# Prompt Fase 5: controles específicos por tipo de gráfico

> Continúa las Fases 0-4 — usa el motor de variables CSS, la capa de
> anotaciones y `getFigureOptions` ya construidos. Contexto:
> `Claude outputs/estudio-editor-graficas-nivel-biorender.md` y
> `Claude outputs/inventario-editor-graficas.md` (secciones de árbol, Sanger,
> control de calidad, Venn/UpSet, aluvial/sunburst, volcano/lollipop).

## Por qué esta fase va después de las 0-4

Los controles de esta fase (P scatter/ordenación, T árbol, B barras
apiladas/alluvial/sunburst, V volcano/lollipop, C cromatograma) son
específicos de un tipo de gráfico y no comparten componente entre sí como sí
lo hacían las anotaciones (Fase 1) o los heatmaps (Fase 3) — por eso van al
final, una vez la infraestructura común está asentada y el patrón de
implementación (motor CSS + `getFigureOptions` + panel de sección nueva) ya
está validado en 2-3 sitios.

## 5.1 — Control de calidad de secuencias (`#/qc`, `js/modules/sequenceQC.js`)

**El de mayor relación esfuerzo/beneficio de toda la lista**: las 3
funciones de dibujo (`drawPerPosQuality` línea 193, `drawLines` línea 252,
`drawBars` línea 288) ya usan `svgEl` y las clases de rol compartidas
(confirmado por grep: `ql-gridline`, `ql-tick-label`, `ql-axis-label`) pero
**ninguna llama a `attachChartEditor`** — es la única deuda real, no hay que
tocar el dibujo. Envolver las 3 con `attachChartEditor({key: 'qc-...', svg,
mount, elements: [...], onReset: () => paint()})` siguiendo exactamente el
patrón de cualquier otro módulo ya auditado (p. ej. `functional.js` como
plantilla mínima). Una vez enganchado, estas 3 vistas heredan gratis todo lo
de las Fases 0, 2 (relleno/paletas) y 4 (ejes/rejilla) sin trabajo adicional
— solo falta darles `elements` (title/xtitle/ytitle) y, si se quiere ir más
lejos, exponer como anotación A5 la línea de umbral Q20/Q30 (el patrón de
banda de fondo con `opacity: 0.08` que `drawPerPosQuality` ya dibuja es
la base perfecta para una banda configurable).

## 5.2 — Árbol filogenético (`#/arbol`, `js/modules/phylo.js`)

Clases dedicadas ya existentes: `ql-phylo-leafdot` (`fill: var(--accent)`)
y `ql-phylo-leaflabel` (línea ~229/401). Extender el motor de variables CSS
de la Fase 0 con variables propias del árbol (`--fig-phylo-leafdot-color`,
`--fig-phylo-branch-color`, `--fig-phylo-branch-width`) en vez de reusar las
genéricas de eje — una hoja de árbol no es un tick. Controles **T**:

- Grosor/color de rama — primero confirmar si las líneas de rama tienen
  clase de rol hoy (auditoría previa no lo confirmó con certeza, verificar
  con grep en `phylo.js` antes de asumir) y añadirla si falta.
- Colores de clado por categoría — la lógica de `matchedCategories`/leyenda
  condicional (línea 910) ya existe; falta exponer una paleta editable
  sobre esos grupos, reutilizando `renderPaletteSection` con
  `paletteSeries` construido a partir de `matchedCategories`.
- Barra de escala (longitud de rama de referencia) — nuevo elemento si no
  existe, con `data-ce="scalebar"`.
- Valores de soporte (bootstrap) con umbral de resaltado — si el dato de
  soporte ya está disponible en la estructura del árbol (verificar en
  `js/lib/neighborJoining.js`/`phyloAlign.js`), añadir como anotación
  opcional junto a cada nodo interno, con un umbral configurable que
  resalta (color/negrita) los valores por debajo de X.
- Cursiva automática para nombre de especie en `leaflabel` — hoy
  `font-weight:500` fijo sin cursiva; el toggle bold/italic del panel ya
  existe para elementos genéricos (`bB`/`bI` en `openPanel`, línea
  818-828) pero aplicado a todo el `data-ce`, no a una subcadena — si la
  etiqueta de hoja es solo el nombre de especie, aplicar cursiva al
  elemento entero basta; si incluye más texto (p. ej. un ID de muestra
  además del nombre), hace falta separar en dos `<tspan>` y solo poner
  cursiva al que corresponde al nombre científico.

## 5.3 — Cromatograma Sanger (`#/sanger`, `js/modules/sanger.js`)

