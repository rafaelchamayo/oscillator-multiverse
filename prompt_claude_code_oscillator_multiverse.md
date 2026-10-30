# Prompt para Claude Code — Oscillator Multiverse (Fase 1: oscilador armónico simple + forzado amortiguado)

> **Cómo usar este prompt:** pégalo en Claude Code desde una carpeta vacía, en **Plan Mode** (Shift+Tab dos veces). Claude Code debe proponer el plan y esperar tu aprobación antes de escribir código.

---

## 0. Instrucción de trabajo (léela primero)

Vas a construir desde cero una web de simulaciones interactivas de osciladores. Antes de escribir código:

1. Lee este documento entero.
2. Propón un plan de implementación por fases (puedes refinar el de la sección 9), con la estructura de carpetas, las interfaces clave en TypeScript y los riesgos técnicos que veas.
3. Si algo es ambiguo o contradictorio, **pregúntame antes de asumir**. Si una decisión es menor y reversible, toma la opción razonable y anótala en `DECISIONS.md`.
4. Espera mi aprobación del plan.

Durante la implementación:

- Trabaja **una fase a la vez**. Al terminar cada fase: corre los tests, levanta el dev server, toma capturas con Playwright de las vistas afectadas, revísalas tú mismo contra los criterios de aceptación de esa fase, corrige lo que no cumpla y recién entonces haz commit y avísame con un resumen corto y las capturas.
- Crea y mantén un `CLAUDE.md` en la raíz con: comandos (dev, test, build), arquitectura en 10 líneas, convenciones y el estado actual de las fases.
- La física tiene que ser correcta. Cada modelo físico lleva tests numéricos (sección 8). No des por terminada una fase con tests en rojo.
- El código en inglés (identificadores, comentarios). Los textos de la UI van en diccionarios i18n en español e inglés.

---

## 1. Visión del proyecto

**Oscillator Multiverse** es una web de simulaciones altamente visuales de osciladores armónicos en distintos regímenes físicos. Está dirigida a **estudiantes universitarios de primeros ciclos**. El objetivo es que cualquiera desarrolle **intuición física** sobre qué significa cada término de una ecuación en la vida real, observando el proceso en vivo. También busca mostrar **la belleza de las matemáticas**: las curvas, espirales y figuras que generan estos sistemas.

Usos concretos:
- Aprender jugando: el usuario agarra el bloque, lo lanza y ve qué pasa.
- **Grabar videos para un canal de YouTube** de matemática y física (un video por oscilador). La web necesita un modo presentación limpio y estable (sección 6).

### Catálogo a largo plazo (NO implementar ahora, pero la arquitectura debe soportarlo)
1. Oscilador armónico simple (clásico) ← **esta fase**
2. Oscilador forzado amortiguado ← **esta fase**
3. Osciladores acoplados (modos normales)
4. Oscilador cosmológico clásico
5. Oscilador armónico cuántico 1D, 2D y 3D: el usuario **combina superposiciones** de autoestados con coeficientes c_n y ve |ψ|² o |ψ| coloreado por la fase (domain coloring). No hay partícula.
6. Oscilador cosmológico cuántico
7. Otros (no lineales, péndulo, Duffing, paramétrico…)

Cada oscilador tiene **su propia pestaña o ruta**. Arrancamos en 2D; 3D queda para el futuro.

### Fuera de alcance por ahora
Móvil y tablet, modo claro, backend o cuentas, osciladores 3–7.

---

## 2. Stack técnico

- **Vite + React + TypeScript (strict)**
- **Canvas 2D** para la escena y las gráficas (render propio, con soporte para devicePixelRatio). No uses librerías de charts: las gráficas tienen que estar acopladas visualmente a la animación.
- **KaTeX** para las ecuaciones
- **Zustand** para el estado de la UI
- **i18n** con diccionarios JSON propios (`es.json`, `en.json`) y un hook `useT()`. Selector ES/EN visible en la cabecera.
- **Vitest** para los tests de física, **Playwright** para las capturas y los smoke tests de interacción
- Deploy estático (GitHub Pages o Vercel), con routing por hash o configurado para SPA

Si ves una alternativa claramente mejor para algún punto, propónla en el plan y justifícala.

---

## 3. Arquitectura escalable (lo más importante)

