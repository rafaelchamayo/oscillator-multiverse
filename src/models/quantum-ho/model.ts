import type { Kinematic, Model } from '../types';
import { BASIS, J, LEVELS, N_MAX } from './hermite';

/**
 * Quantum harmonic oscillator in 1D, natural units ħ = m = ω = 1: x in √(ħ/mω), E in ħω, t in
 * 1/ω. The state is the vector of complex coefficients of ψ = Σ cₙ ψₙ, laid out as
 * [Re c₀…c_N, Im c₀…c_N] and always normalized (Σ|cₙ|² = 1).
 *
 * Time evolution is exact: cₙ(t) = cₙ(0) e^{−iEₙt}. Every state repeats after t = 2π (up to a
 * global phase −1).
 */
export type QhoParams = Record<string, number>;

export const QHO_DEFAULTS: QhoParams = {};

/** Initial coefficients (any norm; `createState` normalizes). Missing entries are 0. */
export interface QhoInit {
  re: number[];
  im: number[];
}

/** Largest |α|√2 = √(⟨x⟩² + ⟨p⟩²) of a coherent state the hand can make (truncation < 1e-10). */
export const R_MAX = 4.8;

export const energy = (n: number): number => n + 0.5;

const IM = LEVELS;

/** Writes the normalized coherent state |α⟩, α = (x₀ + i p₀)/√2, into the state `s`. */
export function writeCoherent(s: Float64Array, x0: number, p0: number): void {
  const r = Math.hypot(x0, p0);
  if (r > R_MAX) {
    x0 *= R_MAX / r;
    p0 *= R_MAX / r;
  }
  const ar = x0 / Math.SQRT2;
  const ai = p0 / Math.SQRT2;
  // cₙ = e^{−|α|²/2} αⁿ/√n!, built as cₙ = cₙ₋₁ · α/√n.
  s[0] = Math.exp(-0.5 * (ar * ar + ai * ai));
  s[IM] = 0;
  for (let n = 1; n < LEVELS; n++) {
    const k = 1 / Math.sqrt(n);
    const pr = s[n - 1]!;
    const pi = s[IM + n - 1]!;
    s[n] = (pr * ar - pi * ai) * k;
    s[IM + n] = (pr * ai + pi * ar) * k;
  }
  normalize(s);
}

/** Scales the coefficients to unit norm; the zero vector becomes the ground state. */
export function normalize(s: Float64Array): void {
  let sum = 0;
  for (let n = 0; n < LEVELS; n++) sum += s[n]! * s[n]! + s[IM + n]! * s[IM + n]!;
  if (sum < 1e-300) {
    s.fill(0);
    s[0] = 1;
    return;
  }
  const k = 1 / Math.sqrt(sum);
  for (let i = 0; i < 2 * LEVELS; i++) s[i]! *= k;
}

/**
 * Sets cₙ = r e^{iφ} (0 ≤ r ≤ 1) and rescales the other coefficients so the norm stays 1.
 * If the others are all zero, cₙ alone carries the norm: |cₙ| = 1 whatever r is.
 */
export function setCoefficient(s: Float64Array, n: number, r: number, phi: number): void {
  r = Math.min(1, Math.max(0, r));
  let others = 0;
  for (let m = 0; m < LEVELS; m++) {
    if (m !== n) others += s[m]! * s[m]! + s[IM + m]! * s[IM + m]!;
  }
  if (others < 1e-24) r = 1;
  const k = others < 1e-24 ? 0 : Math.sqrt((1 - r * r) / others);
  for (let m = 0; m < LEVELS; m++) {
    if (m === n) continue;
    s[m]! *= k;
    s[IM + m]! *= k;
  }
  s[n] = r * Math.cos(phi);
  s[IM + n] = r * Math.sin(phi);
}

// ---- Initial states ----

const empty = (): QhoInit => ({ re: Array(LEVELS).fill(0), im: Array(LEVELS).fill(0) });

/** The eigenstate ψₙ. */
export function eigenInit(n: number): QhoInit {
  const init = empty();
  init.re[n] = 1;
  return init;
}

/** Σ amp · e^{i phase} ψₙ (normalized later by `createState`). */
export function superposeInit(terms: { n: number; amp: number; phase?: number }[]): QhoInit {
  const init = empty();
  for (const t of terms) {
    init.re[t.n] = t.amp * Math.cos(t.phase ?? 0);
    init.im[t.n] = t.amp * Math.sin(t.phase ?? 0);
  }
  return init;
}

const toInit = (s: Float64Array): QhoInit => ({
  re: Array.from(s.subarray(0, LEVELS)),
  im: Array.from(s.subarray(IM, 2 * LEVELS)),
});

/** The coherent state centered at (x₀, p₀) in phase space. */
export function coherentInit(x0: number, p0 = 0): QhoInit {
  const s = new Float64Array(2 * LEVELS);
  writeCoherent(s, x0, p0);
  return toInit(s);
}

/** Schrödinger cat: |α⟩ + |−α⟩ with α = x₀/√2 (only even levels survive). */
export function catInit(x0: number): QhoInit {
  const a = coherentInit(x0);
  const b = coherentInit(-x0);
  return {
    re: a.re.map((c, n) => c + b.re[n]!),
    im: a.im.map((c, n) => c + b.im[n]!),
  };
}

// ---- Expectation values (ladder operators: a cₙ → √n cₙ₋₁) ----

