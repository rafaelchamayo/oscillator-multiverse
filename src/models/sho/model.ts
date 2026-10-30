import { fmtCoef } from '../latex';
import { mechanicalKinematic } from '../mechanical';
import { odeModel } from '../ode';
import type { MechanicalInit, OdeTerm } from '../types';

/**
 * Simple harmonic oscillator: m ẍ + k x = −m g.
 * x is measured from the spring's natural length; g = 0 in the horizontal view and
 * g > 0 in the vertical view, where x points up (see DECISIONS.md).
 */
export interface ShoParams {
  m: number; // kg
  k: number; // N/m
  g: number; // m/s²
}

export const SHO_DEFAULTS: ShoParams = { m: 2, k: 8, g: 0 };

/** Slider ranges. The physics tests run at these extremes. */
export const SHO_RANGES = {
  m: { min: 0.2, max: 5, step: 0.1 },
  k: { min: 1, max: 50, step: 0.5 },
} as const;

export const shoModel = odeModel<ShoParams, MechanicalInit, typeof mechanicalKinematic>(
  {
    dim: 2,
    deriv: (_t, y, p, out) => {
      out[0] = y[1]!;
      out[1] = -(p.k / p.m) * y[0]! - p.g;
    },
  },
  {
    id: 'sho',
    ...mechanicalKinematic,
    createState: (_p, init) => Float64Array.of(init.x0, init.v0),
    observables: (y, p, _t, out) => {
      const x = y[0]!;
      const v = y[1]!;
      const Fspring = -p.k * x;
      const Fgravity = -p.m * p.g;
      const Fnet = Fspring + Fgravity;
      const K = 0.5 * p.m * v * v;
      const U = 0.5 * p.k * x * x + p.m * p.g * x;
      out.x = x;
      out.v = v;
      out.a = Fnet / p.m;
      out.K = K;
      out.U = U;
      out.E = K + U;
      out.Fspring = Fspring;
      out.Fgravity = Fgravity;
      out.Fnet = Fnet;
      return out;
    },
    latexODE: (p) => {
      const rhs: OdeTerm[] = [];
      if (p.g > 0)
        rhs.push({ id: 'gravity', sign: -1, latex: `${fmtCoef(p.m)}\\cdot ${fmtCoef(p.g)}` });
      return {
        lhs: [
          { id: 'mass', sign: 1, latex: `${fmtCoef(p.m)}\\,\\ddot x` },
          { id: 'spring', sign: 1, latex: `${fmtCoef(p.k)}\\,x` },
        ],
        rhs,
      };
    },
  },
);

export const shoOmega0 = (p: ShoParams): number => Math.sqrt(p.k / p.m);
export const shoPeriod = (p: ShoParams): number => 2 * Math.PI * Math.sqrt(p.m / p.k);
/** Equilibrium position: x = −mg/k (x up). */
export const shoEquilibrium = (p: ShoParams): number => (-p.m * p.g) / p.k;
