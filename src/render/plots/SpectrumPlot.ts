import { formatNumber } from '../../core/units';
import { fonts, phaseColor, series as S } from '../theme';
import { drawTag } from './draw';
import type { Plot, PlotCtx } from './types';

/**
 * Spectrum of a quantum state: one bar per level n with height |cₙ|², colored by the phase of
 * cₙ (the same color wheel as the scene). The phases turn at Eₙ, so the colors cycle; the bar
 * heights never change while nothing touches the state. Reads `ctx.state` laid out as
 * [Re c₀…c_N, Im c₀…c_N].
 */
export class SpectrumPlot implements Plot {
  constructor(
    /** Number of coefficients in the state (N + 1). */
    private readonly levels: number,
    /** Always show at least this many bars. */
    private readonly minShown = 11,
  ) {}

  draw(g: CanvasRenderingContext2D, width: number, height: number, ctx: PlotCtx): void {
    const s = ctx.state;
    if (!s) return;
    const L = this.levels;
    const P = (n: number) => s[n]! * s[n]! + s[L + n]! * s[L + n]!;
    let last = this.minShown - 1;
    let maxP = 0;
    for (let n = 0; n < L; n++) {
      const p = P(n);
      if (p > 1e-4) last = Math.max(last, n);
      maxP = Math.max(maxP, p);
    }
    const shown = last + 1;
    // Top of the axis: 1, ½ or ¼, whichever fits the tallest bar.
    const top = maxP > 0.5 ? 1 : maxP > 0.25 ? 0.5 : 0.25;

    const pad = { l: 40, r: 10, t: 12, b: 22 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const slot = w / shown;
    const Y = (p: number) => pad.t + h - (p / top) * h;

    if (ctx.axes) {
      g.font = `400 10px ${fonts.mono}`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let k = 0; k <= 4; k++) {
        const p = (k / 4) * top;
        const y = Math.round(Y(p)) + 0.5;
        g.strokeStyle = k === 0 ? S.axis : S.grid;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(pad.l, y);
        g.lineTo(pad.l + w, y);
        g.stroke();
        g.fillStyle = S.label;
        g.fillText(formatNumber(p, 2), pad.l - 6, y);
      }
      g.textAlign = 'center';
      g.textBaseline = 'top';
      const every = shown > 24 ? 5 : shown > 12 ? 2 : 1;
      for (let n = 0; n < shown; n += every) {
        g.fillText(String(n), pad.l + (n + 0.5) * slot, pad.t + h + 5);
      }
      g.font = `600 11px ${fonts.mono}`;
      g.textAlign = 'left';
      g.fillStyle = S.label;
      g.fillText('|cₙ|²', pad.l + 6, pad.t);
    }

    const barW = Math.max(2, slot * 0.7);
    for (let n = 0; n < shown; n++) {
      const p = P(n);
      if (p < 1e-6) continue;
      const x = pad.l + (n + 0.5) * slot - barW / 2;
      g.fillStyle = phaseColor(Math.atan2(s[L + n]!, s[n]!));
      g.fillRect(x, Y(p), barW, pad.t + h - Y(p));
    }

    const hv = ctx.hover;
    if (hv && hv.x >= pad.l && hv.x <= pad.l + w) {
      const n = Math.min(shown - 1, Math.floor((hv.x - pad.l) / slot));
      const phi = Math.atan2(s[L + n]!, s[n]!);
      drawTag(
        g,
        pad.l + (n + 0.5) * slot + 8,
        pad.t + 16,
        `n = ${n}: |c|² = ${formatNumber(P(n), 3)}, φ = ${formatNumber(phi, 2)}`,
        P(n) > 1e-6 ? phaseColor(phi) : S.label,
        { x: 0, y: 0, w: width, h: height },
      );
    }
  }
}
