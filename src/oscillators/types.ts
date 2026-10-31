import type { Dict, Lang, TKey } from '../i18n/dict';
import type { Kinematic, MechanicalInit, Model } from '../models/types';
import type { Plot } from '../render/plots/types';
import type { MechanicalScene } from '../render/scene/types';

/**
 * Simulation of a mechanical oscillator: one or more bodies with position/velocity that the
 * user can drag, fling and grab (`Kinematic` with a body index). `I` is what the model's
 * `createState` takes ({x0, v0} for 1-DOF tabs).
 */
export interface MechanicalSimSpec<P, I = MechanicalInit> {
  kind: 'mechanical1d';
  model: Model<Float64Array, P, I> & Kinematic<Float64Array>;
  defaultParams: P;
  defaultInit: I;
  /** Fastest initial velocity the hand can impose (m/s). */
  maxSpeed: number;
  createScene(): MechanicalScene<P>;
  /** Observables recorded in the history (for traces and plots). */
  historyKeys: string[];
  /** Plot toggles shown as chips, in order. */
  chips: ChipDef[];
  /** Side-panel plots; each is visible while any of its chips is on. */
  panels: PanelDef[];
  /** Interactive objects of the scene: hover glow, popover (description + sliders), ODE terms. */
  objects: ObjectDef[];
  /** Per-controller helpers shared by panels (e.g. the resonance sweep). */
  createExtras?(api: SimApi): SimExtras;
  /** Small buttons that load a configuration (params, initial condition, chips) and play. */
  presets?: PresetDef[];
  /** Badge next to the ODE (e.g. the damping regime, or the kind of quantum state). */
  badge?(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: any,
    state: Float64Array,
  ): { key: TKey; tone: 'neutral' | 'info' | 'warn' | 'good' } | null;
  /**
   * A parameter that sets how many bodies there are (e.g. n masses), shown as a stepper. Changing
   * it restarts from `init(params)`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  countParam?: { key: string; min: number; max: number; labelKey: TKey; init(params: any): I };
  /** Present when the model supports the vertical view with gravity. */
  setGravity?(params: P, g: number): void;
  /** Rest position of the body for these params (where the gravity sag puts it). */
  equilibrium?(params: P): number;
}

/** What extras may do to the simulation. */
export interface SimApi {
  setParam(key: string, value: number): void;
}

export interface SimExtras {
  /** Called for every history sample. */
  onSample?(
    t: number,
    obs: Record<string, number>,
    params: Record<string, number>,
    manual: boolean,
  ): void;
  onReset?(): void;
}

export interface PresetDef {
  id: string;
  labelKey: TKey;
  /** Explanation shown while the preset button is hovered or focused. */
  descKey?: TKey;
  /** Values for the explanation's template (e.g. the mode's frequency). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descVars?(params: any): Record<string, string | number>;
  /** Shown only while true (e.g. "Mode 4" needs at least 4 masses). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visible?(params: any): boolean;
  params: Record<string, number>;
  /**
   * 1-DOF: x₀ measured from the equilibrium, and v₀. Otherwise a function of the preset's
   * params returning the model's init (e.g. a normal mode, which depends on m and k).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init: MechanicalInit | ((params: any) => unknown);
  chips?: Record<string, boolean>;
}

/**
 * An object the user can hover. Texts live at `osc.<plugin>.objects.<id>.{title,desc}`;
 * `terms` are the ids of the ODE terms it stands for (highlighted together).
 */
export interface ObjectDef {
  id: string;
  terms: string[];
  /** Sliders shown in its popover: the only sliders in the app. */
  params: ParamDef[];
  /** Derived quantities shown under the sliders: an i18n template and its values. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info?: { key: TKey; vars(params: any): Record<string, string> };
}

export interface ParamDef {
  key: string;
  /** Symbol shown next to the slider (plain text, e.g. "m"). */
  symbol: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  /** Parameters an "equalize" button sets to this slider's value (e.g. every mass). */
  group?: string[];
  /**
   * A slider on the state instead of a parameter (e.g. a quantum coefficient |cₙ|): it shows
   * `get(state)` live and edits through `SimController.editState`.
   */
  state?: { get(state: Float64Array): number; set(state: Float64Array, value: number): void };
}

export interface ChipDef {
  id: string;
  labelKey: TKey;
  defaultOn: boolean;
  /** Dot color in the chip. */
  color: string;
  /** `vectors` chips toggle force arrows on the block, `scene` chips other scene layers. */
  group?: 'plots' | 'vectors' | 'scene';
}

export interface PanelAction {
  id: string;
  labelKey: TKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(extras: any, params: any): void;
  /** Shown pressed while true. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?(extras: any): boolean;
}

export interface PanelDef {
  id: string;
  titleKey: TKey;
  chips: string[];
  /** `extras` is what the plugin's `createExtras` returned (undefined without it). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(extras: any): Plot;
  /** Small buttons in the panel's title row. */
  actions?: PanelAction[];
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
  sim?: MechanicalSimSpec<any, any>;
}
