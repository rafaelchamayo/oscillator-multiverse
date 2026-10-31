import { formatNumber } from '../../core/units';
import {
  COUPLED_RANGES,
  MAX_N,
  countOf,
  massOf,
  springOf,
  type CoupledParams,
} from '../../models/coupled/model';
import {
  drawPaper,
  drawPen,
  PAPER_LENGTH,
  paperPoint,
  paperSpeed,
  timeStep,
} from '../../render/plots/PaperTrace';
import { drawArrow, drawHandle } from '../../render/scene/Arrow';
import { MetalBlock } from '../../render/scene/Block';
import { alpha, clamp, drawCallout, roundRectPath } from '../../render/scene/draw';
import { Particles } from '../../render/scene/Particles';
import { drawSpring, springStyleFromK } from '../../render/scene/Spring';
import { drawTrack } from '../../render/scene/Track';
import type { FrameInfo, Hit, MechanicalScene } from '../../render/scene/types';
import { drawWall } from '../../render/scene/Wall';
import { bodyColors, colors, fonts } from '../../render/theme';
import type { Vec2 } from '../../render/view';

/**
 * Chain of n blocks on a floor between two walls. Layout in meters: the walls' faces are at
 * ±L/2 with L = (n + 1)·GAP, and block i rests at e_i = −L/2 + i·GAP; its center is drawn at
 * u = e_i + xᵢ. Bodies and springs are 0-based here (block i ↔ object `block{i+1}`).
 */
export const GAP = 0.85;
export const FLOOR_W = 0.3;
const WALL_HEIGHT = 0.7;
/** The pens touch the paper this far below the floor. */
const PAPER_W = FLOOR_W + 0.08;
const X_KEYS = Array.from({ length: MAX_N }, (_, i) => `x${i + 1}`);
const E_KEYS = Array.from({ length: MAX_N }, (_, i) => `E${i + 1}`);
/** Shortest a spring may get (stops and drags keep at least this). */
const MIN_SPRING = 0.08;
/** Arrow length per unit velocity (m per m/s). */
export const ARROW_SCALE = 0.2;
export const MAX_SPEED = 4;

/** Block side: area ∝ m, 0.26 m at 1 kg. */
export const blockSide = (m: number): number => 0.26 * Math.sqrt(m);

type P = CoupledParams;
type F = FrameInfo<Float64Array, P>;

const halfLength = (p: P) => ((countOf(p) + 1) * GAP) / 2;
/** Rest position (u) of block i. */
export const restU = (p: P, i: number): number => -halfLength(p) + (i + 1) * GAP;
const sideOf = (p: P, i: number) => blockSide(massOf(p, i + 1));
const centerW = (side: number) => FLOOR_W - side / 2;

