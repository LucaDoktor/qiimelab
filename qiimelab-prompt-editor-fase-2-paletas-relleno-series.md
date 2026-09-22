# Prompt Fase 2: relleno de serie — opacidad, degradado, patrón, borde

> Continúa la Fase 0. Contexto:
> `Claude outputs/estudio-editor-graficas-nivel-biorender.md` (sección 4.4) y
> `Claude outputs/inventario-editor-graficas.md`. Assets:
> `Claude outputs/assets/palettes_validated.json` (42 paletas validadas,
> incluye Okabe-Ito y Paul Tol completos, generadas y validadas contra
> `js/lib/paletteValidator.js` en la sesión anterior).

## Lo que pide el usuario

Textualmente: "colores de relleno, paletas completas, degradados... bordes
de las gráficas". Hoy `renderPaletteSection` (chartEditor.js:416) solo
ofrece color sólido por serie (picker + hex) más un botón de "aplicar
paleta completa" que reparte los colores de una paleta fija
(`js/lib/palettes.js`) por orden. Falta: opacidad independiente, degradado,
patrón/rayado, borde independiente (color/grosor/radio), y ampliar el
catálogo de paletas seleccionables más allá de las 5 que hay hoy
(`categorical`/`sequential`/`sequentialPoles`/`divergent`/`divergentPoles`).

## Paso 1 — ampliar el catálogo de paletas

Integrar `Claude outputs/assets/palettes_validated.json` en
`js/lib/palettes.js` como paletas adicionales seleccionables (no sustituir
la paleta por defecto de la app, que ya está validada y es la que se usa
si el usuario no toca nada). Cada paleta añadida debe declarar su propia
regla de desbordamiento (qué pasa con la serie 9ª+ si la paleta tiene menos
de 9 colores) — no heredar la regla "va a Otros" de la paleta de 8 sin
pensarlo, puede no aplicar igual a una paleta de 5 (Tol High-contrast) o
de 10 (Tol Muted). El selector de paleta en `renderPaletteSection` pasa de
un botón fijo a un desplegable/lista con todas las disponibles, agrupadas
por tipo (categórica/secuencial/divergente) igual que ya distingue
`paletteType`.

## Paso 2 — opacidad de serie

Nuevo control de opacidad (0-100%, slider) junto al color de cada serie en
`renderPaletteSection`. Escribe `n.style.fillOpacity`/`n.style.strokeOpacity`
sobre los mismos nodos que ya selecciona `applyPalette()`
(`[data-ce-series-fill="id"]`/`[data-ce-series-stroke="id"]`, líneas
248-255) — mismo patrón, un atributo más. Persistir en
`store.__palette[id]` pasando de `hex` string a `{color, opacity}` — **cuidado**:
esto cambia la forma del dato guardado; añadir migración o comprobación de
tipo (`typeof === 'string'` → tratar como `{color: v, opacity: 1}`) para no
romper estilos ya guardados en `localStorage` de usuarios existentes.

## Paso 3 — degradado

Cuando el usuario elige "degradado" en vez de "sólido" para una serie:
crear (una sola vez, reutilizado) un `<linearGradient id="fig-grad-<id>">`
en un `<defs>` del propio SVG (crearlo si no existe) con 2-3 paradas
configurables (color + posición + ángulo), y apuntar
`fill="url(#fig-grad-<id>)"` en los nodos de esa serie. Verificado en el
prototipo de exportación de la Fase 0: `<linearGradient>` sobrevive intacto
al exportar a SVG y rasteriza correctamente a PNG — no hay sorpresas de
interoperabilidad esperadas, pero **repetir la verificación** (exportar y
abrir el SVG resultante) tras integrarlo aquí, no asumir que el prototipo
aislado se comporta igual dentro del flujo real de `attachChartEditor`.

Aplica con más valor en: barras apiladas (`taxaBarplot.js`), cajas de
boxplot (`groupBoxplot.js` ya tiene `fill-opacity` propio en las cajas —
el degradado sería una alternativa al relleno sólido con opacidad, no algo
que se combine sin pensar la jerarquía sólido/opacidad/degradado/patrón
como 4 opciones mutuamente excluyentes de "tipo de relleno", no 4 casillas
independientes).

## Paso 4 — patrón/rayado

Mismo mecanismo que el degradado pero con `<pattern>`: rayado diagonal
(ángulo configurable), puntos, cuadrícula — al menos el rayado diagonal es
el mínimo viable (es el que BioRender ofrece específicamente "para
legibilidad en blanco y negro/impresión", ver estudio sección 1.1). Color
de primer plano/fondo del patrón, grosor de línea, separación configurables.
Mismo `<defs>` compartido con los degradados del Paso 3.

## Paso 5 — borde independiente

Color, grosor y radio de esquina (`rx`/`ry`) por serie, independiente del
relleno. Varios gráficos ya escriben `rx` a mano hoy (`groupBoxplot.js:106`
`rx:3`, `taxaBarplot.js` en las barras) — el cambio es exponerlo como
control en vez de valor fijo por código, y añadir color de borde
independiente del de relleno donde hoy `stroke` sigue al mismo color que
`fill` (p. ej. las cajas de boxplot ya tienen `stroke` propio — confirmar
caso por caso en el inventario antes de asumir que hace falta añadir el
atributo desde cero).

## Paso 6 — UI del selector de "tipo de relleno"

En `renderPaletteSection`, cada fila de serie gana un selector
sólido/degradado/patrón antes del control de color (que cambia de forma
según la opción elegida: un color para sólido, 2-3 para degradado + ángulo,
2 colores + ángulo + grosor para patrón). El aviso de choque/contraste
(`checkAgainstPalette`, línea 462) sigue aplicando sobre el color dominante
de la serie (el sólido, o el primer color del degradado/patrón) — no
desactivarlo para las series con relleno no sólido, simplemente calcularlo
sobre el color representativo.

## Alcance de este prompt

1. Paso 1 (catálogo de paletas) — bajo riesgo, aditivo puro.
2. Paso 2 (opacidad) — cuidado con la migración de formato de
   `store.__palette`.
3. Pasos 3-4 (degradado/patrón) — el más grande, un commit por tipo de
   relleno, empezando por degradado (más simple de implementar y de
   entender para el usuario).
4. Paso 5 (borde) — puede ir en paralelo con 3-4 si da tiempo.
5. Paso 6 (UI unificada) al final, una vez las piezas de datos existen.

Aplicar primero a 2-3 gráficos representativos (barras apiladas de
`taxaBarplot.js`, cajas de `groupBoxplot.js`, Venn de `venn.js`) y
verificar que el patrón generaliza antes de tocar el resto — no repetir el
mismo trabajo 28 veces sin validar el diseño primero.

## Criterio de aceptación

- Las 42 paletas de `palettes_validated.json` son seleccionables desde el
  editor, agrupadas por tipo, sin romper la paleta por defecto existente.
- Cambiar la opacidad de una serie no pierde el color al recargar la página
  (persistencia correcta en `localStorage`, con migración de estilos
  guardados en formato antiguo).
- Un degradado y un patrón aplicados a una serie sobreviven a la
  exportación SVG/PNG (verificar abriendo el archivo exportado, no solo en
  pantalla).
- El borde de una serie es editable independientemente de su relleno en al
  menos las 3 gráficas piloto.
- `node tests/run.mjs` en verde.
