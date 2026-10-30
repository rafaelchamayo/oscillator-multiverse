import { colors } from '../theme';
import { alpha } from './draw';

/** Frictionless rail under the block with a tick at the equilibrium position. */
export function drawTrack(
  g: CanvasRenderingContext2D,
  uFrom: number,
  uTo: number,
  w: number,
  uEquilibrium: number,
  px: number,
): void {
  const grad = g.createLinearGradient(uFrom, 0, uTo, 0);
  grad.addColorStop(0, alpha(colors.primary, 0.7));
  grad.addColorStop(0.7, alpha(colors.purple, 0.5));
  grad.addColorStop(1, alpha(colors.purple, 0));
  g.strokeStyle = grad;
  g.lineWidth = 3 * px;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(uFrom, w);
  g.lineTo(uTo, w);
  g.stroke();

  // Equilibrium tick.
  g.strokeStyle = alpha(colors.textMuted, 0.7);
  g.lineWidth = 1.5 * px;
  g.setLineDash([4 * px, 4 * px]);
  g.beginPath();
  g.moveTo(uEquilibrium, w - 0.04);
  g.lineTo(uEquilibrium, w + 0.06);
  g.stroke();
  g.setLineDash([]);
}
