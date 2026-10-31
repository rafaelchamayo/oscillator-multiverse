import { registerDict } from '../i18n/dict';
import type { OscillatorPlugin } from './types';
import { shoPlugin } from './sho';
import { dampedDrivenPlugin } from './damped-driven';
import { coupledPlugin } from './coupled';
import { quantumHoPlugin } from './quantum-ho';

const plugins: OscillatorPlugin[] = [];

export function registerPlugin(plugin: OscillatorPlugin): void {
  if (plugins.some((p) => p.id === plugin.id)) throw new Error(`Duplicate plugin id: ${plugin.id}`);
  registerDict(`osc.${plugin.id}`, plugin.i18n);
  plugins.push(plugin);
}

export function getPlugins(): readonly OscillatorPlugin[] {
  return plugins;
}

export function getPlugin(id: string): OscillatorPlugin | undefined {
  return plugins.find((p) => p.id === id);
}

// Tab order. Adding an oscillator = create its folder and add one line here.
registerPlugin(shoPlugin);
registerPlugin(dampedDrivenPlugin);
registerPlugin(coupledPlugin);
registerPlugin(quantumHoPlugin);
