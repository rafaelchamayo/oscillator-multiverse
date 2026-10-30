import { useEffect, useRef, useState } from 'react';
import { PointerController } from '../interaction/PointerController';
import { useT } from '../i18n/useT';
import { recordingMime } from '../presentation/Recorder';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';
import { RecordIcon, StopIcon } from './icons';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

/** Seconds without pointer movement before the options bar hides. */
const BAR_IDLE = 2.5;

/**
 * Full-window presentation mode: one 1920×1080 canvas (scene, ODE and the chosen plots, all
 * drawn by the controller, so a recording captures exactly that), letterboxed. The options bar
 * floats over the canvas but is DOM, so it never appears in a recording.
 */
export function PresentationStage({ sim }: Props) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const present = useSimStore((s) => s.present);
  const setPresent = useSimStore((s) => s.setPresent);
  const serious = useSimStore((s) => s.serious);
  const setSerious = useSimStore((s) => s.setSerious);
  const recording = useSimStore((s) => s.recording);
  const setPresenting = useSimStore((s) => s.setPresenting);
  const [idle, setIdle] = useState(false);
  const canRecord = recordingMime() !== '';

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    sim.enterPresentation(canvas);
    const pointer = new PointerController(sim, canvas);
    return () => {
      pointer.dispose();
      sim.exitPresentation();
    };
  }, [sim]);

  useEffect(() => {
    let id = 0;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(id);
      id = window.setTimeout(() => setIdle(true), BAR_IDLE * 1000);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  const toggleRecord = () => {
    if (sim.recording) void sim.stopRecording();
    else sim.startRecording();
  };

  return (
    <div
      className={`present${idle ? ' present--idle' : ''}`}
      data-testid="presentation"
      role="region"
      aria-label={t('present.label')}
    >
      <canvas ref={ref} className="present__canvas" data-testid="present-canvas" />
      {recording && (
        <div className="present__rec" data-testid="rec-indicator" role="status">
          <span className="present__rec-dot" aria-hidden />
          {t('present.recording')}
        </div>
      )}
      <div className="present__bar" role="toolbar" aria-label={t('present.label')}>
        <Toggle
          id="personality"
          label={t('present.personality')}
          on={!serious}
          set={(v) => setSerious(!v)}
        />
        <Toggle
          id="ode"
          label={t('present.ode')}
          on={present.ode}
          set={(ode) => setPresent({ ode })}
        />
        <Toggle
          id="axes"
          label={t('present.axes')}
          on={present.axes}
          set={(axes) => setPresent({ axes })}
        />
        <button
          type="button"
          className="present__opt"
          data-testid="present-background"
          onClick={() =>
            setPresent({ background: present.background === 'solid' ? 'gradient' : 'solid' })
          }
        >
          {t('present.background')}: {t(`present.${present.background}`)}
        </button>
        <span className="toolbar__sep" aria-hidden />
        <button
          type="button"
          className={`present__opt present__opt--rec${recording ? ' is-on' : ''}`}
          data-testid="record"
          aria-pressed={recording}
          disabled={!canRecord}
          title={canRecord ? `${t('present.record')} (G)` : t('present.unsupported')}
          onClick={toggleRecord}
        >
          {recording ? <StopIcon /> : <RecordIcon />}
          {recording ? t('present.stop') : t('present.record')}
        </button>
        <button
          type="button"
          className="present__opt"
          data-testid="present-exit"
          title={`${t('present.exit')} (Esc)`}
          onClick={() => setPresenting(false)}
        >
          {t('present.exit')}
        </button>
        <span className="present__hint">{t('present.hint')}</span>
      </div>
    </div>
  );
}

function Toggle(props: { id: string; label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="present__opt"
      data-testid={`present-${props.id}`}
      aria-pressed={props.on}
      onClick={() => props.set(!props.on)}
    >
      <span className="present__check" aria-hidden />
      {props.label}
    </button>
  );
}
