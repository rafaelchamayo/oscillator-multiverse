import { symmetricEigen } from '../../core/math/eigen';
import { fmtCoef } from '../latex';
import { chainKinematic } from '../mechanical';
import { odeModel } from '../ode';
import type { MatrixEntry } from '../types';

/**
 * Chain of n masses (2 ≤ n ≤ 5) between two walls, joined by n + 1 springs:
 *   wall —k₁— m₁ —k₂— m₂ … mₙ —kₙ₊₁— wall
 *   mᵢ ẍᵢ = −kᵢ (xᵢ − xᵢ₋₁) + kᵢ₊₁ (xᵢ₊₁ − xᵢ),   x₀ = xₙ₊₁ = 0,
 * i.e. M ẍ + K x = 0 with M = diag(mᵢ) and K tridiagonal. xᵢ is the displacement of mass i from
 * its equilibrium. The state always holds MAX_N bodies, [x₁…x₅, v₁…v₅]; only the first n move.
 */
export const MAX_N = 5;
export const MIN_N = 2;

export interface CoupledParams {
  n: number;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  k6: number;
}

/** Initial displacements and velocities of the first n masses. */
export interface CoupledInit {
  x: number[];
  v: number[];
}

export const COUPLED_DEFAULTS: CoupledParams = {
  n: 3,
  m1: 1,
  m2: 1,
  m3: 1,
  m4: 1,
  m5: 1,
  k1: 4,
  k2: 4,
  k3: 4,
  k4: 4,
  k5: 4,
  k6: 4,
};

/** Slider ranges. The physics tests run at these extremes. */
export const COUPLED_RANGES = {
  m: { min: 0.2, max: 5, step: 0.1 },
  k: { min: 0.5, max: 50, step: 0.5 },
} as const;

type P = CoupledParams;
const M_KEYS = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;
const K_KEYS = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'] as const;
/** Observable names per body / mode, precomputed so `observables` builds no strings per step. */
const keys = (prefix: string) => Array.from({ length: MAX_N }, (_, i) => `${prefix}${i + 1}`);
const XK = keys('x');
const VK = keys('v');
const KK = keys('K');
const EK = keys('E');
const QK = keys('q');
const QDK = keys('qd');
const EQK = keys('Eq');

/** Mass i (1-based). */
export const massOf = (p: P, i: number): number => p[M_KEYS[i - 1]!];
/** Spring j (1-based): spring j joins mass j − 1 and mass j (0 and n + 1 are the walls). */
export const springOf = (p: P, j: number): number => p[K_KEYS[j - 1]!];
export const countOf = (p: P): number => Math.min(MAX_N, Math.max(MIN_N, Math.round(p.n)));

export interface NormalModes {
  n: number;
  /** Angular frequencies ωₙ, ascending. */
  omega: number[];
  /** Mode shapes, `shape[mode][mass]`, normalized so that Φᵀ M Φ = I. */
  shape: number[][];
}

/** Last parameters the modes were computed for: [n, m₁…m₅, k₁…k₆] (compared without allocating). */
const cacheKey = new Float64Array(1 + MAX_N + MAX_N + 1).fill(NaN);
let cachedModes: NormalModes | null = null;

function sameParams(p: P): boolean {
  let same = cacheKey[0] === p.n;
  cacheKey[0] = p.n;
  for (let i = 0; i < MAX_N; i++) {
    same &&= cacheKey[1 + i] === p[M_KEYS[i]!];
    cacheKey[1 + i] = p[M_KEYS[i]!];
  }
  for (let j = 0; j <= MAX_N; j++) {
    same &&= cacheKey[1 + MAX_N + j] === p[K_KEYS[j]!];
    cacheKey[1 + MAX_N + j] = p[K_KEYS[j]!];
  }
  return same;
}

/**
 * Normal modes from K φ = ω² M φ, solved as the symmetric problem M^{-1/2} K M^{-1/2} ψ = ω² ψ
 * with φ = M^{-1/2} ψ. Cached by the parameters (recomputed only when n, m or k change).
 */
export function normalModes(p: P): NormalModes {
  if (sameParams(p) && cachedModes) return cachedModes;
  const n = countOf(p);

  const K = stiffness(p);
  const r = Array.from({ length: n }, (_, i) => 1 / Math.sqrt(massOf(p, i + 1)));
  const A = K.map((row, i) => row.map((kij, j) => r[i]! * kij * r[j]!));
  const { values, vectors } = symmetricEigen(A);
  const shape = values.map((_, mode) => {
    const phi = r.map((ri, i) => ri * vectors[i]![mode]!);
    // Sign convention: the first nonzero component is positive.
    const lead = phi.find((c) => Math.abs(c) > 1e-9) ?? 1;
    return lead < 0 ? phi.map((c) => -c) : phi;
  });
  const modes = { n, omega: values.map((w2) => Math.sqrt(Math.max(0, w2))), shape };
  cachedModes = modes;
  return modes;
}

/** The n × n stiffness matrix K. */
export function stiffness(p: P): number[][] {
  const n = countOf(p);
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return springOf(p, i + 1) + springOf(p, i + 2);
      if (Math.abs(i - j) === 1) return -springOf(p, Math.max(i, j) + 1);
      return 0;
    }),
  );
}

