import { DX, J, J0 } from './hermite';

/**
 * Wigner function W(x, p) = (1/π) ∫ ψ*(x + y) ψ(x − y) e^{2ipy} dy (ħ = 1), sampled on a square
 * grid of `size` × `size` points centered at the origin, `stride` position-grid steps apart
 * (the same step in x and p). ∫∫ W dx dp = 1; W can be negative, which no classical
 * probability can.
 *
 * The harmonic oscillator only rotates W rigidly (clockwise, angle t), so W is computed once
 * per change of the coefficients and the plot turns the image: see `rotatedPoint`.
 */
export interface WignerGrid {
  size: number;
  stride: number;
}

export const WIGNER_GRID: WignerGrid = { size: 121, stride: 5 };

/** Coordinate of sample i along either axis. */
export const wignerCoord = (g: WignerGrid, i: number): number =>
  (i - (g.size - 1) / 2) * g.stride * DX;

/** cos/sin(2 p y_k) per (p index, k), cached per grid. */
let trig: { key: string; cos: Float64Array; sin: Float64Array } | null = null;

function trigTable(g: WignerGrid, K: number) {
  const key = `${g.size}:${g.stride}:${K}`;
  if (trig?.key === key) return trig;
  const cos = new Float64Array(g.size * (K + 1));
  const sin = new Float64Array(g.size * (K + 1));
  for (let ip = 0; ip < g.size; ip++) {
    const p = wignerCoord(g, ip);
    for (let k = 0; k <= K; k++) {
      cos[ip * (K + 1) + k] = Math.cos(2 * p * k * DX);
      sin[ip * (K + 1) + k] = Math.sin(2 * p * k * DX);
    }
  }
  trig = { key, cos, sin };
  return trig;
}

/** Scratch for the products ψ*(x + y_k) ψ(x − y_k). */
const ar = new Float64Array(J);
const ai = new Float64Array(J);

/**
 * W on the grid from ψ sampled on the position grid. `out[ip * size + ix]` (ip = 0 is the most
 * negative p). Returns `out`.
 */
export function wignerFromPsi(
  psiRe: Float64Array,
  psiIm: Float64Array,
  g: WignerGrid = WIGNER_GRID,
  out: Float64Array = new Float64Array(g.size * g.size),
): Float64Array {
  const K = J0;
  const { cos, sin } = trigTable(g, K);
  const half = (g.size - 1) / 2;
  for (let ix = 0; ix < g.size; ix++) {
    const j = J0 + (ix - half) * g.stride;
    const kMax = Math.min(j, J - 1 - j);
    for (let k = 0; k <= kMax; k++) {
      // ψ*(x + y) ψ(x − y) = (r₁ − i i₁)(r₂ + i i₂).
      const r1 = psiRe[j + k]!;
      const i1 = psiIm[j + k]!;
      const r2 = psiRe[j - k]!;
      const i2 = psiIm[j - k]!;
      ar[k] = r1 * r2 + i1 * i2;
      ai[k] = r1 * i2 - i1 * r2;
    }
    // The k and −k terms are complex conjugates: W = (Δy/π)[a₀ + 2 Σ_{k>0} Re(a_k e^{2ipy_k})].
    for (let ip = 0; ip < g.size; ip++) {
      const row = ip * (K + 1);
      let sum = 0;
      for (let k = 1; k <= kMax; k++) {
        sum += ar[k]! * cos[row + k]! - ai[k]! * sin[row + k]!;
      }
      out[ip * g.size + ix] = (DX / Math.PI) * (ar[0]! + 2 * sum);
    }
  }
  return out;
}

/**
 * W at time t from W at time 0 for the harmonic oscillator: a clockwise rotation of phase
 * space, W_t(x, p) = W₀(x cos t − p sin t, x sin t + p cos t).
 */
export function rotatedPoint(x: number, p: number, t: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c - p * s, x * s + p * c];
}
