import { describe, expect, it } from 'vitest';
import { equationToLatex } from '../latex';
import { G_EARTH } from '../mechanical';
import { simulate } from '../../test/sim';
import { shoPosition } from './analytic';
import {
  SHO_RANGES,
  shoEquilibrium,
  shoModel,
  shoOmega0,
  shoPeriod,
  type ShoParams,
} from './model';

const cases: ShoParams[] = [
  { m: 2, k: 8, g: 0 }, // default
  { m: SHO_RANGES.m.min, k: SHO_RANGES.k.max, g: 0 }, // stiffest: ω₀ ≈ 15.8 rad/s
  { m: SHO_RANGES.m.max, k: SHO_RANGES.k.min, g: 0 }, // softest
  { m: 1, k: 10, g: G_EARTH }, // vertical with gravity
];
const x0 = 0.5;
const v0 = 0.3;

const label = (p: ShoParams) => `m=${p.m} k=${p.k} g=${p.g}`;

describe('SHO — RK4 vs analytic solution', () => {
  it.each(cases)('relative error < 1e-6 over 10 periods ($m, $k, $g)', (p) => {
    const y = shoModel.createState(p, { x0, v0 });
    const xe = shoEquilibrium(p);
    const amp = Math.hypot(x0 - xe, v0 / shoOmega0(p));
    let maxErr = 0;
    simulate(shoModel, p, y, 10 * shoPeriod(p), (t, s) => {
      maxErr = Math.max(maxErr, Math.abs(s[0]! - shoPosition(p, x0, v0, t)) / amp);
    });
    expect(maxErr, label(p)).toBeLessThan(1e-6);
  });
});

describe('SHO — period from zero crossings', () => {
  it.each(cases)('matches 2π√(m/k) within 0.1% ($m, $k, $g)', (p) => {
    const y = shoModel.createState(p, { x0, v0 });
    const xe = shoEquilibrium(p);
    const crossings: number[] = [];
    let prevT = 0;
    let prevU = y[0]! - xe;
    simulate(shoModel, p, y, 20 * shoPeriod(p), (t, s) => {
      const u = s[0]! - xe;
      if (prevU < 0 && u >= 0) crossings.push(prevT + ((0 - prevU) / (u - prevU)) * (t - prevT));
      prevT = t;
      prevU = u;
    });
    expect(crossings.length).toBeGreaterThanOrEqual(19);
    const measured = (crossings.at(-1)! - crossings[0]!) / (crossings.length - 1);
    expect(Math.abs(measured / shoPeriod(p) - 1)).toBeLessThan(1e-3);
  });
});

describe('SHO — energy conservation', () => {
  it.each(cases)('relative drift < 1e-5 over 100 periods ($m, $k, $g)', (p) => {
    const y = shoModel.createState(p, { x0, v0 });
    const obs = shoModel.observables(y, p, 0, {});
    // Measure relative to the oscillation energy (E − E_min), which stays meaningful with gravity.
    const xe = shoEquilibrium(p);
    const eMin = 0.5 * p.k * xe * xe + p.m * p.g * xe;
    const e0 = obs.E! - eMin;
    let maxDrift = 0;
    simulate(shoModel, p, y, 100 * shoPeriod(p), (t, s) => {
      const e = shoModel.observables(s, p, t, obs).E! - eMin;
      maxDrift = Math.max(maxDrift, Math.abs(e - e0) / e0);
    });
    expect(maxDrift).toBeLessThan(1e-5);
  });
});

describe('SHO — gravity (vertical view)', () => {
  const p: ShoParams = { m: 2, k: 8, g: G_EARTH };

  it('equilibrium is at x = −mg/k and is stationary', () => {
    expect(shoEquilibrium(p)).toBeCloseTo((-p.m * p.g) / p.k, 12);
    const y = shoModel.createState(p, { x0: shoEquilibrium(p), v0: 0 });
    simulate(shoModel, p, y, 10);
    expect(Math.abs(y[0]! - shoEquilibrium(p))).toBeLessThan(1e-9);
    expect(Math.abs(y[1]!)).toBeLessThan(1e-9);
  });

  it('oscillates around −mg/k (mean over whole periods)', () => {
    const y = shoModel.createState(p, { x0: 0, v0: 0 });
    let sum = 0;
    let n = 0;
    simulate(shoModel, p, y, 10 * shoPeriod(p), (_t, s) => {
      sum += s[0]!;
      n++;
    });
    expect(sum / n).toBeCloseTo(shoEquilibrium(p), 3);
  });
});

describe('SHO — observables and ODE', () => {
  it('splits energy and forces consistently', () => {
    const p: ShoParams = { m: 2, k: 8, g: 0 };
    const o = shoModel.observables(Float64Array.of(0.5, -1), p, 0, {});
    expect(o.K).toBeCloseTo(1);
    expect(o.U).toBeCloseTo(1);
    expect(o.E).toBeCloseTo(2);
    expect(o.Fspring).toBeCloseTo(-4);
    expect(o.a).toBeCloseTo(-2);
  });

  it('substitutes the current values in the ODE', () => {
    expect(equationToLatex(shoModel.latexODE({ m: 2, k: 8, g: 0 }))).toBe(
      '2.0\\,\\ddot x + 8.0\\,x = 0',
    );
    expect(equationToLatex(shoModel.latexODE({ m: 2, k: 8, g: 9.81 }))).toBe(
      '2.0\\,\\ddot x + 8.0\\,x = -2.0\\cdot 9.81',
    );
  });
});
