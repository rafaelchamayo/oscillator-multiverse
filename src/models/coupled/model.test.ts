import { describe, expect, it } from 'vitest';
import { simulate } from '../../test/sim';
import {
  COUPLED_DEFAULTS,
  COUPLED_RANGES,
  MAX_N,
  coupledModel,
  massOf,
  modeInit,
  normalModes,
  stiffness,
  type CoupledParams,
} from './model';

const uniform = (n: number, m: number, k: number): CoupledParams => ({
  n,
  m1: m,
  m2: m,
  m3: m,
  m4: m,
  m5: m,
  k1: k,
  k2: k,
  k3: k,
  k4: k,
  k5: k,
  k6: k,
});

const { m: MR, k: KR } = COUPLED_RANGES;

/** Uniform chains at the slider extremes plus non-uniform ones (all N). */
const cases: CoupledParams[] = [
  ...[2, 3, 4, 5].map((n) => uniform(n, 1, 4)),
  uniform(5, MR.min, KR.max), // fastest: ω up to ≈ 31 rad/s
  uniform(2, MR.max, KR.min), // slowest
  {
    ...COUPLED_DEFAULTS,
    n: 4,
    m1: MR.min,
    m2: 3,
    m3: MR.max,
    m4: 0.7,
    k1: KR.max,
    k3: KR.min,
    k5: 9,
  },
  { ...COUPLED_DEFAULTS, n: 2, m1: 1, m2: 4, k1: 2, k2: 0.5, k3: 10 },
];
const label = (p: CoupledParams) => JSON.stringify(p);

const slowestPeriod = (p: CoupledParams) => (2 * Math.PI) / normalModes(p).omega[0]!;

describe('coupled — normal modes', () => {
  it.each(cases)('Φᵀ M Φ = I and Φᵀ K Φ = diag(ω²) (%#)', (p) => {
    const { n, omega, shape } = normalModes(p);
    const K = stiffness(p);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        let mm = 0;
        let kk = 0;
        for (let i = 0; i < n; i++) {
          mm += shape[a]![i]! * massOf(p, i + 1) * shape[b]![i]!;
          for (let j = 0; j < n; j++) kk += shape[a]![i]! * K[i]![j]! * shape[b]![j]!;
        }
        expect(Math.abs(mm - (a === b ? 1 : 0)), label(p)).toBeLessThan(1e-10);
        const w2 = a === b ? omega[a]! ** 2 : 0;
        expect(Math.abs(kk - w2) / omega[n - 1]! ** 2, label(p)).toBeLessThan(1e-10);
      }
    }
  });

  it.each([2, 3, 4, 5])('uniform chain of %i: ωₙ = 2ω₀ sin(nπ / 2(N+1))', (N) => {
    const p = uniform(N, 1.5, 6);
    const w0 = Math.sqrt(6 / 1.5);
    const { omega } = normalModes(p);
    omega.forEach((w, i) => {
      const expected = 2 * w0 * Math.sin(((i + 1) * Math.PI) / (2 * (N + 1)));
      expect(Math.abs(w - expected)).toBeLessThan(1e-9);
    });
  });
});

describe('coupled — pure modes', () => {
  it.each(cases)('a mode stays a mode and oscillates at ωₙ (%#)', (p) => {
    const { n, omega } = normalModes(p);
    for (let mode = 0; mode < n; mode++) {
      const y = coupledModel.createState(p, modeInit(p, mode, 0.3));
      const obs = coupledModel.observables(y, p, 0, {});
      const E = obs.E!;
      const T = (2 * Math.PI) / omega[mode]!;
      let leak = 0;
      const crossings: number[] = [];
      let prevT = 0;
      let prevQ = obs[`q${mode + 1}`]!;
      simulate(coupledModel, p, y, 12 * T, (t, s) => {
        coupledModel.observables(s, p, t, obs);
        for (let other = 1; other <= n; other++) {
          if (other !== mode + 1) leak = Math.max(leak, obs[`Eq${other}`]! / E);
        }
        const q = obs[`q${mode + 1}`]!;
        if (prevQ < 0 && q >= 0) crossings.push(prevT + (-prevQ / (q - prevQ)) * (t - prevT));
        prevT = t;
        prevQ = q;
      });
      expect(leak, `${label(p)} mode ${mode + 1}`).toBeLessThan(1e-8);
      expect(crossings.length).toBeGreaterThanOrEqual(11);
      const measured = (crossings.at(-1)! - crossings[0]!) / (crossings.length - 1);
      expect(Math.abs(measured / T - 1), `${label(p)} mode ${mode + 1}`).toBeLessThan(1e-3);
    }
  });
});

