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
  view: ViewTransform;
  /** Meters per CSS pixel at the current zoom: UI-like sizes that stay constant on screen. */
  px: number;
  /** Meters per CSS pixel at zoom 1: sizes of physical objects, which magnify with zoom. */
  ppx: number;
  serious: boolean;
  hoverId: string | null;
  /** Real seconds since the last frame (animations), 0 when frozen. */
  realDt: number;
  tr: (key: TKey, vars?: Record<string, string | number>) => string;
}

export type HitRole = 'body' | 'velocityHandle' | 'object';

export interface Hit {
  objectId: string;
  role: HitRole;
}

export interface Scene<S, P> {
  /** Region shown by the default view. */
  bounds(params: P): SceneBounds;
  /** Advance purely visual animation state (eyes, particles...). */
  update(f: FrameInfo<S, P>): void;
  /** Draw in scene coordinates (the context already has the view transform). */
  draw(g: CanvasRenderingContext2D, f: FrameInfo<S, P>): void;
  /** Draw upright text/labels in CSS-pixel screen coordinates. */
  drawOverlay?(g: CanvasRenderingContext2D, f: FrameInfo<S, P>): void;
  hit(pt: Vec2, f: FrameInfo<S, P>): Hit | null;
  /** Notifies a fling (release with speed) for particle effects. */
  onFling?(v: number, f: FrameInfo<S, P>): void;
}

/** Extra hooks for 1-DOF mechanical scenes with a draggable body and velocity arrow. */
export interface MechanicalScene<P> extends Scene<Float64Array, P> {
  clampX(x: number, params: P): number;
  /** Cross-axis coordinate (w) of the body's center: where the hand grabs it. */
  bodyW(params: P): number;
  /** v₀ implied by dragging the arrow tip to scene coordinate `u`. */
  velocityFromHandle(u: number, x: number, params: P): number;
}
