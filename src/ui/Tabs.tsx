import { useT } from '../i18n/useT';
import type { OscillatorPlugin } from '../oscillators/types';

interface Props {
  plugins: readonly OscillatorPlugin[];
  activeId: string;
}

export function Tabs({ plugins, activeId }: Props) {
  const t = useT();
  return (
    <nav className="tabs" aria-label={t('header.tabs')}>
      {plugins.map((p) => (
        <a
          key={p.id}
          href={`#/${p.id}`}
          className="tabs__tab"
          aria-current={p.id === activeId ? 'page' : undefined}
          data-testid={`tab-${p.id}`}
        >
          <span className="tabs__icon" aria-hidden>
            {p.icon}
          </span>
          {t(`osc.${p.id}.short`)}
        </a>
      ))}
    </nav>
  );
}
