import { History } from '../core/sim/History';
import { SPEEDS, SimulationLoop } from '../core/sim/SimulationLoop';
import { translate, type TKey } from '../i18n/dict';
import { G_EARTH } from '../models/mechanical';
import type { MechanicalInit, Observables } from '../models/types';
import type { MechanicalSimSpec } from '../oscillators/types';
import { fitCanvas } from '../render/canvas';
import type { Plot, PlotCtx } from '../render/plots/types';
import type { FrameInfo, MechanicalScene } from '../render/scene/types';
import { motion } from '../render/theme';
import { ViewTransform, type Vec2 } from '../render/view';
import { useSimStore } from '../state/simStore';
import { useUiStore } from '../state/uiStore';

/** History sampling: every 5 steps of 1/600 s → 120 samples per simulated second. */
const SAMPLE_EVERY = 5;
const HISTORY_SECONDS = 40;

interface PlotSlot {
  canvas: HTMLCanvasElement;
  plot: Plot;
  hover: { x: number; y: number } | null;
}

const easeInOut = (f: number): number =>
  f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;

/**
 * Binds one plugin's model, simulation loop, history, scene, view and plots to canvases and
 * runs the render loop. Owns all per-frame state; React only sees the coarse mirror in simStore.
 */
export class SimController<P> {
  readonly loop: SimulationLoop<Float64Array, P>;
  readonly view = new ViewTransform();
  readonly scene: MechanicalScene<P>;
  readonly history: History;
  /** Conditions restored by Reset; updated whenever the user edits x₀ or v₀. */
  ic: MechanicalInit;
  hoverId: string | null = null;
  /** Pointer over the stage, in scene coordinates. */
  pointer: Vec2 | null = null;
  /** The hand is holding the body (in any mode). */
  held = false;
  /** Latest pointer target while holding during a run, applied every frame. */
  holdTarget: { x: number; v: number } | null = null;

  private readonly obs: Observables = {};
  private readonly stepObs: Observables = {};
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private raf = 0;
  private lastNow = 0;
  private resize: ResizeObserver | null = null;
  private readonly plots = new Map<string, PlotSlot>();
  private firstFit = true;
  /** Height reserved for the floating toolbar at the bottom of the stage. */
  static readonly TOOLBAR_INSET = 78;
  /** Perspective rotation animation. */
  private angleFrom = 0;
  private angleTo = 0;
  private angleT = 1;

