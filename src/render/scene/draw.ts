/** Small canvas helpers shared by scene primitives. */

export function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** Exponential smoothing that is frame-rate independent. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Hex color (#RRGGBB) with alpha in [0, 1]. */
export function alpha(hex: string, a: number): string {
  const n = Math.round(clamp(a, 0, 1) * 255);
  return `${hex}${n.toString(16).padStart(2, '0')}`;
}

/** Pill-shaped label drawn in screen pixels. */
export function drawPillLabel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opts: { color: string; bg: string; border: string; font: string },
): void {
  g.font = opts.font;
  const w = g.measureText(text).width + 16;
  const h = 22;
  roundRectPath(g, x - w / 2, y - h / 2, w, h, h / 2);
  g.fillStyle = opts.bg;
  g.fill();
  g.strokeStyle = opts.border;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = opts.color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 0.5);
}
