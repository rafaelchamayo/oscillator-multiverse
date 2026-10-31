import { useState } from 'react';
import { useT } from '../i18n/useT';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

/** Row of small preset buttons under the equation; hovering one explains the scenario. */
export function Presets({ sim }: Props) {
  const t = useT();
  const [active, setActive] = useState<string | null>(null);
  const params = useSimStore((s) => s.params);
  const presets = sim.spec.presets?.filter((p) => p.visible?.(params) ?? true);
  if (!presets?.length) return null;
  const shown = presets.find((p) => p.id === active && p.descKey);
  return (
    <div className="presets" role="group" aria-label={t('presets.label')}>
      <div className="presets__row">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="presets__btn"
            data-testid={`preset-${p.id}`}
            aria-describedby={p.descKey && active === p.id ? 'preset-tip' : undefined}
            onClick={() => sim.applyPreset(p.id)}
            onPointerEnter={() => setActive(p.id)}
            onPointerLeave={() => setActive((a) => (a === p.id ? null : a))}
            onFocus={() => setActive(p.id)}
            onBlur={() => setActive((a) => (a === p.id ? null : a))}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      {shown?.descKey && (
        <div className="presets__tip" id="preset-tip" role="tooltip" data-testid="preset-tip">
          <strong>{t(shown.labelKey)}</strong>
          <p>{t(shown.descKey, shown.descVars?.(params))}</p>
        </div>
      )}
    </div>
  );
}
