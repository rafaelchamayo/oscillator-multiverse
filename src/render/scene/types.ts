import type { History } from '../../core/sim/History';
import type { TKey } from '../../i18n/dict';
import type { Observables } from '../../models/types';
import type { SceneBounds, Vec2, ViewTransform } from '../view';

/** Everything a scene needs to draw one frame. Scene coordinates are meters. */
export interface FrameInfo<S, P> {
  state: S;
  params: P;
  obs: Observables;
  t: number;
  running: boolean;
  /** The hand is holding the body (drag while paused, or grab while running). */
  held: boolean;
  /** Initial velocity currently set (shown by the arrow while paused). */
  v0: number;
  /** Body last touched by the hand (multi-body scenes show its x₀/v₀ tags). */
  activeBody: number;
  view: ViewTransform;
  /** Meters per CSS pixel at the current zoom: UI-like sizes that stay constant on screen. */
  px: number;
  /** Meters per CSS pixel at zoom 1: sizes of physical objects, which magnify with zoom. */
  ppx: number;
  serious: boolean;
  /** Paper grid labels (presentation mode can hide them). */
  axes: boolean;
  hoverId: string | null;
  /** Real seconds since the last frame (animations), 0 when frozen. */
  realDt: number;
  history: History;
  /** Visible plots by chip id (the scene draws the x(t) trace when `chips.x`). */
  chips: Record<string, boolean>;
  /** Seconds of history shown by traces. */
  window: number;
  /** Pointer in scene coordinates while it is over the stage. */
  pointer: Vec2 | null;
  tr: (key: TKey, vars?: Record<string, string | number>) => string;
}

export type HitRole = 'body' | 'velocityHandle' | 'object';

export interface Hit {
  objectId: string;
  role: HitRole;
  /** Body the hit belongs to (body and velocity handle hits in multi-body scenes; default 0). */
  body?: number;
}

export interface Scene<S, P> {
  /** Region shown by the default view (may depend on params, e.g. the gravity sag). */
  bounds(f: FrameInfo<S, P>): SceneBounds;
  /** Advance purely visual animation state (eyes, particles...). */
  update(f: FrameInfo<S, P>): void;
  /** Draw in scene coordinates (the context already has the view transform). */
  draw(g: CanvasRenderingContext2D, f: FrameInfo<S, P>): void;
  /** Draw upright text/labels in CSS-pixel screen coordinates. */
  drawOverlay?(g: CanvasRenderingContext2D, f: FrameInfo<S, P>): void;
  hit(pt: Vec2, f: FrameInfo<S, P>): Hit | null;
  /** Scene box of an object, so its popover can sit beside it; null if not shown. */
  objectBox?(objectId: string, f: FrameInfo<S, P>): SceneBounds | null;
  /** Notifies a fling (release with speed) for particle effects. */
  onFling?(v: number, f: FrameInfo<S, P>): void;
}

/** Extra hooks for 1-DOF mechanical scenes with a draggable body and velocity arrow. */
export interface MechanicalScene<P> extends Scene<Float64Array, P> {
  /** Where body `i` may be dragged to (`state` gives its neighbours in multi-body scenes). */
  clampX(x: number, params: P, i?: number, state?: Float64Array): number;
  /** Scene u of body `i` at displacement x (default: u = x, the 1-DOF scenes). */
  bodyU?(x: number, params: P, i: number): number;
  /** Cross-axis coordinate (w) of a body's center: where the hand grabs it. */
  bodyW(params: P, i?: number): number;
  /** v₀ implied by dragging the arrow tip of body `i` to scene coordinate `u`. */
  velocityFromHandle(u: number, x: number, params: P, i?: number): number;
  /**
   * Keeps the bodies inside the scene after every step (walls, collisions). Without it the
   * controller bounces body 0 elastically off the `clampX` limits.
   */
  constrain?(state: Float64Array, params: P): void;
}
