import type { Dict, Lang, TKey } from '../i18n/dict';
import type { Kinematic, MechanicalInit, Model } from '../models/types';
import type { Plot } from '../render/plots/types';
import type { MechanicalScene } from '../render/scene/types';

/**
 * Simulation of a 1-DOF mechanical oscillator: a body with position/velocity that the
 * user can drag, fling and grab. Other kinds (coupled, quantum) will add their own spec.
 */
export interface MechanicalSimSpec<P> {
  kind: 'mechanical1d';
  model: Model<Float64Array, P, MechanicalInit> & Kinematic<Float64Array>;
  defaultParams: P;
  defaultInit: MechanicalInit;
  /** Fastest initial velocity the hand can impose (m/s). */
  maxSpeed: number;
  createScene(): MechanicalScene<P>;
  /** Observables recorded in the history (for traces and plots). */
  historyKeys: string[];
  /** Plot toggles shown as chips, in order. */
  chips: ChipDef[];
  /** Side-panel plots; each is visible while any of its chips is on. */
  panels: PanelDef[];
  /** Present when the model supports the vertical view with gravity. */
  setGravity?(params: P, g: number): void;
  /** Rest position of the body for these params (where the gravity sag puts it). */
  equilibrium?(params: P): number;
}

export interface ChipDef {
  id: string;
  labelKey: TKey;
  defaultOn: boolean;
  /** Dot color in the chip. */
  color: string;
}

export interface PanelDef {
  id: string;
  titleKey: TKey;
  chips: string[];
  create(): Plot;
  /** Height weight in the stacked panel (default 1). */
  weight?: number;
}

/** An oscillator tab: identity, texts and (once implemented) its simulation. */
export interface OscillatorPlugin {
  /** URL-safe id, used as hash route (`#/<id>`) and i18n namespace (`osc.<id>`). */
  id: string;
  /** Short glyph shown in the tab (plain text). */
  icon: string;
  /** Texts for this oscillator, merged under `osc.<id>`. Must contain `title` and `tagline`. */
  i18n: Record<Lang, Dict>;
  /** Absent while the tab is still a placeholder. */
  // Params differ per plugin; the runtime only passes them back to the plugin's own model/scene.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim?: MechanicalSimSpec<any>;
}
