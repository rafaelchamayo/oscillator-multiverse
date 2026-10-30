import { formatNumber } from '../../core/units';
import {
  omega0,
  resonanceOmega,
  steadyAmplitude,
  steadyPhase,
} from '../../models/damped-driven/analytic';
import type { DampedDrivenParams } from '../../models/damped-driven/model';
import { AutoScale, niceStep } from '../../render/plots/AutoScale';
import { drawTag } from '../../render/plots/draw';
import type { Plot, PlotCtx } from '../../render/plots/types';
import { fonts, series as S } from '../../render/theme';
import type { ResonanceSweep } from './sweep';

const THEORY = '#9B7BFF';
const POINT = '#3DDC97';

/**
 * Resonance curve A(ω): theory dashed, measured sweep points, ω₀ and ω_res marks and the
 * current ω; the phase lag φ(ω) in a thin lane below.
 */
export class ResonancePlot implements Plot {
  private readonly as = new AutoScale({ minSpan: 0.05, includeZero: true, padding: 0.08 });
  private wMax = 0;

  constructor(private readonly sweep: ResonanceSweep) {}

  reset(): void {
    this.as.reset();
  }

  draw(g: CanvasRenderingContext2D, width: number, height: number, ctx: PlotCtx): void {
    const p = ctx.params as unknown as DampedDrivenParams;
    const w0 = omega0(p);
    const wr = resonanceOmega(p);
    const target = Math.min(15, Math.max(2.5 * w0, p.omega * 1.15, 1));
    this.wMax = this.wMax ? this.wMax + (target - this.wMax) * Math.min(1, ctx.dt * 4) : target;
    const wMax = this.wMax;

    const left = 46;
    const right = 12;
    const top = 22;
    const bottom = 22;
    const gap = 10;
    const phaseH = Math.max(34, (height - top - bottom) * 0.24);
    const ampH = height - top - bottom - gap - phaseH;
    const plotW = width - left - right;
    const X = (w: number) => left + (w / wMax) * plotW;

    // Theory sampled across the axis; without damping the peak is infinite, so the scale
    // follows what is measured and the current ω instead.
    const N = 160;
    const theory: number[] = [];
    let hi = 0;
    for (let i = 0; i <= N; i++) {
      const A = steadyAmplitude(p, (i / N) * wMax || 1e-6);
      theory.push(A);
      if (Number.isFinite(A)) hi = Math.max(hi, A);
    }
    const live = this.sweep.amplitude;
    const cur = steadyAmplitude(p);
    if (p.b === 0) {
      const ref = Math.max(Number.isFinite(cur) ? cur : 0, Number.isFinite(live) ? live : 0, 0.1);
      hi = Math.min(hi, ref * 3);
    }
    for (const q of this.sweep.points) hi = Math.max(hi, q.A);
    if (Number.isFinite(live)) hi = Math.max(hi, live);
    this.as.update(0, hi, ctx.dt);
    const Y = (A: number) => top + ampH - this.as.frac(A) * ampH;

    // Grid.
    g.font = `400 10px ${fonts.mono}`;
    g.lineWidth = 1;
    const aStep = niceStep(this.as.max - this.as.min, Math.max(2, Math.floor(ampH / 26)));
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let a = 0; a <= this.as.max; a += aStep) {
      const y = Y(a);
      g.strokeStyle = a === 0 ? S.axis : S.grid;
      g.beginPath();
      g.moveTo(left, Math.round(y) + 0.5);
      g.lineTo(left + plotW, Math.round(y) + 0.5);
      g.stroke();
      g.fillStyle = S.label;
      g.fillText(formatNumber(a, aStep >= 1 ? 0 : aStep >= 0.1 ? 1 : 2), left - 6, y);
    }

