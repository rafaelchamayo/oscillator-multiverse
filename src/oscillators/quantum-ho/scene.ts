import { formatNumber } from '../../core/units';
import { DX, J, J0, gridX } from '../../models/quantum-ho/hermite';
import { R_MAX, evalPsi, type QhoParams } from '../../models/quantum-ho/model';
import { drawArrow, drawHandle } from '../../render/scene/Arrow';
import { alpha, drawCallout } from '../../render/scene/draw';
import type { FrameInfo, Hit, MechanicalScene } from '../../render/scene/types';
import { colors, fonts } from '../../render/theme';
import type { Vec2 } from '../../render/view';

type P = QhoParams;
type F = FrameInfo<Float64Array, P>;

/**
 * Scene layout (natural units: lengths in ℓ = √(ħ/mω), energies in ħω). u is x; w is the
 * energy axis pointing down, w = −E · E_SCALE, so the well opens upwards like in a textbook.
 */
export const E_SCALE = 0.5;
/** Highest energy drawn (the parabola is cut there). */
export const E_TOP = 9;
/** Half-width of the x range shown. */
export const X_VIEW = 6.2;
/** Height (scene units) of a unit of probability density |ψ|². */
export const DENSITY_SCALE = 2.4;
/** ⟨p⟩ arrow: scene length per unit of momentum. */
export const ARROW_SCALE = 0.45;
/** Fastest packet the hand can launch (|⟨p⟩|): beyond it the basis truncates. */
export const MAX_SPEED = R_MAX;

const wOfE = (E: number) => -E * E_SCALE;
/** Grid indices of the x range shown. */
const J_FROM = J0 - Math.round(X_VIEW / DX);
const J_TO = J0 + Math.round(X_VIEW / DX);

export function createQuantumScene(): MechanicalScene<P> {
  const re = new Float64Array(J);
  const im = new Float64Array(J);
  let peak = 0;
  /** Baseline of the last frame drawn (where the hand grabs the packet: `bodyW`). */
  let lastBase = wOfE(0.5);

  /** Baseline of the wave: its mean energy, like the levels of a textbook figure. */
  const base = (f: F) => wOfE(f.obs.E ?? 0.5);
  const arrowTip = (f: F) => (f.obs.x ?? 0) + (f.obs.v ?? 0) * ARROW_SCALE;

  function drawPotential(g: CanvasRenderingContext2D, f: F) {
    const lit = f.hoverId === 'potential';
    const xMax = Math.min(X_VIEW, Math.sqrt(2 * E_TOP));
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

  function drawDensity(g: CanvasRenderingContext2D, f: F) {
    const w0 = base(f);
    const lit = f.hoverId === 'packet';
    const rho = (j: number) => re[j]! * re[j]! + im[j]! * im[j]!;
    g.beginPath();
    g.moveTo(gridX(J_FROM), w0);
    for (let j = J_FROM; j <= J_TO; j++) g.lineTo(gridX(j), w0 - DENSITY_SCALE * rho(j));
    g.lineTo(gridX(J_TO), w0);
    g.closePath();
    g.fillStyle = alpha(colors.primary, f.held ? 0.32 : 0.22);
    g.fill();
    g.save();
    if (lit || f.held) {
      g.shadowColor = lit ? colors.highlight : colors.primary;
      g.shadowBlur = 12;
    }
    g.strokeStyle = lit ? colors.highlight : colors.primary;
    g.lineWidth = 2.5 * f.ppx;
    g.beginPath();
    for (let j = J_FROM; j <= J_TO; j++) {
      const w = w0 - DENSITY_SCALE * rho(j);
      if (j === J_FROM) g.moveTo(gridX(j), w);
      else g.lineTo(gridX(j), w);
    }
    g.stroke();
    g.restore();

    // Mean energy line between the classical turning points ±√(2⟨E⟩).
    const A = Math.sqrt(2 * (f.obs.E ?? 0.5));
    g.strokeStyle = alpha(colors.ink, 0.35);
    g.lineWidth = 1.5 * f.ppx;
    g.setLineDash([6 * f.ppx, 5 * f.ppx]);
    g.beginPath();
    g.moveTo(-A, w0);
    g.lineTo(A, w0);
    g.stroke();
    g.setLineDash([]);

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

  return {
    bounds: () => ({
      uMin: -X_VIEW,
      uMax: X_VIEW,
      wMin: wOfE(E_TOP) - 0.2,
      wMax: 0.5,
    }),

    update(f) {
      evalPsi(f.state, re, im);
      lastBase = base(f);
      peak = 0;
      for (let j = J_FROM; j <= J_TO; j++) peak = Math.max(peak, re[j]! ** 2 + im[j]! ** 2);
    },

    draw(g, f) {
      // Position axis at E = 0.
      g.strokeStyle = alpha(colors.ink, 0.25);
      g.lineWidth = 1.5 * f.ppx;
      g.beginPath();
      g.moveTo(-X_VIEW, 0);
      g.lineTo(X_VIEW, 0);
      g.stroke();

      drawPotential(g, f);
      drawDensity(g, f);

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
        const top = f.view.toScreen(f.obs.x ?? 0, w0 - DENSITY_SCALE * peak);
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
      const halfW = Math.max(0.9, 2 * (f.obs.dx ?? 0.7));
      if (
        Math.abs(pt.x - x) < halfW &&
        pt.y <= w0 + 0.15 &&
        pt.y >= w0 - DENSITY_SCALE * peak - 0.15
      ) {
        return { objectId: 'packet', role: 'body' };
      }
      const V = wOfE(0.5 * pt.x * pt.x);
      if (V >= wOfE(E_TOP) && Math.abs(pt.y - V) < 8 * f.px + 0.04) {
        return { objectId: 'potential', role: 'object' };
      }
      return null;
    },

    objectBox(id, f) {
      if (id === 'potential') {
        const xMax = Math.sqrt(2 * E_TOP);
        return { uMin: -xMax, uMax: xMax, wMin: wOfE(E_TOP), wMax: 0 };
      }
      if (id === 'packet' || id === 'velocity') {
        const x = f.obs.x ?? 0;
        const w0 = base(f);
        return { uMin: x - 1, uMax: x + 1, wMin: w0 - DENSITY_SCALE * peak, wMax: w0 };
      }
      return null;
    },

    // The hand moves the packet's center; a coherent state of radius ≤ R_MAX keeps it in view.
    clampX: (x) => Math.max(-R_MAX, Math.min(R_MAX, x)),
    bodyW: () => lastBase - (DENSITY_SCALE * peak) / 2,
    velocityFromHandle: (u, x) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (u - x) / ARROW_SCALE)),
    // No walls: ⟨x⟩ of a superposition is not a position to bounce (that would replace the state).
    constrain: () => {},
  };
}
