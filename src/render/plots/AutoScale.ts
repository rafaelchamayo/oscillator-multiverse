/**
 * Smoothly animated axis range. Expands quickly so data never leaves the plot, and shrinks
 * slowly (after the data has stayed small) so the scale doesn't jump.
 */
export class AutoScale {
  min: number;
  max: number;
  private initialized = false;

  constructor(
    readonly opts: {
      /** Smallest half-range allowed (avoids zooming into noise). */
      minSpan: number;
      /** Keep the range symmetric around zero. */
      symmetric?: boolean;
      /** Include zero in the range. */
      includeZero?: boolean;
      padding?: number;
    },
  ) {
    this.min = -opts.minSpan;
    this.max = opts.minSpan;
  }

  /** Target range for data in [lo, hi]. */
  target(lo: number, hi: number): [number, number] {
    const pad = this.opts.padding ?? 0.12;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 0;
    }
    if (this.opts.includeZero) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (this.opts.symmetric) {
      const m = Math.max(Math.abs(lo), Math.abs(hi), this.opts.minSpan) * (1 + pad);
      return [-m, m];
    }
    const span = Math.max(hi - lo, 2 * this.opts.minSpan);
    const mid = (lo + hi) / 2;
    const half = (span / 2) * (1 + pad);
    return [mid - half, mid + half];
  }

  update(lo: number, hi: number, dt: number): void {
    const [tMin, tMax] = this.target(lo, hi);
    if (!this.initialized) {
      this.min = tMin;
      this.max = tMax;
      this.initialized = true;
      return;
    }
    if (dt <= 0) return;
    const grow = 1 - Math.exp(-12 * dt);
    const shrink = 1 - Math.exp(-1.5 * dt);
    this.min += (tMin - this.min) * (tMin < this.min ? grow : shrink);
    this.max += (tMax - this.max) * (tMax > this.max ? grow : shrink);
  }

  reset(): void {
    this.initialized = false;
  }

  /** Map value → fraction in [0, 1] of the range. */
  frac(v: number): number {
    return (v - this.min) / (this.max - this.min || 1);
  }
}

/** "Nice" tick step (1, 2, 5 × 10ⁿ) for about `count` ticks over `span`. */
export function niceStep(span: number, count = 4): number {
  const raw = Math.abs(span) / Math.max(1, count);
  if (raw === 0 || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * p;
}
