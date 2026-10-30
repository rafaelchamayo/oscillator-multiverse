/**
 * Estimates pointer velocity from recent samples by least-squares slope over a short
 * window (~80 ms), which smooths jitter better than the last two points.
 */
export class FlingEstimator {
  private ts: number[] = [];
  private xs: number[] = [];

  constructor(
    readonly windowMs = 80,
    readonly maxSpeed = Infinity,
  ) {}

  reset(): void {
    this.ts = [];
    this.xs = [];
  }

  add(timeMs: number, x: number): void {
    this.ts.push(timeMs);
    this.xs.push(x);
    const cutoff = timeMs - this.windowMs * 2;
    while (this.ts.length > 2 && this.ts[0]! < cutoff) {
      this.ts.shift();
      this.xs.shift();
    }
  }

  /** Velocity in units per second at `nowMs`; 0 if the pointer has been still. */
  velocity(nowMs: number): number {
    const from = nowMs - this.windowMs;
    let n = 0;
    let st = 0;
    let sx = 0;
    let stt = 0;
    let stx = 0;
    for (let i = 0; i < this.ts.length; i++) {
      const t = this.ts[i]!;
      if (t < from) continue;
      const tt = (t - nowMs) / 1000;
      const x = this.xs[i]!;
      n++;
      st += tt;
      sx += x;
      stt += tt * tt;
      stx += tt * x;
    }
    if (n < 2) return 0;
    const den = n * stt - st * st;
    if (den <= 1e-12) return 0;
    const v = (n * stx - st * sx) / den;
    return Math.max(-this.maxSpeed, Math.min(this.maxSpeed, v));
  }
}
