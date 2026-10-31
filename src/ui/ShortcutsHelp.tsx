import { useEffect, useRef } from 'react';
import { useT } from '../i18n/useT';
import type { TKey } from '../i18n/dict';
import { useSimStore } from '../state/simStore';

const ROWS: { keys: (TKey | string)[]; what: TKey }[] = [
  { keys: ['keys.space'], what: 'help.play' },
  { keys: ['R'], what: 'help.reset' },
  { keys: ['V'], what: 'help.perspective' },
  { keys: ['E'], what: 'help.ode' },
  { keys: ['P'], what: 'help.present' },
  { keys: ['G'], what: 'help.record' },
  { keys: ['?'], what: 'help.help' },
  { keys: ['keys.esc'], what: 'help.exit' },
  { keys: ['keys.wheel'], what: 'help.zoom' },
  { keys: ['keys.dblclick'], what: 'help.resetView' },
  { keys: ['keys.drag'], what: 'help.drag' },
  { keys: ['keys.drag'], what: 'help.arrow' },
  { keys: ['keys.drag'], what: 'help.pan' },
];

/** Modal list of keyboard and pointer shortcuts (opened with `?`). */
export function ShortcutsHelp() {
  const t = useT();
  const open = useSimStore((s) => s.helpOpen);
  const setOpen = useSimStore((s) => s.setHelpOpen);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => before?.focus?.();
  }, [open]);

  if (!open) return null;
  return (
    <div className="help-backdrop" onClick={() => setOpen(false)}>
      <div
        className="help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        data-testid="help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help__head">
          <h2 id="help-title" className="help__title">
            {t('help.title')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="help__close"
            data-testid="help-close"
            onClick={() => setOpen(false)}
          >
            {t('help.close')}
          </button>
        </div>
        <dl className="help__list">
          {ROWS.map((r) => (
            <div key={r.what} className="help__row">
              <dt>
                {r.keys.map((k) => (
                  <kbd key={k}>{k.includes('.') ? t(k as TKey) : k}</kbd>
                ))}
              </dt>
              <dd>{t(r.what)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
