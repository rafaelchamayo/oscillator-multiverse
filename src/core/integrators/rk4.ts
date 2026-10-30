import type { DerivFn, Integrator } from './types';

/** Classic 4th-order Runge–Kutta with preallocated stage buffers. */
export function createRk4(dim: number): Integrator {
  const k1 = new Float64Array(dim);
  const k2 = new Float64Array(dim);
  const k3 = new Float64Array(dim);
  const k4 = new Float64Array(dim);
  const tmp = new Float64Array(dim);

  return {
    dim,
    step<P>(f: DerivFn<P>, t: number, y: Float64Array, dt: number, p: P): void {
      const h2 = dt / 2;
      f(t, y, p, k1);
      for (let i = 0; i < dim; i++) tmp[i] = y[i]! + h2 * k1[i]!;
      f(t + h2, tmp, p, k2);
      for (let i = 0; i < dim; i++) tmp[i] = y[i]! + h2 * k2[i]!;
      f(t + h2, tmp, p, k3);
      for (let i = 0; i < dim; i++) tmp[i] = y[i]! + dt * k3[i]!;
      f(t + dt, tmp, p, k4);
      const h6 = dt / 6;
      for (let i = 0; i < dim; i++) {
        y[i] = y[i]! + h6 * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
      }
    },
  };
}
