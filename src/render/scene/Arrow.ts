import { colors } from '../theme';
import { alpha } from './draw';

export interface ArrowStyle {
  color: string;
  widthPx: number;
  glow?: boolean;
  dimmed?: boolean;
}

/** Straight arrow from (u0, w) to (u1, w) in scene meters; head size in pixels. */
export function drawArrow(
  g: CanvasRenderingContext2D,
  u0: number,
  w0: number,
  u1: number,
  w1: number,
  style: ArrowStyle,
  px: number,
): void {
  const dx = u1 - u0;
  const dy = w1 - w0;
  const len = Math.hypot(dx, dy);
  if (len < 2 * px) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(14 * px, len * 0.6);
  const lw = style.widthPx * px;
  const color = style.dimmed ? alpha(style.color, 0.55) : style.color;
  g.save();
  if (style.glow) {
    g.shadowColor = style.color;
    g.shadowBlur = 16;
  }
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(u0, w0);
  g.lineTo(u1 - ux * head * 0.8, w1 - uy * head * 0.8);
  g.stroke();
  g.beginPath();
  g.moveTo(u1, w1);
  g.lineTo(u1 - ux * head - uy * head * 0.55, w1 - uy * head + ux * head * 0.55);
  g.lineTo(u1 - ux * head + uy * head * 0.55, w1 - uy * head - ux * head * 0.55);
  g.closePath();
  g.fill();
  g.restore();
}

/** Round handle (e.g. the draggable arrow tip). Radius in pixels. */
export function drawHandle(
  g: CanvasRenderingContext2D,
  u: number,
  w: number,
  radiusPx: number,
  px: number,
  active: boolean,
): void {
  g.save();
  g.shadowColor = colors.accent;
  g.shadowBlur = active ? 18 : 8;
  g.beginPath();
  g.arc(u, w, radiusPx * px, 0, Math.PI * 2);
  g.fillStyle = active ? colors.accent : alpha(colors.accent, 0.85);
  g.fill();
  g.lineWidth = 2 * px;
  g.strokeStyle = colors.text;
  g.stroke();
  g.restore();
}
