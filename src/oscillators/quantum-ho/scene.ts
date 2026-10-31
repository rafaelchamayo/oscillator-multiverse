import { formatNumber } from '../../core/units';
import { DX, J, J0, LEVELS, basisRow, gridX } from '../../models/quantum-ho/hermite';
import {
  R_MAX,
  energy,
  evalPsi,
  setCoefficient,
  type QhoParams,
} from '../../models/quantum-ho/model';
import { timeStep } from '../../render/plots/PaperTrace';
import { drawArrow, drawHandle } from '../../render/scene/Arrow';
import { alpha, drawCallout } from '../../render/scene/draw';
import type { FrameInfo, Hit, MechanicalScene } from '../../render/scene/types';
import { colors, fonts, phaseColor, phaseRGB } from '../../render/theme';
import type { SceneBounds, Vec2 } from '../../render/view';

type P = QhoParams;
type F = FrameInfo<Float64Array, P>;

/**
 * Scene layout (natural units: lengths in ℓ = √(ħ/mω), energies in ħω). u is x; w is the
 * energy axis pointing down, w = −E · E_SCALE, so the well opens upwards like in a textbook.
 * Below the well (w > 0) runs the quantum carpet, the space-time picture of |ψ(x, t)|².
 */
export const E_SCALE = 0.62;
/** Highest energy drawn (the parabola is cut there): levels 0…10 fit. */
export const E_TOP = 11;
/** Levels drawn on the ladder, each with its phasor wheel. */
export const SHOWN_LEVELS = 11;
/** Half-width of the x range shown. */
export const X_VIEW = 6.2;
/** Height (scene units) of a unit of |ψ| (phase view, Re/Im) and of |ψ|² (density view). */
export const AMP_SCALE = 2;
export const DENSITY_SCALE = 2.8;
/** Phasor wheels: column position and radius (|cₙ| = 1 reaches the rim). */
export const WHEEL_U = 7.35;
export const WHEEL_R = 0.27;
/** ⟨p⟩ arrow: scene length per unit of momentum. */
export const ARROW_SCALE = 0.45;
/** Fastest packet the hand can launch (|⟨p⟩|): beyond it the basis truncates. */
export const MAX_SPEED = R_MAX;
/** Carpet strip under the well. */
export const CARPET_TOP = 0.4;
export const CARPET_H = 3.4;

const IM = LEVELS;
export const wOfE = (E: number): number => -E * E_SCALE;
/** Grid indices of the x range shown. */
const J_FROM = J0 - Math.round(X_VIEW / DX);
const J_TO = J0 + Math.round(X_VIEW / DX);
/** Carpet bitmap: one pixel per two grid points across, one row per time step. */
const CW = Math.floor((J_TO - J_FROM) / 2) + 1;
const CH = 256;
/** |ψ|² that saturates the carpet's color (the ground state's peak, 1/√π). */
const CARPET_REF = 1 / Math.sqrt(Math.PI);
const PAPER = [251, 250, 247] as const;

const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
export const sub = (n: number): string =>
  String(n)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('');

const coef = (s: Float64Array, n: number) => ({
  r: Math.hypot(s[n]!, s[IM + n]!),
  phi: Math.atan2(s[IM + n]!, s[n]!),
});

