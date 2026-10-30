import { create } from 'zustand';

/**
 * Mirror of the active simulation's coarse state for React (toolbar, labels).
 * The controller writes here; per-frame data never goes through React.
 */
interface SimUiState {
  running: boolean;
  speed: number;
  serious: boolean;
  setSerious: (v: boolean) => void;
}

export const useSimStore = create<SimUiState>((set) => ({
  running: false,
  speed: 1,
  serious: false,
  setSerious: (serious) => set({ serious }),
}));
