import { DEFAULT_DT } from '../core/sim/SimulationLoop';
import type { Model } from '../models/types';

/** Integrates `model` for `duration` seconds, calling `onStep(t, state)` after every step. */
export function simulate<P>(
  model: Model<Float64Array, P>,
  p: P,
  state: Float64Array,
  duration: number,
  onStep?: (t: number, y: Float64Array) => void,
  dt = DEFAULT_DT,
  t0 = 0,
): number {
  const n = Math.round(duration / dt);
  let step = Math.round(t0 / dt);
  for (let i = 0; i < n; i++) {
    model.step(state, p, step * dt, dt);
    step++;
    onStep?.(step * dt, state);
  }
  return step * dt;
}

/** Least-squares fit y ≈ c0 + c·cos(ωt) + s·sin(ωt). */
export function fitSinusoid(ts: number[], ys: number[], omega: number) {
  // Normal equations for the basis [1, cos, sin].
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const r = [0, 0, 0];
  for (let i = 0; i < ts.length; i++) {
    const b = [1, Math.cos(omega * ts[i]!), Math.sin(omega * ts[i]!)];
    for (let a = 0; a < 3; a++) {
      r[a]! += b[a]! * ys[i]!;
      for (let c = 0; c < 3; c++) M[a]![c]! += b[a]! * b[c]!;
    }
  }
  const [c0, c, s] = solve3(M, r);
  return { offset: c0, amplitude: Math.hypot(c, s), phase: Math.atan2(s, c) };
}

function solve3(M: number[][], r: number[]): [number, number, number] {
  const A = M.map((row, i) => [...row, r[i]!]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let i = col + 1; i < 3; i++) if (Math.abs(A[i]![col]!) > Math.abs(A[piv]![col]!)) piv = i;
    [A[col], A[piv]] = [A[piv]!, A[col]!];
    for (let i = 0; i < 3; i++) {
      if (i === col) continue;
      const f = A[i]![col]! / A[col]![col]!;
      for (let j = col; j < 4; j++) A[i]![j]! -= f * A[col]![j]!;
    }
  }
  return [A[0]![3]! / A[0]![0]!, A[1]![3]! / A[1]![1]!, A[2]![3]! / A[2]![2]!];
}