export function createCoupledScene(): MechanicalScene<P> {
  const blocks = Array.from({ length: MAX_N }, () => new MetalBlock());
  const particles = new Particles();
  /** Smoothed sides, so changing a mass animates its block. */
  const sides = new Float64Array(MAX_N).fill(blockSide(1));
  let firstUpdate = true;
  /** Energy bar full height (J): E when the state was last set, then the largest E. */
  let eScale = 0;

  const uOf = (f: F, i: number) => restU(f.params, i) + f.state[i]!;

  /** Limits of block i's center from the walls and, given a state, its neighbours. */
  const limits = (p: P, i: number, state?: Float64Array) => {
    const n = countOf(p);
    const L = halfLength(p);
    const s = sideOf(p, i) / 2;
    let lo = -L + MIN_SPRING + s;
    let hi = L - MIN_SPRING - s;
    if (state && i > 0) {
      lo = restU(p, i - 1) + state[i - 1]! + sideOf(p, i - 1) / 2 + MIN_SPRING + s;
    }
    if (state && i < n - 1) {
      hi = restU(p, i + 1) + state[i + 1]! - sideOf(p, i + 1) / 2 - MIN_SPRING - s;
    }
    return { lo: lo - restU(p, i), hi: hi - restU(p, i) };
  };

  const arrowGeom = (u: number, v: number, s: number) => {
    const dir = v < 0 ? -1 : 1;
    const start = u + dir * (s / 2);
    return { start, tip: start + v * ARROW_SCALE };
  };

  const scene: MechanicalScene<P> = {
    bounds: (f) => {
      const L = halfLength(f.params);
      return {
        uMin: -L - 0.3,
        uMax: L + 0.3,
        wMin: FLOOR_W - WALL_HEIGHT - 0.25,
        wMax: PAPER_W + PAPER_LENGTH + 0.1,
      };
    },

    bodyU: (x, p, i) => restU(p, i) + x,
    bodyW: (p, i = 0) => centerW(sideOf(p, i)),

    clampX: (x, p, i = 0, state) => {
      const { lo, hi } = limits(p, i, state);
      return clamp(x, lo, Math.max(lo, hi));
    },

    velocityFromHandle: (u, x, p, i = 0) => {
      const c = restU(p, i) + x;
      const s = sideOf(p, i) / 2;
      const v =
        u >= c
          ? Math.max(0, (u - (c + s)) / ARROW_SCALE)
          : Math.min(0, (u - (c - s)) / ARROW_SCALE);
      return clamp(v, -MAX_SPEED, MAX_SPEED);
    },

    /**
     * Elastic bounces off the walls, and elastic collisions between neighbouring blocks (each
     * spring keeps a minimum length), so blocks never cross each other or the walls.
     */
    constrain: (y, p) => {
      const n = countOf(p);
      for (let i = 0; i < n; i++) {
        const { lo, hi } = limits(p, i);
        if (y[i]! < lo) {
          y[i] = 2 * lo - y[i]!;
          y[MAX_N + i] = Math.abs(y[MAX_N + i]!);
        } else if (y[i]! > hi) {
          y[i] = 2 * hi - y[i]!;
          y[MAX_N + i] = -Math.abs(y[MAX_N + i]!);
        }
      }
      for (let i = 0; i < n - 1; i++) {
        const gap =
          restU(p, i + 1) +
          y[i + 1]! -
          sideOf(p, i + 1) / 2 -
          (restU(p, i) + y[i]! + sideOf(p, i) / 2);
        if (gap >= MIN_SPRING) continue;
        // Push the pair apart (inverse-mass weighted) and exchange momentum if approaching.
        const m1 = massOf(p, i + 1);
        const m2 = massOf(p, i + 2);
        const d = MIN_SPRING - gap;
        y[i] = y[i]! - (d * m2) / (m1 + m2);
        y[i + 1] = y[i + 1]! + (d * m1) / (m1 + m2);
        const v1 = y[MAX_N + i]!;
        const v2 = y[MAX_N + i + 1]!;
        if (v1 > v2) {
          y[MAX_N + i] = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
          y[MAX_N + i + 1] = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2);
        }
      }
    },

    update(f) {
      const n = countOf(f.params);
      for (let i = 0; i < n; i++) {
        const target = sideOf(f.params, i);
        sides[i] = firstUpdate
          ? target
          : sides[i]! + (target - sides[i]!) * Math.min(1, 12 * (f.realDt || 1));
        const moving = f.running;
        // Each block deforms with its own velocity and acceleration (a = F/m from the springs).
        const x = f.state[i]!;
        const left = i > 0 ? f.state[i - 1]! : 0;
        const right = i < n - 1 ? f.state[i + 1]! : 0;
        const a =
          (-springOf(f.params, i + 1) * (x - left) + springOf(f.params, i + 2) * (right - x)) /
          massOf(f.params, i + 1);
        blocks[i]!.update({
          v: moving ? f.state[MAX_N + i]! : 0,
          a: moving ? a : 0,
          dt: f.realDt,
        });
      }
      firstUpdate = false;
      particles.update(f.realDt);
      const E = f.obs.E ?? 0;
      eScale = f.running && !f.held ? Math.max(eScale, E) : E;
    },

    draw(g, f) {
      const p = f.params;
      const n = countOf(p);
      const L = halfLength(p);
      const ppx = f.ppx;
      const px = f.px;

      // Shared paper: one pen and one trace per block, in the block's color, around its rest line.
      drawPaper(g, {
        uMin: -L,
        uMax: L,
        wTop: PAPER_W,
        window: f.window,
        t: f.t,
        history: f.history,
        traces: Array.from({ length: n }, (_, i) => ({
          key: X_KEYS[i]!,
          offset: restU(p, i),
          color: bodyColors[i]!,
          body: i,
        })),
        ppx,
        showTrace: f.chips.x ?? true,
      });
      g.lineWidth = 1.5 * ppx;
      g.setLineDash([6 * ppx, 6 * ppx]);
      for (let i = 0; i < n; i++) {
        g.strokeStyle = alpha(bodyColors[i]!, 0.45);
        g.beginPath();
        g.moveTo(restU(p, i), PAPER_W);
        g.lineTo(restU(p, i), PAPER_W + PAPER_LENGTH);
        g.stroke();
      }
      g.setLineDash([]);

      drawTrack(g, -L - 0.2, L + 0.2, FLOOR_W, restU(p, 0), ppx);
      // Rest marks of the other blocks (drawTrack marks the first).
      g.strokeStyle = alpha(colors.textMuted, 0.8);
      g.lineWidth = 1.5 * ppx;
      g.setLineDash([5 * ppx, 5 * ppx]);
      g.beginPath();
      for (let i = 1; i < n; i++) {
        g.moveTo(restU(p, i), FLOOR_W - 0.09);
        g.lineTo(restU(p, i), FLOOR_W + 0.05);
      }
      g.stroke();
      g.setLineDash([]);
      drawWall(g, -L, FLOOR_W, WALL_HEIGHT, ppx, f.hoverId === 'wall');
      // Right wall: the left one mirrored about its face.
      g.save();
      g.translate(2 * L, 0);
      g.scale(-1, 1);
      drawWall(g, L, FLOOR_W, WALL_HEIGHT, ppx, f.hoverId === 'wall');
      g.restore();

      // Springs between the drawn (squashed) faces; spring j joins block j − 1 and block j.
      for (let j = 0; j <= n; j++) {
        const left =
          j === 0 ? -L : uOf(f, j - 1) + (sides[j - 1]! / 2) * blocks[j - 1]!.scaleX(f.serious);
        const right = j === n ? L : uOf(f, j) - (sides[j]! / 2) * blocks[j]!.scaleX(f.serious);
        const style = springStyleFromK(
          springOf(p, j + 1),
          COUPLED_RANGES.k.min,
          COUPLED_RANGES.k.max,
        );
        const w = centerW(Math.min(j > 0 ? sides[j - 1]! : 1, j < n ? sides[j]! : 1));
        drawSpring(
          g,
          left,
          Math.max(right, left + 0.05),
          w,
          {
            ...style,
            radius: 0.07,
            glow: f.hoverId === `spring${j + 1}`,
          },
          ppx,
        );
      }

      for (let i = 0; i < n; i++) {
        const u = uOf(f, i);
        blocks[i]!.draw(g, {
          u,
          w: centerW(sides[i]!),
          side: sides[i]!,
          px: ppx,
          serious: f.serious,
          glow: f.hoverId === `block${i + 1}`,
          tint: bodyColors[i],
        });
        // Velocity arrow: editable v₀ while paused, live v (dimmed) while running.
        const v = f.state[MAX_N + i]!;
        const { start, tip } = arrowGeom(u, v, sides[i]!);
        const w = centerW(sides[i]!);
        drawArrow(
          g,
          start,
          w,
          tip,
          w,
          {
            color: colors.primary,
            widthPx: 3.5,
            glow: f.hoverId === 'velocity',
            dimmed: f.running,
          },
          px,
        );
        if (!f.running) drawHandle(g, tip, w, 7, px, false);
        drawPen(g, u, PAPER_W, ppx, bodyColors[i]);
      }

      if (!f.serious) particles.draw(g, px);
    },

    drawOverlay(g, f) {
      const i = f.activeBody;
      const u = uOf(f, i);
      const s = sides[i]!;
      const callout = { bg: colors.ink, font: `500 13px ${fonts.mono}`, leader: colors.ink };
      if (!f.running && !(f.hoverId === `block${i + 1}` && !f.held)) {
        const top = f.view.toScreen(u, centerW(s) - s / 2);
        drawCallout(
          g,
          top.x,
          top.y - 34,
          [
            { text: `v${sub(i + 1)}(0) = `, color: colors.textOnDark },
            { text: `${formatNumber(f.state[MAX_N + i]!)} m/s`, color: colors.accent },
          ],
          { ...callout, anchor: top },
        );
      }
      if (f.held && !f.running) {
        const mark = f.view.toScreen(u, FLOOR_W + 0.04);
        drawCallout(
          g,
          mark.x,
          mark.y + 30,
          [
            { text: `x${sub(i + 1)}(0) = `, color: colors.textOnDark },
            { text: `${formatNumber(f.state[i]!)} m`, color: colors.accent },
          ],
          { ...callout, anchor: mark },
        );
      }

      if (f.axes) drawTimeLabels(g, f);
      if (f.chips.energy) drawEnergyBar(g, f, eScale);

      g.font = `500 15px ${fonts.mono}`;
      g.fillStyle = colors.text;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(`t = ${formatNumber(f.t)} s`, 22, 20);
    },

    hit(pt: Vec2, f): Hit | null {
      const p = f.params;
      const n = countOf(p);
      const L = halfLength(p);
      const tol = 4 * f.px;
      if (!f.running) {
        for (let i = 0; i < n; i++) {
          const { tip } = arrowGeom(uOf(f, i), f.state[MAX_N + i]!, sides[i]!);
          if (Math.hypot(pt.x - tip, pt.y - centerW(sides[i]!)) < 13 * f.px) {
            return { objectId: 'velocity', role: 'velocityHandle', body: i };
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const s = sides[i]! / 2;
        if (
          Math.abs(pt.x - uOf(f, i)) <= s + tol &&
          Math.abs(pt.y - centerW(sides[i]!)) <= s + tol
        ) {
          return { objectId: `block${i + 1}`, role: 'body', body: i };
        }
      }
      for (let j = 0; j <= n; j++) {
        const left = j === 0 ? -L : uOf(f, j - 1) + sides[j - 1]! / 2;
        const right = j === n ? L : uOf(f, j) - sides[j]! / 2;
        const w = centerW(Math.min(j > 0 ? sides[j - 1]! : 1, j < n ? sides[j]! : 1));
        if (pt.x > left && pt.x < right && Math.abs(pt.y - w) < 0.08) {
          return { objectId: `spring${j + 1}`, role: 'object' };
        }
      }
      const inWall = (face: number, dir: number) =>
        (pt.x - face) * dir >= 0 &&
        (pt.x - face) * dir <= 0.17 &&
        pt.y >= FLOOR_W - WALL_HEIGHT &&
        pt.y <= FLOOR_W;
      if (inWall(-L, -1) || inWall(L, 1)) return { objectId: 'wall', role: 'object' };
      return null;
    },

    objectBox(id, f) {
      const p = f.params;
      const n = countOf(p);
      const L = halfLength(p);
      const block = /^block(\d)$/.exec(id);
      if (block) {
        const i = Number(block[1]) - 1;
        if (i >= n) return null;
        const s = sides[i]! / 2;
        const u = uOf(f, i);
        const w = centerW(sides[i]!);
        return { uMin: u - s, uMax: u + s, wMin: w - s, wMax: w + s };
      }
      const spring = /^spring(\d)$/.exec(id);
      if (spring) {
        const j = Number(spring[1]) - 1;
        if (j > n) return null;
        const left = j === 0 ? -L : uOf(f, j - 1) + sides[j - 1]! / 2;
        const right = j === n ? L : uOf(f, j) - sides[j]! / 2;
        const w = centerW(sides[Math.min(j, n - 1)]!);
        return { uMin: left, uMax: right, wMin: w - 0.08, wMax: w + 0.08 };
      }
      if (id === 'wall') {
        return { uMin: -L - 0.17, uMax: -L, wMin: FLOOR_W - WALL_HEIGHT, wMax: FLOOR_W };
      }
      if (id === 'velocity') {
        const i = f.activeBody;
        const { start, tip } = arrowGeom(uOf(f, i), f.state[MAX_N + i]!, sides[i]!);
        const w = centerW(sides[i]!);
        return {
          uMin: Math.min(start, tip),
          uMax: Math.max(start, tip),
          wMin: w - 0.05,
          wMax: w + 0.05,
        };
      }
      return null;
    },

    onFling(v, f) {
      if (f.serious) return;
      const i = f.activeBody;
      particles.burst(uOf(f, i) - Math.sign(v) * sides[i]! * 0.5, centerW(sides[i]!), v);
    },
  };
  return scene;
}

/** Seconds on the paper's time lines, just left of it. */
function drawTimeLabels(g: CanvasRenderingContext2D, f: F) {
  const L = halfLength(f.params);
  const speed = paperSpeed(f.window);
  const step = timeStep(f.window);
  g.font = `500 11px ${fonts.mono}`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let tk = Math.ceil((f.t - f.window) / step) * step; tk <= f.t; tk += step) {
    if (tk < 0) continue;
    const w = paperPoint(0, tk, f.t, PAPER_W, speed).w;
    if (w > PAPER_W + PAPER_LENGTH - 0.04 || w < PAPER_W + 0.04) continue;
    const p = f.view.toScreen(-L, w);
    halo(g, `${tk} s`, p.x - 8, p.y, colors.textMuted);
  }
}

