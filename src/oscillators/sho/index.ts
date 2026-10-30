import { shoModel, SHO_DEFAULTS } from '../../models/sho/model';
import type { OscillatorPlugin } from '../types';
import es from './i18n/es.json';
import en from './i18n/en.json';
import { createShoScene, MAX_SPEED } from './scene';

export const shoPlugin: OscillatorPlugin = {
  id: 'sho',
  icon: '∿',
  i18n: { es, en },
  sim: {
    kind: 'mechanical1d',
    model: shoModel,
    defaultParams: SHO_DEFAULTS,
    defaultInit: { x0: 0.5, v0: 0 },
    maxSpeed: MAX_SPEED,
    createScene: createShoScene,
  },
};
