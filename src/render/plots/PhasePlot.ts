import { formatNumber } from '../../core/units';
import { fonts, series as S } from '../theme';
import { AutoScale, niceStep } from './AutoScale';
import { drawIdle, drawTag, visibleRange } from './draw';
import type { Plot, PlotCtx } from './types';

const OLD = [124, 77, 255]; // violet
const NEW = [91, 200, 255]; // cyan-blue

function mix(f: number): string {
  const c = OLD.map((o, i) => Math.round(o + (NEW[i]! - o) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Phase space (x, v): a glowing trail whose color runs from violet (past) to cyan (now),
 * and a bright dot for the current state.
 */
export class PhasePlot implements Plot {
  private readonly xs = new AutoScale({ minSpan: 0.1 });
  private readonly vs = new AutoScale({ minSpan: 0.1, symmetric: true });

  constructor(
    private readonly xKey: string,
    private readonly vKey: string,
    private readonly labels: { x: string; v: string; xUnit: string; vUnit: string },
    private readonly opts: {
      /** Seconds of history in the trail (default: twice the trace window). */
      span?: number;
      /** Limit cycle drawn dashed: ellipse centered at (cx, 0) with semi-axes a (x) and b (v). */
      limit?: (params: Record<string, number>) => { cx: number; a: number; b: number } | null;
    } = {},
  ) {}

  reset(): void {
    this.xs.reset();
    this.vs.reset();
  }

  draw(g: CanvasRenderingContext2D, width: number, height: number, ctx: PlotCtx): void {
    const h = ctx.history;
    if (h.length < 2) {
      drawIdle(g, width, height, ctx);
      return;
    }
    const pad = { l: 46, r: 14, t: 10, b: 24 };
    const w = width - pad.l - pad.r;
    const hh = height - pad.t - pad.b;
    const [from, to] = visibleRange(h, ctx.t - (this.opts.span ?? ctx.window * 2), ctx.t);
    const lim = this.opts.limit?.(ctx.params) ?? null;
    const xr = h.get(this.xKey);
    const vr = h.get(this.vKey);

    let xlo = Infinity;
    let xhi = -Infinity;
    let vlo = Infinity;
    let vhi = -Infinity;
    for (let i = from; i <= to; i++) {
      xlo = Math.min(xlo, xr.get(i));
      xhi = Math.max(xhi, xr.get(i));
      vlo = Math.min(vlo, vr.get(i));
      vhi = Math.max(vhi, vr.get(i));
    }
    if (lim && Number.isFinite(lim.a) && Number.isFinite(lim.b)) {
      xlo = Math.min(xlo, lim.cx - lim.a);
      xhi = Math.max(xhi, lim.cx + lim.a);
      vlo = Math.min(vlo, -lim.b);
      vhi = Math.max(vhi, lim.b);
    }
    this.xs.update(xlo, xhi, ctx.dt);
    this.vs.update(vlo, vhi, ctx.dt);
    const X = (x: number) => pad.l + this.xs.frac(x) * w;
    const Y = (v: number) => pad.t + hh - this.vs.frac(v) * hh;

    this.drawAxes(g, pad, w, hh);

    // Limit cycle (steady state), dashed, under the trail.
    if (lim && Number.isFinite(lim.a) && Number.isFinite(lim.b)) {
      g.save();
      g.strokeStyle = 'rgba(243,244,248,0.45)';
      g.lineWidth = 1.4;
      g.setLineDash([5, 5]);
      g.beginPath();
      for (let k = 0; k <= 96; k++) {
        const th = (k / 96) * Math.PI * 2;
        const px = X(lim.cx + lim.a * Math.cos(th));
        const py = Y(-lim.b * Math.sin(th));
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      g.restore();
    }

    // Trail: wide translucent glow, then a thin bright line, colored by age.
    const n = to - from;
    g.save();
    g.beginPath();
    g.rect(pad.l, pad.t, w, hh);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const [lw, alpha] of [
      [9, 0.07],
      [4, 0.18],
      [1.8, 0.95],
    ] as const) {
      g.lineWidth = lw;
      const buckets = 12;
      for (let b = 0; b < buckets; b++) {
        const i0 = from + Math.floor((b * n) / buckets);
        const i1 = from + Math.floor(((b + 1) * n) / buckets);
        if (i1 <= i0) continue;
        const f = (b + 1) / buckets;
        g.globalAlpha = alpha * (0.15 + 0.85 * f);
        g.strokeStyle = mix(f);
        g.beginPath();
        g.moveTo(X(xr.get(i0)), Y(vr.get(i0)));
        for (let i = i0 + 1; i <= i1; i++) g.lineTo(X(xr.get(i)), Y(vr.get(i)));
        g.stroke();
      }
    }
    // Current state.
    const cx = X(xr.get(to));
    const cy = Y(vr.get(to));
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, 16);
    halo.addColorStop(0, 'rgba(160,220,255,0.9)');
    halo.addColorStop(1, 'rgba(160,220,255,0)');
    g.globalAlpha = 1;
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, 16, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(cx, cy, 4, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Hover: nearest trail point.
    const hv = ctx.hover;
    if (hv) {
      let best = -1;
      let bestD = 14 * 14;
      for (let i = from; i <= to; i += 2) {
        const dx = X(xr.get(i)) - hv.x;
        const dy = Y(vr.get(i)) - hv.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        const px = X(xr.get(best));
        const py = Y(vr.get(best));
        g.strokeStyle = '#FFFFFF';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(px, py, 5, 0, Math.PI * 2);
        g.stroke();
        const L = this.labels;
        drawTag(
          g,
          px + 10,
          py - 24,
          `${L.x} = ${formatNumber(xr.get(best))} ${L.xUnit}, ${L.v} = ${formatNumber(vr.get(best))} ${L.vUnit}`,
          S.label,
          { x: 0, y: 0, w: width, h: height },
        );
      }
    }
  }

  private drawAxes(
    g: CanvasRenderingContext2D,
    pad: { l: number; r: number; t: number; b: number },
    w: number,
    hh: number,
  ): void {
    g.font = `400 10px ${fonts.mono}`;
    g.lineWidth = 1;
    const xs = this.xs;
    const vs = this.vs;
    const xStep = niceStep(xs.max - xs.min, 4);
    const vStep = niceStep(vs.max - vs.min, 4);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let x = Math.ceil(xs.min / xStep) * xStep; x <= xs.max; x += xStep) {
      const px = pad.l + xs.frac(x) * w;
      g.strokeStyle = Math.abs(x) < xStep * 1e-6 ? S.axis : S.grid;
      g.beginPath();
      g.moveTo(Math.round(px) + 0.5, pad.t);
      g.lineTo(Math.round(px) + 0.5, pad.t + hh);
      g.stroke();
      g.fillStyle = S.label;
      g.fillText(formatNumber(x, xStep >= 1 ? 0 : xStep >= 0.1 ? 1 : 2), px, pad.t + hh + 5);
    }
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = Math.ceil(vs.min / vStep) * vStep; v <= vs.max; v += vStep) {
      const py = pad.t + hh - vs.frac(v) * hh;
      g.strokeStyle = Math.abs(v) < vStep * 1e-6 ? S.axis : S.grid;
      g.beginPath();
      g.moveTo(pad.l, Math.round(py) + 0.5);
      g.lineTo(pad.l + w, Math.round(py) + 0.5);
      g.stroke();
      g.fillStyle = S.label;
      g.fillText(
        formatNumber(Math.abs(v) < vStep * 1e-6 ? 0 : v, vStep >= 1 ? 0 : 1),
        pad.l - 6,
        py,
      );
    }
    const L = this.labels;
    g.fillStyle = S.label;
    g.font = `600 11px ${fonts.mono}`;
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText(`${L.x} (${L.xUnit})`, pad.l + w, pad.t + hh - 4);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(`${L.v} (${L.vUnit})`, pad.l + 6, pad.t + 4);
  }
}