describe('coupled — two masses vs the analytic superposition of modes', () => {
  const twoMass = [
    uniform(2, 1, 4),
    { ...COUPLED_DEFAULTS, n: 2, m1: 1, m2: 4, k1: 2, k2: 0.5, k3: 10 },
  ];
  it.each(twoMass)('error < 1e-6 of the amplitude over 10 slow periods (%#)', (p) => {
    const x0 = [0.4, -0.1];
    const v0 = [0.2, 0.5];
    const { omega, shape } = normalModes(p);
    // xᵢ(t) = Σₙ φₙᵢ (qₙ(0) cos ωₙt + q̇ₙ(0)/ωₙ sin ωₙt), with qₙ = φₙᵀ M x.
    const q0 = shape.map((phi) => phi.reduce((s, c, i) => s + c * massOf(p, i + 1) * x0[i]!, 0));
    const qd0 = shape.map((phi) => phi.reduce((s, c, i) => s + c * massOf(p, i + 1) * v0[i]!, 0));
    const exact = (t: number, i: number) =>
      shape.reduce(
        (s, phi, n) =>
          s +
          phi[i]! *
            (q0[n]! * Math.cos(omega[n]! * t) + (qd0[n]! / omega[n]!) * Math.sin(omega[n]! * t)),
        0,
      );
    const y = coupledModel.createState(p, { x: x0, v: v0 });
    let maxErr = 0;
    simulate(coupledModel, p, y, 10 * slowestPeriod(p), (t, s) => {
      for (let i = 0; i < 2; i++) maxErr = Math.max(maxErr, Math.abs(s[i]! - exact(t, i)));
    });
    expect(maxErr / 0.5).toBeLessThan(1e-6);
  });
});

describe('coupled — energy', () => {
  it.each(cases)('E drifts < 1e-5 and every Eqₙ is constant over 100 slow periods (%#)', (p) => {
    const n = normalModes(p).n;
    const y = coupledModel.createState(p, {
      x: [0.3, -0.2, 0.15, 0.1, -0.25].slice(0, n),
      v: [0.4, 0.1, -0.3, 0.2, 0].slice(0, n),
    });
    const obs = coupledModel.observables(y, p, 0, {});
    const E0 = obs.E!;
    const Eq0 = Array.from({ length: n }, (_, i) => obs[`Eq${i + 1}`]!);
    expect(Math.abs(Eq0.reduce((a, b) => a + b, 0) - E0) / E0).toBeLessThan(1e-10);
    let drift = 0;
    let modeDrift = 0;
    let splitErr = 0;
    simulate(coupledModel, p, y, 100 * slowestPeriod(p), (t, s) => {
      coupledModel.observables(s, p, t, obs);
      drift = Math.max(drift, Math.abs(obs.E! - E0) / E0);
      for (let i = 0; i < n; i++) {
        modeDrift = Math.max(modeDrift, Math.abs(obs[`Eq${i + 1}`]! - Eq0[i]!) / E0);
      }
      let sum = 0;
      for (let i = 1; i <= MAX_N; i++) sum += obs[`E${i}`]!;
      splitErr = Math.max(splitErr, Math.abs(sum - obs.E!) / E0);
    });
    // The per-mass energies Eᵢ add up to E.
    expect(splitErr, label(p)).toBeLessThan(1e-12);
    expect(drift, label(p)).toBeLessThan(1e-5);
    expect(modeDrift, label(p)).toBeLessThan(1e-5);
  });
});

describe('coupled — unused bodies', () => {
  it('masses beyond n stay at rest and the ODE matrices are n × n', () => {
    const p = uniform(3, 1, 4);
    const y = coupledModel.createState(p, { x: [0.2, 0, -0.1, 0.5, 0.5], v: [0, 0, 0, 1, 1] });
    simulate(coupledModel, p, y, 5);
    expect([y[3], y[4], y[MAX_N + 3], y[MAX_N + 4]]).toEqual([0, 0, 0, 0]);
    const eq = coupledModel.latexODE(p);
    expect(eq.matrix!.M.length).toBe(3);
    expect(eq.matrix!.K[1]!.map((e) => e.latex)).toEqual(['-4.0', '8.0', '-4.0']);
    expect(eq.matrix!.K[1]![1]!.ids).toEqual(['k2', 'k3']);
  });
});
