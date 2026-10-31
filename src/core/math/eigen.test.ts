import { describe, expect, it } from 'vitest';
import { symmetricEigen } from './eigen';

const mul = (A: number[][], B: number[][]) =>
  A.map((row) => B[0]!.map((_, j) => row.reduce((s, a, k) => s + a * B[k]![j]!, 0)));
const transpose = (A: number[][]) => A[0]!.map((_, j) => A.map((row) => row[j]!));

describe('symmetricEigen', () => {
  const cases: number[][][] = [
    [
      [2, -1],
      [-1, 2],
    ],
    [
      [4, 1, 0.5, 0],
      [1, -3, 2, 1],
      [0.5, 2, 0, -1],
      [0, 1, -1, 7],
    ],
    // Repeated eigenvalue (identity block).
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 5],
    ],
  ];

  it.each(cases)('A V = V Λ with orthonormal V and ascending Λ (case %#)', (...rows) => {
    const A = rows as unknown as number[][];
    const { values, vectors: V } = symmetricEigen(A);
    const n = A.length;
    const AV = mul(A, V);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(Math.abs(AV[i]![j]! - V[i]![j]! * values[j]!)).toBeLessThan(1e-10);
      }
    }
    const VtV = mul(transpose(V), V);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++)
        expect(Math.abs(VtV[i]![j]! - (i === j ? 1 : 0))).toBeLessThan(1e-12);
    }
    for (let i = 1; i < n; i++) expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
  });
});
