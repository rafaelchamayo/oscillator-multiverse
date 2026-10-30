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

export interface CalloutPart {
  text: string;
  color: string;
}

/**
 * Dark callout bubble (screen pixels) centered at (x, y). With `anchor`, a short leader line
 * joins the bubble to that point, like a tag pinned to an object.
 */
export function drawCallout(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  parts: CalloutPart[],
  opts: { bg: string; font: string; anchor?: { x: number; y: number }; leader: string },
): void {
  g.font = opts.font;
  const widths = parts.map((p) => g.measureText(p.text).width);
  const w = widths.reduce((a, b) => a + b, 0) + 26;
  const h = 30;
  if (opts.anchor) {
    g.strokeStyle = opts.leader;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(opts.anchor.x, opts.anchor.y);
    g.stroke();
  }
  roundRectPath(g, x - w / 2, y - h / 2, w, h, h / 2);
  g.fillStyle = opts.bg;
  g.fill();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  let cx = x - w / 2 + 13;
  parts.forEach((p, i) => {
    g.fillStyle = p.color;
    g.fillText(p.text, cx, y + 0.5);
    cx += widths[i]!;
  });
}