/** ⟨a⟩ = Σ √n c*ₙ₋₁ cₙ, written as [re, im]. */
function expectA(s: Float64Array, out: Float64Array): void {
  let re = 0;
  let im = 0;
  for (let n = 1; n < LEVELS; n++) {
    const k = Math.sqrt(n);
    const ar = s[n - 1]!;
    const ai = s[IM + n - 1]!;
    const br = s[n]!;
    const bi = s[IM + n]!;
    re += k * (ar * br + ai * bi);
    im += k * (ar * bi - ai * br);
  }
  out[0] = re;
  out[1] = im;
}

const tmp = new Float64Array(2);

/** ⟨x⟩ = √2 Re⟨a⟩. */
export function meanX(s: Float64Array): number {
  expectA(s, tmp);
  return Math.SQRT2 * tmp[0]!;
}

/** ⟨p⟩ = √2 Im⟨a⟩. */
export function meanP(s: Float64Array): number {
  expectA(s, tmp);
  return Math.SQRT2 * tmp[1]!;
}

const P_KEYS = Array.from({ length: LEVELS }, (_, n) => `P${n}`);

const kinematic: Kinematic<Float64Array> = {
  getPos: (s) => meanX(s),
  getVel: (s) => meanP(s),
  // The hand places a coherent state: a minimum-uncertainty packet at (x, p = v).
  setKinematic: (s, x, v) => writeCoherent(s, x, v),
};

export const qhoModel: Model<Float64Array, QhoParams, QhoInit> & Kinematic<Float64Array> = {
  id: 'quantum-ho',
  ...kinematic,
  createState: (_p, init) => {
    const s = new Float64Array(2 * LEVELS);
    for (let n = 0; n < LEVELS; n++) {
      s[n] = init.re[n] ?? 0;
      s[IM + n] = init.im[n] ?? 0;
    }
    normalize(s);
    return s;
  },
  cloneState: (s) => s.slice(),
  copyState: (src, dst) => dst.set(src),
  step: (s, _p, _t, dt) => {
    for (let n = 0; n < LEVELS; n++) {
      const th = -energy(n) * dt;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const re = s[n]!;
      const im = s[IM + n]!;
      s[n] = re * c - im * sn;
      s[IM + n] = re * sn + im * c;
    }
  },
  observables: (s, _p, _t, out) => {
    let N = 0;
    let a2r = 0;
    for (let n = 0; n < LEVELS; n++) {
      const P = s[n]! * s[n]! + s[IM + n]! * s[IM + n]!;
      out[P_KEYS[n]!] = P;
      N += n * P;
      if (n >= 2) {
        // Re⟨a²⟩ = Re Σ √(n(n−1)) c*ₙ₋₂ cₙ.
        const k = Math.sqrt(n * (n - 1));
        a2r += k * (s[n - 2]! * s[n]! + s[IM + n - 2]! * s[IM + n]!);
      }
    }
    expectA(s, tmp);
    const x = Math.SQRT2 * tmp[0]!;
    const p = Math.SQRT2 * tmp[1]!;
    const x2 = a2r + N + 0.5;
    const p2 = -a2r + N + 0.5;
    const dx = Math.sqrt(Math.max(0, x2 - x * x));
    const dp = Math.sqrt(Math.max(0, p2 - p * p));
    out.x = x;
    out.v = p;
    out.p = p;
    out.x2 = x2;
    out.p2 = p2;
    out.dx = dx;
    out.dp = dp;
    out.dxdp = dx * dp;
    out.N = N;
    // ⟨T⟩ = ⟨p²⟩/2 and ⟨V⟩ = ⟨x²⟩/2 (named like the classical tabs' K and U).
    out.K = 0.5 * p2;
    out.U = 0.5 * x2;
    out.E = N + 0.5;
    out.Eeq = out.E;
    return out;
  },
  latexODE: () => ({
    lhs: [{ id: 'time', sign: 1, latex: 'i\\,\\frac{\\partial \\psi}{\\partial t}' }],
    rhs: [
      {
        id: 'kinetic',
        sign: -1,
        latex: '\\tfrac{1}{2}\\,\\frac{\\partial^2 \\psi}{\\partial x^2}',
      },
      { id: 'potential', sign: 1, latex: '\\tfrac{1}{2}\\,x^2\\,\\psi' },
    ],
  }),
};

/** The state with its time phases undone, cₙ e^{iEₙt}: constant under free evolution. */
export function phaseFree(s: Float64Array, t: number, out: Float64Array): void {
  for (let n = 0; n < LEVELS; n++) {
    const c = Math.cos(energy(n) * t);
    const sn = Math.sin(energy(n) * t);
    const re = s[n]!;
    const im = s[IM + n]!;
    out[n] = re * c - im * sn;
    out[IM + n] = re * sn + im * c;
  }
}

/** ψ(x_j) = Σ cₙ ψₙ(x_j) on the grid, into preallocated buffers of length J. */
export function evalPsi(s: Float64Array, outRe: Float64Array, outIm: Float64Array): void {
  outRe.fill(0);
  outIm.fill(0);
  for (let n = 0; n < LEVELS; n++) {
    const cr = s[n]!;
    const ci = s[IM + n]!;
    if (cr === 0 && ci === 0) continue;
    const off = n * J;
    for (let j = 0; j < J; j++) {
      const b = BASIS[off + j]!;
      outRe[j]! += cr * b;
      outIm[j]! += ci * b;
    }
  }
}

export { N_MAX };
