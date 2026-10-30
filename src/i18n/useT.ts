import { useCallback } from 'react';
import { useUiStore } from '../state/uiStore';
import { translate, type TKey } from './dict';

export function useT() {
  const lang = useUiStore((s) => s.lang);
  return useCallback(
    (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
}
