import type { Kinematic } from './types';

/** Kinematic access for 1-DOF states laid out as [x, v, ...]. */
export const mechanicalKinematic: Kinematic<Float64Array> = {
  getPos: (s) => s[0]!,
  getVel: (s) => s[1]!,
  setKinematic: (s, x, v) => {
    s[0] = x;
    s[1] = v;
  },
};

/**
 * Kinematic access for a chain of up to `max` bodies laid out as [x₁…x_max, v₁…v_max];
 * `count` gives how many are in use for the current params.
 */
export function chainKinematic<P>(max: number, count: (p: P) => number): Kinematic<Float64Array> {
  return {
    getPos: (s, i = 0) => s[i]!,
    getVel: (s, i = 0) => s[max + i]!,
    setKinematic: (s, x, v, i = 0) => {
      s[i] = x;
      s[max + i] = v;
    },
    bodies: (p) => count(p as P),
  };
}

/** Standard gravity (m/s²) used when the vertical view has gravity on. */
export const G_EARTH = 9.81;
