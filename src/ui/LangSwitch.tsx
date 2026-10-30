import { LANGS } from '../i18n/dict';
import { useT } from '../i18n/useT';
import { useUiStore } from '../state/uiStore';

export function LangSwitch() {
  const t = useT();
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  return (
    <div className="lang-switch" role="group" aria-label={t('header.language')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className="lang-switch__btn"
          aria-pressed={lang === l}
          data-testid={`lang-${l}`}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