/**
 * Energy bar pinned to the top-right corner, stacked by mass (Eᵢ in its color). Full height is
 * E when the state was last set, so a conserved E fills it while the energy moves between
 * blocks; each segment is that block's share (its K plus its part of the springs).
 */
function drawEnergyBar(g: CanvasRenderingContext2D, f: F, scale: number) {
  const n = countOf(f.params);
  const H = 120;
  const W = 18;
  const left = f.view.width - 30 - W;
  const top = 46;
  const bottom = top + H;
  const k = H / Math.max(scale, 1e-9);
  roundRectPath(g, left, top, W, H, 4);
  g.fillStyle = alpha(colors.ink, 0.06);
  g.fill();
  let y = bottom;
  g.font = `600 11px ${fonts.mono}`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  let E = 0;
  for (let i = 0; i < n; i++) {
    const Ei = f.obs[E_KEYS[i]!] ?? 0;
    E += Ei;
    const h = Math.min(y - top, Ei * k);
    g.fillStyle = bodyColors[i]!;
    g.fillRect(left, y - h, W, h);
    if (h > 12) halo(g, `${i + 1}`, left - 6, y - h / 2, bodyColors[i]!);
    y -= h;
  }
  if (bottom - y > 0.5) {
    g.fillStyle = colors.ink;
    g.fillRect(left - 3, y - 1, W + 6, 2);
  }
  roundRectPath(g, left, top, W, H, 4);
  g.strokeStyle = colors.ink;
  g.lineWidth = 2;
  g.stroke();
  g.textAlign = 'center';
  g.font = `600 12px ${fonts.mono}`;
  halo(g, 'E', left + W / 2, top - 12, colors.ink);
  g.font = `500 11px ${fonts.mono}`;
  halo(g, `${formatNumber(E)} J`, left + W / 2 - 4, bottom + 14, colors.textMuted);
}

/** Text with a paper-colored halo, readable over traces and springs. */
function halo(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  g.lineWidth = 4;
  g.strokeStyle = colors.surface;
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
/** Subscript digits for labels (x₁, v₂...). */
const sub = (n: number) => [...String(n)].map((d) => SUBSCRIPTS[Number(d)]).join('');
