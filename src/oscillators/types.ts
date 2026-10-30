import type { Dict, Lang } from '../i18n/dict';

/**
 * An oscillator tab. Phase 0 only needs identity and texts; model, scene, interactive
 * objects, plots and presets are added to this interface in later phases.
 */
export interface OscillatorPlugin {
  /** URL-safe id, used as hash route (`#/<id>`) and i18n namespace (`osc.<id>`). */
  id: string;
  /** Short glyph shown in the tab (plain text). */
  icon: string;
  /** Texts for this oscillator, merged under `osc.<id>`. Must contain `title` and `tagline`. */
  i18n: Record<Lang, Dict>;
}