Separa estrictamente **física**, **escena**, **gráficas** y **UI**.

```
src/
  core/
    integrators/      # rk4.ts (paso fijo), interfaz para otros futuros
    sim/              # SimulationLoop: paso fijo + acumulador, desacoplado del render
    units.ts          # escala metros↔píxeles, formato de números
  models/             # física pura, sin DOM
    types.ts          # interfaces genéricas (ver abajo)
    sho/              # oscilador armónico simple
    damped-driven/
  oscillators/        # "plugins": un módulo por pestaña
    registry.ts
    sho/              # escena, hovers, ecuación, gráficas disponibles, textos
    damped-driven/
  render/
    scene/            # primitivas: Block (con personalidad), Spring, Arrow, Wall, Dashpot, Crank...
    plots/            # TracePlot, PhasePlot, EnergyPlot, ResonancePlot
    theme.ts          # tokens de diseño
  interaction/        # drag, fling, hover, popovers, zoom/pan
  ui/                 # layout, pestañas, toolbar, popovers, selector de idioma
  i18n/
  presentation/       # modo presentación y grabación
```

### Interfaces clave (proponlas en detalle en tu plan)

- `Model<State, Params>`: estado, parámetros, `step(state, params, t, dt)`, observables (`energy`, `forces`, etc.) y `latexODE(params)`. **No debe asumir que el estado es (x, v)**: el oscilador cuántico futuro tendrá un vector de coeficientes complejos y los acoplados tendrán N grados de libertad. Para los modelos tipo EDO, crea un adaptador `OdeModel` que use RK4.
- `OscillatorPlugin`: id, nombre i18n, modelo, escena, objetos interactivos (con su hover y popover), gráficas disponibles y presets.
- Agregar un oscilador nuevo debe ser **crear una carpeta y registrarla**, sin tocar el núcleo. Documenta esto en `CLAUDE.md`.

### Bucle de simulación
- Integración con **paso fijo** (por ejemplo dt = 1/600 s de tiempo simulado) con acumulador. El render va a requestAnimationFrame. La velocidad de simulación escala el tiempo simulado, no el dt.
- El tiempo simulado es independiente de los fps, para que una grabación sea reproducible.

---

## 4. Diseño visual y de interacción (común a todas las pestañas)

### Look & feel
- **Modo oscuro**, playful, **tipo juego**. Paleta de azules y morados:
  - fondo `#0B1026` (azul noche) con gradiente sutil hacia `#151A3D`
  - superficies y paneles `#1C2250`, bordes `#2E3675`
  - azul primario `#4C8DFF`, cian de acento `#3DE1FF`
  - morado `#9B6BFF`, lila `#C9A7FF`, magenta suave `#FF6BD6` (para resaltar)
  - texto `#E8ECFF`, texto secundario `#9AA3D9`
  - Ajusta los colores para que el contraste sea legible y documenta los tokens en `theme.ts`.
- Tipografías: una redondeada y amigable para títulos (por ejemplo Fredoka o Baloo 2), Inter para la UI y JetBrains Mono para los números.
- Esquinas redondeadas, glow suave en los elementos interactivos, micro-animaciones con easing.

### Bloques con personalidad
- El bloque es un **personaje**: tiene ojos que miran en la dirección del movimiento, se aplasta y estira un poco con la aceleración (squash & stretch sutil, que no altere la posición física), se asusta o hace una mueca cuando el resorte está muy comprimido o estirado y se marea a velocidades altas. Cuando lo agarras reacciona ("¡wii!", ojitos cerrados) y cuando lo lanzas suelta unas partículas pequeñas.
- La personalidad **nunca debe tapar la física**: tiene que ser posible desactivarla (toggle "modo serio"), y en modo presentación debe poder elegirse.

### Representación física de los parámetros (manipulación directa)
- **Masa m → tamaño del bloque.** El área es proporcional a m.
- **Constante k → resorte**: más espiras y un trazo más grueso cuanto mayor es k. El resorte se dibuja como una hélice cartoon que se comprime y estira de verdad.
- **Hover sobre cualquier objeto** (bloque, resorte, pared, flecha de velocidad, amortiguador, motor…):
  1. Resalta el objeto con un glow.
  2. Muestra un **popover** con una descripción breve, en i18n, de qué es físicamente. Por ejemplo: "Resorte: ejerce una fuerza proporcional a cuánto lo estiras, F = −kx".
  3. Si el objeto tiene parámetros, el popover trae **su slider** (por ejemplo, el bloque trae el de m y el resorte el de k). Los sliders solo existen dentro de estos popovers.
  4. Resalta el término correspondiente en la EDO (por ejemplo, hover en el resorte resalta `kx`). Debe funcionar al revés también: hover en el término resalta el objeto.
