import { describe, expect, it } from 'vitest';
import { BASIS, DX, J, J0, LEVELS, N_MAX, basisRow, gridX, hermiteFunctions } from './hermite';
import {
  QHO_DEFAULTS,
  R_MAX,
  catInit,
  coherentInit,
  eigenInit,
  evalPsi,
  meanP,
  meanX,
  qhoModel,
  setCoefficient,
  superposeInit,
  type QhoInit,
} from './model';
import { WIGNER_GRID, rotatedPoint, wignerCoord, wignerFromPsi } from './wigner';

const p = QHO_DEFAULTS;
const make = (init: QhoInit) => qhoModel.createState(p, init);
const obs = (s: Float64Array) => qhoModel.observables(s, p, 0, {});
const norm2 = (s: Float64Array) => s.reduce((a, c) => a + c * c, 0);

/** Advances `s` to time t in `steps` equal steps. */
function evolve(s: Float64Array, t: number, steps: number): Float64Array {
  for (let i = 0; i < steps; i++) qhoModel.step(s, p, (i * t) / steps, t / steps);
  return s;
}

function psi(s: Float64Array) {
  const re = new Float64Array(J);
  const im = new Float64Array(J);
  evalPsi(s, re, im);
  return { re, im };
}

/** A superposition with every kind of term: low and high levels, assorted phases. */
const mixed = () =>
  make(
    superposeInit([
      { n: 0, amp: 0.6, phase: 0.3 },
      { n: 1, amp: 0.5, phase: -1.1 },
      { n: 2, amp: 0.4, phase: 2.0 },
      { n: 5, amp: 0.3, phase: 0.7 },
      { n: 12, amp: 0.2, phase: -2.5 },
    ]),
  );

describe('Hermite basis', () => {
  it('is orthonormal on the grid', () => {
    let worst = 0;
    for (let m = 0; m < LEVELS; m++) {
      for (let n = m; n < LEVELS; n++) {
        let dot = 0;
        for (let j = 0; j < J; j++) dot += BASIS[m * J + j]! * BASIS[n * J + j]!;
        worst = Math.max(worst, Math.abs(dot * DX - (m === n ? 1 : 0)));
      }
    }
    expect(worst).toBeLessThan(1e-10);
  });

  it('solves −½ψ″ + ½x²ψ = (n + ½)ψ (derivatives by the ladder identities)', () => {
    // ψₙ′ = √(n/2) ψₙ₋₁ − √((n+1)/2) ψₙ₊₁, applied twice: exact algebra on the recurrence.
    const f = new Float64Array(N_MAX + 3);
    const d1 = (n: number, k: (m: number) => number): number =>
      (n > 0 ? Math.sqrt(n / 2) * k(n - 1) : 0) - Math.sqrt((n + 1) / 2) * k(n + 1);
    let worst = 0;
    for (const x of [-7.3, -2.1, -0.4, 0, 0.9, 3.3, 6.2]) {
      hermiteFunctions(x, N_MAX + 2, f);
      const val = (n: number) => f[n]!;
      for (let n = 0; n <= N_MAX; n++) {
        const second = d1(n, (m) => d1(m, val));
        const H = -0.5 * second + 0.5 * x * x * f[n]!;
        worst = Math.max(worst, Math.abs(H - (n + 0.5) * f[n]!));
      }
    }
    expect(worst).toBeLessThan(1e-10);
  });

  it('agrees with a finite-difference Hamiltonian for low levels', () => {
    for (let n = 0; n <= 5; n++) {
      const psiN = basisRow(n);
      let worst = 0;
      for (let j = J0 - 300; j <= J0 + 300; j++) {
        const lap = (psiN[j + 1]! - 2 * psiN[j]! + psiN[j - 1]!) / (DX * DX);
        const x = gridX(j);
        worst = Math.max(
          worst,
          Math.abs(-0.5 * lap + 0.5 * x * x * psiN[j]! - (n + 0.5) * psiN[j]!),
        );
      }
      expect(worst).toBeLessThan(1e-3);
    }
  });
});

