import type { History } from '../../core/sim/History';
import { alpha } from '../scene/draw';
import { colors } from '../theme';
import { strokeFading, visibleRange } from './draw';

/** Length of the paper strip (m). The window sets the speed, so the strip never resizes the scene. */
export const PAPER_LENGTH = 2;
/** Paper speed for the default 8 s window: meters of paper scrolling past the pen per second. */
export const PAPER_SPEED = PAPER_LENGTH / 8;
export const paperSpeed = (window: number): number => PAPER_LENGTH / window;

/**
 * Where a sample lands on the moving paper. The pen sits at w = wTop under the body, and the
 * paper moves towards +w, so a sample taken at time tᵢ is (now − tᵢ)·speed past the pen.
 * u is the sample's position itself: the trace is aligned with the body by construction.
 */
export function paperPoint(
  x: number,
  ti: number,
  now: number,
  wTop: number,
  speed = PAPER_SPEED,
): { u: number; w: number } {
  return { u: x, w: wTop + (now - ti) * speed };
}

/** Inverse in time: the sample time under a point of the paper. */
export function paperTime(w: number, now: number, wTop: number, speed = PAPER_SPEED): number {
  return now - (w - wTop) / speed;
}

export interface PaperOptions {
  uMin: number;
  uMax: number;
  wTop: number;
  /** Seconds shown. */
  window: number;
  t: number;
  history: History;
  /** The trace (1-DOF tabs); `traces` replaces it with several. */
  xKey?: string;
  /**
   * One trace per body: the series `key`, drawn at u = value + `offset`, in `color`; its
   * hand-driven stretches are those where body `body` was held.
   */
  traces?: { key: string; offset: number; color: string; body: number }[];
  /** Meters per pixel for physical strokes. */
  ppx: number;
  showTrace: boolean;
  /** Second series drawn dashed over the trace (e.g. the analytic steady state). */
  overlayKey?: string;
}

/** Seconds between time lines on the paper. */
export const timeStep = (window: number): number => (window > 10 ? 2 : 1);

/** Paper strip with a moving time grid and the fading x(t) trace (scene coordinates). */
export function drawPaper(g: CanvasRenderingContext2D, o: PaperOptions): void {
  const len = PAPER_LENGTH;
  const speed = paperSpeed(o.window);
  const wBottom = o.wTop + len;

  // Paper fades out towards the past.
  const grad = g.createLinearGradient(0, o.wTop, 0, wBottom);
  grad.addColorStop(0, alpha(colors.primary, 0.07));
  grad.addColorStop(1, alpha(colors.primary, 0));
  g.fillStyle = grad;
  g.fillRect(o.uMin, o.wTop, o.uMax - o.uMin, len);

  // Grid: position lines every 0.25 m, time lines every second (they scroll with the paper).
  g.lineWidth = 1 * o.ppx;
  g.strokeStyle = alpha(colors.ink, 0.07);
  g.beginPath();
  for (let u = Math.ceil(o.uMin / 0.25) * 0.25; u <= o.uMax; u += 0.25) {
    g.moveTo(u, o.wTop);
    g.lineTo(u, wBottom);
  }
  const step = timeStep(o.window);
  for (let tk = Math.ceil((o.t - o.window) / step) * step; tk <= o.t; tk += step) {
    if (tk < 0) continue;
    const w = paperPoint(0, tk, o.t, o.wTop, speed).w;
    g.moveTo(o.uMin, w);
    g.lineTo(o.uMax, w);
  }
  g.stroke();

  if (!o.showTrace) return;
  const h = o.history;
  if (h.length < 2) return;
  const [from, to] = visibleRange(h, o.t - o.window, o.t);
  const W = (i: number) => paperPoint(0, h.t.get(i), o.t, o.wTop, speed).w;
  const age = (i: number) => Math.max(0, 1 - (o.t - h.t.get(i)) / o.window);
  const traces =
    o.traces ?? (o.xKey ? [{ key: o.xKey, offset: 0, color: colors.primary, body: 0 }] : []);
  for (const tr of traces) {
    const xr = h.get(tr.key);
    strokeFading(
      g,
      from,
      to,
      (i) => xr.get(i) + tr.offset,
      W,
      (i) => 0.15 + 0.85 * age(i),
      (i) => h.manual.get(i) === tr.body + 1,
      tr.color,
      colors.highlight,
      3 * o.ppx,
    );
  }

  if (o.overlayKey && h.has(o.overlayKey)) {
    const ov = h.get(o.overlayKey);
    g.strokeStyle = alpha(colors.ink, 0.6);
    g.lineWidth = 2 * o.ppx;
    g.setLineDash([7 * o.ppx, 6 * o.ppx]);
    g.beginPath();
    for (let i = from; i <= to; i++) {
      const u = ov.get(i);
      if (i === from) g.moveTo(u, W(i));
      else g.lineTo(u, W(i));
    }
    g.stroke();
    g.setLineDash([]);
  }
}

/** The pen nib under the body, touching the paper at (u, wTop). */
export function drawPen(
  g: CanvasRenderingContext2D,
  u: number,
  wTop: number,
  ppx: number,
  color: string = colors.primary,
): void {
  const s = 9 * ppx;
  g.beginPath();
  g.moveTo(u, wTop);
  g.lineTo(u - s * 0.6, wTop - s * 1.4);
  g.lineTo(u + s * 0.6, wTop - s * 1.4);
  g.closePath();
  g.fillStyle = colors.ink;
  g.fill();
  g.beginPath();
  g.arc(u, wTop, 3 * ppx, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}