/** Initial condition of pure mode `mode` (0-based), scaled so the largest |xᵢ| is `amplitude`. */
export function modeInit(p: P, mode: number, amplitude: number): CoupledInit {
  const phi = normalModes(p).shape[mode]!;
  const max = Math.max(...phi.map(Math.abs));
  return { x: phi.map((c) => (c / max) * amplitude), v: phi.map(() => 0) };
}

const kinematic = chainKinematic<P>(MAX_N, countOf);

export const coupledModel = odeModel<P, CoupledInit, typeof kinematic>(
  {
    dim: 2 * MAX_N,
    deriv: (_t, y, p, out) => {
      const n = countOf(p);
      for (let i = 0; i < MAX_N; i++) {
        out[i] = i < n ? y[MAX_N + i]! : 0;
        if (i >= n) {
          out[MAX_N + i] = 0;
          continue;
        }
        const x = y[i]!;
        const left = i > 0 ? y[i - 1]! : 0;
        const right = i < n - 1 ? y[i + 1]! : 0;
        const F = -springOf(p, i + 1) * (x - left) + springOf(p, i + 2) * (right - x);
        out[MAX_N + i] = F / massOf(p, i + 1);
      }
    },
  },
  {
    id: 'coupled',
    ...kinematic,
    createState: (p, init) => {
      const y = new Float64Array(2 * MAX_N);
      const n = countOf(p);
      for (let i = 0; i < n; i++) {
        y[i] = init.x[i] ?? 0;
        y[MAX_N + i] = init.v[i] ?? 0;
      }
      return y;
    },
    observables: (y, p, _t, out) => {
      const n = countOf(p);
      let K = 0;
      let U = 0;
      for (let i = 1; i <= MAX_N; i++) {
        const on = i <= n;
        const x = on ? y[i - 1]! : 0;
        const v = on ? y[MAX_N + i - 1]! : 0;
        out[XK[i - 1]!] = x;
        out[VK[i - 1]!] = v;
        const Ki = on ? 0.5 * massOf(p, i) * v * v : 0;
        out[KK[i - 1]!] = Ki;
        K += Ki;
      }
      // Spring j stretches by x_j − x_{j−1}; each mass gets its K plus half of each spring it shares.
      for (let i = 1; i <= MAX_N; i++) out[EK[i - 1]!] = out[KK[i - 1]!]!;
      for (let j = 1; j <= n + 1; j++) {
        const xl = j > 1 ? y[j - 2]! : 0;
        const xr = j <= n ? y[j - 1]! : 0;
        const Uj = 0.5 * springOf(p, j) * (xr - xl) ** 2;
        U += Uj;
        // A wall spring belongs wholly to its mass.
        const share = j === 1 || j === n + 1 ? Uj : Uj / 2;
        if (j > 1) out[EK[j - 2]!]! += share;
        if (j <= n) out[EK[j - 1]!]! += share;
      }
      out.K = K;
      out.U = U;
      out.E = K + U;
      // Names shared with the 1-DOF tabs (energy bar, debug): body 1 and the total energy.
      out.x = y[0]!;
      out.v = y[MAX_N]!;
      out.Ueq = U;
      out.Eeq = K + U;

      // Normal coordinates qₙ = φₙᵀ M x and their energies ½(q̇ₙ² + ωₙ² qₙ²).
      const modes = normalModes(p);
      for (let mode = 1; mode <= MAX_N; mode++) {
        let q = 0;
        let qd = 0;
        if (mode <= n) {
          const phi = modes.shape[mode - 1]!;
          for (let i = 0; i < n; i++) {
            const mi = massOf(p, i + 1);
            q += phi[i]! * mi * y[i]!;
            qd += phi[i]! * mi * y[MAX_N + i]!;
          }
        }
        const w = mode <= n ? modes.omega[mode - 1]! : 0;
        out[QK[mode - 1]!] = q;
        out[QDK[mode - 1]!] = qd;
        out[EQK[mode - 1]!] = 0.5 * (qd * qd + w * w * q * q);
      }
      return out;
    },
    latexODE: (p) => {
      const n = countOf(p);
      const zero: MatrixEntry = { latex: '0', ids: [] };
      const M = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
          i === j ? { latex: fmtCoef(massOf(p, i + 1)), ids: [`m${i + 1}`] } : zero,
        ),
      );
      const K = stiffness(p).map((row, i) =>
        row.map((kij, j): MatrixEntry => {
          if (i === j) {
            return { latex: fmtCoef(kij), ids: [`k${i + 1}`, `k${i + 2}`] };
          }
          if (Math.abs(i - j) === 1) {
            return { latex: `-${fmtCoef(kij)}`, ids: [`k${Math.max(i, j) + 1}`] };
          }
          return zero;
        }),
      );
      return {
        lhs: [
          { id: 'mass', sign: 1, latex: 'M\\,\\ddot{\\mathbf{x}}' },
          { id: 'spring', sign: 1, latex: 'K\\,\\mathbf{x}' },
        ],
        rhs: [],
        matrix: { M, K },
      };
    },
  },
);
