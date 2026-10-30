import type { DampedDrivenParams } from './model';

export type Regime = 'undamped' | 'underdamped' | 'critical' | 'overdamped';

export const omega0 = (p: DampedDrivenParams): number => Math.sqrt(p.k / p.m);
export const gammaOf = (p: DampedDrivenParams): number => p.b / (2 * p.m);
export const equilibrium = (p: DampedDrivenParams): number => (-p.m * p.g) / p.k;

/**
 * Regime for the UI badge. `relTol` widens "critical" into a band so slider values
 * near γ = ω₀ read as critical.
 */
export function regime(p: DampedDrivenParams, relTol = 1e-3): Regime {
  const g = gammaOf(p);
  const w0 = omega0(p);
  if (g === 0) return 'undamped';
  if (Math.abs(g - w0) <= relTol * w0) return 'critical';
  return g < w0 ? 'underdamped' : 'overdamped';
}

/** Unforced response (F₀ = 0) from (x₀, v₀), exact in each regime. */
export function freePosition(p: DampedDrivenParams, x0: number, v0: number, t: number): number {
  const g = gammaOf(p);
  const w0 = omega0(p);
  const xe = equilibrium(p);
  const u0 = x0 - xe;
  const r = regime(p, 0);
  let u: number;
  if (r === 'critical') {
    u = Math.exp(-g * t) * (u0 + (v0 + g * u0) * t);
  } else if (r === 'overdamped') {
    const beta = Math.sqrt(g * g - w0 * w0);
    const s1 = -g + beta;
    const s2 = -g - beta;
    const c1 = (v0 - s2 * u0) / (s1 - s2);
    u = c1 * Math.exp(s1 * t) + (u0 - c1) * Math.exp(s2 * t);
  } else {
    const wd = Math.sqrt(w0 * w0 - g * g);
    u = Math.exp(-g * t) * (u0 * Math.cos(wd * t) + ((v0 + g * u0) / wd) * Math.sin(wd * t));
  }
  return xe + u;
}

/** Steady-state amplitude A(ω) = (F₀/m) / √((ω₀² − ω²)² + (2γω)²). */
export function steadyAmplitude(p: DampedDrivenParams, omega = p.omega): number {
  const w0 = omega0(p);
  const g = gammaOf(p);
  return p.F0 / p.m / Math.hypot(w0 * w0 - omega * omega, 2 * g * omega);
}

/** Phase lag φ(ω) ∈ [0, π] of the response behind the drive: x_ss = A cos(ωt − φ). */
export function steadyPhase(p: DampedDrivenParams, omega = p.omega): number {
  const w0 = omega0(p);
  const g = gammaOf(p);
  return Math.atan2(2 * g * omega, w0 * w0 - omega * omega);
}

export function steadyPosition(p: DampedDrivenParams, t: number): number {
  return equilibrium(p) + steadyAmplitude(p) * Math.cos(p.omega * t - steadyPhase(p));
}

export function steadyVelocity(p: DampedDrivenParams, t: number): number {
  return -p.omega * steadyAmplitude(p) * Math.sin(p.omega * t - steadyPhase(p));
}

/** Amplitude-resonance frequency √(ω₀² − 2γ²), or 0 when there is no peak. */
export function resonanceOmega(p: DampedDrivenParams): number {
  const w0 = omega0(p);
  const g = gammaOf(p);
  const s = w0 * w0 - 2 * g * g;
  return s > 0 ? Math.sqrt(s) : 0;
}

/** Time for the transient to decay to `fraction` of its size (∞ when undamped). */
export function settlingTime(p: DampedDrivenParams, fraction = 0.01): number {
  const g = gammaOf(p);
  const w0 = omega0(p);
  if (g === 0) return Infinity;
  // Slowest decay rate: γ when underdamped, γ − √(γ² − ω₀²) when overdamped.
  const rate = g < w0 ? g : g - Math.sqrt(g * g - w0 * w0);
  return Math.log(1 / fraction) / rate;
}
