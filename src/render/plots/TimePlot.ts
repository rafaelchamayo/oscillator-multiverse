import { formatNumber } from '../../core/units';
import { fonts, series as S } from '../theme';
import { AutoScale, niceStep } from './AutoScale';
import {
  drawTag,
  drawValueGrid,
  minMax,
  nearestIndex,
  strokeFading,
  visibleRange,
  type Rect,
} from './draw';
import type { Plot, PlotCtx, SeriesDef } from './types';

/**
 * Scrolling time plot. `lanes`: one lane per enabled series sharing the time axis (x, v, a).
 * `overlay`: all series in one lane with a common scale (energy).
 */
export class TimePlot implements Plot {
  private readonly scales = new Map<string, AutoScale>();
  private readonly shared: AutoScale;

  constructor(
    private readonly series: SeriesDef[],
    private readonly mode: 'lanes' | 'overlay',
    opts: { minSpan?: number; includeZero?: boolean } = {},
  ) {
    for (const s of series) this.scales.set(s.key, new AutoScale({ minSpan: opts.minSpan ?? 0.1 }));
    this.shared = new AutoScale({ minSpan: opts.minSpan ?? 0.1, includeZero: opts.includeZero });
  }

  reset(): void {
    for (const s of this.scales.values()) s.reset();
    this.shared.reset();
  }

  draw(g: CanvasRenderingContext2D, width: number, height: number, ctx: PlotCtx): void {
    const h = ctx.history;
    const shown = this.series.filter((s) => !s.chip || ctx.chips[s.chip]);
    if (shown.length === 0 || h.length < 2) return;

    const left = 46;
    const right = 12;
    const top = this.mode === 'overlay' ? 26 : 8;
    const bottom = 22;
    const gap = 12;
    const t1 = ctx.t;
    const t0 = t1 - ctx.window;
    const [from, to] = visibleRange(h, t0, t1);
    const plotW = width - left - right;
    const X = (i: number) => left + ((h.t.get(i) - t0) / ctx.window) * plotW;
    const age = (i: number) => 0.25 + 0.75 * Math.max(0, 1 - (t1 - h.t.get(i)) / ctx.window);
    const manual = (i: number) => h.manual.get(i) > 0;

    const lanes: { rect: Rect; series: SeriesDef[]; scale: AutoScale }[] = [];
    if (this.mode === 'lanes') {
      const laneH = (height - top - bottom - gap * (shown.length - 1)) / shown.length;
      shown.forEach((s, k) => {
        const rect = { x: left, y: top + k * (laneH + gap), w: plotW, h: laneH };
        lanes.push({ rect, series: [s], scale: this.scales.get(s.key)! });
      });
    } else {
      lanes.push({
        rect: { x: left, y: top, w: plotW, h: height - top - bottom },
        series: shown,
        scale: this.shared,
      });
    }

    for (const lane of lanes) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of lane.series) {
        const [a, b] = minMax(h, s.key, from, to);
        lo = Math.min(lo, a);
        hi = Math.max(hi, b);
      }
      lane.scale.update(lo, hi, ctx.dt);
      const r = lane.rect;
      drawValueGrid(g, r, lane.scale);

      g.save();
      g.beginPath();
      g.rect(r.x, r.y - 2, r.w, r.h + 4);
      g.clip();
      for (const s of lane.series) {
        const rb = h.get(s.key);
        const Y = (i: number) => r.y + r.h - lane.scale.frac(rb.get(i)) * r.h;
        strokeFading(g, from, to, X, Y, age, manual, s.color, S.manual, 2);
      }
      g.restore();

      if (this.mode === 'lanes') {
        const s = lane.series[0]!;
        g.font = `600 11px ${fonts.mono}`;
        g.fillStyle = s.color;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(`${s.label} (${s.unit})`, r.x + 6, r.y + 4);
      }
    }

    if (this.mode === 'overlay') this.drawLegend(g, left, shown);
    this.drawTimeAxis(g, left, plotW, height - bottom, t0, ctx);

    // Hover: crosshair at the pointer's time and the value of each series there.
    const hv = ctx.hover;
    if (hv && hv.x >= left && hv.x <= left + plotW) {
      const th = t0 + ((hv.x - left) / plotW) * ctx.window;
      const i = nearestIndex(h, th);
      if (Math.abs(h.t.get(i) - th) < ctx.window / 50) {
        const x = X(i);
        g.strokeStyle = S.label;
        g.setLineDash([3, 3]);
        g.beginPath();
        g.moveTo(Math.round(x) + 0.5, top);
        g.lineTo(Math.round(x) + 0.5, height - bottom);
        g.stroke();
        g.setLineDash([]);
        const bounds = { x: 0, y: 0, w: width, h: height };
        for (const lane of lanes) {
          lane.series.forEach((s, k) => {
            const v = h.get(s.key).get(i);
            const y = lane.rect.y + lane.rect.h - lane.scale.frac(v) * lane.rect.h;
            g.fillStyle = s.color;
            g.beginPath();
            g.arc(x, y, 3.5, 0, Math.PI * 2);
            g.fill();
            const tagY = this.mode === 'overlay' ? lane.rect.y + 4 + k * 21 : lane.rect.y + 2;
            drawTag(g, x + 8, tagY, `${s.label} = ${formatNumber(v)} ${s.unit}`, s.color, bounds);
          });
        }
        drawTag(
          g,
          x - 30,
          height - bottom + 3,
          `t = ${formatNumber(h.t.get(i))} s`,
          S.label,
          bounds,
        );
      }
    }
  }

  private drawLegend(g: CanvasRenderingContext2D, left: number, shown: SeriesDef[]): void {
    g.font = `600 11px ${fonts.mono}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    let x = left;
    for (const s of shown) {
      g.fillStyle = s.color;
      g.beginPath();
      g.arc(x + 4, 12, 4, 0, Math.PI * 2);
      g.fill();
      g.fillText(s.label, x + 12, 12.5);
      x += g.measureText(s.label).width + 26;
    }
    g.fillStyle = S.label;
    g.fillText(`(${shown[0]!.unit})`, x, 12.5);
  }

  private drawTimeAxis(
    g: CanvasRenderingContext2D,
    left: number,
    plotW: number,
    y: number,
    t0: number,
    ctx: PlotCtx,
  ): void {
    const step = niceStep(ctx.window, 4);
    g.font = `400 10px ${fonts.mono}`;
    g.fillStyle = S.label;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let t = Math.ceil(Math.max(t0, 0) / step) * step; t <= ctx.t + 1e-9; t += step) {
      const x = left + ((t - t0) / ctx.window) * plotW;
      if (x > left + plotW - 40) continue; // room for the axis name
      g.fillText(formatNumber(t, step < 1 ? 1 : 0), x, y + 5);
    }
    g.textAlign = 'right';
    g.fillText('t (s)', left + plotW, y + 5);
  }
}