- No hay sliders sueltos en la UI.

### Controles globales (toolbar mínima, con iconos)
- Play/Pause (tecla `Espacio`), Reset (`R`)
- **Botón de velocidad de simulación** que rota entre 0.25×, 0.5×, 1×, 2× y 4×
- **Zoom**: rueda del mouse o pinch en el trackpad, centrado en el cursor. Arrastrar el fondo hace pan. Doble clic en el fondo vuelve a la vista por defecto.
- Botón para **cambiar de perspectiva** (horizontal ↔ vertical, sección 5.4)
- Selector de gráficas visibles (chips)
- Toggle de fuerzas (en las pestañas donde aplique)
- Selector ES/EN

---

## 5. Pestaña 1 — Oscilador armónico simple

EDO: `m ẍ + k x = 0`, mostrada con KaTeX y **con los valores actuales sustituidos**, actualizada en vivo (por ejemplo `2.0\,\ddot x + 8.0\,x = 0`). Por ahora solo se muestra la EDO, no la solución.

### 5.1 Fijar la amplitud inicial: arrastrar
- Con la simulación pausada o detenida, arrastra el bloque horizontalmente para fijar x₀. El resorte se estira o comprime en vivo y aparece una etiqueta con x₀.
- Al soltarlo **quieto**, queda listo con v₀ = 0 (o el valor de la flecha, ver 5.2).

### 5.2 Fijar la velocidad inicial: dos formas, ambas activas
- **Flecha de velocidad**: un vector horizontal que sale del bloque. Se arrastra la punta para fijar v₀ (longitud ∝ |v₀|, con etiqueta numérica). Al pasar el mouse sobre la flecha aparece su descripción.
- **Lanzar con el mouse (fling)**: si sueltas el bloque mientras lo mueves, v₀ es la velocidad del puntero estimada en los últimos ~80 ms (suavizada y con un tope razonable). La flecha se actualiza para mostrar la v₀ resultante. Si la simulación estaba pausada, empieza a correr sola tras un lanzamiento.

### 5.3 Agarrar el bloque durante la simulación
- Mientras corre, puedes agarrar el bloque: la integración se suspende y el bloque sigue al cursor (movimiento cinemático). El tiempo sigue avanzando y la traza sigue dibujándose, pero ese tramo "a mano" se dibuja **punteado o con otro color**, para distinguirlo de la dinámica libre.
- Al soltarlo, la integración continúa desde la posición actual con la velocidad del fling.

### 5.4 La traza de la ecuación de movimiento (la característica estrella)
El bloque **"dibuja" su propia gráfica** mientras se mueve, como una pluma sobre papel que avanza:

- **Perspectiva horizontal (por defecto):** el bloque oscila horizontalmente. Una "pluma" bajo el bloque traza x(t) sobre un papel que se desplaza **hacia abajo**: el eje del tiempo es vertical y la posición x queda alineada exactamente con la del bloque.
- **Perspectiva vertical:** el sistema rota y el bloque cuelga u oscila verticalmente. La traza sale hacia la **derecha**, con el tiempo en el eje horizontal y la altura alineada con el bloque (la gráfica clásica de x vs t).
- La transición entre perspectivas es **animada** (rotación suave de unos 600 ms) y conserva el estado y la traza.
- **Gravedad en vertical:** toggle, encendido por defecto en la vista vertical. Con gravedad, el equilibrio se desplaza en mg/k, se muestra una línea punteada en el nuevo equilibrio y la EDO pasa a `m ẍ + k x = m g` (con valores). Anota esta decisión en `DECISIONS.md`.
- La traza tiene un degradado que se desvanece hacia el pasado y un buffer circular con un largo de ventana configurable.

