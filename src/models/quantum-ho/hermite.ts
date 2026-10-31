/**
 * Hermite functions: the eigenstates of the harmonic oscillator in natural units (ħ = m = ω = 1),
 * ψₙ(x) = (2ⁿ n! √π)^{-1/2} Hₙ(x) e^{-x²/2}, with energy Eₙ = n + ½.
 */

/** Highest level kept. Coherent states up to |α|² ≈ 12 lose < 1e-10 of their norm above it. */
export const N_MAX = 40;
/** Number of levels (n = 0…N_MAX). */
export const LEVELS = N_MAX + 1;

/** Position grid: wide enough that ψ_N_MAX (turning point √81 = 9) has decayed at the edges. */
export const X_MIN = -12;
export const X_MAX = 12;
export const DX = 0.02;
export const J = Math.round((X_MAX - X_MIN) / DX) + 1;
/** Index of x = 0 on the grid. */
export const J0 = (J - 1) / 2;

/**
 * ψ₀…ψ_nMax at x, written into `out`, by the normalized three-term recurrence
 * ψₙ₊₁ = √(2/(n+1)) x ψₙ − √(n/(n+1)) ψₙ₋₁, which never forms Hₙ or n! (no overflow).
 */
export function hermiteFunctions(x: number, nMax: number, out: Float64Array): Float64Array {
  out[0] = Math.PI ** -0.25 * Math.exp(-0.5 * x * x);
  if (nMax >= 1) out[1] = Math.SQRT2 * x * out[0]!;
  for (let n = 1; n < nMax; n++) {
    out[n + 1] = Math.sqrt(2 / (n + 1)) * x * out[n]! - Math.sqrt(n / (n + 1)) * out[n - 1]!;
  }
  return out;
}

/** x of grid point j. */
export const gridX = (j: number): number => X_MIN + j * DX;

/** ψₙ(x_j) for every level and grid point: `BASIS[n * J + j]`. */
export const BASIS: Float64Array = (() => {
  const table = new Float64Array(LEVELS * J);
  const col = new Float64Array(LEVELS);
  for (let j = 0; j < J; j++) {
    hermiteFunctions(gridX(j), N_MAX, col);
    for (let n = 0; n < LEVELS; n++) table[n * J + j] = col[n]!;
  }
  return table;
})();

/** ψₙ on the grid (a view into `BASIS`, no copy). */
export const basisRow = (n: number): Float64Array => BASIS.subarray(n * J, (n + 1) * J);
