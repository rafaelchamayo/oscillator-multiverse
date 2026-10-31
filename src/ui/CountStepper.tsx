import { useT } from '../i18n/useT';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

/** "N masses − 3 +": the number of bodies (`spec.countParam`). Changing it restarts. */
export function CountStepper({ sim }: Props) {
  const t = useT();
  const c = sim.spec.countParam;
  const value = useSimStore((s) => (c ? s.params[c.key] : undefined));
  if (!c || value === undefined) return null;
  return (
    <div className="count" role="group" aria-label={t(c.labelKey)} data-testid="count">
      <span className="count__label">{t(c.labelKey)}</span>
      <button
        type="button"
        className="count__btn"
        data-testid="count-minus"
        aria-label={`${t(c.labelKey)} −1`}
        disabled={value <= c.min}
        onClick={() => sim.setCount(value - 1)}
      >
        −
      </button>
      <output className="count__value" data-testid="count-value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="count__btn"
        data-testid="count-plus"
        aria-label={`${t(c.labelKey)} +1`}
        disabled={value >= c.max}
        onClick={() => sim.setCount(value + 1)}
      >
        +
      </button>
    </div>
  );
}
