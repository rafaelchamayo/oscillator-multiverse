import { formatNumber } from '../../core/units';
import { diverging, fonts, series as S } from '../theme';
import { drawTag } from './draw';
import type { Plot, PlotCtx } from './types';

export interface WignerSource {
  /** Samples per axis of the computed image. */
  size: number;
  /** Half-width of the image in x and in p. */
  extent: number;
  /**
   * Writes the state with its time phases undone (cₙ e^{iEₙt}) into `out`: it only changes
   * when something edits the state, so it is the cache key of the image.
   */
  phaseFree(state: Float64Array, t: number, out: Float64Array): void;
  /** W of a phase-free state, `size × size`, row 0 at the most negative p. */
  compute(phaseFree: Float64Array): Float64Array;
}

/** Visible half-width of the plot in x and p. */
const VIEW = 5.5;
/** Contrast: |W|^γ, so the faint fringes of a cat still show. */
const GAMMA = 0.7;

/**
 * Wigner quasi-probability W(x, p) as a diverging heatmap: blue where W > 0, red where W < 0
 * (which no classical probability can be). The harmonic oscillator only turns W rigidly, so the
 * image is computed once per edit of the coefficients and drawn rotated by ωt (clockwise: a
 * packet at +x moves to −p, as ⟨p⟩ = −x₀ sin t). A dot marks (⟨x⟩, ⟨p⟩).
 */
export class WignerPlot implements Plot {
  /** Minimum of W in the current image, for tests: negative only for non-classical states. */
  min = 0;
  private key: Float64Array | null = null;
  private scratch: Float64Array | null = null;
  private image: HTMLCanvasElement | null = null;

  constructor(
    private readonly source: WignerSource,
    private readonly xKey: string,
    private readonly pKey: string,
  ) {}

  reset(): void {
    this.key = null;
  }

  /** Recomputes the image if the phase-free state moved (beyond round-off). */
  private refresh(state: Float64Array, t: number): void {
    const src = this.source;
    if (!this.scratch || this.scratch.length !== state.length) {
      this.scratch = new Float64Array(state.length);
    }
    src.phaseFree(state, t, this.scratch);
    if (this.key && this.image) {
      let d = 0;
      for (let i = 0; i < state.length; i++)
        d = Math.max(d, Math.abs(this.scratch[i]! - this.key[i]!));
      if (d < 1e-7) return;
    }
    this.key = this.scratch.slice();
    const W = src.compute(this.key);
    const n = src.size;
    let max = 0;
    let min = 0;
    for (const w of W) {
      max = Math.max(max, Math.abs(w));
      min = Math.min(min, w);
    }
    this.min = min;
    if (!this.image) this.image = document.createElement('canvas');
    this.image.width = n;
    this.image.height = n;
    const ig = this.image.getContext('2d')!;
    const data = ig.createImageData(n, n);
    const px = data.data;
    for (let ip = 0; ip < n; ip++) {
      // Image row 0 is the top of the plot: the most positive p.
      const row = (n - 1 - ip) * n;
      for (let ix = 0; ix < n; ix++) {
        const w = W[ip * n + ix]!;
        const c = w >= 0 ? diverging.positive : diverging.negative;
        const k = (row + ix) * 4;
        px[k] = c[0];
        px[k + 1] = c[1];
        px[k + 2] = c[2];
        px[k + 3] = max > 0 ? Math.round(255 * Math.pow(Math.abs(w) / max, GAMMA)) : 0;
      }
    }
    ig.putImageData(data, 0, 0);
  }

  draw(g: CanvasRenderingContext2D, width: number, height: number, ctx: PlotCtx): void {
    const state = ctx.state;
    if (!state) return;
    this.refresh(state, ctx.t);
    // The image's canvas is a stable place for tests to read the minimum from.
    g.canvas.dataset.wignerMin = String(this.min);

    const pad = { l: 34, r: 10, t: 10, b: 22 };
    const side = Math.max(10, Math.min(width - pad.l - pad.r, height - pad.t - pad.b));
    const cx = pad.l + (width - pad.l - pad.r) / 2;
    const cy = pad.t + (height - pad.t - pad.b) / 2;
    const scale = side / (2 * VIEW); // px per unit
    const X = (x: number) => cx + x * scale;
    const Y = (p: number) => cy - p * scale;

    if (ctx.axes) {
      g.font = `400 10px ${fonts.mono}`;
      g.lineWidth = 1;
      for (let v = -4; v <= 4; v += 2) {
        g.strokeStyle = v === 0 ? S.axis : S.grid;
        g.beginPath();
        g.moveTo(Math.round(X(v)) + 0.5, Y(VIEW));
        g.lineTo(Math.round(X(v)) + 0.5, Y(-VIEW));
        g.moveTo(X(-VIEW), Math.round(Y(v)) + 0.5);
        g.lineTo(X(VIEW), Math.round(Y(v)) + 0.5);
        g.stroke();
        g.fillStyle = S.label;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText(String(v), X(v), Y(-VIEW) + 5);
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillText(String(v), X(-VIEW) - 6, Y(v));
      }
    }

    g.save();
    g.beginPath();
    g.rect(X(-VIEW), Y(VIEW), side, side);
    g.clip();
    g.translate(cx, cy);
    g.rotate(ctx.t);
    const e = this.source.extent * scale;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.image!, -e, -e, 2 * e, 2 * e);
    g.restore();

    const h = ctx.history;
    if (h.length > 0 && h.has(this.xKey)) {
      const i = h.length - 1;
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.arc(X(h.get(this.xKey).get(i)), Y(h.get(this.pKey).get(i)), 3, 0, Math.PI * 2);
      g.fill();
    }

    g.font = `600 11px ${fonts.mono}`;
    g.fillStyle = S.label;
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText('x', X(VIEW) - 4, Y(0) - 3);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('p', X(0) + 5, Y(VIEW) + 3);

    if (this.min < -1e-3) {
      g.font = `500 10px ${fonts.mono}`;
      g.textAlign = 'left';
      g.textBaseline = 'bottom';
      g.fillStyle = `rgb(${diverging.negative.join(',')})`;
      g.fillText(`W min = ${formatNumber(this.min, 3)}`, X(-VIEW) + 4, Y(-VIEW) - 3);
    }

    const hv = ctx.hover;
    if (hv && Math.abs(hv.x - cx) <= side / 2 && Math.abs(hv.y - cy) <= side / 2) {
      drawTag(
        g,
        hv.x + 10,
        hv.y - 24,
        `x = ${formatNumber((hv.x - cx) / scale)}, p = ${formatNumber((cy - hv.y) / scale)}`,
        S.label,
        { x: 0, y: 0, w: width, h: height },
      );
    }
  }
}
