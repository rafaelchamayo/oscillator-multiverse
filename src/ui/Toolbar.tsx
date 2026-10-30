import { useT } from '../i18n/useT';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';
import {
  FaceIcon,
  GravityIcon,
  HelpIcon,
  PauseIcon,
  PlayIcon,
  PresentIcon,
  ResetIcon,
  RotateIcon,
  ViewIcon,
} from './icons';

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
  const vertical = useSimStore((s) => s.perspective === 'vertical');
  const togglePerspective = useSimStore((s) => s.togglePerspective);
  const gravity = useSimStore((s) => s.gravity);
  const setGravity = useSimStore((s) => s.setGravity);
  const canRotate = !!sim.spec.setGravity;
  const setPresenting = useSimStore((s) => s.setPresenting);
  const setHelpOpen = useSimStore((s) => s.setHelpOpen);

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
      <span className="toolbar__sep" aria-hidden />
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
      {canRotate && (
        <button
          type="button"
          className="toolbar__btn"
          data-testid="perspective"
          aria-pressed={vertical}
          aria-label={t('toolbar.perspective')}
          title={`${vertical ? t('toolbar.perspectiveOff') : t('toolbar.perspective')} (V)`}
          onClick={togglePerspective}
        >
          <RotateIcon />
        </button>
      )}
      {canRotate && vertical && (
        <button
          type="button"
          className="toolbar__btn"
          data-testid="gravity"
          aria-pressed={gravity}
          aria-label={t('toolbar.gravity')}
          title={t('toolbar.gravity')}
          onClick={() => setGravity(!gravity)}
        >
          <GravityIcon />
        </button>
      )}
      <button
        type="button"
        className="toolbar__btn toolbar__btn--ring"
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
      <span className="toolbar__sep" aria-hidden />
      <button
        type="button"
        className="toolbar__btn"
        data-testid="present"
        aria-label={t('toolbar.present')}
        title={`${t('toolbar.present')} (P)`}
        onClick={() => setPresenting(true)}
      >
        <PresentIcon />
      </button>
      <button
        type="button"
        className="toolbar__btn"
        data-testid="help-open"
        aria-label={t('toolbar.help')}
        title={`${t('toolbar.help')} (?)`}
        onClick={() => setHelpOpen(true)}
      >
        <HelpIcon />
      </button>
    </div>
  );
}
