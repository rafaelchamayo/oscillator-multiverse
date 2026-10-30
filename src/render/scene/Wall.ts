import { colors } from '../theme';
import { alpha, roundRectPath } from './draw';

/** Fixed wall: a slab whose right face is at `uFace`, centered on w = wCenter. */
export function drawWall(
  g: CanvasRenderingContext2D,
  uFace: number,
  wCenter: number,
  height: number,
  px: number,
  glow: boolean,
): void {
  const thick = 0.12;
  const top = wCenter - height / 2;
  if (glow) {
    g.save();
    g.shadowColor = colors.magenta;
    g.shadowBlur = 24;
    roundRectPath(g, uFace - thick, top, thick, height, 0.03);
    g.fillStyle = alpha(colors.magenta, 0.25);
    g.fill();
    g.restore();
  }
  roundRectPath(g, uFace - thick, top, thick, height, 0.03);
  const grad = g.createLinearGradient(uFace - thick, 0, uFace, 0);
  grad.addColorStop(0, colors.surface);
  grad.addColorStop(1, colors.surfaceRaised);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = glow ? colors.magenta : colors.border;
  g.lineWidth = 2 * px;
  g.stroke();

  // Hatching.
  g.save();
  roundRectPath(g, uFace - thick, top, thick, height, 0.03);
  g.clip();
  g.strokeStyle = alpha(colors.primary, 0.35);
  g.lineWidth = 2 * px;
  g.beginPath();
  for (let w = top - thick; w < top + height + thick; w += 0.07) {
    g.moveTo(uFace - thick, w + thick);
    g.lineTo(uFace, w);
  }
  g.stroke();
  g.restore();

  // Bright face where the spring attaches.
  g.strokeStyle = alpha(colors.accent, 0.8);
  g.lineWidth = 3 * px;
  g.beginPath();
  g.moveTo(uFace, top + 0.02);
  g.lineTo(uFace, top + height - 0.02);
  g.stroke();
}
