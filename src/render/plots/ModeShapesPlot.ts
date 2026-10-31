import { formatNumber } from '../../core/units';
import { fonts, modeColors, series as S } from '../theme';
import type { Plot, PlotCtx } from './types';

export interface ModeSet {
  /** Angular frequencies ωₙ, ascending. */
  omega: number[];
  /** `shape[mode][body]`. */
  shape: number[][];
}

/**
 * Normal modes of a chain fixed at both ends, one row per mode: the bodies' displacements as
 * stems joined by a line (wall to wall), each swinging as cos(ωₙ t) so the rows move at their own
 * frequency, with ωₙ on the left and, on the right, the share of the energy in that mode now.
 */
export class ModeShapesPlot implements Plot {
  constructor(
    private readonly modes: (params: Record<string, number>) => ModeSet,
    /** History series with the energy of mode n (0-based) and the total energy. */
    private readonly energyKey: (n: number) => string,
    private readonly totalKey: string,
  ) {}

  draw(g: CanvasRenderingContext2D, width: number, height: number, ctx: PlotCtx): void {
    const { omega, shape } = this.modes(ctx.params);
    const N = omega.length;
    if (N === 0) return;
    const h = ctx.history;
    const last = h.length - 1;
    const E = last >= 0 && h.has(this.totalKey) ? h.get(this.totalKey).get(last) : 0;

    const labelW = 64;
    const barW = 54;
    const left = labelW;
    const right = width - barW - 14;
    const top = 6;
    const rowH = (height - top - 6) / N;
    const span = right - left;
    // Bodies sit evenly between the two walls, as in the scene.
    const X = (i: number) => left + ((i + 1) / (N + 1)) * span;

    for (let n = 0; n < N; n++) {
      const color = modeColors[n % modeColors.length]!;
      const phi = shape[n]!;
      const peak = Math.max(...phi.map(Math.abs)) || 1;
      const yMid = top + (n + 0.5) * rowH;
      const amp = rowH * 0.36;
      const swing = Math.cos(omega[n]! * ctx.t);

      // Row label: mode number and its frequency.
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.font = `700 12px ${fonts.mono}`;
      g.fillText(`${n + 1}`, 6, yMid - 7);
      g.font = `400 10px ${fonts.mono}`;
      g.fillStyle = S.label;
      g.fillText(`ω ${formatNumber(omega[n]!)}`, 6, yMid + 8);

      // Rest line between the walls.
      g.strokeStyle = S.grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(left, Math.round(yMid) + 0.5);
      g.lineTo(right, Math.round(yMid) + 0.5);
      g.moveTo(left + 0.5, yMid - amp);
      g.lineTo(left + 0.5, yMid + amp);
      g.moveTo(right - 0.5, yMid - amp);
      g.lineTo(right - 0.5, yMid + amp);
      g.stroke();

      // Envelope: the shape at its extremes, faint and dashed.
      g.strokeStyle = color;
      g.globalAlpha = 0.28;
      g.setLineDash([3, 3]);
      for (const s of [1, -1]) {
        g.beginPath();
        g.moveTo(left, yMid);
        phi.forEach((c, i) => g.lineTo(X(i), yMid - (s * c * amp) / peak));
        g.lineTo(right, yMid);
        g.stroke();
      }
      g.setLineDash([]);
      g.globalAlpha = 1;

      // The shape now: stems from the rest line and the line through their tips.
      const tip = (i: number) => yMid - (phi[i]! * swing * amp) / peak;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(left, yMid);
      phi.forEach((_, i) => g.lineTo(X(i), tip(i)));
      g.lineTo(right, yMid);
      g.stroke();
      g.lineWidth = 1.5;
      g.beginPath();
      phi.forEach((_, i) => {
        g.moveTo(X(i), yMid);
        g.lineTo(X(i), tip(i));
      });
      g.stroke();
      g.fillStyle = color;
      phi.forEach((_, i) => {
        g.beginPath();
        g.arc(X(i), tip(i), 3.5, 0, Math.PI * 2);
        g.fill();
      });

      // Share of the energy in this mode.
      const En = last >= 0 && h.has(this.energyKey(n)) ? h.get(this.energyKey(n)).get(last) : 0;
      const frac = E > 1e-12 ? Math.min(1, Math.max(0, En / E)) : 0;
      const bx = width - barW - 6;
      const bh = 8;
      g.fillStyle = S.grid;
      g.fillRect(bx, yMid - bh / 2 - 6, barW, bh);
      g.fillStyle = color;
      g.fillRect(bx, yMid - bh / 2 - 6, barW * frac, bh);
      g.font = `400 10px ${fonts.mono}`;
      g.fillStyle = S.label;
      g.textAlign = 'right';
      g.fillText(E > 1e-12 ? `${Math.round(frac * 100)} %` : '—', bx + barW, yMid + 10);
    }
  }
}
