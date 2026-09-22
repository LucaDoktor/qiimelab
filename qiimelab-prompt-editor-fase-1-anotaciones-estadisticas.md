# Prompt Fase 1: anotaciones estadísticas — asteriscos ⇄ p-valor, corchetes por pares

> Continúa la Fase 0 (`qiimelab-prompt-editor-fase-0-fundamentos.md`) —
> **requiere que `js/lib/pairwiseStats.js` y el formateador de p ya existan y
> tengan tests en verde**. Contexto completo:
> `Claude outputs/estudio-editor-graficas-nivel-biorender.md` (sección 4.3) y
> `Claude outputs/inventario-editor-graficas.md` (secciones de alfa,
> recuentos, funcional, diferencial-boxplot, correlograma). Verificar con
> grep que los números de línea de abajo siguen vigentes antes de empezar.

## Lo que pide el usuario

Textualmente: "cambiar asteriscos por p valor" — para **todas y cada una**
de las gráficas que hoy muestran significación estadística. Hoy eso es: un
corchete único de Kruskal-Wallis omnibus en `js/lib/groupBoxplot.js` (usado
por alfa, recuentos-vista-jitter no, funcional, y diferencial-boxplot),
letras compactas de LSD de Fisher en `js/modules/microbialCounts.js`, y
estrellas de correlación en `js/modules/correlogram.js`. En ningún sitio hay
comparaciones **por pares** con corchete — eso también hay que añadirlo,
no solo reformatear lo que ya existe.

## Paso 1 — extraer el corchete de significación a una función compartida

`js/lib/groupBoxplot.js` duplica literalmente el bloque de dibujo del
corchete en `drawGroupBoxplot` (líneas 134-149) y `drawGroupStripPlot`
(líneas 285-299) — casi carácter por carácter. Antes de tocar el
comportamiento, extraer una función `drawSignificanceBrackets(svg, {pairs,
xPositions, yTop, style})` (nuevo, en el mismo archivo o en
`js/lib/pairwiseStats.js` si se prefiere mantener el dibujo cerca del
cálculo) que:

- Acepta una lista de pares `{i, j, p, label}` en vez de un único `kw.p`.
- Dibuja un corchete por par, apilando verticalmente los que se solapan en
  X (mismo `step.increase`/espaciado que `add_pvalue` de ggprism — ver
  estudio sección 1.4 para el catálogo completo de opciones a igualar).
- Usa el formateador de p de la Fase 0 (`'stars'|'exact'|'stars+exact'`,
  estilo GP/APA/NEJM) en vez del `stars = kw.p<0.001?...` hardcodeado.

Sustituir las dos copias por llamadas a esta función. Con **un** par
(el caso omnibus de hoy con 2 grupos) el resultado visual debe ser idéntico
al actual salvo por el nuevo control de formato — es un refactor, no un
cambio de comportamiento por defecto.

## Paso 2 — calcular los pares reales

Cuando hay ≥3 grupos, `kruskalWallis` (omnibus) ya no basta para saber QUÉ
par difiere. En `drawGroupBoxplot`/`drawGroupStripPlot`, además del KW
omnibus ya calculado (línea 52-54), cuando `kwSig` (o siempre, configurable)
calcular todos los pares con `dunnTest` (Fase 0) + `pAdjust` (Holm o BH por
defecto — exponer el método como opción, no fijarlo), y pasar el resultado a
`drawSignificanceBrackets`. Con exactamente 2 grupos, usar `mannWhitneyU`
directo (no Dunn, que es para post-hoc de ≥3) — más simple y es lo que un
usuario esperaría ver coincidir con un t-test/Mann-Whitney hecho a mano en R.

Aplica automáticamente a: `#/alfa` (boxplot y jitter), `#/funcional`,
`#/diferencial` vista cajas y bigotes — los tres consumen
`drawGroupBoxplot`/`drawGroupStripPlot`, así que este cambio los cubre a la
vez sin tocar esos tres módulos más que para pasar la nueva opción si hace
falta.

## Paso 3 — panel de control en el editor

Nueva sección en el panel de `attachChartEditor` (junto a
`renderPaletteSection`, o una nueva `renderStatsSection` — decidir según lo
que quede más consistente con el resto del panel), visible solo cuando el
gráfico tiene `data-ce="sig"` o el nuevo hook equivalente para corchetes
múltiples:

