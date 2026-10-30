import { useT } from '../i18n/useT';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';
import { FaceIcon, PauseIcon, PlayIcon, ResetIcon, ViewIcon } from './icons';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

export function Toolbar({ sim }: Props) {
  const t = useT();
  const running = useSimStore((s) => s.running);
  const speed = useSimStore((s) => s.speed);
  const serious = useSimStore((s) => s.serious);
  const setSerious = useSimStore((s) => s.setSerious);

  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <button
        type="button"
        className="toolbar__btn toolbar__btn--primary"
        data-testid="play"
        aria-label={running ? t('toolbar.pause') : t('toolbar.play')}
        title={`${running ? t('toolbar.pause') : t('toolbar.play')} (${t('keys.space')})`}
        onClick={() => sim.toggle()}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        className="toolbar__btn"
        data-testid="reset"
        aria-label={t('toolbar.reset')}
        title={`${t('toolbar.reset')} (R)`}
        onClick={() => sim.reset()}
      >
        <ResetIcon />
      </button>
      <button
        type="button"
        className="toolbar__btn toolbar__btn--text"
        data-testid="speed"
        aria-label={t('toolbar.speed', { speed })}
        title={t('toolbar.speed', { speed })}
        onClick={() => sim.cycleSpeed()}
      >
        {speed}×
      </button>
      <span className="toolbar__sep" aria-hidden />
      <button
        type="button"
        className="toolbar__btn"
        data-testid="serious"
        aria-pressed={serious}
        aria-label={t('toolbar.serious')}
        title={t('toolbar.serious')}
        onClick={() => setSerious(!serious)}
      >
        <FaceIcon />
      </button>
      <button
        type="button"
        className="toolbar__btn"
        data-testid="reset-view"
        aria-label={t('toolbar.resetView')}
        title={t('toolbar.resetView')}
        onClick={() => sim.view.resetView()}
      >
        <ViewIcon />
      </button>
    </div>
  );
}
