import type { Kinematic, Model } from '../../models/types';

export const DEFAULT_DT = 1 / 600;
export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export interface StepInfo<S> {
  t: number;
  state: S;
  /** True while the hand holds the body (kinematic motion, no integration). */
  manual: boolean;
}

export interface SimulationLoopOptions<S, P> {
  model: Model<S, P> & Partial<Kinematic<S>>;
  params: P;
  state: S;
  dt?: number;
  /** Real-time frames longer than this (s) are clamped, e.g. after a background tab. */
  maxFrameTime?: number;
  onStep?: (info: StepInfo<S>) => void;
}

/**
 * Fixed-step simulation decoupled from rendering.
 *
 * Time is kept as an integer step count (t = n·dt) so it never drifts, and the accumulator
 * is measured in steps. `speed` scales how much simulated time each real second produces;
 * dt never changes. `advanceFrame()` is the frame-locked variant used while recording:
 * every frame advances exactly 1/60 s · speed, independent of wall-clock jitter.
 */
export class SimulationLoop<S, P> {
  readonly model: Model<S, P> & Partial<Kinematic<S>>;
  readonly dt: number;
  params: P;
  state: S;
  speed = 1;
  running = false;
  stepCount = 0;
  onStep?: (info: StepInfo<S>) => void;

  private acc = 0;
  private readonly maxFrameTime: number;
  private held = false;
  private holdFrom = { x: 0, v: 0 };
  private holdTo = { x: 0, v: 0 };

  constructor(opts: SimulationLoopOptions<S, P>) {
    this.model = opts.model;
    this.params = opts.params;
    this.state = opts.state;
    this.dt = opts.dt ?? DEFAULT_DT;
    this.maxFrameTime = opts.maxFrameTime ?? 0.1;
    this.onStep = opts.onStep;
  }

  get t(): number {
    return this.stepCount * this.dt;
  }

  get isHeld(): boolean {
    return this.held;
  }

  /** Advance by a real-time interval (seconds). Returns the number of steps taken. */
  advance(realDt: number): number {
    if (!this.running) return 0;
    const clamped = Math.min(Math.max(realDt, 0), this.maxFrameTime);
    return this.advanceSteps((clamped * this.speed) / this.dt);
  }

  /** Frame-locked advance: exactly `frameDt · speed` of simulated time. */
  advanceFrame(frameDt = 1 / 60): number {
    if (!this.running) return 0;
    return this.advanceSteps((frameDt * this.speed) / this.dt);
  }

  /** Single integration step regardless of `running` (used by tests and stepping UI). */
  stepOnce(): void {
    this.doSteps(1);
  }

  reset(state: S): void {
    this.state = state;
    this.stepCount = 0;
    this.acc = 0;
    this.held = false;
  }

  /**
   * Start or update holding the body at (x, v). While held, integration is suspended and
   * steps interpolate linearly from the last imposed position to this target, so time and
   * traces keep flowing smoothly. Requires a `Kinematic` model.
   */
  hold(x: number, v: number): void {
    const k = this.requireKinematic();
    if (!this.held) {
      this.held = true;
      this.holdTo = { x: k.getPos(this.state), v: k.getVel(this.state) };
    }
    this.holdFrom = { x: k.getPos(this.state), v: this.holdTo.v };
    this.holdTo = { x, v };
  }

  /** Release the body at (x, v): integration resumes from there. */
  release(x: number, v: number): void {
    const k = this.requireKinematic();
    k.setKinematic(this.state, x, v);
    this.held = false;
  }

  private requireKinematic(): Kinematic<S> {
    const m = this.model;
    if (!m.getPos || !m.getVel || !m.setKinematic) {
      throw new Error(`Model ${m.id} does not support kinematic control`);
    }
    return m as Kinematic<S>;
  }

  private advanceSteps(steps: number): number {
    this.acc += steps;
    // Tolerance absorbs float error so e.g. 2.5 + 2.5 + ... lands on whole steps exactly.
    const n = Math.floor(this.acc + 1e-9);
    this.acc -= n;
    if (this.acc < 0) this.acc = 0;
    this.doSteps(n);
    return n;
  }

  private doSteps(n: number): void {
    const k = this.held ? this.requireKinematic() : undefined;
    for (let i = 0; i < n; i++) {
      if (k) {
        const f = (i + 1) / n;
        const x = this.holdFrom.x + (this.holdTo.x - this.holdFrom.x) * f;
        k.setKinematic(this.state, x, this.holdTo.v);
      } else {
        this.model.step(this.state, this.params, this.t, this.dt);
      }
      this.stepCount++;
      this.onStep?.({ t: this.t, state: this.state, manual: this.held });
    }
    if (k && n > 0) this.holdFrom = { ...this.holdTo };
  }
}
