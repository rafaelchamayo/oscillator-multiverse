import { equilibrium, omega0, settlingTime } from '../../models/damped-driven/analytic';
import type { DampedDrivenParams } from '../../models/damped-driven/model';
import { DD_RANGES } from '../../models/damped-driven/model';

export interface SweepPoint {
  omega: number;
  A: number;
}

/** Relative spread of the last half-cycle amplitudes below which the motion counts as steady. */
const STABLE_SPREAD = 0.002;
const HALF_CYCLES = 4;
/** Points of an automatic sweep. */
const SWEEP_POINTS = 25;

/**
 * Measures the resonance curve the way a lab would: it watches x(t), estimates the amplitude
 * from consecutive extrema and, once the transient has died out and the amplitude is stable,
 * records a point (ω, A). In automatic mode it then steps ω up and waits again.
 *
 * Changing m, k, b, F₀ or g makes the recorded points stale, so they are cleared.
 */
export class ResonanceSweep {
  points: SweepPoint[] = [];
  auto = false;
  /** Latest amplitude estimate (half peak-to-peak of the last cycle), NaN until known. */
  amplitude = NaN;
  steady = false;

  private shape = '';
  private omega = NaN;
  private since = 0;
  private recorded = false;
  private x1 = NaN;
  private x2 = NaN;
  private lastMax = NaN;
  private lastMin = NaN;
  private amps: number[] = [];
  private lo = 0;
  private hi = 0;

  constructor(private readonly api: { setParam(key: string, value: number): void }) {}

  /** Feed one history sample (x is the block position). */
  onSample(t: number, x: number, p: DampedDrivenParams, manual: boolean): void {
    const shape = shapeOf(p);
    if (shape !== this.shape) {
      this.shape = shape;
      this.points = [];
      this.auto = false;
      this.restart(t);
    }
    if (p.omega !== this.omega) {
      this.omega = p.omega;
      this.restart(t);
    }
    if (manual) {
      this.restart(t);
      return;
    }

    const xr = x - equilibrium(p);
    if (Number.isFinite(this.x2)) {
      const a = this.x2;
      const b = this.x1;
      const c = xr;
      // Extremum at the previous sample: refine with the parabola through the three samples.
      const curv = a - 2 * b + c;
      const peak = curv !== 0 ? b - ((c - a) * (c - a)) / (8 * curv) : b;
      if (b > a && b >= c) this.extremum('max', peak);
      else if (b < a && b <= c) this.extremum('min', peak);
    }
    this.x2 = this.x1;
    this.x1 = xr;

    const settle = Math.min(settlingTime(p, 0.005), 600);
    const mean = this.amps.reduce((s, v) => s + v, 0) / (this.amps.length || 1);
    const spread = this.amps.length
      ? (Math.max(...this.amps) - Math.min(...this.amps)) / (mean || 1)
      : Infinity;
    this.steady =
      p.F0 > 0 &&
      Number.isFinite(settle) &&
      t - this.since >= settle &&
      this.amps.length >= HALF_CYCLES &&
      spread < STABLE_SPREAD;

    if (this.steady && !this.recorded) {
      this.recorded = true;
      this.points = this.points.filter((q) => Math.abs(q.omega - p.omega) > 1e-9);
      this.points.push({ omega: p.omega, A: this.amplitude });
      this.points.sort((q, r) => q.omega - r.omega);
      if (this.auto) {
        const next = p.omega + (this.hi - this.lo) / (SWEEP_POINTS - 1);
        if (next > this.hi + 1e-9) this.auto = false;
        else this.api.setParam('omega', round(next));
      }
    }
  }

  /** Starts an automatic sweep from 0.3 ω₀ to 2.2 ω₀ (within the slider range). */
  startAuto(p: DampedDrivenParams): void {
    const w0 = omega0(p);
    this.lo = Math.max(DD_RANGES.omega.min, round(0.3 * w0));
    this.hi = Math.min(DD_RANGES.omega.max, 2.2 * w0);
    this.points = [];
    this.shape = shapeOf(p);
    this.auto = true;
    if (p.omega === this.lo) this.recorded = false;
    this.api.setParam('omega', this.lo);
  }

  stopAuto(): void {
    this.auto = false;
  }

  clear(): void {
    this.points = [];
  }

  /** Forget the motion tracking (after a reset); points are kept. */
  reset(): void {
    this.auto = false;
    this.restart(0);
  }

  private restart(t: number): void {
    this.since = t;
    this.recorded = false;
    this.steady = false;
    this.x1 = this.x2 = NaN;
    this.lastMax = this.lastMin = NaN;
    this.amps = [];
    this.amplitude = NaN;
  }

  private extremum(kind: 'max' | 'min', value: number): void {
    if (kind === 'max') this.lastMax = value;
    else this.lastMin = value;
    if (!Number.isFinite(this.lastMax) || !Number.isFinite(this.lastMin)) return;
    this.amplitude = (this.lastMax - this.lastMin) / 2;
    this.amps.push(this.amplitude);
    if (this.amps.length > HALF_CYCLES) this.amps.shift();
  }
}

/** Everything but ω: when it changes, the measured curve belongs to another oscillator. */
const shapeOf = (p: DampedDrivenParams): string => `${p.m}|${p.k}|${p.b}|${p.F0}|${p.g}`;

const round = (v: number): number => Math.round(v * 1000) / 1000;
