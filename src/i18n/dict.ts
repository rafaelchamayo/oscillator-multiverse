import es from './es.json';
import en from './en.json';

export type Lang = 'es' | 'en';
export const LANGS: readonly Lang[] = ['es', 'en'];

export type Dict = { [key: string]: string | Dict };

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Keys of the core dictionary (checked at compile time). Plugin keys live under `osc.<id>.`. */
export type CoreKey = Leaves<typeof en>;
export type TKey = CoreKey | `osc.${string}`;

function flatten(d: Dict, prefix: string, out: Map<string, string>): void {
  for (const [k, v] of Object.entries(d)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else flatten(v, key, out);
  }
}

const tables: Record<Lang, Map<string, string>> = { es: new Map(), en: new Map() };
flatten(es, '', tables.es);
flatten(en, '', tables.en);

/** Merge a dictionary under a namespace, e.g. a plugin's texts under `osc.sho`. */
export function registerDict(namespace: string, dicts: Record<Lang, Dict>): void {
  for (const lang of LANGS) flatten(dicts[lang], namespace, tables[lang]);
}

/** Translate `key`, replacing `{name}` placeholders. Falls back to Spanish, then to the key. */
export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  const raw = tables[lang].get(key) ?? tables.es.get(key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Keys present in one language but not the other; used by tests. */
export function missingKeys(): { es: string[]; en: string[] } {
  const inEs = [...tables.en.keys()].filter((k) => !tables.es.has(k));
  const inEn = [...tables.es.keys()].filter((k) => !tables.en.has(k));
  return { es: inEs, en: inEn };
}