    g.save();
    g.beginPath();
    g.rect(left, top - 2, plotW, ampH + 4);
    g.clip();
    // ω₀ and ω_res marks.
    const mark = (w: number, text: string) => {
      const x = X(w);
      g.strokeStyle = S.axis;
      g.setLineDash([2, 4]);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, top + ampH + gap + phaseH);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = S.label;
      g.font = `600 11px ${fonts.mono}`;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(text, x + 4, top + 2);
    };
    if (w0 <= wMax) mark(w0, 'ω₀');
    if (wr > 0 && wr <= wMax && Math.abs(wr - w0) * (plotW / wMax) > 26) mark(wr, 'ω_res');

    // Theory, dashed.
    g.strokeStyle = THEORY;
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.beginPath();
    let started = false;
    theory.forEach((A, i) => {
      const x = X((i / N) * wMax);
      const y = Number.isFinite(A) ? Math.max(Y(A), top - 40) : top - 40;
      if (!started) g.moveTo(x, y);
      else g.lineTo(x, y);
      started = true;
    });
    g.stroke();
    g.setLineDash([]);

    // Current ω: theory point (ring) and the live measured amplitude (dot).
    const xc = X(p.omega);
    g.strokeStyle = 'rgba(243,244,248,0.5)';
    g.beginPath();
    g.moveTo(xc, top);
    g.lineTo(xc, top + ampH);
    g.stroke();
    if (Number.isFinite(cur)) {
      g.strokeStyle = THEORY;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(xc, Y(cur), 6, 0, Math.PI * 2);
      g.stroke();
    }
    if (Number.isFinite(live)) {
      g.fillStyle = this.sweep.steady ? POINT : S.E;
      g.globalAlpha = this.sweep.steady ? 1 : 0.6;
      g.beginPath();
      g.arc(xc, Y(live), 3.5, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    // Measured points.
    for (const q of this.sweep.points) {
      const x = X(q.omega);
      const y = Y(q.A);
      const halo = g.createRadialGradient(x, y, 0, x, y, 10);
      halo.addColorStop(0, 'rgba(61,220,151,0.55)');
      halo.addColorStop(1, 'rgba(61,220,151,0)');
      g.fillStyle = halo;
      g.beginPath();
      g.arc(x, y, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = POINT;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // Legend / status.
    g.font = `600 11px ${fonts.mono}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = THEORY;
    g.fillText('A (m)', left, 10);
    g.textAlign = 'right';
    g.fillStyle = this.sweep.steady ? POINT : S.label;
    const status = this.sweep.auto
      ? ctx.tr('plots.resonance.sweeping', { n: this.sweep.points.length })
      : this.sweep.steady
        ? ctx.tr('plots.resonance.steady')
        : ctx.tr('plots.resonance.waiting');
    g.fillText(status, left + plotW, 10);

    // Phase lane.
    const py0 = top + ampH + gap;
    const PY = (phi: number) => py0 + (phi / Math.PI) * phaseH;
    g.strokeStyle = S.grid;
    g.lineWidth = 1;
    for (const phi of [0, Math.PI / 2, Math.PI]) {
      g.beginPath();
      g.moveTo(left, Math.round(PY(phi)) + 0.5);
      g.lineTo(left + plotW, Math.round(PY(phi)) + 0.5);
      g.stroke();
    }
    g.font = `400 10px ${fonts.mono}`;
    g.fillStyle = S.label;
    g.textAlign = 'right';
    g.fillText('0', left - 6, PY(0));
    g.fillText('π', left - 6, PY(Math.PI));
    g.strokeStyle = S.a;
    g.lineWidth = 1.6;
    g.setLineDash([5, 4]);
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const w = (i / N) * wMax;
      const y = PY(steadyPhase(p, w));
      if (i === 0) g.moveTo(X(w), y);
      else g.lineTo(X(w), y);
    }
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = S.a;
    g.beginPath();
    g.arc(xc, PY(steadyPhase(p)), 3.5, 0, Math.PI * 2);
    g.fill();
    g.font = `600 11px ${fonts.mono}`;
    g.textAlign = 'left';
    g.fillText('φ (rad)', left + 4, py0 + phaseH / 2);

    // ω axis.
    const step = niceStep(wMax, 5);
    g.font = `400 10px ${fonts.mono}`;
    g.fillStyle = S.label;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let w = 0; w <= wMax + 1e-9; w += step) {
      const x = X(w);
      if (x > left + plotW - 70) continue; // room for the axis name
      g.fillText(formatNumber(w, step < 1 ? 1 : 0), x, height - bottom + 5);
    }
    g.textAlign = 'right';
    g.fillText('ω (rad/s)', left + plotW, height - bottom + 5);

    // Hover: theory at the pointer's ω, or a measured point.
    const hv = ctx.hover;
    if (hv && hv.x >= left && hv.x <= left + plotW && hv.y <= top + ampH) {
      const w = ((hv.x - left) / plotW) * wMax;
      const near = this.sweep.points.find((q) => Math.hypot(X(q.omega) - hv.x, Y(q.A) - hv.y) < 8);
      const text = near
        ? `ω = ${formatNumber(near.omega)}  A = ${formatNumber(near.A, 3)} m`
        : `ω = ${formatNumber(w)}  A = ${formatNumber(steadyAmplitude(p, w), 3)} m`;
      drawTag(g, hv.x + 10, hv.y - 22, text, near ? POINT : THEORY, {
        x: 0,
        y: 0,
        w: width,
        h: height,
      });
    }
  }
}
