# Decisions

Minor, reversible decisions taken during implementation, and why.

## Phase 0

- **Hash routing, hand-rolled** (`useHashRoute`, ~20 lines) instead of react-router: GitHub Pages has no SPA
  fallback and two/three tabs don't justify a dependency.
- **Self-hosted fonts via `@fontsource`** (Fredoka, Inter, JetBrains Mono): works offline and lets the canvas
  wait on `document.fonts` before drawing text.
- **Theme tokens in TS** (`src/render/theme.ts`) and exposed to CSS as custom properties, so canvas and DOM
  share one palette.
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

## Phase 2

- **Scene layout (meters)**: wall face at u = −1.35, block center at u = x, spring from the wall to the
  block's face. The block's side is 0.34 m·√(m/2 kg) (area ∝ m), so the drawn rest length shortens slightly
  as m grows; the wall never moves. x is clamped so the spring keeps ≥ 0.16 m and x ≤ 1.5 m.
- **Spring look**: 10–22 coils and a 2–6.5 px wire, both increasing linearly with k over its slider range.
  Each coil is a side-viewed circle (prolate cycloid), back strands darker, so compression is real.
- **Zoom magnifies physical objects** (spring wire, wall, block outline); handles and labels keep their
  screen size.
- **Fling**: least-squares slope of the pointer over the last 80 ms; a release counts as a fling above
  0.25 m/s (real time). The resulting v₀ is divided by the sim speed so the block leaves the hand at the speed
  it is seen moving, and is capped at ±4 m/s. Releasing still keeps the arrow's v₀ (paused) or 0 (running).
- **Editing while paused** (drag x₀ or the arrow) also sets the initial conditions that Reset restores.
  Reset goes back to t = 0 and pauses.
- **Velocity arrow**: starts at the block face, 0.22 m per m/s, editable (with a handle) only while paused;
  while running it shows the live v, dimmed.
- **Personality** (revised after review, see below): stretch along the motion when fast and squash at
  turning points, driven by an under-damped spring so it wobbles like jelly (up to ~±30%, area-preserving,
  anchored on the floor contact — the physical position and hit box never change); star particles on
  fling; "wheee!" while held. Only real motion deforms the block (a paused block with a v₀ set is at rest).
  Particles use a seeded generator so recordings are reproducible. "Serious mode" turns all of it off.
- **Wheel = zoom** (mouse wheel and trackpad pinch, centered on the cursor); background drag pans;
  double-click on empty background resets the view (a toolbar button does too).

## Phase 2 revision (owner's sketch)

- **Light "sketchbook" theme replaces the spec's dark theme**, at the owner's request: ivory paper, 2 px ink
  outlines, one strong blue (`#1F63F2`) for the spring, velocity and active controls. The plots panel stays
  dark (a "display" next to the drawing). Hover highlight is pink (`#E8338F`). Brand title in Inter bold
  with "Multiverse" muted; Fredoka is kept only for the playful "wheee!".
- **No face and no "m" on the block**: it is a brushed-metal block with chamfered corners and a bevel.
- **The block rests on the floor** (w = 0.30 m), so its center and the spring axis sit at 0.30 − side/2;
  the wall stands on the same floor. A blue tick on the floor marks the block's position, a dashed one the
  equilibrium.
- **Callouts**: v₀ (above the block) and x₀ (below the floor mark) are dark tags with a leader line.
- **Spring** is drawn thick (5–11 px) and attaches to the drawn, squashed face so it never cuts into the
  block.
- The speed button keeps cycling (no dropdown) as the spec asks.

## Phase 3 — Trace and plots

- **Vertical perspective** (implemented as planned): a pure −90° rotation animated over 600 ms (ease-in-out);
  the view refits smoothly every frame (`ViewTransform.fitSmooth`). Gravity is on by default when entering
  the vertical view and g = 0 in the horizontal one. Shortcut: V.
- **Switching gravity keeps the motion as seen**: displacement from equilibrium, velocity, time and history
  are preserved. x keeps its physical meaning (measured from the spring's natural length), so x, x₀ and the
  stored x samples all shift by Δx_eq = −mg/k. Without this, a soft spring (m = 2 kg, k = 8 N/m sags 2.45 m)
  would start a 3 m oscillation through the wall the moment the view rotates.
- **Scenery shifted by x_eq**: wall, floor and paper are drawn at offset x_eq, so the spring at rest looks the
  same in both views (a 2.45 m sag would not fit the drawn spring). Labels on the paper show the true x.
- **Energy relative to equilibrium**: plots and the stacked bar show K, U_eq = ½k(x − x_eq)² and
  E = K + U_eq, the energy of the oscillation. With gravity U = ½kx² + mgx differs from U_eq by a constant;
  without gravity they are identical. The model still exposes U and E.
- **Paper strip of fixed length (2 m)**: the trace window (4/8/16 s) sets the paper speed instead of the strip
  length, so changing the window never rescales the scene. 8 s → 0.25 m/s.
- **History**: 120 samples per simulated second (every 5 steps), 40 s capacity; hand-held samples are drawn
  dashed in pink on the paper and in every plot.
- **Toolbar inset**: the view fits the scene above the floating toolbar (`ViewTransform.insetBottom`).

## Planned (from the approved plan; detailed when implemented)

- **Driving force**: option (a), a direct force F₀ cos ωt on the block; the crank is visual only. The ODE then
  matches exactly what is drawn.
- **Energy balance (driven)**: the state is augmented with W_in = ∫F·v dt and W_diss = ∫b v² dt, integrated by
  the same RK4 step.
- **Recording**: `captureStream()` does not capture DOM, so presentation mode composes scene, plots and the
  ODE (drawn by a small canvas math renderer) into one 1920×1080 canvas.
