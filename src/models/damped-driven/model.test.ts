import { describe, expect, it } from 'vitest';
import { equationToLatex } from '../latex';
import { G_EARTH } from '../mechanical';
import { fitSinusoid, simulate } from '../../test/sim';
import {
  equilibrium,
  freePosition,
  omega0,
  regime,
  resonanceOmega,
  settlingTime,
  steadyAmplitude,
  steadyPhase,
} from './analytic';
import { dampedDrivenModel as model, type DampedDrivenParams } from './model';

const base: DampedDrivenParams = { m: 1, k: 4, b: 0, F0: 0, omega: 1, g: 0 };

describe('damped (unforced) vs analytic solution', () => {
  const cases: [string, DampedDrivenParams][] = [
    ['underdamped', { ...base, b: 1 }],
    ['critical', { ...base, b: 4 }],
    ['overdamped', { ...base, b: 10 }],
    ['overdamped, stiff extreme', { ...base, m: 0.2, k: 1, b: 20 }],
    ['underdamped + gravity', { ...base, b: 0.5, g: G_EARTH }],
  ];

  it.each(cases)('%s: error < 1e-5', (name, p) => {
    if (!name.includes('extreme') && !name.includes('gravity')) {
      expect(regime(p, 0)).toBe(name.split(',')[0]);
    }
    const x0 = 0.5;
    const v0 = -0.8;
    const y = model.createState(p, { x0, v0 });
    let maxErr = 0;
    simulate(model, p, y, 15, (t, s) => {
      maxErr = Math.max(maxErr, Math.abs(s[0]! - freePosition(p, x0, v0, t)));
    });
    expect(maxErr / Math.abs(x0)).toBeLessThan(1e-5);
  });
});

describe('driven — steady state matches A(ω) and φ(ω)', () => {
  const p0: DampedDrivenParams = { m: 1, k: 4, b: 0.4, F0: 1, omega: 1, g: 0 };
  const omegas = [0.8, 1.5, 1.96, 2.4, 4];

  it.each(omegas)('ω = %f: amplitude and phase within 1%', (omega) => {
    for (const g of [0, G_EARTH]) {
      const p = { ...p0, omega, g };
      const y = model.createState(p, { x0: 0.4, v0: 0.5 });
      const tSettle = settlingTime(p, 1e-5);
      const T = (2 * Math.PI) / omega;
      const ts: number[] = [];
      const xs: number[] = [];
      simulate(model, p, y, tSettle + 10 * T, (t, s) => {
        if (t > tSettle) {
          ts.push(t);
          xs.push(s[0]!);
        }
      });
      const fit = fitSinusoid(ts, xs, omega);
      const A = steadyAmplitude(p);
      expect(Math.abs(fit.amplitude / A - 1)).toBeLessThan(0.01);
      expect(Math.abs(fit.phase - steadyPhase(p))).toBeLessThan(0.01 * Math.PI);
      expect(fit.offset).toBeCloseTo(equilibrium(p), 4);
    }
  });

  it('resonance frequency sits below ω₀ and maximises A(ω)', () => {
    const wr = resonanceOmega(p0);
    expect(wr).toBeLessThan(omega0(p0));
    const A = (w: number) => steadyAmplitude(p0, w);
    expect(A(wr)).toBeGreaterThan(A(wr * 0.99));
    expect(A(wr)).toBeGreaterThan(A(wr * 1.01));
  });
});

describe('driven — energy balance ΔE = W_in − W_diss', () => {
  const cases: DampedDrivenParams[] = [
    { m: 1, k: 4, b: 0.4, F0: 2, omega: 1.5, g: 0 },
    { m: 0.5, k: 20, b: 3, F0: 5, omega: 6, g: G_EARTH },
    { m: 2, k: 8, b: 0.05, F0: 1, omega: 2, g: 0 }, // near resonance, light damping
  ];

  it.each(cases)('within 1% (m=$m k=$k b=$b)', (p) => {
    const y = model.createState(p, { x0: 0.3, v0: 0 });
    const e0 = model.observables(y, p, 0, {}).E!;
    const t = simulate(model, p, y, 30);
    const o = model.observables(y, p, t, {});
    const dE = o.E! - e0;
    const balance = o.Win! - o.Wdiss!;
    const scale = Math.abs(o.Win!) + Math.abs(o.Wdiss!);
    expect(Math.abs(dE - balance) / scale).toBeLessThan(0.01);
  });
});

describe('driven — gravity', () => {
  it('settles at x = −mg/k when damped and unforced', () => {
    const p: DampedDrivenParams = { ...base, m: 2, k: 8, b: 3, g: G_EARTH };
    const y = model.createState(p, { x0: 0, v0: 0 });
    simulate(model, p, y, 40);
    expect(Math.abs(y[0]! - (-p.m * p.g) / p.k)).toBeLessThan(1e-6);
  });
});

describe('regime badge and ODE', () => {
  it('classifies regimes with a tolerance band around critical', () => {
    expect(regime({ ...base, b: 0 })).toBe('undamped');
    expect(regime({ ...base, b: 1 })).toBe('underdamped');
    expect(regime({ ...base, b: 4.002 })).toBe('critical');
    expect(regime({ ...base, b: 4.002 }, 0)).toBe('overdamped');
    expect(regime({ ...base, b: 6 })).toBe('overdamped');
  });

  it('substitutes the current values in the ODE', () => {
    const p: DampedDrivenParams = { m: 1, k: 4, b: 0.4, F0: 1, omega: 1.5, g: 0 };
    expect(equationToLatex(model.latexODE(p))).toBe(
      '1.0\\,\\ddot x + 0.4\\,\\dot x + 4.0\\,x = 1.0\\cos(1.5\\,t)',
    );
  });
});
