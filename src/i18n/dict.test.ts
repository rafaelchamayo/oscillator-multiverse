import { describe, expect, it } from 'vitest';
import { getPlugins } from '../oscillators/registry';
import { missingKeys, translate } from './dict';

describe('i18n', () => {
  it('has the same keys in es and en (core + plugins)', () => {
    expect(getPlugins().length).toBeGreaterThan(0);
    expect(missingKeys()).toEqual({ es: [], en: [] });
  });

  it('every plugin provides title, short and tagline', () => {
    for (const p of getPlugins()) {
      for (const field of ['title', 'short', 'tagline']) {
        const key = `osc.${p.id}.${field}` as const;
        expect(translate('es', key)).not.toBe(key);
        expect(translate('en', key)).not.toBe(key);
      }
    }
  });

  it('interpolates placeholders', () => {
    expect(translate('en', 'app.title', { unused: 1 })).toBe('Oscillator Multiverse');
  });
});