`elements: []` hoy (línea 2269) — primer paso trivial: añadir
title/xtitle/ytitle si tiene sentido en un cromatograma (puede que el eje X
de posición de base no necesite título editable, valorar). `paletteSeries`
ya mapea A/C/G/T como series recoloreables (`paletteType: 'categorical'`,
`paletteMax: 4`) — el color por base ya es editable, verificar solamente
que los 4 colores por defecto de la app sean razonablemente distinguibles
en daltonismo (pasar los 4 hex actuales por
`js/lib/paletteValidator.js:checkAgainstPalette` o equivalente) y, si no lo
son, ofrecer como preset alternativo una paleta explícitamente validada sin
forzar el cambio por defecto (la convención A=verde/C=azul/G=negro/T=rojo es
muy reconocible para quien ya sabe leer cromatogramas — no romperla sin
avisar). Controles **C** adicionales: grosor de traza (línea que dibuja cada
curva A/C/G/T), banda de calidad Phred superpuesta con umbral configurable
(mismo patrón que sequenceQC 5.1, si el dato de calidad por posición está
disponible en este módulo).

## 5.4 — Venn/UpSet (`#/venn`, `js/modules/venn.js`)

- Opacidad de relleno por conjunto — hoy fija a 0.22 para las 4 áreas
  (verificado); aplicar el control de opacidad de la Fase 2 aquí en vez de
  reimplementarlo.
- Forma círculo vs elipse — hoy determinada automáticamente por el nº de
  grupos (2-3 círculos, 4 elipses según la sonda); exponer como opción
  explícita si tiene sentido (con 4 grupos, un usuario podría preferir
  ver el rectángulo Venn en vez de elipses, y esa variante ya existe en el
  código — solo falta el selector).
- UpSet (barras + matriz de puntos): auditoría dedicada pendiente — no se
  cubrió en detalle en la sesión de investigación previa; antes de diseñar
  controles, confirmar con grep/lectura si comparte `attachChartEditor` y
  qué estructura SVG tiene (probablemente distinta a la de círculos/elipses).

## 5.5 — Aluvial (×2, `taxaBarplot.js` y `inference.js`) y sunburst

Si la Fase 0 decidió migrar el aluvial de `taxaBarplot.js` de
`openChartEditor` a `attachChartEditor`, esta es la fase donde se
implementa el degradado origen→destino por flujo (**S2** aplicado a `B`):
un `<linearGradient>` por combinación única origen-destino (no uno por
flujo individual si hay cientos — agrupar por par de categorías, reutilizar
gradientes idénticos) usando el mecanismo de `<defs>` ya construido en la
Fase 2. Unificar los dos aluviales (`js/lib/alluvial.js` es compartido,
confirmar si el dibujo también podría compartirse entre `taxaBarplot.js` e
`inference.js` en vez de mantener dos implementaciones paralelas de
controles). Sunburst (`taxaBarplot.js` línea 1694): radios de anillo,
separación entre segmentos, bordes — menor prioridad si el tiempo aprieta.

## 5.6 — Volcano y lollipop (`differentialAbundance.js`, `inference.js`)

- Etiquetar los top-N puntos por nombre (volcano) — nuevo, hoy sin
  etiquetas de punto individuales; cuidado con el solapamiento de texto en
  puntos densos (considerar un algoritmo simple de separación o limitar a
  top-N pequeño, p. ej. 10-15, para no necesitar un layout de evitación de
  colisión complejo).
- Tamaño de punto por variable (p. ej. abundancia media) — mapeo lineal o
  por raíz cuadrada (para que el área, no el radio, sea proporcional —
  convención estándar en gráficos de burbuja) configurable.
- Grosor de línea de "palillo" en ambos lollipop — dar clase de rol
  primero si no la tienen (confirmado sin rol en la auditoría de
  `differentialAbundance.js` lollipop).

## Alcance de este prompt

Priorizar por esfuerzo/beneficio, no por orden de aparición:

1. 5.1 (control de calidad) — el más barato, sin tocar dibujo existente.
2. 5.4 (Venn opacidad/forma) — bajo esfuerzo, reutiliza controles ya
   construidos en fases anteriores.
3. 5.2 (árbol) y 5.3 (Sanger) — esfuerzo medio, cada uno un commit
   independiente.
4. 5.6 (volcano/lollipop etiquetas) — esfuerzo medio-alto por el problema
   de solapamiento de texto.
5. 5.5 (aluvial/sunburst) — el más grande, depende de la decisión de la
   Fase 0 sobre `openChartEditor`; si esa decisión no se tomó, tomarla
   ahora antes de continuar.

## Criterio de aceptación

- `#/qc` tiene editor funcional en sus 3 vistas (mínimo: título/ejes
  editables, exportación SVG/PNG limpia heredada de la Fase 0).
- Árbol: al menos grosor/color de rama y colores de clado son editables.
- Sanger: `elements` no vacío; color por base confirmado o corregido para
  daltonismo.
- Venn: opacidad configurable por conjunto, forma círculo/elipse
  seleccionable donde aplique.
- Al menos un aluvial usa degradado origen→destino en sus flujos, exportado
  correctamente.
- `node tests/run.mjs` en verde.
