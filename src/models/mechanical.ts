import type { Kinematic } from './types';

/** Kinematic access for states laid out as [x, v, ...]. */
export const mechanicalKinematic: Kinematic<Float64Array> = {
  getPos: (s) => s[0]!,
  getVel: (s) => s[1]!,
  setKinematic: (s, x, v) => {
    s[0] = x;
    s[1] = v;
  },
};

/** Standard gravity (m/s²) used when the vertical view has gravity on. */
export const G_EARTH = 9.81;
