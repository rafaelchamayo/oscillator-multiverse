import { formatNumber } from '../../core/units';
import {
  COUPLED_DEFAULTS,
  COUPLED_RANGES,
  MAX_N,
  coupledModel,
  normalModes,
  type CoupledInit,
  type CoupledParams,
} from '../../models/coupled/model';
import { TimePlot } from '../../render/plots/TimePlot';
import { series as S } from '../../render/theme';
import type { MechanicalSimSpec, ObjectDef, OscillatorPlugin } from '../types';
import es from './i18n/es.json';
import en from './i18n/en.json';
import { createCoupledScene, MAX_SPEED } from './scene';

/** The normal-mode frequencies under every slider: what m and k are changing. */
const info = {
  key: 'osc.coupled.derived' as const,
  vars: (p: CoupledParams) => ({
    w: normalModes(p)
      .omega.map((w) => formatNumber(w))
      .join(' · '),
  }),
};

const objects: ObjectDef[] = [
  ...Array.from({ length: MAX_N }, (_, i) => ({
    id: `block${i + 1}`,
    terms: [`m${i + 1}`],
    params: [{ key: `m${i + 1}`, symbol: `m${i + 1}`, unit: 'kg', ...COUPLED_RANGES.m, digits: 1 }],
    info,
  })),
  ...Array.from({ length: MAX_N + 1 }, (_, j) => ({
    id: `spring${j + 1}`,
    terms: [`k${j + 1}`],
    params: [
      { key: `k${j + 1}`, symbol: `k${j + 1}`, unit: 'N/m', ...COUPLED_RANGES.k, digits: 1 },
    ],
    info,
  })),
  { id: 'wall', terms: [], params: [] },
  { id: 'velocity', terms: [], params: [] },
];

const sim: MechanicalSimSpec<CoupledParams, CoupledInit> = {
  kind: 'mechanical1d',
  model: coupledModel,
  defaultParams: COUPLED_DEFAULTS,
  // A pulse: only the first block displaced.
  defaultInit: { x: [0.3, 0, 0, 0, 0], v: [0, 0, 0, 0, 0] },
  maxSpeed: MAX_SPEED,
  createScene: createCoupledScene,
  objects,
  historyKeys: ['K', 'U', 'E'],
  chips: [{ id: 'energy', labelKey: 'plots.chips.energy', defaultOn: true, color: S.U }],
  panels: [
    {
      id: 'energy',
      titleKey: 'plots.panels.energy',
      chips: ['energy'],
      create: () =>
        new TimePlot(
          [
            { key: 'K', label: 'K', unit: 'J', color: S.K },
            { key: 'U', label: 'U', unit: 'J', color: S.U },
            { key: 'E', label: 'E', unit: 'J', color: S.E },
          ],
          'overlay',
          { includeZero: true },
        ),
    },
  ],
};

export const coupledPlugin: OscillatorPlugin = {
  id: 'coupled',
  icon: '≈',
  i18n: { es, en },
  sim,
};
