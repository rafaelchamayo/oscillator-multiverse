/** Right-hand side of y' = f(t, y; p), written into `out` (no allocation). */
export type DerivFn<P> = (t: number, y: Float64Array, p: P, out: Float64Array) => void;

/** A fixed-step integrator bound to a state dimension. Advances `y` in place. */
export interface Integrator {
  readonly dim: number;
  step<P>(f: DerivFn<P>, t: number, y: Float64Array, dt: number, p: P): void;
}

export type IntegratorFactory = (dim: number) => Integrator;
