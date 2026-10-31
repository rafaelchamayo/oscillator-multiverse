import {
  QHO_DEFAULTS,
  coherentInit,
  qhoModel,
  type QhoInit,
  type QhoParams,
} from '../../models/quantum-ho/model';
import { TimePlot } from '../../render/plots/TimePlot';
import { series as S } from '../../render/theme';
import type { MechanicalSimSpec, ObjectDef, OscillatorPlugin } from '../types';
import es from './i18n/es.json';
import en from './i18n/en.json';
import { MAX_SPEED, createQuantumScene } from './scene';

const objects: ObjectDef[] = [
  { id: 'potential', terms: ['potential'], params: [] },
  // Dragging the packet reshapes ψ: its curvature is the kinetic term.
  { id: 'packet', terms: ['kinetic'], params: [] },
  { id: 'velocity', terms: [], params: [] },
];

const sim: MechanicalSimSpec<QhoParams, QhoInit> = {
  kind: 'mechanical1d',
  model: qhoModel,
  defaultParams: QHO_DEFAULTS,
  defaultInit: coherentInit(2.5),
  maxSpeed: MAX_SPEED,
  createScene: createQuantumScene,
  objects,
  historyKeys: ['x', 'v', 'dx', 'dp', 'dxdp', 'E', 'K', 'U'],
  chips: [{ id: 'x', labelKey: 'osc.quantum-ho.chips.expect', defaultOn: true, color: S.x }],
  panels: [
    {
      id: 'expect',
      titleKey: 'osc.quantum-ho.panels.expect',
      chips: ['x'],
      create: () =>
        new TimePlot(
          [
            { key: 'x', label: '⟨x⟩', unit: 'ℓ', color: S.x },
            { key: 'v', label: '⟨p⟩', unit: 'ħ/ℓ', color: S.v },
          ],
          'lanes',
        ),
    },
  ],
};

export const quantumHoPlugin: OscillatorPlugin = {
  id: 'quantum-ho',
  icon: 'ψ',
  i18n: { es, en },
  sim,
};
