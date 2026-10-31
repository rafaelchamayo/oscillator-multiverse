import { formatNumber } from '../../core/units';
import {
  COUPLED_DEFAULTS,
  COUPLED_RANGES,
  MAX_N,
  countOf,
  coupledModel,
  massOf,
  modeInit,
  normalModes,
  springOf,
  type CoupledInit,
  type CoupledParams,
} from '../../models/coupled/model';
import { ModeShapesPlot } from '../../render/plots/ModeShapesPlot';
import { PhasePlot } from '../../render/plots/PhasePlot';
import { TimePlot } from '../../render/plots/TimePlot';
import type { SeriesDef } from '../../render/plots/types';
import { bodyColors, modeColors, series as S } from '../../render/theme';
import type { MechanicalSimSpec, ObjectDef, OscillatorPlugin, PresetDef } from '../types';
import es from './i18n/es.json';
import en from './i18n/en.json';
import { createCoupledScene, MAX_SPEED } from './scene';

type P = CoupledParams;

/** The normal-mode frequencies under every slider: what m and k are changing. */
const info = {
  key: 'osc.coupled.derived' as const,
  vars: (p: P) => ({
    w: normalModes(p)
      .omega.map((w) => formatNumber(w))
      .join(' · '),
  }),
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const M_KEYS = range(MAX_N).map((i) => `m${i + 1}`);
const K_KEYS = range(MAX_N + 1).map((j) => `k${j + 1}`);

const objects: ObjectDef[] = [
  ...range(MAX_N).map((i) => ({
    id: `block${i + 1}`,
    // Its mass on M's diagonal and its coordinate in the vectors.
    terms: [`m${i + 1}`, `x${i + 1}`],
    params: [
      {
        key: M_KEYS[i]!,
        symbol: `m${i + 1}`,
        unit: 'kg',
        ...COUPLED_RANGES.m,
        digits: 1,
        group: M_KEYS,
      },
    ],
    info,
  })),
  ...range(MAX_N + 1).map((j) => ({
    id: `spring${j + 1}`,
    terms: [`k${j + 1}`],
    params: [
      {
        key: K_KEYS[j]!,
        symbol: `k${j + 1}`,
        unit: 'N/m',
        ...COUPLED_RANGES.k,
        digits: 1,
        group: K_KEYS,
      },
    ],
    info,
  })),
  { id: 'wall', terms: [], params: [] },
  { id: 'velocity', terms: [], params: [] },
];

/** Only the first block displaced: the disturbance spreads along the chain. */
const pulse = (): CoupledInit => ({ x: [0.35, 0, 0, 0, 0], v: [0, 0, 0, 0, 0] });

const presets: PresetDef[] = [
  ...range(MAX_N).map((i): PresetDef => ({
    id: `mode${i + 1}`,
    labelKey: `osc.coupled.presets.mode${i + 1}`,
    descKey: 'osc.coupled.presetInfo.mode',
    descVars: (p: P) => ({
      n: i + 1,
      w: formatNumber(normalModes(p).omega[i] ?? 0),
      nodes: i,
    }),
    visible: (p: P) => countOf(p) > i,
    params: {},
    init: (p: P) => modeInit(p, i, 0.3),
  })),
  {
    id: 'exchange',
    labelKey: 'osc.coupled.presets.exchange',
    descKey: 'osc.coupled.presetInfo.exchange',
    // Weak middle spring: ω₁ = 2, ω₂ = √5.6 ≈ 2.37 rad/s, energy moves across every π/Δω ≈ 8.6 s.
    params: { n: 2, m1: 1, m2: 1, k1: 4, k2: 0.8, k3: 4 },
    init: () => ({ x: [0.35, 0], v: [0, 0] }),
    chips: { energy: true },
  },
  {
    id: 'pulse',
    labelKey: 'osc.coupled.presets.pulse',
    descKey: 'osc.coupled.presetInfo.pulse',
    params: {},
    init: pulse,
  },
];

const SUB = ['₁', '₂', '₃', '₄', '₅'];

/** One series per body i (`key{i}`, colored like the block), hidden while i ≥ n. */
const perBody = (
  key: string,
  label: string,
  unit: string,
  extra: Partial<SeriesDef> = {},
): SeriesDef[] =>
  range(MAX_N).map((i) => ({
    key: `${key}${i + 1}`,
    label: `${label}${SUB[i]}`,
    unit,
    color: bodyColors[i]!,
    when: (p) => countOf(p as unknown as P) > i,
    ...extra,
  }));

/** One series per normal mode n, in its mode color, sharing `lane`. */
const perMode = (key: string, label: string, unit: string, lane: string): SeriesDef[] =>
  range(MAX_N).map((i) => ({
    key: `${key}${i + 1}`,
    label: `${label}${SUB[i]}`,
    unit,
    color: modeColors[i]!,
    lane,
    when: (p) => countOf(p as unknown as P) > i,
  }));

const historyKeys = [
  ...['x', 'v', 'E', 'q', 'Eq'].flatMap((k) => range(MAX_N).map((i) => `${k}${i + 1}`)),
  'K',
  'U',
  'E',
];

const sim: MechanicalSimSpec<P, CoupledInit> = {
  kind: 'mechanical1d',
  model: coupledModel,
  defaultParams: COUPLED_DEFAULTS,
  defaultInit: pulse(),
  maxSpeed: MAX_SPEED,
  createScene: createCoupledScene,
  objects,
  presets,
  countParam: { key: 'n', min: 2, max: MAX_N, labelKey: 'osc.coupled.count', init: pulse },
  badge: (p: P) => {
    const n = countOf(p);
    const uniform =
      range(n).every((i) => massOf(p, i + 1) === massOf(p, 1)) &&
      range(n + 1).every((j) => springOf(p, j + 1) === springOf(p, 1));
    return uniform
      ? { key: 'osc.coupled.badge.uniform', tone: 'good' }
      : { key: 'osc.coupled.badge.nonuniform', tone: 'neutral' };
  },
  historyKeys,
  chips: [
    { id: 'x', labelKey: 'osc.coupled.chips.traces', defaultOn: true, color: bodyColors[0] },
    { id: 'v', labelKey: 'plots.chips.v', defaultOn: false, color: bodyColors[1] },
    { id: 'energy', labelKey: 'plots.chips.energy', defaultOn: true, color: S.U },
    { id: 'modes', labelKey: 'osc.coupled.chips.modes', defaultOn: false, color: modeColors[0] },
    { id: 'shapes', labelKey: 'osc.coupled.chips.shapes', defaultOn: false, color: modeColors[1] },
    { id: 'config', labelKey: 'osc.coupled.chips.config', defaultOn: false, color: '#9B7BFF' },
  ],
  panels: [
    {
      id: 'motion',
      titleKey: 'plots.panels.motion',
      chips: ['x', 'v'],
      weight: 1.3,
      create: () =>
        new TimePlot(
          [
            ...perBody('x', 'x', 'm', { chip: 'x', lane: 'x' }),
            ...perBody('v', 'v', 'm/s', { chip: 'v', lane: 'v' }),
          ],
          'lanes',
        ),
    },
    {
      id: 'energy',
      titleKey: 'osc.coupled.panels.energy',
      chips: ['energy'],
      create: () =>
        new TimePlot(
          [...perBody('E', 'E', 'J'), { key: 'E', label: 'E', unit: 'J', color: S.E }],
          'overlay',
          { includeZero: true },
        ),
    },
    {
      id: 'modes',
      titleKey: 'osc.coupled.panels.modes',
      chips: ['modes'],
      weight: 1.3,
      create: () =>
        new TimePlot(
          [...perMode('q', 'q', 'm·√kg', 'q'), ...perMode('Eq', 'E', 'J', 'Eq')],
          'lanes',
        ),
    },
    {
      id: 'shapes',
      titleKey: 'osc.coupled.panels.shapes',
      chips: ['shapes'],
      weight: 1.2,
      create: () =>
        new ModeShapesPlot(
          (p) => normalModes(p as unknown as P),
          (n) => `Eq${n + 1}`,
          'E',
        ),
    },
    {
      id: 'config',
      titleKey: 'osc.coupled.panels.config',
      chips: ['config'],
      weight: 1.2,
      // Lissajous figures: a pure mode is a straight line, a mix of two fills a box.
      create: () => new PhasePlot('x1', 'x2', { x: 'x₁', v: 'x₂', xUnit: 'm', vUnit: 'm' }),
    },
  ],
};

export const coupledPlugin: OscillatorPlugin = {
  id: 'coupled',
  icon: '≈',
  i18n: { es, en },
  sim,
};
