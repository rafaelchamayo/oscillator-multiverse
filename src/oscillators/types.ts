import type { Dict, Lang } from '../i18n/dict';
import type { Kinematic, MechanicalInit, Model } from '../models/types';
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