- Selector de modo: asteriscos / p exacto / asteriscos+p.
- Selector de estilo cuando el modo incluye p exacto: GraphPad / APA / NEJM
  / personalizado (nº de decimales).
- Umbral de significación a mostrar (ocultar pares con p > umbral, por
  defecto 0.05 — igual que el "hide ns" de Prism/ggprism).
- Selector de método de comparación cuando hay ≥3 grupos: Dunn (por
  defecto, coherente con el KW ya usado en toda la app) — dejar la puerta
  abierta a Tukey si se implementó en la Fase 0, pero no bloquear esta fase
  por eso.
- Método de ajuste de p (Holm por defecto, BH/Bonferroni/Hochberg/BY como
  alternativas).

Persistir en `store.__stats` (mismo objeto `store` de siempre,
`localStorage['smart-175.chartStyle.' + key]`).

## Paso 4 — `js/modules/microbialCounts.js`: letras ⇄ corchetes ⇄ p

Hoy usa `fisherLSD` + `compactLetterDisplay` (línea 549) y dibuja las letras
como `<text>` suelto (línea 780, sin `data-ce` — si la Fase 0 Paso 4 ya le
dio clase de rol, partir de ahí). Añadir un control (misma sección del
panel que el Paso 3) para alternar entre:

- Letras compactas (comportamiento actual, sin cambios por defecto).
- Corchetes por pares con `drawSignificanceBrackets` (Paso 1), reutilizando
  el `fisherLSD.pairwise` que **ya se calcula** — no hay que añadir ningún
  test nuevo aquí, solo un renderizado alternativo del mismo dato.

## Paso 5 — `js/modules/correlogram.js`: anotación de celda configurable

`stars(p)` (línea 103) y el valor `r` ya se calculan; hoy se dibujan como
`<text>` fijo (r + estrellas siempre juntos, sin opción). Añadir el mismo
selector de modo del Paso 3 (asteriscos/p exacto/ambos) aplicado por celda
en vez de a un corchete — reutilizar el formateador de p de la Fase 0, no
reimplementar el mapeo de umbrales a asteriscos que ya existe en `stars()`
(puede que `stars()` deba delegar en el formateador nuevo para no tener dos
implementaciones del mismo umbral).

## Paso 6 — volcano y lollipop de `differentialAbundance.js`/`inference.js`

Estos no usan corchetes (la significación ya está codificada como color
`--enriched`/`--depleted` + opacidad), pero si se quiere ofrecer p exacto en
el tooltip/etiqueta de punto en vez de solo el color, es una aplicación
directa del formateador de p de la Fase 0 sobre el valor `padj` que ya
existe en los datos — bajo coste, opcional si el tiempo de esta fase no
llega, documentar como pendiente si se deja fuera.

## Alcance de este prompt

Orden sugerido por impacto/coste:

1. Extraer `drawSignificanceBrackets` (Paso 1) — refactor puro, sin cambio
   visible, con test de regresión (el corchete con 1 par debe verse igual
   que antes).
2. Cálculo de pares reales + panel de control (Pasos 2-3) en
   `groupBoxplot.js` — beneficia a 3 módulos de golpe.
3. `microbialCounts.js` (Paso 4).
4. `correlogram.js` (Paso 5).
5. Volcano/lollipop (Paso 6) si queda tiempo.

## Criterio de aceptación

- Con 2 grupos en `#/alfa`, el modo "p exacto" muestra el mismo valor (hasta
  redondeo) que un `wilcox.test(x, y)` en R sobre el mismo dataset de
  ejemplo — verificar al menos un caso a mano.
- Con ≥3 grupos, aparecen múltiples corchetes (no solo el omnibus), apilados
  sin solaparse, con el método de ajuste seleccionado aplicado.
- Cambiar el estilo de formato de p (GP/APA/NEJM) cambia el texto mostrado
  sin recalcular nada (es solo formato, no estadística nueva).
- `microbialCounts.js` puede alternar letras ⇄ corchetes sin perder el
  cálculo de `fisherLSD` ya existente.
- `correlogram.js` puede mostrar r solo, estrellas solas, p exacto, o
  combinaciones, celda por celda.
- `node tests/run.mjs` en verde, incluyendo los nuevos tests de
  `pairwiseStats.js` de la Fase 0.
- Exportar una gráfica con corchetes por pares (SVG/PNG) y confirmar que las
  anotaciones se ven correctamente en el archivo exportado, no solo en pantalla.
