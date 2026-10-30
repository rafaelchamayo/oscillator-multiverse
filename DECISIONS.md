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

## Phase 1

- **Time as an integer step count** (t = n·dt, dt = 1/600 s) so simulated time never drifts; the accumulator
  is measured in steps. Frames longer than 0.1 s (background tab) are clamped.
- **`advanceFrame()`** advances exactly 1/60 s × speed per frame, used for deterministic recording.
- **Holding the block** (`hold`/`release`): integration is suspended and each step interpolates linearly to
  the latest pointer position, so time and traces keep a smooth, uniformly sampled flow; samples are flagged
  `manual`. W_in/W_diss are not accumulated while held (the hand's work is not part of the model).
- **Slider ranges** (kg, N/m, N·s/m, N, rad/s): m ∈ [0.2, 5], k ∈ [1, 50], b ∈ [0, 20], F₀ ∈ [0, 20],
  ω ∈ [0.1, 15]. The stiffest case (ω₀ ≈ 15.8 rad/s) still gives RK4 error ≈ 2.5e-7 < 1e-6 over 10 periods.
- **Energy drift test** measures E − E_min (the oscillation energy) so it stays meaningful with gravity,
  where E itself can be near zero.
- **Regime badge** treats |γ − ω₀| ≤ 0.1% ω₀ as critical; the analytic solution uses the exact regime.
- **ODE coefficients** are shown with two decimals, trailing zeros trimmed but at least one kept
  (2 → `2.0`, 0.25 → `0.25`). Gravity appears as `− m·g` with both values (e.g. `−2.0·9.81`).
- **Phase φ** is the lag of the response behind the drive, x_ss = x_eq + A cos(ωt − φ), φ ∈ [0, π].

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
