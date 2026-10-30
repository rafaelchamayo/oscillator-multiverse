import { shoModel, SHO_DEFAULTS, type ShoParams } from '../../models/sho/model';
import { PhasePlot } from '../../render/plots/PhasePlot';
import { TimePlot } from '../../render/plots/TimePlot';
import { series as S } from '../../render/theme';
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
    historyKeys: ['x', 'v', 'a', 'K', 'Ueq', 'Eeq'],
    chips: [
      { id: 'x', labelKey: 'plots.chips.x', defaultOn: true, color: S.x },
      { id: 'v', labelKey: 'plots.chips.v', defaultOn: true, color: S.v },
      { id: 'a', labelKey: 'plots.chips.a', defaultOn: false, color: S.a },
      { id: 'energy', labelKey: 'plots.chips.energy', defaultOn: true, color: S.U },
      { id: 'phase', labelKey: 'plots.chips.phase', defaultOn: false, color: '#9B7BFF' },
    ],
    panels: [
      {
        id: 'motion',
        titleKey: 'plots.panels.motion',
        chips: ['x', 'v', 'a'],
        weight: 1.3,
        create: () =>
          new TimePlot(
            [
              { key: 'x', chip: 'x', label: 'x', unit: 'm', color: S.x },
              { key: 'v', chip: 'v', label: 'v', unit: 'm/s', color: S.v },
              { key: 'a', chip: 'a', label: 'a', unit: 'm/s²', color: S.a },
            ],
            'lanes',
          ),
      },
      {
        id: 'energy',
        titleKey: 'plots.panels.energy',
        chips: ['energy'],
        create: () =>
          new TimePlot(
            [
              { key: 'K', label: 'K', unit: 'J', color: S.K },
              // Potential energy measured from the equilibrium (equals ½kx² without gravity).
              { key: 'Ueq', label: 'U', unit: 'J', color: S.U },
              { key: 'Eeq', label: 'E', unit: 'J', color: S.E },
            ],
            'overlay',
            { includeZero: true },
          ),
      },
      {
        id: 'phase',
        titleKey: 'plots.panels.phase',
        chips: ['phase'],
        weight: 1.2,
        create: () => new PhasePlot('x', 'v', { x: 'x', v: 'v', xUnit: 'm', vUnit: 'm/s' }),
      },
    ],
    setGravity: (p: ShoParams, g: number) => {
      p.g = g;
    },
    equilibrium: (p: ShoParams) => (-p.m * p.g) / p.k,
  },
};
