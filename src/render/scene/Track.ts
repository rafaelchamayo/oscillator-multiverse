import { colors } from '../theme';
import { alpha } from './draw';

/** Ink floor line the block slides on, with a dashed mark at the equilibrium position. */
export function drawTrack(
  g: CanvasRenderingContext2D,
  uFrom: number,
  uTo: number,
  w: number,
  uEquilibrium: number,
  px: number,
): void {
  g.strokeStyle = colors.ink;
  g.lineWidth = 2.5 * px;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(uFrom, w);
  g.lineTo(uTo, w);
  g.stroke();

  g.strokeStyle = alpha(colors.textMuted, 0.8);
  g.lineWidth = 1.5 * px;
  g.setLineDash([5 * px, 5 * px]);
  g.beginPath();
  g.moveTo(uEquilibrium, w - 0.09);
  g.lineTo(uEquilibrium, w + 0.05);
  g.stroke();
  g.setLineDash([]);
}
