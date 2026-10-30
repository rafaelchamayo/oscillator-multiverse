import type { History } from '../../core/sim/History';
import { formatNumber } from '../../core/units';
import { roundRectPath } from '../scene/draw';
import { fonts, series as S } from '../theme';
import { niceStep, type AutoScale } from './AutoScale';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BUCKETS = 10;

/**
 * Strokes a polyline whose opacity fades with age, plus dashed segments where the sample is
 * flagged manual. Segments are grouped into opacity buckets so each bucket is a single path.
 */
export function strokeFading(
  g: CanvasRenderingContext2D,
  from: number,
  to: number,
  px: (i: number) => number,
  py: (i: number) => number,
  opacity: (i: number) => number,
  manual: (i: number) => boolean,
  color: string,
  manualColor: string,
  width: number,
): void {
  if (to - from < 1) return;
  const paths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D());
  const manualPaths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D());
  for (let i = from + 1; i <= to; i++) {
    const a = opacity(i);
    if (a <= 0.01) continue;
    const b = Math.min(BUCKETS - 1, Math.floor(a * BUCKETS));
    const p = manual(i) ? manualPaths[b]! : paths[b]!;
    p.moveTo(px(i - 1), py(i - 1));
    p.lineTo(px(i), py(i));
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = width;
  for (let b = 0; b < BUCKETS; b++) {
    g.globalAlpha = (b + 1) / BUCKETS;
    g.setLineDash([]);
    g.strokeStyle = color;
    g.stroke(paths[b]!);
    g.setLineDash([width * 2.2, width * 2]);
    g.strokeStyle = manualColor;
    g.stroke(manualPaths[b]!);
  }
  g.setLineDash([]);
  g.globalAlpha = 1;
}

/** Visible [from, to] sample index range for times in [t0, t1]. */
export function visibleRange(h: History, t0: number, t1: number): [number, number] {
  const from = Math.max(0, h.indexAt(t0) - 1);
  const to = Math.min(h.length - 1, h.indexAt(t1));
  return [from, to];
}

export function minMax(h: History, key: string, from: number, to: number): [number, number] {
  const rb = h.get(key);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i <= to; i++) {
    const v = rb.get(i);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** Horizontal grid lines with value labels on the left, for a lane with scale `s`. */
export function drawValueGrid(g: CanvasRenderingContext2D, r: Rect, s: AutoScale): void {
  const step = niceStep(s.max - s.min, Math.max(2, Math.round(r.h / 36)));
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  g.font = `400 10px ${fonts.mono}`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let v = Math.ceil(s.min / step) * step; v <= s.max; v += step) {
    const y = r.y + r.h - s.frac(v) * r.h;
    const zero = Math.abs(v) < step * 1e-6;
    g.strokeStyle = zero ? S.axis : S.grid;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(r.x, Math.round(y) + 0.5);
    g.lineTo(r.x + r.w, Math.round(y) + 0.5);
    g.stroke();
    g.fillStyle = S.label;
    g.fillText(formatNumber(zero ? 0 : v, digits), r.x - 6, y);
  }
}

/** Small dark tag with colored text (CSS pixels), clamped inside `bounds`. */
export function drawTag(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  bounds: Rect,
): void {
  g.font = `500 11px ${fonts.mono}`;
  const w = g.measureText(text).width + 12;
  const h = 18;
  const tx = Math.min(Math.max(x, bounds.x), bounds.x + bounds.w - w);
  const ty = Math.min(Math.max(y, bounds.y), bounds.y + bounds.h - h);
  roundRectPath(g, tx, ty, w, h, 6);
  g.fillStyle = 'rgba(16,18,23,0.92)';
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, tx + 6, ty + h / 2 + 0.5);
}

/** Nearest sample index to time t. */
export function nearestIndex(h: History, t: number): number {
  const i = h.indexAt(t);
  if (i <= 0) return 0;
  if (i >= h.length) return h.length - 1;
  return t - h.t.get(i - 1) < h.t.get(i) - t ? i - 1 : i;
}

/** Placeholder while there is nothing to plot yet (paused at t = 0). */
export function drawIdle(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  ctx: { tr: (key: 'plots.idle') => string },
): void {
  g.font = `500 12px ${fonts.ui}`;
  g.fillStyle = S.label;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ctx.tr('plots.idle'), width / 2, height / 2);
}
