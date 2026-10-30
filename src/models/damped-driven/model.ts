import { fmtCoef } from '../latex';
import { mechanicalKinematic } from '../mechanical';
import { odeModel } from '../ode';
import type { MechanicalInit, OdeTerm } from '../types';

/**
 * Damped driven oscillator: m ẍ + b ẋ + k x = F₀ cos(ω t) − m g.
 *
 * The drive is a direct force on the block (the crank is only its picture, DECISIONS.md).
 * The state is augmented to [x, v, W_in, W_diss], where W_in = ∫ F_drive·v dt is the work
 * done by the motor and W_diss = ∫ b v² dt the energy dissipated by the dashpot, so the
 * energy balance is integrated with the same accuracy as the motion.
 */
export interface DampedDrivenParams {
  m: number; // kg
  k: number; // N/m
  b: number; // N·s/m
  F0: number; // N
  omega: number; // rad/s
  g: number; // m/s²
}

export const DD_DEFAULTS: DampedDrivenParams = { m: 1, k: 4, b: 0.4, F0: 1, omega: 1.5, g: 0 };

export const DD_RANGES = {
  m: { min: 0.2, max: 5, step: 0.1 },
  k: { min: 1, max: 50, step: 0.5 },
  b: { min: 0, max: 20, step: 0.05 },
  F0: { min: 0, max: 20, step: 0.1 },
  omega: { min: 0.1, max: 15, step: 0.05 },
} as const;

export const ddDrive = (p: DampedDrivenParams, t: number): number => p.F0 * Math.cos(p.omega * t);

export const dampedDrivenModel = odeModel<
  DampedDrivenParams,
  MechanicalInit,
  typeof mechanicalKinematic
>(
  {
    dim: 4,
    deriv: (t, y, p, out) => {
      const v = y[1]!;
      const Fd = ddDrive(p, t);
      out[0] = v;
      out[1] = (-p.k * y[0]! - p.b * v + Fd) / p.m - p.g;
      out[2] = Fd * v;
      out[3] = p.b * v * v;
    },
  },
  {
    id: 'damped-driven',
    ...mechanicalKinematic,
    createState: (_p, init) => Float64Array.of(init.x0, init.v0, 0, 0),
    observables: (y, p, t, out) => {
      const x = y[0]!;
      const v = y[1]!;
      const Fspring = -p.k * x;
      const Fdamp = -p.b * v;
      const Fdrive = ddDrive(p, t);
      const Fgravity = -p.m * p.g;
      const Fnet = Fspring + Fdamp + Fdrive + Fgravity;
      const K = 0.5 * p.m * v * v;
      const U = 0.5 * p.k * x * x + p.m * p.g * x;
      out.x = x;
      out.v = v;
      out.a = Fnet / p.m;
      out.K = K;
      out.U = U;
      out.E = K + U;
      out.Fspring = Fspring;
      out.Fdamp = Fdamp;
      out.Fdrive = Fdrive;
      out.Fgravity = Fgravity;
      out.Fnet = Fnet;
      out.Pin = Fdrive * v;
      out.Pdiss = p.b * v * v;
      out.Win = y[2]!;
      out.Wdiss = y[3]!;
      return out;
    },
    latexODE: (p) => {
      const rhs: OdeTerm[] = [
        { id: 'drive', sign: 1, latex: `${fmtCoef(p.F0)}\\cos(${fmtCoef(p.omega)}\\,t)` },
      ];
      if (p.g > 0)
        rhs.push({ id: 'gravity', sign: -1, latex: `${fmtCoef(p.m)}\\cdot ${fmtCoef(p.g)}` });
      return {
        lhs: [
          { id: 'mass', sign: 1, latex: `${fmtCoef(p.m)}\\,\\ddot x` },
          { id: 'damper', sign: 1, latex: `${fmtCoef(p.b)}\\,\\dot x` },
          { id: 'spring', sign: 1, latex: `${fmtCoef(p.k)}\\,x` },
        ],
        rhs,
      };
    },
  },
);
