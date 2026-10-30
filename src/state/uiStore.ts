import { create } from 'zustand';
import type { Lang } from '../i18n/dict';

const LANG_KEY = 'osc.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    // storage unavailable: fall through to browser language
  }
  return typeof navigator !== 'undefined' && navigator.language.startsWith('en') ? 'en' : 'es';
}

interface UiState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useUiStore = create<UiState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));
