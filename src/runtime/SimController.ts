import { History } from '../core/sim/History';
import { SPEEDS, SimulationLoop } from '../core/sim/SimulationLoop';
import { translate, type TKey } from '../i18n/dict';
import { G_EARTH } from '../models/mechanical';
import type { MechanicalInit, Observables } from '../models/types';
import type { MechanicalSimSpec, PanelDef, SimExtras } from '../oscillators/types';
import {
  drawBackground,
  drawOdeCard,
  drawPlotColumn,
  PRESENT,
  presentLayout,
} from '../presentation/compose';
import { downloadBlob, Recorder } from '../presentation/Recorder';
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
  /** CSS size, kept by a ResizeObserver (no layout reads in the render loop). */
  width: number;
  height: number;
}

/** Where the controller draws: the interactive stage or the 1920×1080 presentation canvas. */
type Surface = 'stage' | 'present';

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
  /** The plugin's helpers (resonance sweep...), fed with every history sample. */
  readonly extras: SimExtras | undefined;
  /** State restored by Reset; updated whenever the user edits an x₀ or v₀. */
  initState: Float64Array;
  /** Body last touched by the hand: drags, the v₀ handle and the tags act on it. */
  activeBody = 0;
  /** Object under the canvas pointer. */
  hoverId: string | null = null;
  /** Object whose ODE term is under the pointer. */
  termHoverId: string | null = null;
  /** Object whose popover is open, and the popover element (positioned every frame). */
  popoverId: string | null = null;
  popoverEl: HTMLElement | null = null;
  /** Pointer over the stage, in scene coordinates. */
  pointer: Vec2 | null = null;
  /** The hand is holding a body (in any mode). */
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
  private surface: Surface = 'stage';
  /** Stage canvas to return to when presentation mode ends. */
  private stageCanvas: HTMLCanvasElement | null = null;
  /** Presentation plots: own instances (own autoscale), created on first use. */
  private readonly presentPlots = new Map<string, Plot>();
  private recorder: Recorder | null = null;
  /** Start recording as soon as presentation mode attaches its canvas (the G shortcut). */
  recordOnPresent = false;
  /** Render cost (ms): moving average and worst since `resetPerf()`; frames over 25 ms apart. */
  private perf = { renderMs: 0, renderMax: 0, frames: 0, longFrames: 0 };
  private firstFit = true;
  /** Height reserved for the floating toolbar at the bottom of the stage. */
  static readonly TOOLBAR_INSET = 78;
  /** Perspective rotation animation. */
  private angleFrom = 0;
  private angleTo = 0;
  private angleT = 1;
  /** g last applied to the params (NaN before the first application). */
  private gravity = NaN;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly spec: MechanicalSimSpec<P, any>,
    /** Plugin id, used to name recordings. */
    readonly id = 'sim',
  ) {
    this.initState = spec.model.createState(spec.defaultParams, spec.defaultInit);
    this.scene = spec.createScene();
    this.extras = spec.createExtras?.({ setParam: (k, v) => this.setParam(k, v) });
    this.history = new History(
      spec.historyKeys,
      (HISTORY_SECONDS * 600) / SAMPLE_EVERY,
      SAMPLE_EVERY,
    );
    this.loop = new SimulationLoop({
      model: spec.model,
      params: { ...spec.defaultParams },
      state: spec.model.cloneState(this.initState),
      onStep: ({ t, state, manual }) => {
        if (!manual) this.bounce(state);
        spec.model.observables(state, this.loop.params, t, this.stepObs);
        if (this.history.offer(t, this.stepObs, manual)) {
          this.extras?.onSample?.(
            t,
            this.stepObs,
            this.loop.params as Record<string, number>,
            manual,
          );
        }
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

  /** Number of bodies in use (1 for 1-DOF models). */
  get bodies(): number {
    return this.spec.model.bodies?.(this.params) ?? 1;
  }

  /** Initial conditions of body 0 (the 1-DOF view of `initState`). */
  get ic(): MechanicalInit {
    const k = this.spec.model;
    return { x0: k.getPos(this.initState), v0: k.getVel(this.initState) };
  }

  attach(canvas: HTMLCanvasElement, surface: Surface = 'stage'): void {
    this.surface = surface;
    this.firstFit = true;
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

  get presenting(): boolean {
    return this.surface === 'present';
  }

  /** Moves rendering to the presentation canvas (the stage canvas stays mounted underneath). */
  enterPresentation(canvas: HTMLCanvasElement): void {
    if (this.presenting) return;
    this.stageCanvas = this.canvas;
    this.detach();
    this.attach(canvas, 'present');
  }

  exitPresentation(): void {
    if (!this.presenting) return;
    void this.stopRecording();
    this.detach();
    this.surface = 'stage';
    if (this.stageCanvas) this.attach(this.stageCanvas);
  }

  get recording(): boolean {
    return this.recorder !== null;
  }

  /**
   * Records the presentation canvas to WebM. While recording, every frame advances exactly
   * 1/60 s of simulated time (× speed), so the video is smooth even if a frame is late.
   */
  startRecording(): boolean {
    if (!this.presenting || this.recorder || !this.canvas) return false;
    try {
      this.recorder = new Recorder(this.canvas);
    } catch {
      return false;
    }
    this.resetPerf();
    useSimStore.setState({ recording: true });
    return true;
  }

  /** Stops the recording and downloads it; resolves with the video (null if none). */
  async stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec) return null;
    this.recorder = null;
    useSimStore.setState({ recording: false });
    const blob = await rec.stop();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadBlob(blob, `oscillator-${this.id}-${stamp}.webm`);
    return blob;
  }

  resetPerf(): void {
    this.perf = { renderMs: 0, renderMax: 0, frames: 0, longFrames: 0 };
  }

  /** Pointer position in the canvas's logical coordinates (the presentation canvas is scaled). */
  toLocal(clientX: number, clientY: number): Vec2 {
    const r = this.canvas?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const k = this.presenting ? PRESENT.width / r.width : 1;
    return { x: (clientX - r.left) * k, y: (clientY - r.top) * k };
  }
  /** Registers a side-panel plot canvas; returns the unregister function. */
  registerPlot(id: string, canvas: HTMLCanvasElement, plot: Plot): () => void {
    const slot: PlotSlot = { canvas, plot, hover: null, width: 0, height: 0 };
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      slot.width = r.width;
      slot.height = r.height;
    });
    ro.observe(canvas);
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      slot.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const leave = () => (slot.hover = null);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    this.plots.set(id, slot);
    return () => {
      ro.disconnect();
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
    if (this.loop.isHeld) {
      this.endHold(this.spec.model.getPos(this.state, this.loop.heldBody), 0);
    }
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
    this.loop.reset(this.spec.model.cloneState(this.initState));
    this.history.clear();
    this.extras?.onReset?.();
    for (const s of this.plots.values()) s.plot.reset?.();
    for (const p of this.presentPlots.values()) p.reset?.();
    this.recordNow();
    this.syncStore();
  }

  /** Loads a preset: its params (gravity stays as the view says), x₀ from equilibrium, chips. */
  applyPreset(id: string): void {
    const preset = this.spec.presets?.find((p) => p.id === id);
    if (!preset) return;
    const params = this.params as Record<string, number>;
    Object.assign(params, preset.params);
    if (Number.isFinite(this.gravity)) this.spec.setGravity?.(this.params, this.gravity);
    const { init } = preset;
    if (typeof init === 'function') {
      this.initState = this.spec.model.createState(this.params, init(this.params));
    } else {
      const eq = this.spec.equilibrium?.(this.params) ?? 0;
      this.initState = this.spec.model.createState(this.params, {
        x0: eq + init.x0,
        v0: init.v0,
      });
    }
    this.activeBody = 0;
    if (preset.chips) {
      useSimStore.setState((s) => ({ chips: { ...s.chips, ...preset.chips } }));
    }
    this.reset();
    this.play();
  }

  cycleSpeed(): void {
    const i = SPEEDS.indexOf(this.loop.speed as (typeof SPEEDS)[number]);
    this.loop.speed = SPEEDS[(i + 1) % SPEEDS.length]!;
    this.syncStore();
  }

  /**
   * Edit body `i` while paused; the paused state (positions and velocities of every body)
   * becomes the new initial condition.
   */
  setPausedState(x: number, v: number, i = this.activeBody): void {
    const k = this.spec.model;
    k.setKinematic(this.state, x, v, i);
    const init = k.createState(this.params, this.spec.defaultInit);
    for (let b = 0; b < this.bodies; b++) {
      k.setKinematic(init, k.getPos(this.state, b), k.getVel(this.state, b), b);
    }
    this.initState = init;
  }

  beginHold(x: number, i = this.activeBody): void {
    this.held = true;
    this.activeBody = i;
    if (this.running) {
      this.holdTarget = { x, v: 0 };
      this.loop.hold(x, 0, i);
    }
  }

  endHold(x: number, v: number): void {
    this.held = false;
    this.holdTarget = null;
    if (this.loop.isHeld) this.loop.release(x, v);
  }

  /**
   * Elastic bounce off the ends of the track (the wall side and the end of the floor), so the
   * body and its trace never leave the scene. Within the track the motion is the model's.
   */
  private bounce(state: Float64Array): void {
    if (this.scene.constrain) {
      this.scene.constrain(state, this.loop.params);
      return;
    }
    const k = this.spec.model;
    const x = k.getPos(state);
    const c = this.scene.clampX(x, this.loop.params);
    if (c !== x) k.setKinematic(state, 2 * c - x, -k.getVel(state));
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
      v0: this.spec.model.getVel(s, this.activeBody),
      activeBody: this.activeBody,
      view: this.view,
      px: 1 / this.view.pxPerMeter,
      ppx: 1 / this.view.fitScale,
      serious: ui.serious,
      axes: !this.presenting || ui.present.axes,
      hoverId: this.highlightId,
      realDt,
      history: this.history,
      chips: ui.chips,
      window: ui.traceWindow,
      pointer: this.pointer,
      tr: this.translator(lang),
    };
  }

  /** The UI's popover for object `id` (null closes it). */
  setPopover(id: string | null, el: HTMLElement | null): void {
    this.popoverId = id;
    this.popoverEl = el;
  }

  /** The object whose ODE term is under the pointer (null when none). */
  setTermHover(id: string | null): void {
    this.termHoverId = id;
  }

  /** What is highlighted: the canvas hover wins, then the ODE term, then the open popover. */
  get highlightId(): string | null {
    return this.hoverId ?? this.termHoverId ?? this.popoverId;
  }

  /** Sets a model parameter from a slider, keeping the motion as seen (see applyGravity). */
  setParam(key: string, value: number): void {
    this.changeParams(() => {
      (this.params as Record<string, number>)[key] = value;
    });
    this.activeBody = Math.min(this.activeBody, this.bodies - 1);
    this.syncStore();
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

  /** Gravity follows the view (on only in the vertical one, unless toggled off). */
  private applyGravity(): void {
    const { setGravity } = this.spec;
    if (!setGravity) return;
    const ui = useSimStore.getState();
    const g = ui.perspective === 'vertical' && ui.gravity ? G_EARTH : 0;
    if (this.gravity === g) return;
    this.gravity = g;
    this.changeParams(() => setGravity(this.params, g));
    this.syncStore();
  }

  /**
   * Applies a parameter change. When it moves the equilibrium (gravity, or m/k with gravity on),
   * the displacement from equilibrium is preserved: x, x₀, the stored x samples and the camera
   * shift by Δx_eq, so the motion and the trace look unchanged and nothing jumps.
   */
  private changeParams(mutate: () => void): void {
    const { equilibrium } = this.spec;
    const before = equilibrium?.(this.params) ?? 0;
    mutate();
    const d = (equilibrium?.(this.params) ?? 0) - before;
    if (d === 0) return;
    const k = this.spec.model;
    k.setKinematic(this.state, k.getPos(this.state) + d, k.getVel(this.state));
    k.setKinematic(this.initState, k.getPos(this.initState) + d, k.getVel(this.initState));
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
    if (this.presenting) {
      // Fixed video size; CSS letterboxes it into the window.
      const w = PRESENT.width * PRESENT.scale;
      const h = PRESENT.height * PRESENT.scale;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      this.dpr = PRESENT.scale;
      this.layoutPresent();
      this.view.fitSmooth(this.scene.bounds(this.frameInfo(0)), 0, true);
      return;
    }
    const rect = c.getBoundingClientRect();
    this.dpr = fitCanvas(c, rect.width, rect.height);
    this.view.width = rect.width;
    this.view.height = rect.height;
    this.view.insetBottom = SimController.TOOLBAR_INSET;
    // ODE card on top, plus the presets row when there is one.
    this.view.insetTop = this.spec.presets ? 112 : 70;
    this.view.fitSmooth(this.scene.bounds(this.frameInfo(0)), 0, true);
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    // Deferred to the first frame: React may mount, unmount and remount the stage first.
    if (this.recordOnPresent && this.presenting) {
      this.recordOnPresent = false;
      this.startRecording();
    }
    const wall = (now - this.lastNow) / 1000;
    this.lastNow = now;
    // Frame-locked while recording: time moves in whole 1/60 s ticks. A late frame (the encoder
    // can stall the page) catches up with extra ticks, so the video never plays in slow motion.
    const ticks = this.recorder ? Math.min(4, Math.max(1, Math.round(wall * 60))) : 0;
    const realDt = ticks ? ticks / 60 : Math.min(wall, 0.1);
    this.updatePerspective(realDt);
    if (this.holdTarget && this.loop.isHeld) {
      this.loop.hold(this.holdTarget.x, this.holdTarget.v, this.loop.heldBody);
    }
    if (ticks) for (let i = 0; i < ticks; i++) this.loop.advanceFrame(1 / 60);
    else this.loop.advance(realDt);
    const t0 = performance.now();
    this.render(realDt);
    const ms = performance.now() - t0;
    const p = this.perf;
    p.renderMs = p.frames === 0 ? ms : p.renderMs * 0.95 + ms * 0.05;
    p.renderMax = Math.max(p.renderMax, ms);
    if (p.frames > 0 && wall > 0.025) p.longFrames++;
    p.frames++;
    this.recorder?.frame();
  };

  /** Presentation layout for the current chips and options (cheap; done every frame). */
  private layoutPresent() {
    const ui = useSimStore.getState();
    const panels = this.spec.panels.filter((p) => p.chips.some((c) => ui.chips[c]));
    const L = presentLayout(panels, ui.present);
    this.view.width = L.sceneW;
    this.view.height = PRESENT.height;
    this.view.insetTop = L.insetTop;
    this.view.insetBottom = L.insetBottom;
    return L;
  }

  private presentPlot(panel: PanelDef): Plot {
    let plot = this.presentPlots.get(panel.id);
    if (!plot) {
      plot = panel.create(this.extras);
      this.presentPlots.set(panel.id, plot);
    }
    return plot;
  }

  render(realDt = 0): void {
    const g = this.g;
    const c = this.canvas;
    if (!g || !c) return;
    if (this.presenting) {
      this.renderPresent(g, realDt);
      return;
    }
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
    this.syncHover();
    this.placePopover(f);
  }

  /** Everything in one canvas (what gets recorded): background, scene, ODE, plots. */
  private renderPresent(g: CanvasRenderingContext2D, realDt: number): void {
    const L = this.layoutPresent();
    const ui = useSimStore.getState();
    const f = this.frameInfo(realDt);
    this.view.fitSmooth(this.scene.bounds(f), realDt, this.firstFit);
    this.firstFit = false;
    this.scene.update(f);
    const k = PRESENT.scale;

    g.setTransform(k, 0, 0, k, 0, 0);
    drawBackground(g, ui.present.background);
    g.save();
    g.beginPath();
    g.rect(0, 0, L.sceneW, PRESENT.height);
    g.clip();
    this.view.apply(g, k);
    this.scene.draw(g, f);
    g.setTransform(k, 0, 0, k, 0, 0);
    this.scene.drawOverlay?.(g, f);
    g.restore();

    if (ui.present.ode) {
      const params = this.params as Record<string, number>;
      const badge = this.spec.badge?.(params) ?? null;
      drawOdeCard(
        g,
        {
          eq: this.spec.model.latexODE(this.params),
          badge: badge && { text: f.tr(badge.key), tone: badge.tone },
          lit: this.spec.objects.find((o) => o.id === this.highlightId)?.terms ?? [],
        },
        L.sceneW / 2,
      );
    }

    drawPlotColumn(
      g,
      L,
      (panel) => this.presentPlot(panel),
      {
        history: this.history,
        t: this.loop.t,
        window: f.window,
        chips: f.chips,
        dt: realDt,
        params: this.params as Record<string, number>,
        axes: ui.present.axes,
        tr: f.tr,
      },
      f.tr,
    );
    this.syncHover();
  }

  private renderPlots(f: FrameInfo<Float64Array, P>, realDt: number): void {
    for (const slot of this.plots.values()) {
      const pc = slot.canvas;
      const rect = slot;
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
        params: this.params as Record<string, number>,
        axes: true,
        tr: f.tr,
      };
      slot.plot.draw(pg, rect.width, rect.height, ctx);
    }
  }

  private syncStore(): void {
    useSimStore.setState({
      running: this.loop.running,
      speed: this.loop.speed,
      params: { ...(this.params as Record<string, number>) },
    });
  }

  /** Mirrors hover/highlight into the store only when they change (React re-renders). */
  private syncHover(): void {
    const ui = useSimStore.getState();
    const hl = this.highlightId;
    if (ui.hoverId !== this.hoverId || ui.highlightId !== hl) {
      useSimStore.setState({ hoverId: this.hoverId, highlightId: hl });
    }
  }

  /**
   * Keeps the open popover next to its object (which may be moving) without covering it:
   * above, else below, right or left of the object's screen box. Hidden while dragging.
   */
  private placePopover(f: FrameInfo<Float64Array, P>): void {
    const el = this.popoverEl;
    if (!el || !this.popoverId) return;
    const b = this.scene.objectBox?.(this.popoverId, f);
    if (!b || this.held) {
      el.style.visibility = 'hidden';
      return;
    }
    const pts = [
      this.view.toScreen(b.uMin, b.wMin),
      this.view.toScreen(b.uMax, b.wMin),
      this.view.toScreen(b.uMin, b.wMax),
      this.view.toScreen(b.uMax, b.wMax),
    ];
    const r = {
      l: Math.min(...pts.map((p) => p.x)),
      r: Math.max(...pts.map((p) => p.x)),
      t: Math.min(...pts.map((p) => p.y)),
      b: Math.max(...pts.map((p) => p.y)),
    };
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const W = this.view.width;
    const H = this.view.height - this.view.insetBottom;
    const gap = 14;
    const cx = (r.l + r.r) / 2 - w / 2;
    const cy = (r.t + r.b) / 2 - h / 2;
    const options = [
      { x: cx, y: r.t - gap - h, fits: r.t - gap - h >= 8 },
      { x: cx, y: r.b + gap, fits: r.b + gap + h <= H },
      { x: r.r + gap, y: cy, fits: r.r + gap + w <= W - 8 },
      { x: r.l - gap - w, y: cy, fits: r.l - gap - w >= 8 },
    ];
    const pick = options.find((o) => o.fits) ?? options[1]!;
    const x = Math.min(Math.max(pick.x, 8), W - w - 8);
    const y = Math.min(Math.max(pick.y, 8), this.view.height - h - 8);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.style.visibility = 'visible';
  }

  /** Read-only snapshot for Playwright (exposed on window in dev). */
  debug() {
    const k = this.spec.model;
    const s = this.state;
    const bodyW = this.scene.bodyW(this.params);
    const block = this.pageCoords(k.getPos(s), bodyW);
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
      highlightId: this.highlightId,
      params: { ...this.params },
      bodyW,
      block,
      presenting: this.presenting,
      recording: this.recording,
      frames: this.recorder?.frames ?? 0,
      canvas: this.canvas ? { width: this.canvas.width, height: this.canvas.height } : null,
      perf: { ...this.perf },
      activeBody: this.activeBody,
      bodies: Array.from({ length: this.bodies }, (_, i) => ({
        x: k.getPos(s, i),
        v: k.getVel(s, i),
        page: this.pageCoords(
          this.scene.bodyU?.(k.getPos(s, i), this.params, i) ?? k.getPos(s, i),
          this.scene.bodyW(this.params, i),
        ),
      })),
    };
  }

  /** Page coordinates of a scene point (for Playwright). */
  pageCoords(u: number, w: number) {
    const p = this.view.toScreen(u, w);
    const rect = this.canvas?.getBoundingClientRect();
    const k = this.presenting && rect ? rect.width / PRESENT.width : 1;
    return { x: (rect?.left ?? 0) + p.x * k, y: (rect?.top ?? 0) + p.y * k };
  }
}
