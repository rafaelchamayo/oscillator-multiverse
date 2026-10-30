import { useEffect } from 'react';
import type { SimController } from '../runtime/SimController';

/** Global keyboard shortcuts for the active simulation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useShortcuts(sim: SimController<any>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      if (e.code === 'Space') {
        // Avoid also "clicking" a focused toolbar button.
        e.preventDefault();
        sim.toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        sim.reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sim]);
}
