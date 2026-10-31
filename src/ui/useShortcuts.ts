import { useEffect } from 'react';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';

/** Global keyboard shortcuts for the active simulation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useShortcuts(sim: SimController<any>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      const ui = useSimStore.getState();
      if (e.key === 'Escape') {
        if (ui.helpOpen) ui.setHelpOpen(false);
        else if (ui.presenting) ui.setPresenting(false);
        return;
      }
      if (e.key === '?') {
        ui.setHelpOpen(!ui.helpOpen);
        return;
      }
      if (ui.helpOpen) return;
      if (e.code === 'Space') {
        // Avoid also "clicking" a focused toolbar button.
        e.preventDefault();
        sim.toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        sim.reset();
      } else if ((e.key === 'v' || e.key === 'V') && sim.spec.setGravity) {
        ui.togglePerspective();
      } else if (e.key === 'e' || e.key === 'E') {
        ui.setOdeHidden(!ui.odeHidden);
      } else if (e.key === 'p' || e.key === 'P') {
        ui.setPresenting(!ui.presenting);
      } else if (e.key === 'g' || e.key === 'G') {
        // Outside presentation, G opens it and starts recording once its canvas is attached.
        if (!ui.presenting) {
          sim.recordOnPresent = true;
          ui.setPresenting(true);
        } else if (sim.recording) void sim.stopRecording();
        else sim.startRecording();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sim]);
}