### 5.5 Gráficas seleccionables (chips; varias a la vez, en paneles apilados al costado)
1. **x(t)**: la traza acoplada de 5.4. Siempre disponible, es la principal.
2. **v(t)** y **a(t)**: compartiendo el eje del tiempo con x(t), cada una en su color.
3. **Energía**: K, U y E total en el tiempo, más una barra apilada instantánea junto al bloque. E debe verse constante (sirve también para mostrar la calidad del integrador).
4. **Espacio de fases (x, v)**: elipse con un punto que la recorre y su estela. Que se vea bonita, con glow y degradado.

En todas: hover sobre la curva muestra el valor; los ejes tienen unidades; la escala se ajusta automáticamente con suavidad (sin saltos bruscos).

---

## 6. Modo presentación y grabación (para YouTube)

- Tecla `P`: oculta toda la UI salvo la escena y las gráficas elegidas. Lienzo fijo de **16:9 (1920×1080 lógico)**, centrado.
- 60 fps estables. El tiempo de la simulación es determinista.
- **Grabar**: botón (o tecla `G`) que graba el canvas con `canvas.captureStream()` + `MediaRecorder` en WebM y lo descarga al terminar.
- Opciones del modo: con o sin personalidad del bloque, con o sin EDO, con o sin ejes, fondo sólido o con gradiente.

---

## 7. Pestaña 2 — Oscilador forzado amortiguado

EDO: `m ẍ + b ẋ + k x = F₀ cos(ω t)`, con valores sustituidos en vivo. Además, un **badge de régimen** (subamortiguado, crítico o sobreamortiguado) calculado con γ = b/(2m) frente a ω₀ = √(k/m). Es la misma interfaz base que la pestaña 1 (arrastrar, lanzar, flecha de velocidad, agarrar en vivo, perspectivas y traza), más lo siguiente:

### 7.1 Representación física de las fuerzas
- **Amortiguamiento, b → amortiguador hidráulico (dashpot):** un pistón conectado al bloque, dentro de un cilindro con fluido. El **fluido cambia visualmente según b**: agua celeste y transparente con b bajo, aceite violeta con b medio, miel densa con b alto. Tiene burbujitas que se mueven según la velocidad del pistón. Al pasar el mouse aparecen la descripción ("fuerza que se opone a la velocidad, F = −b ẋ") y el slider de b.
- **Fuerza externa, F₀ y ω → motor con biela:** el extremo fijo del resorte deja de ser una pared y pasa a ser una **rueda motorizada con biela** que empuja y tira. El radio de la manivela representa la amplitud del forzamiento y la velocidad de giro representa ω. Al pasar el mouse sobre la rueda aparecen la descripción y los sliders de F₀ y ω.
  - Implementación física: decide en el plan entre (a) una fuerza externa directa F₀ cos ωt sobre el bloque, con la biela como representación visual, o (b) un anclaje móvil x_a = A cos ωt, que da F = kA cos ωt. Recomiendo (a) por claridad, porque la EDO coincide exactamente con lo que se ve. Explica la elección en `DECISIONS.md`.
- La rueda tiene una "carita" de motor que se esfuerza más cuando F₀ es grande (coherente con el estilo de juego).

### 7.2 Fuerzas en tiempo real (toggle)
- Vectores sobre el bloque, **cada uno activable por separado**: restauradora (−kx), amortiguamiento (−bẋ), externa (F₀ cos ωt), gravedad (si aplica) y **fuerza neta**. Cada uno con su color, su etiqueta y su longitud proporcional (con una escala común).
- Opcional: una gráfica de las fuerzas en el tiempo con los mismos colores.

### 7.3 Gráficas adicionales (además de las de la pestaña 1)
- **Transitorio vs. estacionario:** superpuestos a x(t), activables. La solución estacionaria analítica en punteado y el transitorio como la diferencia. La idea es ver cómo el transitorio "muere".
- **Espacio de fases:** espiral que converge al ciclo límite elíptico del estado estacionario. Esta gráfica tiene que ser especialmente hermosa.
- **Energía:** K, U y E, más la potencia inyectada por el motor y la disipada por el amortiguador.
- **Curva de resonancia A(ω):** curva teórica en punteado, `A = (F₀/m) / √((ω₀² − ω²)² + (2γω)²)`, más un **modo barrido**: el usuario cambia ω (o activa un barrido automático lento) y, cada vez que el sistema alcanza el estado estacionario, se agrega un punto medido. Marca ω₀ y ω_res. Opcionalmente, la fase φ(ω) debajo.