describe('time evolution', () => {
  it('keeps the norm over 10⁶ steps (only round-off: ~1e-16 per step, as a random walk)', () => {
    const s = mixed();
    evolve(s, 1e6 / 240, 1e6);
    expect(Math.abs(norm2(s) - 1)).toBeLessThan(1e-9);
  });

  it('every state comes back after t = 2π, up to the global phase −1', () => {
    const s0 = mixed();
    const s = evolve(s0.slice(), 2 * Math.PI, 1000);
    let worst = 0;
    for (let i = 0; i < s.length; i++) worst = Math.max(worst, Math.abs(s[i]! + s0[i]!));
    expect(worst).toBeLessThan(1e-12);
  });

  it('an eigenstate is stationary: |ψ|² does not change', () => {
    const s = make(eigenInit(7));
    const a = psi(s);
    const b = psi(evolve(s, 1.234, 300));
    let worst = 0;
    for (let j = 0; j < J; j++) {
      worst = Math.max(
        worst,
        Math.abs(a.re[j]! ** 2 + a.im[j]! ** 2 - b.re[j]! ** 2 - b.im[j]! ** 2),
      );
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it('Ehrenfest: d⟨x⟩/dt = ⟨p⟩ and d⟨p⟩/dt = −⟨x⟩', () => {
    const s = mixed();
    const h = 1e-5;
    const x0 = meanX(s);
    const p0 = meanP(s);
    evolve(s, h, 1);
    expect((meanX(s) - x0) / h).toBeCloseTo(p0, 4);
    expect((meanP(s) - p0) / h).toBeCloseTo(-x0, 4);
  });
});

describe('coherent states', () => {
  const cases: [number, number][] = [
    [2.5, 0],
    [0, -3],
    [-1.7, 2.2],
    [R_MAX, 0],
  ];

  it('are not truncated by the basis, even at the edge of what the hand can make', () => {
    // Analytic norm of the kept levels: e^{−|α|²} Σ_{n≤N} |α|^{2n}/n!.
    const a2 = (R_MAX * R_MAX) / 2;
    let term = Math.exp(-a2);
    let kept = term;
    for (let n = 1; n < LEVELS; n++) {
      term *= a2 / n;
      kept += term;
    }
    expect(1 - kept).toBeLessThan(1e-10);
  });

  it('follow the classical orbit with minimum uncertainty Δx = Δp = 1/√2', () => {
    for (const [x0, p0] of cases) {
      const s = make(coherentInit(x0, p0));
      for (const t of [0, 0.7, Math.PI / 2, 2.9, 5.5]) {
        const st = evolve(s.slice(), t, 200);
        const o = obs(st);
        expect(Math.abs(o.x! - (x0 * Math.cos(t) + p0 * Math.sin(t)))).toBeLessThan(1e-9);
        expect(Math.abs(o.p! - (-x0 * Math.sin(t) + p0 * Math.cos(t)))).toBeLessThan(1e-9);
        expect(Math.abs(o.dx! - Math.SQRT1_2)).toBeLessThan(1e-9);
        expect(Math.abs(o.dp! - Math.SQRT1_2)).toBeLessThan(1e-9);
        expect(Math.abs(o.dxdp! - 0.5)).toBeLessThan(1e-9);
      }
    }
  });

  it('the hand places one: setKinematic then getPos/getVel give back (x, v)', () => {
    const s = make(eigenInit(3));
    qhoModel.setKinematic(s, 1.3, -0.8);
    expect(qhoModel.getPos(s)).toBeCloseTo(1.3, 10);
    expect(qhoModel.getVel(s)).toBeCloseTo(-0.8, 10);
    expect(Math.abs(norm2(s) - 1)).toBeLessThan(1e-12);
    // Beyond the reach of the basis it is pulled back to radius R_MAX.
    qhoModel.setKinematic(s, 10, 0);
    expect(qhoModel.getPos(s)).toBeCloseTo(R_MAX, 9);
  });
});

describe('observables', () => {
  it('match the moments of |ψ|² on the grid', () => {
    const s = mixed();
    const { re, im } = psi(s);
    let mx = 0;
    let mx2 = 0;
    for (let j = 0; j < J; j++) {
      const rho = re[j]! ** 2 + im[j]! ** 2;
      mx += gridX(j) * rho * DX;
      mx2 += gridX(j) ** 2 * rho * DX;
    }
    const o = obs(s);
    expect(Math.abs(o.x! - mx)).toBeLessThan(1e-10);
    expect(Math.abs(o.x2! - mx2)).toBeLessThan(1e-10);
  });

  it('⟨E⟩ = ⟨T⟩ + ⟨V⟩ = Σ Pₙ (n + ½) and Heisenberg Δx Δp ≥ ½', () => {
    for (const s of [mixed(), make(eigenInit(4)), make(catInit(2.5))]) {
      const o = obs(s);
      let E = 0;
      let P = 0;
      for (let n = 0; n < LEVELS; n++) {
        E += o[`P${n}`]! * (n + 0.5);
        P += o[`P${n}`]!;
      }
      expect(P).toBeCloseTo(1, 12);
      expect(o.E).toBeCloseTo(E, 12);
      expect(o.K! + o.U!).toBeCloseTo(o.E!, 12);
      expect(o.dxdp!).toBeGreaterThanOrEqual(0.5 - 1e-12);
    }
    // ψₙ: Δx Δp = n + ½.
    expect(obs(make(eigenInit(4))).dxdp).toBeCloseTo(4.5, 12);
  });

  it('a cat state has only even levels', () => {
    const o = obs(make(catInit(2.5)));
    for (let n = 1; n < LEVELS; n += 2) expect(o[`P${n}`]!).toBeLessThan(1e-28);
  });
});

describe('setCoefficient', () => {
  it('sets |cₙ| and arg cₙ and keeps the norm', () => {
    const s = mixed();
    setCoefficient(s, 3, 0.6, 1.2);
    expect(Math.abs(norm2(s) - 1)).toBeLessThan(1e-14);
    expect(Math.hypot(s[3]!, s[LEVELS + 3]!)).toBeCloseTo(0.6, 14);
    expect(Math.atan2(s[LEVELS + 3]!, s[3]!)).toBeCloseTo(1.2, 14);
  });

  it('a lone coefficient keeps the whole norm', () => {
    const s = make(eigenInit(2));
    setCoefficient(s, 2, 0.3, -0.5);
    expect(Math.hypot(s[2]!, s[LEVELS + 2]!)).toBeCloseTo(1, 14);
    expect(Math.atan2(s[LEVELS + 2]!, s[2]!)).toBeCloseTo(-0.5, 14);
  });
});

describe('Wigner function', () => {
  const G = WIGNER_GRID;
  const step = G.stride * DX;
  const W = (s: Float64Array) => {
    const { re, im } = psi(s);
    return wignerFromPsi(re, im, G);
  };
  const at = (w: Float64Array, ix: number, ip: number) => w[ip * G.size + ix]!;

  it('integrates to 1 (on a ±12 grid: the shown ±6 one cuts the tails of high levels)', () => {
    const wide = { size: 241, stride: G.stride };
    for (const s of [make(eigenInit(0)), mixed(), make(catInit(2.5))]) {
      const { re, im } = psi(s);
      const total = wignerFromPsi(re, im, wide).reduce((a, c) => a + c, 0) * step * step;
      expect(Math.abs(total - 1)).toBeLessThan(1e-6);
    }
  });

  it('is the Gaussian e^{−(x²+p²)}/π for the ground state', () => {
    const w = W(make(eigenInit(0)));
    let worst = 0;
    for (let ip = 0; ip < G.size; ip += 7) {
      for (let ix = 0; ix < G.size; ix += 7) {
        const x = wignerCoord(G, ix);
        const q = wignerCoord(G, ip);
        worst = Math.max(worst, Math.abs(at(w, ix, ip) - Math.exp(-(x * x + q * q)) / Math.PI));
      }
    }
    expect(worst).toBeLessThan(1e-10);
  });

  it('is negative somewhere for a cat state and for ψ₁, never for a coherent state', () => {
    expect(Math.min(...W(make(catInit(2.5))))).toBeLessThan(-0.05);
    // W₁(0, 0) = −1/π.
    const w1 = W(make(eigenInit(1)));
    const c = (G.size - 1) / 2;
    expect(at(w1, c, c)).toBeCloseTo(-1 / Math.PI, 10);
    expect(Math.min(...W(make(coherentInit(2, -1))))).toBeGreaterThan(-1e-10);
  });

  it('rotates rigidly (clockwise) with time', () => {
    const s0 = mixed();
    const w0 = W(s0);
    const t = Math.PI / 2; // a quarter turn maps the grid onto itself
    const wt = W(evolve(s0.slice(), t, 100));
    const half = (G.size - 1) / 2;
    let worst = 0;
    for (let ip = 0; ip < G.size; ip += 3) {
      for (let ix = 0; ix < G.size; ix += 3) {
        const [x, q] = rotatedPoint(wignerCoord(G, ix), wignerCoord(G, ip), t);
        const jx = Math.round(x / step) + half;
        const jp = Math.round(q / step) + half;
        worst = Math.max(worst, Math.abs(at(wt, ix, ip) - at(w0, jx, jp)));
      }
    }
    expect(worst).toBeLessThan(1e-10);
  });
});
