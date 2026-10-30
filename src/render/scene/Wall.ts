import { colors } from '../theme';
import { alpha, roundRectPath } from './draw';

/** Fixed wall standing on the floor: right face at `uFace`, bottom at `wFloor`. */
export function drawWall(
  g: CanvasRenderingContext2D,
  uFace: number,
  wFloor: number,
  height: number,
  px: number,
  glow: boolean,
): void {
  const thick = 0.17;
  const top = wFloor - height;
  const r = 0.035;
  const x0 = uFace - thick;

  // Soft cast shadow on the paper.
  g.fillStyle = alpha(colors.ink, 0.07);
  roundRectPath(g, x0 - 0.04, top + 0.05, thick, height - 0.05, r);
  g.fill();

  roundRectPath(g, x0, top, thick, height, r);
  g.fillStyle = colors.surface;
  g.fill();

  // Hatched core.
  const inset = 0.022;
  g.save();
  roundRectPath(g, x0 + inset, top + inset, thick - 2 * inset, height - 2 * inset, r * 0.6);
  g.fillStyle = colors.metalDark;
  g.fill();
  g.clip();
  g.strokeStyle = alpha(colors.ink, 0.55);
  g.lineWidth = 2 * px;
  g.beginPath();
  for (let w = top - thick; w < wFloor + thick; w += 0.06) {
    g.moveTo(x0, w + thick);
    g.lineTo(uFace, w);
  }
  g.stroke();
  g.restore();

  roundRectPath(g, x0, top, thick, height, r);
  g.strokeStyle = glow ? colors.highlight : colors.ink;
  g.lineWidth = (glow ? 3.5 : 2.5) * px;
  g.stroke();
}
