/**
 * Generic physical model. Pure: no DOM, no rendering.
 *
 * The state type `S` is opaque to the core — a mechanical oscillator uses a Float64Array
 * [x, v, ...], coupled oscillators will use N degrees of freedom and the quantum oscillator a
 * vector of complex coefficients. Only optional capabilities (e.g. `Kinematic`) give the
 * UI a way to read or impose a position.
 */
export interface Model<S, P, I = unknown> {
  readonly id: string;
  createState(p: P, init: I): S;
  cloneState(s: S): S;
  copyState(src: S, dst: S): void;
  /** Advance `s` in place from t to t + dt. */
  step(s: S, p: P, t: number, dt: number): void;
  /** Writes derived quantities (energy, forces, ...) into `out` and returns it. */
  observables(s: S, p: P, t: number, out: Observables): Observables;
  /** The equation of motion with the current parameter values substituted. */
  latexODE(p: P): OdeEquation;
}

export type Observables = Record<string, number>;

/** One additive term of the ODE. `id` links it to scene objects for bidirectional highlight. */
export interface OdeTerm {
  id: string;
  /** LaTeX of the term's magnitude, without its leading sign. */
  latex: string;
  sign: 1 | -1;
}

export interface OdeEquation {
  lhs: OdeTerm[];
  rhs: OdeTerm[];
  /** Matrix form M ẍ + K x = 0 for systems of N bodies (lhs/rhs then hold its symbolic form). */
  matrix?: MatrixOde;
}

/** One entry of a matrix in the ODE; `ids` are the terms (objects) that contribute to it. */
export interface MatrixEntry {
  latex: string;
  ids: string[];
}

export interface MatrixOde {
  M: MatrixEntry[][];
  K: MatrixEntry[][];
}

/**
 * Capability of mechanical models: the hand can impose a body's position and velocity.
 * `i` is the body (0 for 1-DOF models); `bodies` says how many there are (default 1).
 */
export interface Kinematic<S> {
  getPos(s: S, i?: number): number;
  getVel(s: S, i?: number): number;
  setKinematic(s: S, x: number, v: number, i?: number): void;
  bodies?(params: unknown): number;
}

export interface MechanicalInit {
  x0: number;
  v0: number;
}
