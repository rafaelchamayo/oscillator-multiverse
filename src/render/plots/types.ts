import type { History } from '../../core/sim/History';
import type { TKey } from '../../i18n/dict';

export interface PlotCtx {
  history: History;
  /** Current simulated time. */
  t: number;
  /** Seconds of history to show. */
  window: number;
  chips: Record<string, boolean>;
  /** Pointer position in CSS pixels inside the plot, or null. */
  hover: { x: number; y: number } | null;
  /** Real seconds since the last frame (for smooth autoscale). */
  dt: number;
  /** Current model parameters (analytic overlays). */
  params: Record<string, number>;
  /** Current simulation state, read-only (plots of the state itself, e.g. quantum coefficients). */
  state?: Float64Array;
  /** Grid lines and tick labels (presentation mode can hide them). */
  axes: boolean;
  tr: (key: TKey, vars?: Record<string, string | number>) => string;
}

/** A plot drawn on its own canvas in the side panel (CSS-pixel coordinates). */
export interface Plot {
  draw(g: CanvasRenderingContext2D, width: number, height: number, ctx: PlotCtx): void;
  reset?(): void;
}

/** One time series a plot can show. */
export interface SeriesDef {
  key: string;
  /** Chip that toggles it (time plots); omitted when always shown in its plot. */
  chip?: string;
  label: string;
  unit: string;
  color: string;
  /** Lane id in `lanes` mode: series with the same id share a lane (default: own lane). */
  lane?: string;
  /** Drawn dashed (analytic references such as the steady state). */
  dash?: boolean;
  /** Shown only while this holds (e.g. x₄ only when there are 4 bodies). */
  when?(params: Record<string, number>): boolean;
}
