import type { Hit } from '../render/scene/types';
import type { SimController } from '../runtime/SimController';
import { FlingEstimator } from './flingEstimator';

/** Pointer speed (m/s, real time) above which a release counts as a fling. */
const FLING_MIN = 0.25;

type Mode =
  | { kind: 'none' }
  | { kind: 'body'; offset: number }
  | { kind: 'handle' }
  | { kind: 'custom'; drag: NonNullable<Hit['drag']> }
  | { kind: 'pan'; lastX: number; lastY: number };

/**
 * Translates pointer input on the stage canvas into simulation edits:
 * drag the body (x₀ while paused, live grab while running), fling it, drag the
 * velocity arrow tip, pan the background, wheel/pinch zoom, double-click to reset view.
 */
export class PointerController<P> {
  private mode: Mode = { kind: 'none' };
  private readonly fling: FlingEstimator;
  private lastX = 0;

  constructor(
    private readonly sim: SimController<P>,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.fling = new FlingEstimator(80);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDblClick);
  }

  dispose(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('dblclick', this.onDblClick);
  }

  private local(e: { clientX: number; clientY: number }) {
    return this.sim.toLocal(e.clientX, e.clientY);
  }

  private scenePoint(e: PointerEvent | MouseEvent) {
    const l = this.local(e);
    return this.sim.view.toScene(l.x, l.y);
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const pt = this.scenePoint(e);
    const hit = this.sim.scene.hit(pt, this.sim.frameInfo(0));
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; input still works.
    }
    const k = this.sim.spec.model;
    if (hit && (hit.role === 'velocityHandle' || hit.role === 'body') && !this.sim.held) {
      this.sim.activeBody = hit.body ?? 0;
    }
    const i = this.sim.activeBody;
    if (hit?.role === 'handle' && hit.drag) {
      this.mode = { kind: 'custom', drag: hit.drag };
      hit.drag(pt, this.sim);
    } else if (hit?.role === 'velocityHandle' && !this.sim.running) {
      this.mode = { kind: 'handle' };
    } else if (hit?.role === 'body') {
      const x = k.getPos(this.sim.state, i);
      this.mode = { kind: 'body', offset: x - pt.x };
      this.lastX = x;
      this.fling.reset();
      this.fling.add(e.timeStamp, x);
      this.sim.beginHold(x, i);
    } else {
      const l = this.local(e);
      this.mode = { kind: 'pan', lastX: l.x, lastY: l.y };
    }
    this.updateCursor(hit?.role ?? null);
  };

  private onMove = (e: PointerEvent): void => {
    const pt = this.scenePoint(e);
    const sim = this.sim;
    const m = this.mode;
    sim.pointer = pt;
    if (m.kind === 'none') {
      const hit = sim.scene.hit(pt, sim.frameInfo(0));
      sim.hoverId = hit?.objectId ?? null;
      this.updateCursor(hit?.role ?? null);
      return;
    }
    if (m.kind === 'pan') {
      const l = this.local(e);
      sim.view.panBy(l.x - m.lastX, l.y - m.lastY);
      this.mode = { kind: 'pan', lastX: l.x, lastY: l.y };
      return;
    }
    if (m.kind === 'custom') {
      m.drag(pt, sim);
      return;
    }
    const k = sim.spec.model;
    const i = sim.activeBody;
    if (m.kind === 'handle') {
      const x = k.getPos(sim.state, i);
      sim.setPausedState(x, sim.scene.velocityFromHandle(pt.x, x, sim.params, i), i);
      return;
    }
    const x = sim.scene.clampX(pt.x + m.offset, sim.params, i, sim.state);
    this.lastX = x;
    this.fling.add(e.timeStamp, x);
    if (sim.running) {
      sim.holdTarget = { x, v: this.simVelocity(e.timeStamp) };
    } else {
      sim.setPausedState(x, k.getVel(sim.state, i), i);
    }
  };

  private onUp = (e: PointerEvent): void => {
    const sim = this.sim;
    const m = this.mode;
    this.mode = { kind: 'none' };
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (m.kind !== 'body') return;

    const realV = this.fling.velocity(e.timeStamp);
    const flung = Math.abs(realV) > FLING_MIN;
    const v = flung ? this.simVelocity(e.timeStamp) : 0;
    const x = this.lastX;
    if (sim.running) {
      sim.endHold(x, v);
    } else {
      sim.held = false;
      if (flung) {
        sim.setPausedState(x, v);
        sim.play();
      }
    }
    if (flung) sim.scene.onFling?.(v, sim.frameInfo(0));
  };

  private onLeave = (): void => {
    this.sim.pointer = null;
    if (this.mode.kind === 'none') this.sim.hoverId = null;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const l = this.local(e);
    // Trackpad pinch arrives as wheel + ctrlKey with small deltas.
    const sensitivity = e.ctrlKey ? 0.01 : 0.0015;
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.sim.view.zoomAt(l.x, l.y, Math.exp(-delta * sensitivity));
  };

  private onDblClick = (e: MouseEvent): void => {
    const hit = this.sim.scene.hit(this.scenePoint(e), this.sim.frameInfo(0));
    if (!hit) this.sim.view.resetView();
  };

  /** Pointer velocity converted to simulated time (the block keeps the speed it is seen with). */
  private simVelocity(timeMs: number): number {
    const max = this.sim.spec.maxSpeed;
    const v = this.fling.velocity(timeMs) / this.sim.loop.speed;
    return Math.max(-max, Math.min(max, v));
  }

  private updateCursor(role: string | null): void {
    const grabbing =
      this.mode.kind === 'body' || this.mode.kind === 'pan' || this.mode.kind === 'custom';
    this.canvas.style.cursor =
      role === 'velocityHandle' && !this.sim.running
        ? 'ew-resize'
        : role === 'body' || role === 'handle'
          ? grabbing
            ? 'grabbing'
            : 'grab'
          : grabbing
            ? 'grabbing'
            : role
              ? 'help'
              : 'default';
  }
}