export function createQuantumScene(): MechanicalScene<P> {
  const re = new Float64Array(J);
  const im = new Float64Array(J);
  /** Height (scene units) of the drawn wave's peak, in the current view. */
  let peakH = 0;
  /** Baseline of the last frame drawn (where the hand grabs the packet: `bodyW`). */
  let lastBase = wOfE(0.5);

  // ---- Carpet: a ring of rows, the newest at `head`, drawn newest on top ----
  let carpet: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData } | null =
    null;
  let head = 0;
  let lastRowT = Number.NaN;
  /** History length last frame: it drops when the run restarts (reset, preset). */
  let lastSamples = 0;
  const rgb = [0, 0, 0];
  /** ψ of a past row: the evolution is exact, so the state is turned back to that time. */
  const past = new Float64Array(2 * LEVELS);
  const pastRe = new Float64Array(J);
  const pastIm = new Float64Array(J);

  function ensureCarpet() {
    if (carpet || typeof document === 'undefined') return carpet;
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    carpet = { canvas, ctx, img: ctx.createImageData(CW, CH) };
    clearCarpet();
    return carpet;
  }

  function clearCarpet() {
    if (!carpet) return;
    const d = carpet.img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = PAPER[0];
      d[i + 1] = PAPER[1];
      d[i + 2] = PAPER[2];
      d[i + 3] = 255;
    }
    carpet.ctx.putImageData(carpet.img, 0, 0);
  }

  /** Writes ψ (`re`, `im` on the grid) into row `row` of the carpet: hue = phase, strength = |ψ|². */
  function writeRow(row: number, re: Float64Array, im: Float64Array) {
    if (!carpet) return;
    const d = carpet.img.data;
    for (let c = 0; c < CW; c++) {
      const j = J_FROM + 2 * c;
      const rho = re[j]! * re[j]! + im[j]! * im[j]!;
      const I = Math.min(1, Math.sqrt(rho / CARPET_REF));
      phaseRGB(Math.atan2(im[j]!, re[j]!), rgb);
      const o = (row * CW + c) * 4;
      d[o] = PAPER[0] + (rgb[0]! - PAPER[0]) * I;
      d[o + 1] = PAPER[1] + (rgb[1]! - PAPER[1]) * I;
      d[o + 2] = PAPER[2] + (rgb[2]! - PAPER[2]) * I;
    }
    carpet.ctx.putImageData(carpet.img, 0, 0, 0, row, CW, 1);
  }

  /** One row per window/CH of simulated time; the top row always shows ψ now (also edits). */
  function updateCarpet(f: F) {
    if (!f.chips.carpet || !ensureCarpet()) return;
    const dtRow = f.window / CH;
    const restarted = f.history.length < lastSamples;
    lastSamples = f.history.length;
    if (restarted || !(f.t >= lastRowT - 1e-9)) {
      // First frame, or time went back (reset, preset): a blank carpet, refilled from t = 0
      // below (the time since then may have run without a frame drawn, e.g. at high speed).
      clearCarpet();
      lastRowT = Math.max(0, f.t - CH * dtRow);
      lastRowT = f.t - Math.floor((f.t - lastRowT) / dtRow) * dtRow;
    }
    // Several rows may be due in one frame (fast speeds, frame skips): each shows ψ at its
    // own time, cₙ(t_row) = cₙ(t) e^{iEₙ(t − t_row)}, exact as long as the hand did not edit
    // the state in between (and then rows are a frame apart anyway).
    if (f.t - lastRowT > CH * dtRow) lastRowT = f.t - CH * dtRow;
    while (f.t - lastRowT >= dtRow) {
      lastRowT += dtRow;
      const back = f.t - lastRowT;
      for (let n = 0; n < LEVELS; n++) {
        const th = energy(n) * back;
        const c = Math.cos(th);
        const s = Math.sin(th);
        const a = f.state[n]!;
        const b = f.state[IM + n]!;
        past[n] = a * c - b * s;
        past[IM + n] = a * s + b * c;
      }
      evalPsi(past, pastRe, pastIm);
      head = (head - 1 + CH) % CH;
      writeRow(head, pastRe, pastIm);
    }
    writeRow(head, re, im);
  }

  const base = (f: F) => wOfE(f.obs.E ?? 0.5);
  const arrowTip = (f: F) => (f.obs.x ?? 0) + (f.obs.v ?? 0) * ARROW_SCALE;
  const density = (f: F) => !!f.chips.density;
  const levelW = (n: number) => wOfE(energy(n));
  const turning = (E: number) => Math.sqrt(2 * E);

  function drawPotential(g: CanvasRenderingContext2D, f: F) {
    const lit = f.hoverId === 'potential';
    const xMax = Math.min(X_VIEW, turning(E_TOP));
    g.beginPath();
    for (let k = 0; k <= 160; k++) {
      const x = -xMax + (2 * xMax * k) / 160;
      const w = wOfE(0.5 * x * x);
      if (k === 0) g.moveTo(x, w);
      else g.lineTo(x, w);
    }
    g.save();
    if (lit) {
      g.shadowColor = colors.highlight;
      g.shadowBlur = 14;
    }
    g.strokeStyle = lit ? colors.highlight : colors.ink;
    g.lineWidth = 3 * f.ppx;
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }

  /** Energy ladder: each level spans its classical region, colored as occupied as it is. */
  function drawLevels(g: CanvasRenderingContext2D, f: F) {
    for (let n = 0; n < SHOWN_LEVELS; n++) {
      const A = turning(energy(n));
      const w = levelW(n);
      const { r, phi } = coef(f.state, n);
      const lit = f.hoverId === `level${n}` || f.hoverId === `wheel${n}`;
      g.lineWidth = (lit ? 3 : 1.5) * f.ppx;
      g.strokeStyle = lit ? colors.highlight : alpha(colors.ink, 0.16);
      g.beginPath();
      g.moveTo(-A, w);
      g.lineTo(A, w);
      g.stroke();
      if (r * r > 1e-4 && !lit) {
        g.globalAlpha = Math.min(1, 0.25 + r * r);
        g.strokeStyle = phaseColor(phi);
        g.lineWidth = 3 * f.ppx;
        g.beginPath();
        g.moveTo(-A, w);
        g.lineTo(A, w);
        g.stroke();
        g.globalAlpha = 1;
      }
      if (f.hoverId === `level${n}`) drawEigenfunction(g, f, n);
    }
  }

  /** ψₙ on its level (the textbook picture), with its n nodes marked. */
  function drawEigenfunction(g: CanvasRenderingContext2D, f: F, n: number) {
    const row = basisRow(n);
    const w = levelW(n);
    const k = AMP_SCALE * 0.8;
    g.strokeStyle = alpha(colors.highlight, 0.85);
    g.lineWidth = 2 * f.ppx;
    g.beginPath();
    for (let j = J_FROM; j <= J_TO; j += 2) {
      const y = w - k * row[j]!;
      if (j === J_FROM) g.moveTo(gridX(j), y);
      else g.lineTo(gridX(j), y);
    }
    g.stroke();
    g.fillStyle = colors.highlight;
    const A = turning(energy(n)) * 1.1;
    for (let j = J_FROM + 1; j <= J_TO; j++) {
      const a = row[j - 1]!;
      const b = row[j]!;
      if (a * b < 0 && Math.abs(gridX(j)) < A) {
        const x = gridX(j - 1) + (DX * a) / (a - b);
        g.beginPath();
        g.arc(x, w, 4 * f.px, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  /** The wave at height ⟨E⟩: |ψ| colored by arg ψ (default), or |ψ|², plus Re/Im if asked. */
  function drawWave(g: CanvasRenderingContext2D, f: F) {
    const w0 = base(f);
    const lit = f.hoverId === 'packet';
    const dens = density(f);
    const h = (j: number) => {
      const rho = re[j]! * re[j]! + im[j]! * im[j]!;
      return dens ? DENSITY_SCALE * rho : AMP_SCALE * Math.sqrt(rho);
    };

    if (dens) {
      g.beginPath();
      g.moveTo(gridX(J_FROM), w0);
      for (let j = J_FROM; j <= J_TO; j++) g.lineTo(gridX(j), w0 - h(j));
      g.lineTo(gridX(J_TO), w0);
      g.closePath();
      g.fillStyle = alpha(colors.primary, f.held ? 0.32 : 0.22);
      g.fill();
    } else {
      // Domain coloring: the area under |ψ|, filled with a gradient that follows arg ψ.
      const grad = g.createLinearGradient(gridX(J_FROM), 0, gridX(J_TO), 0);
      const span = J_TO - J_FROM;
      for (let j = J_FROM; j <= J_TO; j += 3) {
        grad.addColorStop((j - J_FROM) / span, phaseColor(Math.atan2(im[j]!, re[j]!)));
      }
      g.beginPath();
      g.moveTo(gridX(J_FROM), w0);
      for (let j = J_FROM; j <= J_TO; j++) g.lineTo(gridX(j), w0 - h(j));
      g.lineTo(gridX(J_TO), w0);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
    }

    g.save();
    if (lit || f.held) {
      g.shadowColor = lit ? colors.highlight : colors.primary;
      g.shadowBlur = 12;
    }
    g.strokeStyle = lit ? colors.highlight : dens ? colors.primary : colors.ink;
    g.lineWidth = (dens ? 2.5 : 2) * f.ppx;
    g.beginPath();
    for (let j = J_FROM; j <= J_TO; j++) {
      if (j === J_FROM) g.moveTo(gridX(j), w0 - h(j));
      else g.lineTo(gridX(j), w0 - h(j));
    }
    g.stroke();
    g.restore();

    if (f.chips.reim) {
      for (const [buf, color] of [
        [re, colors.primaryDeep],
        [im, colors.warning],
      ] as const) {
        g.strokeStyle = color;
        g.lineWidth = 2 * f.ppx;
        g.setLineDash([5 * f.ppx, 4 * f.ppx]);
        g.beginPath();
        for (let j = J_FROM; j <= J_TO; j += 2) {
          const y = w0 - AMP_SCALE * buf[j]!;
          if (j === J_FROM) g.moveTo(gridX(j), y);
          else g.lineTo(gridX(j), y);
        }
        g.stroke();
        g.setLineDash([]);
      }
    }

    // Mean energy line between the classical turning points ±√(2⟨E⟩).
    const A = turning(f.obs.E ?? 0.5);
    g.strokeStyle = alpha(colors.ink, 0.35);
    g.lineWidth = 1.5 * f.ppx;
    g.setLineDash([6 * f.ppx, 5 * f.ppx]);
    g.beginPath();
    g.moveTo(-A, w0);
    g.lineTo(A, w0);
    g.stroke();
    g.setLineDash([]);

    if (f.chips.classical) drawClassical(g, f, A, w0);

    // ⟨x⟩: where the classical block would be.
    const x = f.obs.x ?? 0;
    g.fillStyle = colors.ink;
    g.beginPath();
    g.moveTo(x, w0);
    g.lineTo(x - 7 * f.px, w0 + 11 * f.px);
    g.lineTo(x + 7 * f.px, w0 + 11 * f.px);
    g.closePath();
    g.fill();
  }

  /**
   * Classical probability density of an oscillator with energy ⟨E⟩, 1/(π√(A² − x²)): where a
   * block spends its time. Drawn as a density over |ψ|², or as its square root over |ψ|.
   */
  function drawClassical(g: CanvasRenderingContext2D, f: F, A: number, w0: number) {
    const dens = density(f);
    const cap = Math.max(peakH * 1.4, 0.6);
    g.strokeStyle = alpha(colors.ink, 0.75);
    g.lineWidth = 2 * f.ppx;
    g.setLineDash([3 * f.ppx, 4 * f.ppx]);
    g.beginPath();
    for (let k = 0; k <= 240; k++) {
      const x = -A + (2 * A * k) / 240;
      const rho = 1 / (Math.PI * Math.sqrt(Math.max(1e-9, A * A - x * x)));
      const hgt = Math.min(cap, dens ? DENSITY_SCALE * rho : AMP_SCALE * Math.sqrt(rho));
      if (k === 0) g.moveTo(x, w0 - hgt);
      else g.lineTo(x, w0 - hgt);
    }
    g.stroke();
    // Turning points.
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * A, w0);
      g.lineTo(s * A, w0 - cap);
      g.stroke();
    }
    g.setLineDash([]);
  }

  /** One complex plane per level: the needle is cₙ(t), turning clockwise at Eₙ. */
  function drawWheels(g: CanvasRenderingContext2D, f: F) {
    for (let n = 0; n < SHOWN_LEVELS; n++) {
      const cw = levelW(n);
      const { r, phi } = coef(f.state, n);
      const lit = f.hoverId === `wheel${n}` || f.hoverId === `level${n}`;
      const color = phaseColor(phi);
      g.beginPath();
      g.arc(WHEEL_U, cw, WHEEL_R, 0, Math.PI * 2);
      g.fillStyle = alpha(colors.ink, 0.03 + 0.1 * r * r);
      g.fill();
      g.lineWidth = (lit ? 2.5 : 1.5) * f.ppx;
      g.strokeStyle = lit ? colors.highlight : alpha(colors.ink, 0.4);
      g.stroke();
      // Real axis tick (phase 0), so the turning is readable.
      g.strokeStyle = alpha(colors.ink, 0.25);
      g.lineWidth = 1 * f.ppx;
      g.beginPath();
      g.moveTo(WHEEL_U + WHEEL_R * 0.8, cw);
      g.lineTo(WHEEL_U + WHEEL_R, cw);
      g.stroke();
      if (r < 1e-3) continue;
      const tx = WHEEL_U + WHEEL_R * r * Math.cos(phi);
      const tw = cw - WHEEL_R * r * Math.sin(phi);
      g.strokeStyle = color;
      g.lineWidth = 3 * f.ppx;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(WHEEL_U, cw);
      g.lineTo(tx, tw);
      g.stroke();
      g.fillStyle = color;
      g.beginPath();
      g.arc(tx, tw, 4.5 * f.px, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawCarpet(g: CanvasRenderingContext2D, f: F) {
    if (!f.chips.carpet || !carpet) return;
    const w = 2 * X_VIEW;
    const rowH = CARPET_H / CH;
    g.imageSmoothingEnabled = true;
    // Rows head…CH−1 are the newest; 0…head−1 continue them further into the past.
    const first = CH - head;
    g.drawImage(carpet.canvas, 0, head, CW, first, -X_VIEW, CARPET_TOP, w, first * rowH);
    if (head > 0) {
      g.drawImage(
        carpet.canvas,
        0,
        0,
        CW,
        head,
        -X_VIEW,
        CARPET_TOP + first * rowH,
        w,
        head * rowH,
      );
    }
    g.strokeStyle = alpha(colors.ink, 0.2);
    g.lineWidth = 1 * f.ppx;
    g.strokeRect(-X_VIEW, CARPET_TOP, w, CARPET_H);
    // ⟨x⟩ pen on top of the carpet, like the pen on the classical paper.
    const x = f.obs.x ?? 0;
    g.fillStyle = colors.ink;
    g.beginPath();
    g.moveTo(x, CARPET_TOP);
    g.lineTo(x - 6 * f.px, CARPET_TOP - 9 * f.px);
    g.lineTo(x + 6 * f.px, CARPET_TOP - 9 * f.px);
    g.closePath();
    g.fill();
  }

  function wheelAt(pt: Vec2): number {
    for (let n = 0; n < SHOWN_LEVELS; n++) {
      if (Math.hypot(pt.x - WHEEL_U, pt.y - levelW(n)) <= WHEEL_R * 1.15) return n;
    }
    return -1;
  }

  return {
    bounds: (f): SceneBounds => ({
      uMin: -X_VIEW,
      uMax: WHEEL_U + WHEEL_R + 0.15,
      // The wave of a high level rises above the top of the well.
      wMin: Math.min(wOfE(E_TOP), base(f) - peakH) - 0.25,
      wMax: f.chips.carpet ? CARPET_TOP + CARPET_H + 0.15 : 0.5,
    }),

    update(f) {
      evalPsi(f.state, re, im);
      lastBase = base(f);
      let peak = 0;
      for (let j = J_FROM; j <= J_TO; j++) peak = Math.max(peak, re[j]! ** 2 + im[j]! ** 2);
      peakH = density(f) ? DENSITY_SCALE * peak : AMP_SCALE * Math.sqrt(peak);
      updateCarpet(f);
    },

    draw(g, f) {
      // Position axis at E = 0.
      g.strokeStyle = alpha(colors.ink, 0.25);
      g.lineWidth = 1.5 * f.ppx;
      g.beginPath();
      g.moveTo(-X_VIEW, 0);
      g.lineTo(X_VIEW, 0);
      g.stroke();

      drawCarpet(g, f);
      drawLevels(g, f);
      drawPotential(g, f);
      drawWave(g, f);
      drawWheels(g, f);

      if (!f.running) {
        const w0 = base(f);
        const x = f.obs.x ?? 0;
        const tip = arrowTip(f);
        drawArrow(g, x, w0, tip, w0, { color: colors.primary, widthPx: 4 }, f.px);
        drawHandle(g, tip, w0, 7, f.px, f.hoverId === 'velocity');
      }
    },

    drawOverlay(g, f) {
      const callout = { bg: colors.ink, font: `500 13px ${fonts.mono}`, leader: colors.ink };
      const w0 = base(f);
      if (!f.running && !(f.hoverId === 'packet' && !f.held)) {
        const top = f.view.toScreen(f.obs.x ?? 0, w0 - peakH);
        drawCallout(
          g,
          top.x,
          top.y - 34,
          [
            { text: '⟨p⟩(0) = ', color: colors.textOnDark },
            { text: formatNumber(f.obs.v ?? 0), color: colors.accent },
          ],
          { ...callout, anchor: top },
        );
      }
      if (f.held && !f.running) {
        const mark = f.view.toScreen(f.obs.x ?? 0, w0 + 0.1);
        drawCallout(
          g,
          mark.x,
          mark.y + 30,
          [
            { text: '⟨x⟩(0) = ', color: colors.textOnDark },
            { text: formatNumber(f.obs.x ?? 0), color: colors.accent },
          ],
          { ...callout, anchor: mark },
        );
      }

      // Level numbers next to their wheels.
      g.font = `600 11px ${fonts.mono}`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let n = 0; n < SHOWN_LEVELS; n++) {
        const p = f.view.toScreen(WHEEL_U - WHEEL_R, levelW(n));
        const lit = f.hoverId === `wheel${n}` || f.hoverId === `level${n}`;
        g.fillStyle = lit ? colors.highlight : colors.textMuted;
        g.fillText(`${n}`, p.x - 6, p.y);
      }

      if (f.chips.carpet && f.axes) {
        // Time marks on the carpet: when each row was ψ.
        g.font = `500 11px ${fonts.mono}`;
        g.fillStyle = colors.textMuted;
        g.textAlign = 'right';
        const step = timeStep(f.window);
        for (let a = 0; a <= f.window + 1e-9; a += step) {
          const tk = f.t - a;
          if (tk < 0) break;
          const p = f.view.toScreen(-X_VIEW, CARPET_TOP + (a / f.window) * CARPET_H);
          g.fillText(formatNumber(tk, 1), p.x - 6, p.y);
        }
        const lbl = f.view.toScreen(-X_VIEW, CARPET_TOP + CARPET_H);
        g.fillText('ωt', lbl.x - 6, lbl.y + 14);
      }

      g.font = `500 15px ${fonts.mono}`;
      g.fillStyle = colors.text;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(`ωt = ${formatNumber(f.t)}`, 22, 20);
    },

    hit(pt: Vec2, f): Hit | null {
      const w0 = base(f);
      const x = f.obs.x ?? 0;
      if (!f.running && Math.hypot(pt.x - arrowTip(f), pt.y - w0) < 13 * f.px) {
        return { objectId: 'velocity', role: 'velocityHandle' };
      }
      const n = wheelAt(pt);
      if (n >= 0) {
        return {
          objectId: `wheel${n}`,
          role: 'handle',
          // The pointer is cₙ in the wheel's complex plane (up is +Im).
          drag: (q, sim) => {
            const dx = (q.x - WHEEL_U) / WHEEL_R;
            const dy = -(q.y - levelW(n)) / WHEEL_R;
            sim.editState((s) => setCoefficient(s, n, Math.hypot(dx, dy), Math.atan2(dy, dx)));
          },
        };
      }
      const halfW = Math.max(0.9, 2 * (f.obs.dx ?? 0.7));
      if (Math.abs(pt.x - x) < halfW && pt.y <= w0 + 0.15 && pt.y >= w0 - peakH - 0.15) {
        return { objectId: 'packet', role: 'body' };
      }
      for (let k = 0; k < SHOWN_LEVELS; k++) {
        if (Math.abs(pt.y - levelW(k)) < 6 * f.px + 0.02 && Math.abs(pt.x) <= turning(energy(k))) {
          return { objectId: `level${k}`, role: 'object' };
        }
      }
      const V = wOfE(0.5 * pt.x * pt.x);
      if (V >= wOfE(E_TOP) && Math.abs(pt.y - V) < 8 * f.px + 0.04) {
        return { objectId: 'potential', role: 'object' };
      }
      return null;
    },

    objectBox(id, f) {
      if (id === 'potential') {
        const xMax = turning(E_TOP);
        return { uMin: -xMax, uMax: xMax, wMin: wOfE(E_TOP), wMax: 0 };
      }
      if (id === 'packet' || id === 'velocity') {
        const x = f.obs.x ?? 0;
        const w0 = base(f);
        return { uMin: x - 1, uMax: x + 1, wMin: w0 - peakH, wMax: w0 };
      }
      const m = /^(level|wheel)(\d+)$/.exec(id);
      if (m) {
        const n = Number(m[2]);
        const w = levelW(n);
        if (m[1] === 'wheel') {
          return {
            uMin: WHEEL_U - WHEEL_R,
            uMax: WHEEL_U + WHEEL_R,
            wMin: w - WHEEL_R,
            wMax: w + WHEEL_R,
          };
        }
        const A = turning(energy(n));
        return { uMin: -A, uMax: A, wMin: w - 0.05, wMax: w + 0.05 };
      }
      return null;
    },

    // The hand moves the packet's center; a coherent state of radius ≤ R_MAX keeps it in view.
    clampX: (x) => Math.max(-R_MAX, Math.min(R_MAX, x)),
    bodyW: () => lastBase - peakH / 2,
    velocityFromHandle: (u, x) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (u - x) / ARROW_SCALE)),
    // No walls: ⟨x⟩ of a superposition is not a position to bounce (that would replace the state).
    constrain: () => {},
  };
}