  constructor(readonly spec: MechanicalSimSpec<P>) {
    this.ic = { ...spec.defaultInit };
    this.scene = spec.createScene();
    this.history = new History(
      spec.historyKeys,
      (HISTORY_SECONDS * 600) / SAMPLE_EVERY,
      SAMPLE_EVERY,
    );
    this.loop = new SimulationLoop({
      model: spec.model,
      params: { ...spec.defaultParams },
      state: spec.model.createState(spec.defaultParams, this.ic),
      onStep: ({ t, state, manual }) => {
        spec.model.observables(state, this.loop.params, t, this.stepObs);
        this.history.offer(t, this.stepObs, manual);
      },
    });
    // Chips start at their defaults unless the user already chose for this plugin.
    const chips = { ...useSimStore.getState().chips };
    for (const c of spec.chips) if (!(c.id in chips)) chips[c.id] = c.defaultOn;
    useSimStore.setState({ chips });
    const vertical = useSimStore.getState().perspective === 'vertical';
    this.angleFrom = this.angleTo = this.view.angle = vertical ? -Math.PI / 2 : 0;
    this.applyGravity();
    this.recordNow();
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

  /** Registers a side-panel plot canvas; returns the unregister function. */
  registerPlot(id: string, canvas: HTMLCanvasElement, plot: Plot): () => void {
    const slot: PlotSlot = { canvas, plot, hover: null };
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      slot.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const leave = () => (slot.hover = null);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    this.plots.set(id, slot);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      if (this.plots.get(id) === slot) this.plots.delete(id);
    };
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
    this.history.clear();
    for (const s of this.plots.values()) s.plot.reset?.();
    this.recordNow();
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
    const ui = useSimStore.getState();
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
      serious: ui.serious,
      hoverId: this.hoverId,
      realDt,
      history: this.history,
      chips: ui.chips,
      window: ui.traceWindow,
      pointer: this.pointer,
      tr: this.translator(lang),
    };
  }

  get isVertical(): boolean {
    return this.angleTo !== 0;
  }

  private translator(lang: ReturnType<typeof useUiStore.getState>['lang']) {
    return (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  }

  /** Sample the current state into the history (e.g. after a reset, so plots aren't empty). */
  private recordNow(): void {
    this.spec.model.observables(this.state, this.params, this.loop.t, this.stepObs);
    this.history.offer(this.loop.t, this.stepObs, false, true);
  }

  /**
   * Switches gravity on/off keeping the motion as seen: the displacement from equilibrium,
   * the velocity and the time are preserved, so x (measured from the spring's natural length)
   * shifts by Δx_eq together with the history, the initial condition and the scenery.
   */
  private applyGravity(): void {
    const { setGravity, equilibrium } = this.spec;
    if (!setGravity) return;
    const ui = useSimStore.getState();
    const g = ui.perspective === 'vertical' && ui.gravity ? G_EARTH : 0;
    const before = equilibrium?.(this.params) ?? 0;
    setGravity(this.params, g);
    const d = (equilibrium?.(this.params) ?? 0) - before;
    if (d === 0) return;
    const k = this.spec.model;
    k.setKinematic(this.state, k.getPos(this.state) + d, k.getVel(this.state));
    this.ic = { ...this.ic, x0: this.ic.x0 + d };
    if (this.history.has('x')) this.history.shift('x', d);
    if (this.holdTarget) this.holdTarget.x += d;
    if (this.loop.isHeld) this.loop.hold(k.getPos(this.state), k.getVel(this.state));
    this.view.focus = { x: this.view.focus.x + d, y: this.view.focus.y };
  }

  private updatePerspective(realDt: number): void {
    const target = useSimStore.getState().perspective === 'vertical' ? -Math.PI / 2 : 0;
    if (target !== this.angleTo) {
      this.angleFrom = this.view.angle;
      this.angleTo = target;
      this.angleT = 0;
    }
    if (this.angleT < 1) {
      this.angleT = Math.min(1, this.angleT + (realDt * 1000) / motion.perspective);
      this.view.angle = this.angleFrom + (this.angleTo - this.angleFrom) * easeInOut(this.angleT);
    } else {
      this.view.angle = this.angleTo;
    }
    this.applyGravity();
  }

  private layout(): void {
    const c = this.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    this.dpr = fitCanvas(c, rect.width, rect.height);
    this.view.width = rect.width;
    this.view.height = rect.height;
    this.view.insetBottom = SimController.TOOLBAR_INSET;
    this.view.fitSmooth(this.scene.bounds(this.frameInfo(0)), 0, true);
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const realDt = Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;
    this.updatePerspective(realDt);
    if (this.holdTarget && this.loop.isHeld) this.loop.hold(this.holdTarget.x, this.holdTarget.v);
    this.loop.advance(realDt);
    this.render(realDt);
  };

  render(realDt = 0): void {
    const g = this.g;
    const c = this.canvas;
    if (!g || !c) return;
    const f = this.frameInfo(realDt);
    this.view.fitSmooth(this.scene.bounds(f), realDt, this.firstFit);
    this.firstFit = false;
    this.scene.update(f);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    this.view.apply(g, this.dpr);
    this.scene.draw(g, f);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scene.drawOverlay?.(g, f);

    this.renderPlots(f, realDt);
  }

  private renderPlots(f: FrameInfo<Float64Array, P>, realDt: number): void {
    for (const slot of this.plots.values()) {
      const pc = slot.canvas;
      const rect = pc.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const dpr = fitCanvas(pc, rect.width, rect.height);
      const pg = pc.getContext('2d');
      if (!pg) continue;
      pg.setTransform(dpr, 0, 0, dpr, 0, 0);
      pg.clearRect(0, 0, rect.width, rect.height);
      const ctx: PlotCtx = {
        history: this.history,
        t: this.loop.t,
        window: f.window,
        chips: f.chips,
        hover: slot.hover,
        dt: realDt,
        tr: f.tr,
      };
      slot.plot.draw(pg, rect.width, rect.height, ctx);
    }
  }

  private syncStore(): void {
    useSimStore.setState({ running: this.loop.running, speed: this.loop.speed });
  }

  /** Read-only snapshot for Playwright (exposed on window in dev). */
  debug() {
    const k = this.spec.model;
    const s = this.state;
    const bodyW = this.scene.bodyW(this.params);
    const p = this.view.toScreen(k.getPos(s), bodyW);
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
      angle: this.view.angle,
      pxPerMeter: this.view.pxPerMeter,
      historyLength: this.history.length,
      params: { ...this.params },
      bodyW,
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
