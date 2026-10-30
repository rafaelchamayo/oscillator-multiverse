import { SPEEDS, SimulationLoop } from '../core/sim/SimulationLoop';
import { translate, type TKey } from '../i18n/dict';
import type { MechanicalInit, Observables } from '../models/types';
import type { MechanicalSimSpec } from '../oscillators/types';
import { fitCanvas } from '../render/canvas';
import type { FrameInfo, MechanicalScene } from '../render/scene/types';
import { ViewTransform } from '../render/view';
import { useSimStore } from '../state/simStore';
import { useUiStore } from '../state/uiStore';

/**
 * Binds one plugin's model, simulation loop, scene and view to a canvas, and runs the
 * render loop. Owns all per-frame state; React only sees the coarse mirror in simStore.
 */
export class SimController<P> {
  readonly loop: SimulationLoop<Float64Array, P>;
  readonly view = new ViewTransform();
  readonly scene: MechanicalScene<P>;
  /** Conditions restored by Reset; updated whenever the user edits x₀ or v₀. */
  ic: MechanicalInit;
  hoverId: string | null = null;
  /** The hand is holding the body (in any mode). */
  held = false;
  /** Latest pointer target while holding during a run, applied every frame. */
  holdTarget: { x: number; v: number } | null = null;

  private readonly obs: Observables = {};
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private raf = 0;
  private lastNow = 0;
  private resize: ResizeObserver | null = null;

  constructor(readonly spec: MechanicalSimSpec<P>) {
    this.ic = { ...spec.defaultInit };
    this.scene = spec.createScene();
    this.loop = new SimulationLoop({
      model: spec.model,
      params: { ...spec.defaultParams },
      state: spec.model.createState(spec.defaultParams, this.ic),
    });
    this.syncStore();
  }

  get params(): P {
    return this.loop.params;
  }

  get state(): Float64Array {
    return this.loop.state;
  }

  get running(): boolean {
    return this.loop.running;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(canvas);
    this.layout();
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  detach(): void {
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    this.canvas = null;
    this.g = null;
  }

  play(): void {
    this.loop.running = true;
    this.syncStore();
  }

  pause(): void {
    this.loop.running = false;
    if (this.loop.isHeld) this.endHold(this.spec.model.getPos(this.state), 0);
    this.syncStore();
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.play();
  }

  reset(): void {
    this.loop.running = false;
    this.held = false;
    this.holdTarget = null;
    this.loop.reset(this.spec.model.createState(this.params, this.ic));
    this.syncStore();
  }

  cycleSpeed(): void {
    const i = SPEEDS.indexOf(this.loop.speed as (typeof SPEEDS)[number]);
    this.loop.speed = SPEEDS[(i + 1) % SPEEDS.length]!;
    this.syncStore();
  }

  /** Edit the state while paused; the edit also becomes the new initial condition. */
  setPausedState(x: number, v: number): void {
    this.spec.model.setKinematic(this.state, x, v);
    this.ic = { x0: x, v0: v };
  }

  beginHold(x: number): void {
    this.held = true;
    if (this.running) {
      this.holdTarget = { x, v: 0 };
      this.loop.hold(x, 0);
    }
  }

  endHold(x: number, v: number): void {
    this.held = false;
    this.holdTarget = null;
    if (this.loop.isHeld) this.loop.release(x, v);
  }

  frameInfo(realDt: number): FrameInfo<Float64Array, P> {
    const lang = useUiStore.getState().lang;
    const s = this.state;
    this.spec.model.observables(s, this.params, this.loop.t, this.obs);
    return {
      state: s,
      params: this.params,
      obs: this.obs,
      t: this.loop.t,
      running: this.running,
      held: this.held,
      v0: this.spec.model.getVel(s),
      view: this.view,
      px: 1 / this.view.pxPerMeter,
      ppx: 1 / this.view.fitScale,
      serious: useSimStore.getState().serious,
      hoverId: this.hoverId,
      realDt,
      tr: (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    };
  }

  private layout(): void {
    const c = this.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    this.dpr = fitCanvas(c, rect.width, rect.height);
    this.view.width = rect.width;
    this.view.height = rect.height;
    this.view.fit(this.scene.bounds(this.params));
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const realDt = Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;
    if (this.holdTarget && this.loop.isHeld) this.loop.hold(this.holdTarget.x, this.holdTarget.v);
    this.loop.advance(realDt);
    this.render(realDt);
  };

  render(realDt = 0): void {
    const g = this.g;
    const c = this.canvas;
    if (!g || !c) return;
    const f = this.frameInfo(realDt);
    this.scene.update(f);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    this.view.apply(g, this.dpr);
    this.scene.draw(g, f);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scene.drawOverlay?.(g, f);
  }

  private syncStore(): void {
    useSimStore.setState({ running: this.loop.running, speed: this.loop.speed });
  }

  /** Read-only snapshot for Playwright (exposed on window in dev). */
  debug() {
    const k = this.spec.model;
    const s = this.state;
    const p = this.view.toScreen(k.getPos(s), 0);
    const rect = this.canvas?.getBoundingClientRect();
    return {
      x: k.getPos(s),
      v: k.getVel(s),
      t: this.loop.t,
      running: this.running,
      held: this.held,
      loopHeld: this.loop.isHeld,
      speed: this.loop.speed,
      ic: { ...this.ic },
      zoom: this.view.zoom,
      pxPerMeter: this.view.pxPerMeter,
      block: { x: (rect?.left ?? 0) + p.x, y: (rect?.top ?? 0) + p.y },
    };
  }

  /** Page coordinates of a scene point (for Playwright). */
  pageCoords(u: number, w: number) {
    const p = this.view.toScreen(u, w);
    const rect = this.canvas?.getBoundingClientRect();
    return { x: (rect?.left ?? 0) + p.x, y: (rect?.top ?? 0) + p.y };
  }
}