### 7.4 Presets (botones pequeños)
Sin amortiguar · Subamortiguado · Crítico · Sobreamortiguado · Resonancia · Pulsaciones (ω ≈ ω₀ con b ≈ 0)

---

## 8. Verificación de la física (tests obligatorios con Vitest)

- **RK4 en el oscilador simple frente a la solución analítica** x(t) = x₀ cos ω₀t + (v₀/ω₀) sin ω₀t: error relativo < 1e-6 durante 10 periodos con el dt elegido.
- **Periodo:** medido por cruces por cero, coincide con 2π√(m/k) con error < 0.1%.
- **Energía del oscilador simple:** deriva relativa < 1e-5 en 100 periodos.
- **Amortiguado sin forzar:** coincide con la solución analítica en los tres regímenes (error < 1e-5).
- **Forzado:** tras el transitorio, la amplitud y la fase estacionarias coinciden con las fórmulas analíticas con error < 1%.
- **Gravedad en vertical:** el equilibrio queda en mg/k.
- **Balance de energía en el forzado:** la variación de E es igual a la integral de la potencia del motor menos la disipada (error < 1%).
- **Interacción (Playwright):** arrastrar el bloque cambia x₀; lanzarlo produce v₀ ≠ 0 con el signo correcto; agarrarlo durante la simulación la pausa y soltarlo la reanuda; el cambio de perspectiva conserva el estado.

---

## 9. Fases de implementación (con criterios de aceptación)

**Fase 0 — Andamiaje.** Vite + React + TS, ESLint/Prettier, Vitest, Playwright, `CLAUDE.md`, `DECISIONS.md`, tokens del tema, layout con pestañas, i18n ES/EN funcionando. ✔ La app levanta con dos pestañas vacías, el selector de idioma funciona y la página tiene el look oscuro con azules y morados.

**Fase 1 — Núcleo físico.** Interfaces `Model` y `OdeModel`, RK4, SimulationLoop con paso fijo, modelos del oscilador simple y del forzado amortiguado **sin UI**. ✔ Todos los tests de física de la sección 8 en verde.

**Fase 2 — Escena del oscilador simple.** Bloque con personalidad, resorte proporcional a k, pared, arrastre de x₀, flecha de v₀, fling, agarrar en vivo, play/pause/reset, botón de velocidad, zoom y pan. ✔ Los tests de interacción pasan y las capturas muestran el bloque y el resorte con buena pinta.

**Fase 3 — Traza y gráficas.** Pluma con papel en movimiento, perspectivas horizontal y vertical con transición animada, gravedad en vertical, chips de gráficas (x, v, a, energía, fases). ✔ La traza queda perfectamente alineada con el bloque en ambas perspectivas y E se ve constante.

**Fase 4 — Hover, popovers y EDO.** Descripciones i18n, sliders de m y k dentro de los popovers, EDO en KaTeX con valores en vivo y resaltado bidireccional entre términos y objetos. ✔ Pasar el mouse sobre cualquier objeto muestra su descripción y no queda ningún slider fuera de un popover.

**Fase 5 — Forzado amortiguado.** Dashpot con fluido variable, motor con biela, vectores de fuerza activables, badge de régimen, transitorio y estacionario, espiral de fases, energía y potencia, curva de resonancia con barrido y presets. ✔ El preset de resonancia muestra el crecimiento hasta la amplitud teórica y los puntos del barrido caen sobre la curva teórica.

**Fase 6 — Modo presentación y pulido.** Modo `P`, grabación WebM, modo serio, rendimiento a 60 fps estables (perfila y optimiza el render de las trazas), accesibilidad básica (foco visible y atajos documentados con `?`). ✔ Una grabación de 30 s sale fluida y sin la UI.

---

## 10. Definición de "terminado" para esta etapa

- Las dos pestañas funcionan con toda la interactividad descrita, en ES y EN.
- Los tests de física y de interacción están en verde.
- `CLAUDE.md` explica cómo agregar un oscilador nuevo en pasos concretos, usando el oscilador simple como ejemplo.
- `DECISIONS.md` registra las decisiones tomadas y por qué.
- El build estático está listo para desplegar.

Empieza leyendo todo y proponiendo el plan. No escribas código hasta que lo apruebe.
