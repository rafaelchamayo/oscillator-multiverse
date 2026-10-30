import { createRk4 } from '../core/integrators/rk4';
import type { DerivFn, IntegratorFactory } from '../core/integrators/types';
import type { Model } from './types';

export interface OdeSpec<P> {
  dim: number;
  deriv: DerivFn<P>;
}

type OdeModelDef<P, I> = Omit<Model<Float64Array, P, I>, 'step' | 'cloneState' | 'copyState'>;

/** Adapts an ODE y' = f(t, y; p) to the `Model` interface, stepping with RK4 by default. */
export function odeModel<P, I, Extra extends object = object>(
  spec: OdeSpec<P>,
  def: OdeModelDef<P, I> & Extra,
  integrator: IntegratorFactory = createRk4,
): Model<Float64Array, P, I> & Extra & OdeSpec<P> {
  const stepper = integrator(spec.dim);
  return {
    ...def,
    dim: spec.dim,
    deriv: spec.deriv,
    cloneState: (s) => Float64Array.from(s),
    copyState: (src, dst) => dst.set(src),
    step: (s, p, t, dt) => stepper.step(spec.deriv, t, s, dt, p),
  };
}
