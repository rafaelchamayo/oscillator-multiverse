import { useEffect } from 'react';
import { useT } from '../i18n/useT';
import { getPlugin, getPlugins } from '../oscillators/registry';
import { LangSwitch } from './LangSwitch';
import { SimStage } from './SimStage';
import { LogoWave } from './icons';
import { Tabs } from './Tabs';
import { navigate, useHashRoute } from './useHashRoute';

export function AppShell() {
  const t = useT();
  const route = useHashRoute();
  const plugins = getPlugins();
  const active = getPlugin(route) ?? plugins[0];

  useEffect(() => {
    if (active && route !== active.id) navigate(active.id);
  }, [active, route]);

  if (!active) return null;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand__logo" aria-hidden>
            <LogoWave />
          </span>
          <BrandTitle text={t('app.title')} />
        </div>
        <Tabs plugins={plugins} activeId={active.id} />
        <LangSwitch />
      </header>
      <main className="workspace" data-testid={`workspace-${active.id}`}>
        {active.sim ? (
          <SimStage key={active.id} plugin={{ ...active, sim: active.sim }} />
        ) : (
          <>
            <section className="stage">
              <div className="placeholder">
                <h1 className="placeholder__title">{t(`osc.${active.id}.title`)}</h1>
                <p className="placeholder__tagline">{t(`osc.${active.id}.tagline`)}</p>
                <div className="placeholder__card">
                  <strong>{t('placeholder.comingSoon')}</strong>
                  <p>{t('placeholder.body')}</p>
                </div>
              </div>
            </section>
            <aside className="side-panel" aria-hidden />
          </>
        )}
      </main>
    </div>
  );
}

/** Brand name with the last word in the muted tone ("Oscillator **Multiverse**"). */
function BrandTitle({ text }: { text: string }) {
  const i = text.lastIndexOf(' ');
  return (
    <span className="brand__title">
      {i < 0 ? text : text.slice(0, i + 1)}
      {i >= 0 && <span className="brand__title-muted">{text.slice(i + 1)}</span>}
    </span>
  );
}
