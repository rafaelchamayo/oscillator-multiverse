# Decisions

Minor, reversible decisions taken during implementation, and why.

## Phase 0

- **Hash routing, hand-rolled** (`useHashRoute`, ~20 lines) instead of react-router: GitHub Pages has no SPA
  fallback and two/three tabs don't justify a dependency.
- **Self-hosted fonts via `@fontsource`** (Fredoka, Inter, JetBrains Mono): works offline and lets the canvas
  wait on `document.fonts` before drawing text.
- **Theme tokens in TS** (`src/render/theme.ts`) and exposed to CSS as custom properties, so canvas and DOM
  share one palette. `textMuted` lifted from `#9AA3D9` to `#A3ACE0` for ≥ 4.5:1 contrast on `surface`.
- **i18n**: core keys are type-checked from `en.json`; plugin texts are merged under `osc.<id>.*` at
  registration, so adding an oscillator needs no change to the core dictionaries. Missing keys fall back
  to Spanish, then to the key itself. Default language: saved choice, else browser language, else Spanish.
- **Vite `base`** is `./` by default, overridable with `BASE_PATH` (used by the Pages workflow).

## Planned (from the approved plan; detailed when implemented)

- **Driving force**: option (a), a direct force F₀ cos ωt on the block; the crank is visual only. The ODE then
  matches exactly what is drawn.
- **Vertical perspective**: a pure −90° rotation of the scene. The wall/motor ends at the bottom, the block
  rests on the spring, the trace exits to the right and x is positive upwards (classic x vs t plot). With
  gravity the ODE reads `m ẍ + k x = −m g` and the equilibrium sits at x = −mg/k. A "hanging" layout would need
  a reflection instead of a rotation, which cannot be animated as a smooth rotation.
- **Gravity** toggle, on by default when entering the vertical view; g = 0 in the horizontal view.
- **Energy balance (driven)**: the state is augmented with W_in = ∫F·v dt and W_diss = ∫b v² dt, integrated by
  the same RK4 step.
- **Recording**: `captureStream()` does not capture DOM, so presentation mode composes scene, plots and the
  ODE (drawn by a small canvas math renderer) into one 1920×1080 canvas.
