import { useT } from '../i18n/useT';
import type { SimController } from '../runtime/SimController';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

/** Row of small preset buttons under the equation. */
export function Presets({ sim }: Props) {
  const t = useT();
  const presets = sim.spec.presets;
  if (!presets?.length) return null;
  return (
    <div className="presets" role="group" aria-label={t('presets.label')}>
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className="presets__btn"
          data-testid={`preset-${p.id}`}
          onClick={() => sim.applyPreset(p.id)}
        >
          {t(p.labelKey)}
        </button>
      ))}
    </div>
  );
}
