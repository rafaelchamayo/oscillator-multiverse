import { shoEquilibrium, shoOmega0, type ShoParams } from './model';

/** x(t) = x_eq + (x₀ − x_eq) cos ω₀t + (v₀/ω₀) sin ω₀t. */
export function shoPosition(p: ShoParams, x0: number, v0: number, t: number): number {
  const w = shoOmega0(p);
  const xe = shoEquilibrium(p);
  return xe + (x0 - xe) * Math.cos(w * t) + (v0 / w) * Math.sin(w * t);
}

export function shoVelocity(p: ShoParams, x0: number, v0: number, t: number): number {
  const w = shoOmega0(p);
  const xe = shoEquilibrium(p);
  return -(x0 - xe) * w * Math.sin(w * t) + v0 * Math.cos(w * t);
}
