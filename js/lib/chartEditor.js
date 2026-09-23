// chartEditor.js — motor de personalización de figuras, compartido por los
// módulos de gráficos.
//
// Qué hace:
//  - Modo "Personalizar" (botón). Con él apagado no interfiere en nada.
//  - Arrastra con el ratón SOLO elementos de texto/anotación (título de la
//    figura, títulos de eje, bloque de leyenda). Los marcadores de datos
//    (puntos, barras, líneas) NO se mueven nunca.
//  - Panel flotante por elemento: color de texto, familia de fuente (las 3
//    ya cargadas + genéricas del sistema), negrita/cursiva, tamaño.
//  - Persistencia en localStorage por módulo (smart-175.chartStyle.<key>),
//    re-aplicada al recargar. Botón "Restablecer".
//  - Sección "Estilo de la figura": motor de variables CSS de rol (--fig-*,
//    ver css/components.css) para rejilla/eje/marcas/título de eje/fuente.
//    Solo variables CSS con fallback al tema actual — no repinta nada, así
//    que a diferencia de la paleta o la geometría no hace falta cfg por
//    módulo: aparece en las ~28 vistas en cuanto usan las clases de rol
//    (.ql-gridline/.ql-baseline-line/.ql-tick-label/.ql-axis-label).
//  - "Descargar SVG/PNG/TIFF" (attachChartEditor): pasan por
//    js/lib/figureExport.js (Paso 3 de qiimelab-prompt-editor-fase-0-
//    fundamentos.md) — resuelven SIEMPRE en esquema claro (legible con
//    independencia del tema activo) y sin var()/color() residual (el bug de
//    color-mix() en mapas de calor/degradados). PNG/TIFF llevan dpi real
//    embebido (300 por defecto). `openChartEditor` (legacy, ver más abajo)
//    sigue con el pipeline antiguo (serializeSvg/exportSvg/exportPng): no
//    se le ha portado el arreglo por no ganar casos de uso nuevos.
//
//  - "Descargar SVG" (openChartEditor, legacy): exporta la figura tal cual
//    se ve, con los estilos inline resueltos (sin depender de la hoja de
//    estilos de la app).
//
//  - Paleta de color para las SERIES de datos (no solo el texto): botones de
//    paleta completa (categórica/secuencial/divergente) + una fila por serie
//    con swatch nativo + campo de texto #RRGGBB, con aviso suave (no
//    bloqueante) si el color chocaría con otro de la misma figura. Dos
//    mecanismos según el tipo de gráfico (ver cfg.paletteSeries más abajo):
//    directo por atributo `data-ce-series-fill/-stroke="<id>"` en los nodos
//    ya dibujados (sin repintar — la mayoría de gráficos: barras, cajas,
//    puntos, dímeros…), o lectura de `getPaletteOverrides(key)` ANTES de
//    calcular colores, para las figuras con degradado continuo (mapas de
//    calor, matriz de correlación) que sí necesitan repintar al cambiar.
//
// Sin dependencias, sin build step. No toca datos ni escalas.
//
// DECISIÓN DE ARQUITECTURA (22 sep 2026, ver Claude outputs/estudio-editor-
// graficas-nivel-biorender.md sección 2 y qiimelab-prompt-editor-fase-0-
// fundamentos.md Paso 1): este archivo tenía dos vías de edición no
// unificadas. `attachChartEditor` (abajo) es ahora la ÚNICA vía — la usan
// las ~28 vistas de gráfico de la app. `openChartEditor` (modal aparte con
// pestañas geometría/tipografía/colores, más abajo en el archivo) queda
// documentado como LEGACY: se retiró su único uso (el diagrama aluvial de
// taxaBarplot.js) en favor de `attachChartEditor` + `cfg.geometrySliders`
// (nueva sección "Geometría" del panel, mismo patrón que la paleta y los
// títulos). No se ha borrado el código de `openChartEditor` todavía —
// queda como referencia/red de seguridad un tiempo — pero no debe ganar
// ningún caso de uso nuevo; cualquier control nuevo va en `attachChartEditor`.

import {
  paletteColorAt, palettesForType, resolvePaletteColors,
  paletteColorsOf, evenlySampleColors, PALETTE_TYPE_FAMILY,
} from './palettes.js';
import {
  normalizeSeriesStyle, representativeColor, defaultGradient, defaultPattern,
  gradientLineFromAngle, patternTileSpec, defId, defIdPrefix,
} from './paletteStyle.js';
import { checkAgainstPalette, isValidHex } from './paletteValidator.js';
import { openPanel as openModalPanel } from './modal.js';
import { escapeHtml } from './dom.js';
import { serializeForExport, exportFigure } from './figureExport.js';

const NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'ce-styles';
const CHARTSTYLE_PREFIX = 'smart-175.chartStyle.';
const LEGACY_CHARTSTYLE_PREFIX = 'qiimelab.chartStyle.';

function readChartStyleRaw(key) {
  try {
    const raw = localStorage.getItem(CHARTSTYLE_PREFIX + key) || localStorage.getItem(LEGACY_CHARTSTYLE_PREFIX + key);
    return JSON.parse(raw) || {};
  }
  catch (e) { return {}; }
}

/** Los overrides de paleta persistidos para `key` — { seriesId: '#hex' }.
 *  Función pura, sin DOM: para que los módulos con degradado continuo
 *  (mapas de calor, matriz de correlación) puedan leerla ANTES de calcular
 *  sus colores, sin esperar a que exista el <svg>. */
export function getPaletteOverrides(key) {
  return readChartStyleRaw(key).__palette || {};
}

/** Las opciones estructurales (Fase 4: eje G4, rejilla menor G5, leyenda
 *  G6, lienzo G3 — qiimelab-prompt-editor-fase-4-ejes-rejilla-leyenda-
 *  lienzo.md Paso 1) persistidas para `key` —
 *  `{ axisMin?, axisMax?, axisLog?, tickFormat?, categoryOrder?, gridMinor?,
 *  legendSwatchSize?, marginExtra?: {top,right,bottom,left} }`. Función
 *  pura, sin DOM: el módulo la lee al principio del pintado (mismo punto
 *  donde ya lee `groupData`/`series`) y ajusta la geometría ANTES de
 *  dibujar — mismo patrón que getPaletteOverrides/getColorScaleOptions.
 *  Ralo: valores ausentes = sin personalizar, el valor por defecto lo
 *  decide quien llama, no esta función. */
export function getFigureOptions(key) {
  return readChartStyleRaw(key).__structure || {};
}

/** Los valores de geometría persistidos para `key` — { sliderId: number }.
 *  Función pura, sin DOM: para que un módulo pueda leer (p. ej. el ancho de
 *  nodo o la opacidad de flujo elegidos por el usuario) ANTES de calcular su
 *  layout inicial, igual que `getPaletteOverrides` para el color. */
export function getFigureGeometry(key) {
  return readChartStyleRaw(key).__geometry || {};
}

/** Los valores del motor de variables CSS de rol (rejilla, eje, marcas,
 *  título de eje, fuente — ver Paso 2 de qiimelab-prompt-editor-fase-0-
 *  fundamentos.md) persistidos para `key` — { varId: valor }. Función pura,
 *  sin DOM: mismo patrón que getPaletteOverrides/getFigureGeometry, aunque
 *  hoy ningún módulo necesita leerla antes del primer pintado (los `--fig-*`
 *  se aplican vía `svg.style.setProperty`, no afectan al cálculo del layout). */
export function getFigureStyle(key) {
  return readChartStyleRaw(key).__figureStyle || {};
}

/** Las opciones de anotación estadística (modo asteriscos/p-exacto, estilo
 *  Prism, umbral de significación, método de ajuste de p) persistidas para
 *  `key` — ver Paso 3 de qiimelab-prompt-editor-fase-1-anotaciones-
 *  estadisticas.md. Función pura, sin DOM: el módulo la lee ANTES de
 *  calcular los pares significativos (mannWhitneyU/dunnTest dependen de
 *  qué método de ajuste y umbral haya elegido el usuario), igual que
 *  getFigureGeometry/getPaletteOverrides. Valores ausentes = sin
 *  personalizar; los valores por defecto los decide quien llama (aquí no,
 *  para no bifurcar la fuente de verdad de "cuál es el valor por defecto"). */
export function getStatsOptions(key) {
  return readChartStyleRaw(key).__stats || {};
}

/** Las opciones de escala de color continua (paleta, dominio, punto medio,
 *  pasos discretos, invertir) persistidas para `key` — Paso 3 de
 *  qiimelab-prompt-editor-fase-3-heatmaps-escalas-continuas.md. Función
 *  pura, sin DOM: los 3 consumidores (betaDiversity/correlogram/
 *  differentialAbundance heatmap) la leen ANTES de construir su
 *  `makeColorScale()` (js/lib/colorScale.js), mismo patrón que
 *  getStatsOptions/getPaletteOverrides. Ralo: solo trae las claves que el
 *  usuario tocó; los valores por defecto (paleta de la app, dominio real de
 *  los datos, punto medio 0) los decide cada módulo, no aquí. */
export function getColorScaleOptions(key) {
  return readChartStyleRaw(key).__colorScale || {};
}

// ---- Presets (Fase 6, Paso 1 y 3 de qiimelab-prompt-editor-fase-6-
// presets-style-match-export-revista.md): un preset es "una foto del
// store" -- el mismo objeto que ya se guarda en
// localStorage['smart-175.chartStyle.'+key], más name/seriesOrder. Se
// guardan en una clave APARTE, compartida entre TODAS las gráficas (no
// por `key`), porque un preset debe poder aplicarse a cualquier gráfico. */
const PRESETS_LSKEY = 'smart-175.chartPresets';

/** Función pura, sin DOM -- mismo patrón que getPaletteOverrides/etc. */
export function readPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_LSKEY)) || {}; }
  catch (e) { return {}; }
}
function writePresets(all) {
  try {
    if (Object.keys(all).length) localStorage.setItem(PRESETS_LSKEY, JSON.stringify(all));
    else localStorage.removeItem(PRESETS_LSKEY);
  } catch (e) { /* modo privado */ }
}

const PT_TO_PX = 96 / 72; // 1pt = 4/3 px a 96dpi -- la tabla de la revista viene en pt, el motor --fig-* en px
const pt = (n) => Math.round(n * PT_TO_PX * 100) / 100;

/** Presets de revista (Paso 3): NO editables por el usuario -- reaplicar
 *  siempre vuelve a la especificación oficial exacta, así que no hace
 *  falta un "restablecer" aparte. Valores tomados de la tabla de
 *  `Claude outputs/estudio-editor-graficas-nivel-biorender.md` sección
 *  1.5 (rangos de la revista; se elige un valor concreto dentro de cada
 *  rango, documentado aquí en pt antes de convertir a px):
 *   - Nature: texto de cuerpo 7pt (rango 5-7), título de panel 8pt
 *     negrita, línea 0.5pt (rango 0.25-1), fuente Helvetica/Arial.
 *   - Cell: texto de cuerpo 7pt (rango 6-8), línea 1pt (rango 0.5-1.5),
 *     fuente Arial únicamente. */
function journalStyleBlock({ font, bodyPt, titlePt, linePt, widthMm }) {
  return {
    __figureStyle: { font, tickSize: pt(bodyPt), axisTitleSize: pt(bodyPt), gridWidth: pt(linePt), axisWidth: pt(linePt) },
    __export: { widthMm },
    title: { size: pt(titlePt), bold: true, font },
  };
}
export const JOURNAL_PRESETS = {
  nature89: { id: 'nature89', builtin: true, journal: 'nature', widthMm: 89, store: journalStyleBlock({ font: 'Helvetica, Arial, sans-serif', bodyPt: 7, titlePt: 8, linePt: 0.5, widthMm: 89 }) },
  nature183: { id: 'nature183', builtin: true, journal: 'nature', widthMm: 183, store: journalStyleBlock({ font: 'Helvetica, Arial, sans-serif', bodyPt: 7, titlePt: 8, linePt: 0.5, widthMm: 183 }) },
  cell85: { id: 'cell85', builtin: true, journal: 'cell', widthMm: 85, store: journalStyleBlock({ font: 'Arial, sans-serif', bodyPt: 7, titlePt: 8, linePt: 1, widthMm: 85 }) },
  cell114: { id: 'cell114', builtin: true, journal: 'cell', widthMm: 114, store: journalStyleBlock({ font: 'Arial, sans-serif', bodyPt: 7, titlePt: 8, linePt: 1, widthMm: 114 }) },
  cell174: { id: 'cell174', builtin: true, journal: 'cell', widthMm: 174, store: journalStyleBlock({ font: 'Arial, sans-serif', bodyPt: 7, titlePt: 8, linePt: 1, widthMm: 174 }) },
};

const FONTS = [
  ['var(--font-body)', 'Sans (IBM Plex)'],
  ['var(--font-display)', 'Serif (IBM Plex)'],
  ['var(--font-mono)', 'Mono (IBM Plex)'],
  ['system-ui, sans-serif', 'Sistema'],
  ['Georgia, "Times New Roman", serif', 'Serif del sistema'],
  ['ui-monospace, Menlo, monospace', 'Mono del sistema'],
];

// ---- motor de variables CSS de rol (--fig-*) — Paso 2 de
// qiimelab-prompt-editor-fase-0-fundamentos.md. Cada entrada: la variable
// CSS que escribe (con fallback ya puesto en css/components.css), de qué
// nodo de rol lee su valor por defecto (para prellenar el control) y qué
// propiedad computada leer. `kind` decide el tipo de control: 'color',
// 'number' (con min/max/step) o 'dash' (select de trazo).
const FIG_STYLE_VARS = [
  { id: 'gridColor', css: '--fig-grid-color', kind: 'color', role: '.ql-gridline', prop: 'stroke' },
  { id: 'gridWidth', css: '--fig-grid-width', kind: 'number', role: '.ql-gridline', prop: 'strokeWidth', min: 0.5, max: 3, step: 0.25 },
  { id: 'gridDash', css: '--fig-grid-dash', kind: 'dash' },
  { id: 'axisColor', css: '--fig-axis-color', kind: 'color', role: '.ql-baseline-line', prop: 'stroke' },
  { id: 'axisWidth', css: '--fig-axis-width', kind: 'number', role: '.ql-baseline-line', prop: 'strokeWidth', min: 0.5, max: 3, step: 0.25 },
  { id: 'tickColor', css: '--fig-tick-color', kind: 'color', role: '.ql-tick-label', prop: 'fill' },
  { id: 'tickSize', css: '--fig-tick-size', kind: 'number', role: '.ql-tick-label', prop: 'fontSize', min: 8, max: 16, step: 1, unit: 'px' },
  { id: 'axisTitleColor', css: '--fig-axis-title-color', kind: 'color', role: '.ql-axis-label', prop: 'fill' },
  { id: 'axisTitleSize', css: '--fig-axis-title-size', kind: 'number', role: '.ql-axis-label', prop: 'fontSize', min: 9, max: 18, step: 1, unit: 'px' },
  { id: 'font', css: '--fig-font', kind: 'font' },
  // Fase 4 (qiimelab-prompt-editor-fase-4-ejes-rejilla-leyenda-lienzo.md):
  // G5 mostrar/ocultar rejilla, G6 ocultar leyenda, G3 marco/fondo del
  // panel — las 3 son solo variables CSS de rol (nunca repintan), igual
  // que el resto de este motor; el color/grosor de rejilla/eje ya estaba.
  { id: 'gridVisible', css: '--fig-grid-opacity', kind: 'toggle' },
  { id: 'legendVisible', css: '--fig-legend-opacity', kind: 'toggle' },
  { id: 'pointsVisible', css: '--fig-points-opacity', kind: 'toggle' },
  { id: 'panelBorderColor', css: '--fig-panel-border-color', kind: 'color', role: '.ql-panel-border', prop: 'stroke' },
  { id: 'panelBorderWidth', css: '--fig-panel-border-width', kind: 'number', role: '.ql-panel-border', prop: 'strokeWidth', min: 0, max: 4, step: 0.5 },
  { id: 'panelBgColor', css: '--fig-panel-bg-color', kind: 'color', role: '.ql-panel-bg', prop: 'fill' },
];

const I18N = {
  es: { customize: 'Personalizar', done: 'Terminar', reset: 'Restablecer', download: 'Descargar SVG', downloadPng: 'Descargar PNG', downloadTiff: 'Descargar TIFF',
        hint: 'Arrastra los textos (o enfócalos con el tabulador y muévelos con las flechas). Haz clic o pulsa Intro para cambiar su estilo.',
        lead: 'Esta figura es editable:', leadRest: 'cambia textos, colores y posiciones, y descárgala en SVG o PNG.',
        text: 'Texto', color: 'Color', hex: 'Hex', font: 'Fuente', size: 'Tamaño', bold: 'Negrita', italic: 'Cursiva', close: 'Cerrar',
        handle: (name) => name + ', elemento arrastrable: muévelo con las flechas (Mayús = paso mayor), Intro para editar su estilo',
        paletteTitle: 'Paleta de la figura', paletteCategorical: 'Categórica', paletteSequential: 'Secuencial', paletteDivergent: 'Divergente',
        paletteWarnClash: (name) => 'parecido a "' + name + '" para algunos tipos de daltonismo',
        paletteWarnContrast: 'poco contraste sobre el fondo de la figura',
        paletteInvalidHex: 'no es un color hex válido (usa #RRGGBB)',
        paletteAppDefault: 'por defecto', paletteApply: 'Aplicar', paletteChoose: 'Elegir paleta',
        paletteWarnSafeN: (n, max) => n + ' series superan las ' + max + ' que esta paleta distingue con seguridad bajo daltonismo',
        paletteSafeN: (max) => 'Nº de series seguro bajo daltonismo: ' + max,
        paletteOpacity: 'Opacidad',
        paletteFillSolid: 'Sólido', paletteFillGradient: 'Degradado', paletteFillPattern: 'Patrón',
        paletteGradientAngle: 'Ángulo', paletteGradientStop: (n) => 'Parada ' + n,
        paletteAddStop: '+ añadir parada intermedia', paletteRemoveStop: 'Quitar parada intermedia',
        palettePatternKind: 'Tipo', palettePatternDiagonal: 'Rayado diagonal', palettePatternDots: 'Puntos', palettePatternGrid: 'Cuadrícula',
        palettePatternFg: 'Trazo', palettePatternBg: 'Fondo', palettePatternTransparentBg: 'Fondo transparente',
        palettePatternSpacing: 'Separación', palettePatternStroke: 'Grosor', palettePatternAngle: 'Ángulo del rayado',
        paletteBorderTitle: 'Borde independiente', paletteBorderColor: 'Color del borde',
        paletteBorderWidth: 'Grosor', paletteBorderRadius: 'Radio de esquina',
        fullscreen: 'Pantalla completa', fullscreenExit: 'Salir de pantalla completa', fullscreenTitle: 'Editor de la figura — vista ampliada',
        titlesTitle: 'Títulos de la figura', chartTitle: 'Título del Gráfico', xAxisTitle: 'Título Eje X', yAxisTitle: 'Título Eje Y',
        geometryTitle: 'Geometría',
        figureStyleTitle: 'Estilo de la figura', gridLabel: 'Rejilla', axisLabel: 'Eje', tickLabel: 'Marcas de eje', axisTitleLabel: 'Título de eje',
        gridVisibleLabel: 'Mostrar rejilla', legendVisibleLabel: 'Mostrar leyenda', pointsVisibleLabel: 'Mostrar puntos individuales',
        panelBorderLabel: 'Marco del panel', panelBgLabel: 'Fondo del panel', legendPosition: 'Posición',
        dashLabel: 'Trazo', dashSolid: 'Sólida', dashDotted: 'Punteada', dashDashed: 'Discontinua',
        statsTitle: 'Significación estadística', statsMode: 'Mostrar', statsModeStars: 'Solo asteriscos',
        statsModeExact: 'Solo p exacto', statsModeBoth: 'Asteriscos + p', statsStyle: 'Estilo',
        statsThreshold: 'Umbral de significación', statsMethod: 'Ajuste de p (varias comparaciones)',
        statsTestLabel: 'Test a usar', statsTestAuto: 'Automático (recomendado)',
        statsTestStudent: 't-test de Student', statsTestWelch: 't-test de Welch', statsTestMW: 'Mann-Whitney U',
        statsTestAnovaTukey: 'ANOVA + Tukey HSD', statsTestWelchGH: 'ANOVA de Welch + Games-Howell', statsTestKruskalDunn: 'Kruskal-Wallis + Dunn',
        colorScaleTitle: 'Escala de color', csPalette: 'Paleta', csDomain: 'Dominio (mín–máx)',
        csDomainMin: 'Mínimo del dominio', csDomainMax: 'Máximo del dominio', csResetDomain: 'Restablecer',
        csMidpoint: 'Punto medio', csSteps: 'Nº de pasos (0 = continuo)', csInvert: 'Invertir escala',
        csShowValue: 'Valor en celda', csCellBorder: 'Borde de celda',
        structureTitle: 'Estructura', axisDomain: 'Rango del eje', axisLog: 'Escala logarítmica',
        categoryOrderLabel: 'Orden de categorías', orderOriginal: 'Original', orderAlphaAsc: 'Alfabético A-Z',
        orderAlphaDesc: 'Alfabético Z-A', orderValueAsc: 'Por valor (ascendente)', orderValueDesc: 'Por valor (descendente)',
        gridMinorLabel: 'Rejilla menor', marginsLabel: 'Márgenes (±px)',
        marginSide: (side) => ({ top: 'Margen superior', right: 'Margen derecho', bottom: 'Margen inferior', left: 'Margen izquierdo' }[side] || side),
        presetsTitle: 'Presets', presetSaveLabel: 'Guardar el estilo actual como preset',
        presetNamePlaceholder: 'Nombre del preset', presetSaveBtn: 'Guardar', presetApplyBtn: 'Aplicar',
        presetDeleteBtn: 'Borrar', presetNone: 'Sin presets guardados todavía',
        presetJournalTitle: 'Presets de revista', presetJournalHelp: 'Fuente/tamaño/grosor/ancho según la especificación oficial — aplicar reemplaza el estilo actual.',
        presetNatureLabel: (mm) => 'Nature (' + mm + ' mm)', presetCellLabel: (mm) => 'Cell (' + mm + ' mm)',
        exportWidthLabel: 'Ancho de exportación (mm)', exportWidthHelp: 'Vacío = tamaño natural en píxeles.' },
  en: { customize: 'Customise', done: 'Done', reset: 'Reset', download: 'Download SVG', downloadPng: 'Download PNG', downloadTiff: 'Download TIFF',
        hint: 'Drag the labels (or focus them with Tab and move them with the arrow keys). Click or press Enter to change the style.',
        lead: 'This figure is editable:', leadRest: 'change text, colours and positions, then download it as SVG or PNG.',
        text: 'Text', color: 'Colour', hex: 'Hex', font: 'Font', size: 'Size', bold: 'Bold', italic: 'Italic', close: 'Close',
        handle: (name) => name + ', draggable element: move it with the arrow keys (Shift = larger step), Enter to edit its style',
        paletteTitle: 'Figure palette', paletteCategorical: 'Categorical', paletteSequential: 'Sequential', paletteDivergent: 'Divergent',
        paletteWarnClash: (name) => 'similar to "' + name + '" for some kinds of colour blindness',
        paletteWarnContrast: 'low contrast against the figure background',
        paletteInvalidHex: 'not a valid hex colour (use #RRGGBB)',
        paletteAppDefault: 'default', paletteApply: 'Apply', paletteChoose: 'Choose palette',
        paletteWarnSafeN: (n, max) => n + ' series exceed the ' + max + ' this palette safely tells apart under colour blindness',
        paletteSafeN: (max) => 'Series safe under colour blindness: ' + max,
        paletteOpacity: 'Opacity',
        paletteFillSolid: 'Solid', paletteFillGradient: 'Gradient', paletteFillPattern: 'Pattern',
        paletteGradientAngle: 'Angle', paletteGradientStop: (n) => 'Stop ' + n,
        paletteAddStop: '+ add middle stop', paletteRemoveStop: 'Remove middle stop',
        palettePatternKind: 'Type', palettePatternDiagonal: 'Diagonal hatch', palettePatternDots: 'Dots', palettePatternGrid: 'Grid',
        palettePatternFg: 'Stroke', palettePatternBg: 'Background', palettePatternTransparentBg: 'Transparent background',
        palettePatternSpacing: 'Spacing', palettePatternStroke: 'Thickness', palettePatternAngle: 'Hatch angle',
        paletteBorderTitle: 'Independent border', paletteBorderColor: 'Border colour',
        paletteBorderWidth: 'Thickness', paletteBorderRadius: 'Corner radius',
        fullscreen: 'Full screen', fullscreenExit: 'Exit full screen', fullscreenTitle: 'Figure editor — enlarged view',
        titlesTitle: 'Figure titles', chartTitle: 'Chart Title', xAxisTitle: 'X Axis Title', yAxisTitle: 'Y Axis Title',
        geometryTitle: 'Geometry',
        figureStyleTitle: 'Figure style', gridLabel: 'Gridlines', axisLabel: 'Axis', tickLabel: 'Tick labels', axisTitleLabel: 'Axis titles',
        gridVisibleLabel: 'Show gridlines', legendVisibleLabel: 'Show legend', pointsVisibleLabel: 'Show individual points',
        panelBorderLabel: 'Panel border', panelBgLabel: 'Panel background', legendPosition: 'Position',
        dashLabel: 'Dash', dashSolid: 'Solid', dashDotted: 'Dotted', dashDashed: 'Dashed',
        statsTitle: 'Statistical significance', statsMode: 'Show', statsModeStars: 'Stars only',
        statsModeExact: 'Exact p only', statsModeBoth: 'Stars + p', statsStyle: 'Style',
        statsThreshold: 'Significance threshold', statsMethod: 'p adjustment (multiple comparisons)',
        statsTestLabel: 'Test to use', statsTestAuto: 'Automatic (recommended)',
        statsTestStudent: 'Student’s t-test', statsTestWelch: 'Welch’s t-test', statsTestMW: 'Mann-Whitney U',
        statsTestAnovaTukey: 'ANOVA + Tukey HSD', statsTestWelchGH: 'Welch ANOVA + Games-Howell', statsTestKruskalDunn: 'Kruskal-Wallis + Dunn',
        colorScaleTitle: 'Colour scale', csPalette: 'Palette', csDomain: 'Domain (min–max)',
        csDomainMin: 'Domain minimum', csDomainMax: 'Domain maximum', csResetDomain: 'Reset',
        csMidpoint: 'Midpoint', csSteps: 'Number of steps (0 = continuous)', csInvert: 'Invert scale',
        csShowValue: 'Value in cell', csCellBorder: 'Cell border',
        structureTitle: 'Structure', axisDomain: 'Axis range', axisLog: 'Logarithmic scale',
        categoryOrderLabel: 'Category order', orderOriginal: 'Original', orderAlphaAsc: 'Alphabetical A-Z',
        orderAlphaDesc: 'Alphabetical Z-A', orderValueAsc: 'By value (ascending)', orderValueDesc: 'By value (descending)',
        gridMinorLabel: 'Minor gridlines', marginsLabel: 'Margins (±px)',
        marginSide: (side) => ({ top: 'Top margin', right: 'Right margin', bottom: 'Bottom margin', left: 'Left margin' }[side] || side),
        presetsTitle: 'Presets', presetSaveLabel: 'Save the current style as a preset',
        presetNamePlaceholder: 'Preset name', presetSaveBtn: 'Save', presetApplyBtn: 'Apply',
        presetDeleteBtn: 'Delete', presetNone: 'No saved presets yet',
        presetJournalTitle: 'Journal presets', presetJournalHelp: 'Font/size/weight/width per the official spec — applying replaces the current style.',
        presetNatureLabel: (mm) => 'Nature (' + mm + ' mm)', presetCellLabel: (mm) => 'Cell (' + mm + ' mm)',
        exportWidthLabel: 'Export width (mm)', exportWidthHelp: 'Empty = natural pixel size.' },
};
function tr(lang) { return I18N[lang] || I18N.es; }

// iconos propios, mismo estilo que la barra lateral (24×24, trazo 1.7, redondeado)
// aria-hidden/focusable="false": son decorativos, el <span> del botón lleva el texto.
const CE_ICONS = {
  edit: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.4 3.6a2 2 0 0 1 2.9 2.9L7.5 18.3 3.5 19.5l1.2-4Z"/></svg>',
  download: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10m0 0-3.5-3.5M12 14l3.5-3.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>',
  reset: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 8 0 1 1-1.5 4.5"/><path d="M3.5 4.5v4.8h4.8"/></svg>',
  fullscreen: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"/></svg>',
};

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.ce-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:14px; padding-top:14px; border-top:1px solid var(--border-strong); }
.ce-toolbar .ce-lead { font-size:12px; color:var(--ink-2); flex:1 1 100%; margin:0 0 4px; }
.ce-toolbar .ce-lead strong { color:var(--ink); font-weight:600; }
.ce-toolbar .ce-hint { font-size:11.5px; color:var(--ink-muted); flex:1 1 100%; margin:2px 0 0; }
.ce-toolbar button { display:inline-flex; align-items:center; gap:6px; }
.ce-toolbar button svg { flex:none; }
.ce-toolbar .ce-cta { border-color:var(--accent); color:var(--accent); background:var(--accent-soft); }
.ce-toolbar .ce-cta:hover { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 18%, var(--surface)); }
svg.ce-editing { }
svg.ce-editing .ce-el { cursor: move; }
.ce-outline { fill:none; stroke:var(--accent); stroke-width:1; stroke-dasharray:4 3; pointer-events:none; opacity:0; transition:opacity .1s ease; }
svg.ce-editing .ce-el:hover .ce-outline, svg.ce-editing .ce-el.ce-selected .ce-outline { opacity:1; }
svg.ce-editing .ce-el.ce-selected .ce-outline { stroke-width:1.4; stroke-dasharray:none; }
.ce-hit { fill:transparent; pointer-events:none; }
svg.ce-editing .ce-hit { pointer-events:all; cursor:move; }
svg.ce-editing .ce-hit:focus { outline:none; }
svg.ce-editing .ce-hit:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.ce-panel {
  position:fixed; z-index:60; width:230px; background:var(--surface); color:var(--ink);
  border:1px solid var(--border-strong); border-radius:var(--radius-md); box-shadow:var(--shadow);
  padding:12px; font-family:var(--font-body); font-size:12.5px;
}
.ce-panel h4 { margin:0 0 8px; font-family:var(--font-body); font-size:12px; font-weight:600; color:var(--ink-2); display:flex; justify-content:space-between; align-items:center; }
.ce-panel h4 button { border:none; background:none; cursor:pointer; color:var(--ink-muted); font-size:15px; line-height:1; padding:0 2px; }
.ce-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.ce-row:last-child { margin-bottom:0; }
.ce-row label { flex:0 0 52px; color:var(--ink-muted); font-size:11.5px; }
.ce-row input[type=color] { width:34px; height:26px; padding:0; border:1px solid var(--border); border-radius:5px; background:none; cursor:pointer; }
.ce-row input[type=number] { width:64px; }
.ce-row select { flex:1; }
.ce-toggles { display:flex; gap:6px; }
.ce-toggles button {
  flex:1; border:1px solid var(--border-strong); background:var(--surface); color:var(--ink-2);
  border-radius:6px; padding:5px 0; cursor:pointer; font-size:12px;
}
.ce-toggles button.on { background:var(--accent); border-color:var(--accent); color:var(--accent-ink); }
.ce-toolbar .ce-on { background:var(--accent); border-color:var(--accent); color:var(--accent-ink); }
text.ce-title { font-family:var(--font-display); font-size:15px; font-weight:600; fill:var(--ink); }
.ce-hexfield { width:76px; font-family:var(--font-mono); text-transform:uppercase; }
.ce-titles-section { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-titles-section h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-titles-rows { display:flex; flex-direction:column; gap:6px; max-width:480px; }
.ce-title-row { display:flex; align-items:center; gap:8px; }
.ce-title-row label { flex:0 0 130px; font-size:12px; font-weight:500; color:var(--ink-2); }
.ce-title-row input[type=text] { flex:1; min-width:180px; height:26px; padding:2px 8px; font-size:12px; border:1px solid var(--border-strong); border-radius:4px; background:var(--surface); color:var(--ink); }
.ce-palette { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-palette h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-pal-chooser { margin-bottom:10px; }
.ce-pal-chooser-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ce-pal-chooser-row label { font-size:12px; color:var(--ink-2); }
.ce-pal-chooser-row select { flex:1; min-width:160px; }
.ce-pal-chooser-row button { border:1px solid var(--border-strong); background:var(--surface); color:var(--ink-2); border-radius:6px; padding:5px 10px; cursor:pointer; font-size:12px; }
.ce-pal-chooser-row button:hover { border-color:var(--accent); color:var(--ink); }
.ce-pal-preview { margin-top:6px; }
.ce-pal-swatchbar { display:flex; }
.ce-pal-swatchbar span { display:block; width:8px; height:14px; }
.ce-pal-rows { display:flex; flex-direction:column; gap:10px; max-width:480px; }
.ce-pal-row-block { border:1px solid var(--border); border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:6px; }
.ce-pal-row-head { display:flex; align-items:center; gap:8px; }
.ce-pal-row-head label { flex:1 1 auto; font-size:12px; font-weight:500; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ce-pal-row-head select { flex:none; width:auto; min-width:96px; }
.ce-pal-row-fill, .ce-pal-opacity { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ce-pal-solid, .ce-pal-gradient, .ce-pal-pattern { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ce-pal-row-fill input[type=color], .ce-pal-border-body input[type=color] { width:28px; height:24px; padding:0; border:1px solid var(--border); border-radius:5px; background:none; cursor:pointer; flex:none; }
.ce-pal-row-fill input[type=text] { flex:0 0 84px; }
.ce-pal-row-fill input[type=number], .ce-pal-border-body input[type=number] { width:56px; flex:none; }
.ce-pal-row-fill select { flex:none; width:auto; min-width:110px; }
.ce-pal-grad-stops { display:flex; gap:4px; }
.ce-pal-pat-num { display:flex; align-items:center; gap:4px; }
.ce-pal-pat-num label { font-size:11px; color:var(--ink-muted); }
.ce-pal-opacity input[type=range] { flex:0 1 80px; min-width:50px; }
.ce-pal-op-val { flex:none; width:34px; font-size:11px; color:var(--ink-muted); font-family:var(--font-mono); }
.ce-pal-border { font-size:12px; }
.ce-pal-border summary { cursor:pointer; color:var(--ink-2); font-size:11.5px; }
.ce-pal-border-body { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:6px; }
.ce-pal-border-row { display:flex; align-items:center; gap:6px; }
.ce-pal-border-row label { font-size:11px; color:var(--ink-muted); }
.ce-pal-warn { font-size:11px; color:#8a5a00; margin:0; }
.ce-pal-safen { font-size:11px; color:var(--ink-muted); margin:2px 0 0; }
.ce-pal-safen:empty { display:none; }
.ce-geometry { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-geometry h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-geom-rows { display:flex; flex-direction:column; gap:8px; max-width:420px; }
.ce-geom-row { display:flex; align-items:center; gap:8px; }
.ce-geom-row label { flex:0 0 auto; min-width:150px; font-size:12px; color:var(--ink-2); }
.ce-geom-row .ql-inputrow { display:flex; align-items:center; gap:8px; flex:1; }
.ce-geom-row input[type=range] { flex:1; min-width:0; }
.ce-geom-row input[type=number] { width:64px; flex:none; }
.ce-stats { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-stats h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-stats-rows { display:flex; flex-direction:column; gap:8px; max-width:420px; }
.ce-stats-row { display:flex; align-items:center; gap:8px; }
.ce-stats-row label { flex:0 0 auto; min-width:150px; font-size:12px; color:var(--ink-2); }
.ce-stats-row select { flex:1; min-width:0; }
.ce-stats-diagnostic { font-size:11.5px; color:var(--ink-2); line-height:1.4; background:var(--page); border:1px solid var(--border); border-radius:6px; padding:8px 10px; }
.ce-stats-row input[type=number] { width:72px; flex:none; }
.ce-colorscale { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-colorscale h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-cs-rows { display:flex; flex-direction:column; gap:8px; max-width:420px; }
.ce-cs-row { display:flex; align-items:center; gap:8px; }
.ce-cs-row label { flex:0 0 auto; min-width:150px; font-size:12px; color:var(--ink-2); }
.ce-cs-row select { flex:1; min-width:0; }
.ce-cs-row input[type=number] { width:72px; flex:none; }
.ce-cs-row input[type=text] { flex:1; min-width:120px; height:26px; padding:2px 8px; font-size:12px; border:1px solid var(--border-strong); border-radius:4px; background:var(--surface); color:var(--ink); }
.ce-presets .ce-cs-row { margin-bottom:6px; flex-wrap:wrap; }
.ce-presets .ce-cs-row span { font-size:12px; color:var(--ink-2); }
.ce-presets .ce-cs-row label { min-width:0; }
.ce-cs-domain { display:flex; align-items:center; gap:6px; flex:1; flex-wrap:wrap; }
.ce-cs-domain button { border:1px solid var(--border-strong); background:var(--surface); color:var(--ink-2); border-radius:6px; padding:4px 8px; cursor:pointer; font-size:11.5px; }
.ce-cs-domain button:hover { border-color:var(--accent); color:var(--ink); }
.ce-figstyle { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-figstyle h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-figstyle-rows { display:flex; flex-direction:column; gap:8px; max-width:480px; }
.ce-figstyle-row { display:flex; align-items:center; gap:8px; }
.ce-figstyle-row label { flex:0 0 auto; min-width:110px; font-size:12px; color:var(--ink-2); }
.ce-figstyle-row select { flex:1; min-width:0; }
.ce-figstyle-controls { display:flex; align-items:center; gap:6px; flex:1; flex-wrap:wrap; }
.ce-figstyle-controls input[type=color] { width:28px; height:24px; padding:0; border:1px solid var(--border); border-radius:5px; background:none; cursor:pointer; flex:none; }
.ce-figstyle-controls input[type=number] { width:56px; flex:none; }
.ce-figstyle-controls select { flex:none; width:auto; min-width:96px; }
.ce-fs-stage { display:flex; flex-direction:column; gap:14px; }
.ce-fs-svgwrap { flex:1 1 auto; min-height:0; display:flex; align-items:center; justify-content:center; overflow:auto; background:var(--page); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; }
.ce-fs-svgwrap svg.ce-fs-svg { width:100% !important; height:auto !important; max-height:calc(100vh - 260px); }
.ce-fs-stage .ce-toolbar { flex:none; margin-top:0; padding-top:14px; }
`;
  document.head.appendChild(s);
}

/**
 * @param {object} cfg
 * @param {string} cfg.key      clave de módulo (localStorage smart-175.chartStyle.<key>)
 * @param {SVGSVGElement} cfg.svg
 * @param {HTMLElement} cfg.mount   dónde se cuelga la barra de herramientas
 * @param {string} cfg.filename     nombre del .svg exportado
 * @param {Array}  cfg.elements     [{ id, selector?, create?, kind? }]
 *        - selector: CSS para encontrar el nodo dentro del svg (se re-busca en cada sync)
 *        - create:   { text, x, y, anchor, cls } para crear un <text> si no existe
 *        - kind:     'text' (def.) | 'group' (aplica estilo a los <text> descendientes)
 * @param {string} [cfg.lang]
 * @param {Function} [cfg.onChange]  se llama tras cualquier cambio persistido
 * @param {Array}  [cfg.geometrySliders]  [{ id, label, min, max, step, value,
 *        unit?, isPercent? }] — parámetros estructurales que SÍ necesitan
 *        recalcular geometría (p. ej. ancho de nodo de un aluvial) y por
 *        tanto no pueden ser una simple variable CSS. `value` es el valor
 *        por defecto si no hay nada persistido; leer el efectivo con
 *        `getFigureGeometry(key)` antes del primer pintado. Cada cambio se
 *        persiste en `store.__geometry[id]` y dispara `cfg.onGeometryChange`.
 * @param {Function} [cfg.onGeometryChange]  (id, value) — el módulo debe
 *        repintar con el nuevo valor (mismo patrón que `onReset`/`onChange`,
 *        pero con el dato: no hay forma de inferirlo solo del DOM).
 * @param {object} [cfg.statsControls]  { hasMultiGroup } — activa la sección
 *        "Significación estadística" (Paso 3 de qiimelab-prompt-editor-
 *        fase-1-anotaciones-estadisticas.md): modo asteriscos/p-exacto,
 *        estilo Prism, umbral, método de ajuste (solo con hasMultiGroup,
 *        ≥3 grupos — con 2 no hay comparaciones múltiples que ajustar).
 * @param {Function} [cfg.onStatsChange]  se llama tras persistir un cambio
 *        en las opciones de estadística — el módulo debe repintar entero
 *        (recalcula qué pares son significativos), mismo patrón que `onReset`.
 * @param {object} [cfg.colorScale]  { type: 'sequential'|'divergent',
 *        domain: [min,max] (el rango REAL de los datos en este pintado, para
 *        el botón "restablecer" y como valor por defecto), defaultPaletteId?
 *        (id de js/lib/palettes.js — 'app:sequential'/'app:divergent' si se
 *        omite), defaultMidpoint? (solo divergent, 0 si se omite),
 *        defaultShowValue? (Paso 4: si el módulo ya dibuja el valor en cada
 *        celda sin necesidad de tocar nada — correlograma/diferencial lo
 *        dejan implícito true; beta lo pone a false) } — activa
 *        la sección "Escala de color" (Paso 3 de qiimelab-prompt-editor-
 *        fase-3-heatmaps-escalas-continuas.md), para los 3 heatmaps con
 *        degradado continuo (beta/correlograma/diferencial). El módulo debe
 *        leer `getColorScaleOptions(key)` ANTES de construir su
 *        `makeColorScale()` (js/lib/colorScale.js) — mismo patrón que
 *        `getStatsOptions`/`getPaletteOverrides`.
 * @param {Function} [cfg.onColorScaleChange]  se llama tras persistir un
 *        cambio de escala — el módulo repinta entero (cambia el color de
 *        CADA celda, a diferencia del motor --fig-* que nunca repinta).
 * @param {boolean} [cfg.startEditing]  arranca ya en modo "Personalizar" —
 *        para cuando `onReset`/`onColorScaleChange`/etc. destruyen y vuelven
 *        a crear la instancia entera: pasar `editorAnterior.isEditing()`
 *        aquí para no cerrar el panel en cada repintado disparado desde
 *        dentro del propio editor.
 * @param {object} [cfg.figureOptions]  Fase 4 (qiimelab-prompt-editor-fase-
 *        4-ejes-rejilla-leyenda-lienzo.md), activa la sección "Estructura":
 *        { axis: false|{domain:[min,max], log?:boolean}, categoryOrder:
 *        false|true, gridMinor: false|true, margins:
 *        false|{base:{top,right,bottom,left}} }. El módulo lee
 *        `getFigureOptions(key)` ANTES de calcular su layout (igual que
 *        `getStatsOptions`/`getPaletteOverrides`).
 * @param {Function} [cfg.onFigureOptionsChange]  se llama tras persistir un
 *        cambio estructural — el módulo repinta entero (cambia orden/
 *        rango/márgenes, no solo estilo).
 * @param {Array} [cfg.legendPositions]  [{id, label, dx, dy}] posiciones
 *        predefinidas para el elemento 'legend' (Paso 4 G6) — aparecen como
 *        botones en su panel de estilo, además de poder seguir
 *        arrastrándose libremente. `dx`/`dy` son ABSOLUTOS (mismo sistema
 *        que ya usa el arrastre), no relativos a la posición actual.
 */
export function attachChartEditor(cfg) {
  injectStyles();
  const { key, svg, mount, filename = 'figura', elements = [] } = cfg;
  const paletteSeries = cfg.paletteSeries || []; // [{ id, label }] — series de datos recoloreables
  const paletteType = cfg.paletteType || 'categorical'; // qué botones de paleta ofrecer
  const paletteMax = cfg.paletteMax; // tope de tonos simultáneos (scatter/red: 3-4, no los 8)
  const geometrySliders = cfg.geometrySliders || []; // [{ id, label, min, max, step, value, unit?, isPercent? }]
  const statsControls = cfg.statsControls || null; // { hasMultiGroup } | null (sección desactivada)
  const colorScaleCfg = cfg.colorScale || null; // { type, domain, defaultPaletteId?, defaultMidpoint? } | null
  // Fase 4 (qiimelab-prompt-editor-fase-4-ejes-rejilla-leyenda-lienzo.md):
  // { axis: false|{domain:[min,max], log?:bool}, categoryOrder: false|true,
  //   gridMinor: false|true, margins: false|true } — cada clave activa (o
  //   no) su propia subsección; el módulo lee getFigureOptions(key) al
  //   pintar y decide qué hacer con cada campo, aquí solo se activa/
  //   desactiva la UI correspondiente.
  const figureOptionsCfg = cfg.figureOptions || null;
  const lang = cfg.lang || 'es';
  const T = tr(lang);
  const LSKEY = 'smart-175.chartStyle.' + key;
  const LEGACY_LSKEY = 'qiimelab.chartStyle.' + key;

  let store = readStore();
  // startEditing: para módulos cuyo paint() destruye y vuelve a crear el
  // editor en cada repintado (el patrón `if (editor) editor.destroy();
  // editor = attachChartEditor(...)` que usan los 3 heatmaps de la Fase 3 y
  // varias otras vistas para onReset) — sin esto, cada cambio que dispara un
  // repintado completo (cambiar la escala de color, "Restablecer"…) cierra
  // el panel "Personalizar" de golpe porque la NUEVA instancia siempre
  // arrancaba con editing=false, perdiendo el estado de la anterior. El
  // módulo debe leer `editor.isEditing()` ANTES de destruir la instancia
  // vieja y pasarlo aquí.
  let editing = !!cfg.startEditing;
  let selectedId = null;
  let panel = null;
  let cePanelUid = 0; // ids para enlazar <label for> ↔ control dentro del panel
  const wraps = new Map(); // id -> { wrap, inner, def }
  let fsHandle = null; // { close } del modal de pantalla completa, si está abierto

  function readStore() {
    try {
      const raw = localStorage.getItem(LSKEY) || localStorage.getItem(LEGACY_LSKEY);
      return JSON.parse(raw) || {};
    }
    catch (e) { return {}; }
  }
  function writeStore() {
    try {
      if (Object.keys(store).length) {
        localStorage.setItem(LSKEY, JSON.stringify(store));
        localStorage.removeItem(LEGACY_LSKEY);
      } else {
        localStorage.removeItem(LSKEY);
        localStorage.removeItem(LEGACY_LSKEY);
      }
    } catch (e) { /* modo privado */ }
    if (cfg.onChange) try { cfg.onChange(); } catch (e) { /* noop */ }
    renderToolbar();
  }
  function st(id) { return (store[id] = store[id] || {}); }

  // ---- paleta de series de datos ----
  // store.__palette = { seriesId: styleValue } — solo las series con algo
  // personalizado a mano o por un botón de paleta; las demás siguen el
  // var() por defecto del propio módulo (fill/stroke tal como lo dibujó).
  // `styleValue` es un string hex (formato de antes de la Fase 2 —
  // qiimelab-prompt-editor-fase-2-paletas-relleno-series.md Paso 2) o un
  // objeto RALO `{ color?, opacity?, fillType?, gradient?, pattern?,
  // border? }` — normalizeSeriesStyle() de js/lib/paletteStyle.js migra el
  // primer formato al segundo al leer, así que TODO el código de aquí en
  // adelante solo trata con el objeto, nunca con el string suelto.
  function paletteOverrides() { return store.__palette || {}; }
  function seriesStyle(id) { return normalizeSeriesStyle(paletteOverrides()[id]); }

  /** Color efectivo actual de una serie: el override si existe, si no el
   *  que ya está dibujado en el propio SVG (resuelto por el navegador, así
   *  que respeta el tema claro/oscuro), y si no hay ningún nodo (gráficos de
   *  degradado continuo, que no taggean nodos) el que le tocaría por orden
   *  dentro de la paleta activa — solo como referencia para el aviso de choque. */
  function effectiveSeriesColor(id, idx) {
    const style = seriesStyle(id);
    const rep = representativeColor(style, null);
    if (rep) return rep;
    const node = svg.querySelector('[data-ce-series-fill="' + id + '"], [data-ce-series-stroke="' + id + '"]');
    if (node) {
      const prop = node.hasAttribute('data-ce-series-fill') ? 'fill' : 'stroke';
      return toHex(getComputedStyle(node)[prop]);
    }
    return paletteColorAt(paletteType, idx, { max: paletteMax }) || '#888888';
  }

  // ---- <defs> de degradado/patrón (Pasos 3-4 de qiimelab-prompt-editor-
  // fase-2-paletas-relleno-series.md) — un <linearGradient>/<pattern> por
  // serie en modo degradado/patrón, dentro de un único <defs> al principio
  // del propio <svg>. Los ids llevan el `key` del módulo (namespaced, ver
  // js/lib/paletteStyle.js defId): js/modules/informe.js clona el <svg> de
  // varios módulos dentro de UNA sola página, así que dos gráficos con una
  // serie 's0' cada uno no pueden compartir id sin que uno "robe" el
  // degradado del otro.
  function svgDefs() {
    let defs = svg.querySelector(':scope > defs');
    if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
    return defs;
  }

  /** Borra los <defs> de degradado/patrón de ESTE módulo que ya no
   *  corresponden a ninguna serie en ese modo — si no, cambiar de
   *  degradado a sólido y volver a degradado dejaría <defs> huérfanos
   *  acumulándose en el <svg> (inofensivo para el pintado, pero ensucia el
   *  SVG exportado). Se llama al principio de applyPalette(), antes de
   *  recrear los que sí hacen falta. */
  function pruneOwnDefs(neededIds) {
    const defs = svg.querySelector(':scope > defs');
    if (!defs) return;
    const prefixes = [defIdPrefix('gradient', key), defIdPrefix('pattern', key)];
    [...defs.children].forEach((el) => {
      const id = el.getAttribute('id') || '';
      if (prefixes.some((p) => id.startsWith(p)) && !neededIds.has(id)) defs.removeChild(el);
    });
  }

  function ensureGradientDef(seriesId, gradCfg) {
    const id = defId('gradient', key, seriesId);
    const defs = svgDefs();
    let grad = defs.querySelector('#' + CSS.escape(id));
    if (!grad) { grad = document.createElementNS(NS, 'linearGradient'); grad.setAttribute('id', id); defs.appendChild(grad); }
    const line = gradientLineFromAngle(gradCfg.angle || 0);
    grad.setAttribute('x1', line.x1); grad.setAttribute('y1', line.y1);
    grad.setAttribute('x2', line.x2); grad.setAttribute('y2', line.y2);
    while (grad.firstChild) grad.removeChild(grad.firstChild);
    (gradCfg.stops || []).forEach((st) => {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', (st.pos != null ? st.pos : 0) + '%');
      stop.setAttribute('stop-color', isValidHex(st.color) ? st.color : '#000000');
      grad.appendChild(stop);
    });
    return id;
  }

  function ensurePatternDef(seriesId, patCfg) {
    const id = defId('pattern', key, seriesId);
    const defs = svgDefs();
    let pat = defs.querySelector('#' + CSS.escape(id));
    if (!pat) {
      pat = document.createElementNS(NS, 'pattern');
      pat.setAttribute('id', id);
      pat.setAttribute('patternUnits', 'userSpaceOnUse');
      defs.appendChild(pat);
    }
    const spec = patternTileSpec(patCfg);
    pat.setAttribute('width', spec.width);
    pat.setAttribute('height', spec.height);
    if (spec.patternTransform) pat.setAttribute('patternTransform', spec.patternTransform);
    else pat.removeAttribute('patternTransform');
    while (pat.firstChild) pat.removeChild(pat.firstChild);
    if (patCfg.bg && patCfg.bg !== 'transparent') {
      const bgRect = document.createElementNS(NS, 'rect');
      bgRect.setAttribute('width', spec.width); bgRect.setAttribute('height', spec.height);
      bgRect.setAttribute('fill', patCfg.bg);
      pat.appendChild(bgRect);
    }
    const fg = isValidHex(patCfg.fg) ? patCfg.fg : '#000000';
    (spec.shapes || []).forEach((sh) => {
      let el;
      if (sh.type === 'circle') {
        el = document.createElementNS(NS, 'circle');
        el.setAttribute('cx', sh.cx); el.setAttribute('cy', sh.cy); el.setAttribute('r', sh.r);
        el.setAttribute('fill', fg);
      } else {
        el = document.createElementNS(NS, 'line');
        el.setAttribute('x1', sh.x1); el.setAttribute('y1', sh.y1); el.setAttribute('x2', sh.x2); el.setAttribute('y2', sh.y2);
        el.setAttribute('stroke', fg);
        el.setAttribute('stroke-width', sh.strokeWidth || 1);
      }
      pat.appendChild(el);
    });
    return id;
  }

  /** Aplica (o revierte, si no hay override) el relleno de cada serie
   *  configurada a los nodos ya dibujados — sin repintar el gráfico.
   *  Opacidad 1 (o ausente) se trata como "sin personalizar": se limpia el
   *  estilo inline y el nodo vuelve a su fill-opacity/stroke-opacity propios
   *  (p. ej. las cajas de groupBoxplot.js dibujan fill-opacity:0.16 fijo —
   *  tocar el color de una serie no debe borrar eso de regalo). Tipo de
   *  relleno (Pasos 3-4): sólido (color plano, como antes) | degradado
   *  (<linearGradient>) | patrón (<pattern>) — mutuamente excluyentes, no
   *  3 casillas independientes (ver prompt Paso 3). */
  function applyPalette() {
    // 1ª pasada: qué <defs> hacen falta en total — hay que conocer el
    // conjunto completo ANTES de podar huérfanos, o se borraría uno que
    // otra serie acaba de pedir en esta misma llamada.
    const neededDefIds = new Set();
    paletteSeries.forEach((s) => {
      const style = seriesStyle(s.id);
      const fillType = style.fillType || 'solid';
      if (fillType === 'gradient' && style.gradient) neededDefIds.add(defId('gradient', key, s.id));
      else if (fillType === 'pattern' && style.pattern) neededDefIds.add(defId('pattern', key, s.id));
    });
    pruneOwnDefs(neededDefIds);
    paletteSeries.forEach((s) => {
      const style = seriesStyle(s.id);
      const fillType = style.fillType || 'solid';
      const opacityStr = style.opacity != null ? String(style.opacity) : '';
      let fillValue = style.color || '';
      if (fillType === 'gradient' && style.gradient) fillValue = 'url(#' + ensureGradientDef(s.id, style.gradient) + ')';
      else if (fillType === 'pattern' && style.pattern) fillValue = 'url(#' + ensurePatternDef(s.id, style.pattern) + ')';

      const fillNodes = svg.querySelectorAll('[data-ce-series-fill="' + s.id + '"]');
      const strokeNodes = svg.querySelectorAll('[data-ce-series-stroke="' + s.id + '"]');
      fillNodes.forEach((n) => { n.style.fill = fillValue; n.style.fillOpacity = opacityStr; });

      // borde: si hay `border` explícito, manda sobre el color de relleno —
      // y se aplica también a nodos que SOLO llevan -fill (p. ej. las
      // barras de taxaBarplot.js, que hoy no tienen ningún stroke propio)
      // porque si no el control no tendría ningún efecto visible ahí. Sin
      // `border` explícito: mismo comportamiento que antes de la Fase 2 —
      // el color de serie sigue marcando fill Y stroke, pero SOLO en los
      // nodos que el propio módulo ya etiquetó con -stroke (nunca se
      // inventa un borde en una barra que nunca lo tuvo).
      if (style.border) {
        const strokeTargets = strokeNodes.length ? strokeNodes : fillNodes;
        const bc = style.border.color || style.color || '';
        const bw = style.border.width != null ? String(style.border.width) : '';
        strokeTargets.forEach((n) => { n.style.stroke = bc; n.style.strokeWidth = bw; n.style.strokeOpacity = opacityStr; });
      } else {
        strokeNodes.forEach((n) => { n.style.stroke = fillValue; n.style.strokeWidth = ''; n.style.strokeOpacity = opacityStr; });
      }

      // radio de esquina: solo tiene sentido en <rect>; nunca se inventa
      // en un <path>/<circle> (Venn, puntos de dispersión…).
      fillNodes.forEach((n) => {
        if (!n.tagName || n.tagName.toLowerCase() !== 'rect') return;
        if (style.border && style.border.radius != null) {
          n.style.setProperty('rx', style.border.radius + 'px');
          n.style.setProperty('ry', style.border.radius + 'px');
        } else {
          n.style.removeProperty('rx');
          n.style.removeProperty('ry');
        }
      });
    });
  }

  /** Escribe un campo del estilo ralo de una serie (color/opacity/…) y
   *  limpia la entrada entera si se queda vacía — mismo criterio que ya
   *  regía cuando `store.__palette[id]` era un string suelto: "sin
   *  personalizar" no debe dejar basura en localStorage. */
  function setSeriesStyleField(id, field, value, isNoop) {
    const pal = (store.__palette = store.__palette || {});
    const cur = normalizeSeriesStyle(pal[id]);
    if (value != null && !isNoop) cur[field] = value; else delete cur[field];
    if (Object.keys(cur).length) pal[id] = cur; else delete pal[id];
    if (!Object.keys(pal).length) delete store.__palette;
    applyPalette();
    writeStore();
  }

  function setSeriesColor(id, hex) { setSeriesStyleField(id, 'color', hex, !hex); }
  /** opacity=1 (o null) se trata como valor neutro/no personalizado — ver
   *  el porqué en el comentario de applyPalette(). */
  function setSeriesOpacity(id, opacity) { setSeriesStyleField(id, 'opacity', opacity, opacity == null || opacity === 1); }
  /** 'solid' es el valor neutro/por defecto — no deja rastro en
   *  localStorage (mismo criterio que el resto de campos ralos). Al entrar
   *  por primera vez en degradado/patrón, siembra una configuración por
   *  defecto a partir del color actual de la serie (Paso 6: cambiar el
   *  SELECTOR de tipo de relleno debe verse en el gráfico al momento, no
   *  quedarse en blanco hasta que el usuario también elija paradas/trazo). */
  function setSeriesFillType(id, type) {
    const pal = (store.__palette = store.__palette || {});
    const cur = normalizeSeriesStyle(pal[id]);
    if (!type || type === 'solid') {
      delete cur.fillType;
    } else {
      cur.fillType = type;
      const idx = paletteSeries.findIndex((p) => p.id === id);
      const baseColor = cur.color || effectiveSeriesColor(id, idx);
      if (type === 'gradient' && !cur.gradient) cur.gradient = defaultGradient(baseColor);
      if (type === 'pattern' && !cur.pattern) cur.pattern = defaultPattern(baseColor);
    }
    if (Object.keys(cur).length) pal[id] = cur; else delete pal[id];
    if (!Object.keys(pal).length) delete store.__palette;
    applyPalette();
    writeStore();
  }
  function setSeriesGradient(id, gradCfg) { setSeriesStyleField(id, 'gradient', gradCfg, false); }
  function setSeriesPattern(id, patCfg) { setSeriesStyleField(id, 'pattern', patCfg, false); }
  function setSeriesBorder(id, borderCfg) {
    const hasAny = borderCfg && (borderCfg.color || borderCfg.width != null || borderCfg.radius != null);
    setSeriesStyleField(id, 'border', hasAny ? borderCfg : null, !hasAny);
  }

  /** Aplica una paleta del catálogo (js/lib/palettes.js) a TODAS las series
   *  configuradas de golpe. `id` es 'app:<paletteType>' (la paleta por
   *  defecto de la app) o un id de PALETTE_CATALOG (Fase 2, Paso 1 de
   *  qiimelab-prompt-editor-fase-2-paletas-relleno-series.md). Categóricas:
   *  un color por serie EN ORDEN (mismo comportamiento que antes). Secuencial/
   *  divergente: se muestrean equiespaciadas tantas paradas como series haya
   *  configuradas (2 "polos" siempre caen en el primer/último tono de la
   *  rampa elegida, nunca en sus 2 primeros — ver evenlySampleColors). */
  function applyPresetPalette(id) {
    const pal = (store.__palette = store.__palette || {});
    const isQualitative = (PALETTE_TYPE_FAMILY[paletteType] || 'qualitative') === 'qualitative';
    const picks = isQualitative
      ? paletteSeries.map((s, i) => resolvePaletteColors(id, i, { max: paletteMax }))
      : evenlySampleColors(paletteColorsOf(id, { max: paletteMax }), paletteSeries.length);
    paletteSeries.forEach((s, i) => {
      if (!picks[i]) return;
      const cur = normalizeSeriesStyle(pal[s.id]);
      cur.color = picks[i];
      // aplicar una paleta completa siempre da relleno sólido — un
      // degradado/patrón que se quedara con las paradas del color anterior
      // quedaría descolocado frente al nuevo color base (Paso 6: "sólido/
      // degradado/patrón/borde" es la jerarquía de tipo de relleno, no algo
      // que sobreviva sin más a cambiar la paleta entera). La opacidad y el
      // borde SÍ se conservan: son preferencias de estilo independientes
      // del tono elegido.
      delete cur.fillType; delete cur.gradient; delete cur.pattern;
      pal[s.id] = cur;
    });
    store.__paletteChoice = id;
    applyPalette();
    writeStore();
  }

  // ---- barra de herramientas ----
  const toolbar = document.createElement('div');
  toolbar.className = 'ce-toolbar';
  mount.appendChild(toolbar);

  function renderToolbar() {
    toolbar.innerHTML = '';

    const lead = document.createElement('p');
    lead.className = 'ce-lead';
    if (editing) {
      lead.className = 'ce-hint';
      lead.textContent = T.hint;
    } else {
      lead.innerHTML = '<strong>' + T.lead + '</strong> ' + T.leadRest;
    }
    toolbar.appendChild(lead);

    const bCustom = mkBtn(CE_ICONS.edit, editing ? T.done : T.customize, () => { setEditing(!editing); });
    bCustom.className = 'ql-btn' + (editing ? ' ce-on' : ' ce-cta');
    toolbar.appendChild(bCustom);

    const bFull = mkBtn(CE_ICONS.fullscreen, fsHandle ? T.fullscreenExit : T.fullscreen, openFullscreen);
    bFull.className = 'ql-btn' + (fsHandle ? ' ce-on' : '');
    toolbar.appendChild(bFull);

    const bDl = mkBtn(CE_ICONS.download, T.download, downloadSvg);
    bDl.className = 'ql-btn';
    toolbar.appendChild(bDl);

    const bPng = mkBtn(CE_ICONS.download, T.downloadPng, downloadPng);
    bPng.className = 'ql-btn';
    toolbar.appendChild(bPng);

    const bTiff = mkBtn(CE_ICONS.download, T.downloadTiff, downloadTiff);
    bTiff.className = 'ql-btn';
    toolbar.appendChild(bTiff);

    if (Object.keys(store).length) {
      const bReset = mkBtn(CE_ICONS.reset, T.reset, resetAll);
      bReset.className = 'ql-btn ql-btn-ghost';
      toolbar.appendChild(bReset);
    }

    if (editing) {
      toolbar.appendChild(renderTitlesSection());
    }

    // sección de estilo (rejilla/eje/marcas/título de eje/fuente): siempre
    // disponible cuando se edita, a diferencia de paleta/geometría que son
    // opt-in por módulo — todo gráfico con las clases de rol de components.css
    // (la inmensa mayoría) la aprovecha gratis, sin cfg adicional.
    if (editing) toolbar.appendChild(renderFigureStyleSection());

    if (editing && paletteSeries.length) toolbar.appendChild(renderPaletteSection());

    if (editing && geometrySliders.length) toolbar.appendChild(renderGeometrySection());

    if (editing && statsControls) toolbar.appendChild(renderStatsSection());

    if (editing && colorScaleCfg) toolbar.appendChild(renderColorScaleSection());

    if (editing && figureOptionsCfg) toolbar.appendChild(renderStructureSection());

    // Presets (Fase 6): siempre disponible al editar, no opt-in por módulo
    // -- a diferencia de paleta/geometría, cualquier gráfico puede guardar/
    // aplicar un preset (aunque no tenga paletteSeries, sigue teniendo
    // __figureStyle/posiciones de elemento que guardar).
    if (editing) toolbar.appendChild(renderPresetsSection());
  }

  function renderTitlesSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-titles ce-titles-section';
    wrap.innerHTML = '<h5>' + (T.titlesTitle || 'Títulos de la figura') + '</h5>';

    const rows = document.createElement('div');
    rows.className = 'ce-titles-rows';

    const titleDefs = [
      {
        id: 'title',
        label: T.chartTitle || 'Título del Gráfico',
        selector: '.ql-chart-main-title, .ce-title, [data-ce="title"]',
        cls: 'ql-ce-title-input',
      },
      {
        id: 'xtitle',
        label: T.xAxisTitle || 'Título Eje X',
        selector: '.ql-chart-x-title, [data-ce="xtitle"]',
        cls: 'ql-ce-xtitle-input',
      },
      {
        id: 'ytitle',
        label: T.yAxisTitle || 'Título Eje Y',
        selector: '.ql-chart-y-title, [data-ce="ytitle"]',
        cls: 'ql-ce-ytitle-input',
      },
    ];

    titleDefs.forEach((td) => {
      const row = document.createElement('div');
      row.className = 'ce-title-row';

      const lab = document.createElement('label');
      lab.setAttribute('for', td.cls);
      lab.textContent = td.label;
      row.appendChild(lab);

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = td.cls;
      inp.className = 'ql-input ce-textfield ' + td.cls;
      inp.placeholder = td.label;

      const stVal = store[td.id] && typeof store[td.id].text === 'string' ? store[td.id].text : null;
      if (stVal !== null) {
        inp.value = stVal;
      } else {
        const matching = svg.querySelector(td.selector);
        if (matching && matching.textContent) {
          inp.value = matching.textContent.trim();
        }
      }

      inp.addEventListener('input', () => {
        const val = inp.value;
        const targets = svg.querySelectorAll(td.selector);
        targets.forEach((target) => {
          target.textContent = val;
        });
        const w = wraps.get(td.id);
        if (w && w.inner) {
          w.inner.textContent = val;
        }
        const s = st(td.id);
        s.text = val;
        decorate(td.id);
        writeStoreDebounced();
        if (cfg.onChange) try { cfg.onChange(); } catch (e) {}
      });

      row.appendChild(inp);
      rows.appendChild(row);
    });

    wrap.appendChild(rows);
    return wrap;
  }

  const PALETTE_LABEL = {
    categorical: T.paletteCategorical, sequential: T.paletteSequential,
    sequentialPoles: T.paletteSequential, divergent: T.paletteDivergent,
    divergentPoles: T.paletteDivergent,
  };

  function swatchBarColors(colors) {
    const bar = document.createElement('span');
    bar.className = 'ce-pal-swatchbar';
    (colors || []).slice(0, paletteMax || (colors || []).length).forEach((hex) => {
      const sw = document.createElement('span');
      sw.style.background = hex;
      bar.appendChild(sw);
    });
    return bar;
  }

  function paletteEntryLabel(p) {
    if (p.isDefault) return (PALETTE_LABEL[paletteType] || paletteType) + ' — ' + T.paletteAppDefault;
    return p.name;
  }

  /** Desplegable con todas las paletas de la MISMA familia que `paletteType`
   *  (categórica/secuencial/divergente — nunca mezcladas: no tendría
   *  sentido ofrecer una rampa secuencial de 9 tonos para recolorear series
   *  discretas de un Venn) + una vista previa de swatches que se actualiza
   *  al cambiar de opción SIN aplicar todavía, y un botón "Aplicar" aparte
   *  (Paso 1 de qiimelab-prompt-editor-fase-2-paletas-relleno-series.md —
   *  antes era un único botón fijo a la paleta por defecto de la app). */
  function renderPaletteChooser() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-pal-chooser';

    const options = palettesForType(paletteType);
    const current = store.__paletteChoice && options.some((p) => p.id === store.__paletteChoice)
      ? store.__paletteChoice : 'app:' + paletteType;

    const row = document.createElement('div');
    row.className = 'ce-pal-chooser-row';
    const selId = 'ce-pal-choose-' + (++cePanelUid);
    const lab = document.createElement('label');
    lab.setAttribute('for', selId);
    lab.textContent = T.paletteChoose;
    row.appendChild(lab);

    const sel = document.createElement('select');
    sel.id = selId;
    const appGroup = document.createElement('optgroup');
    appGroup.label = PALETTE_LABEL[paletteType] || paletteType;
    const catGroup = document.createElement('optgroup');
    catGroup.label = T.paletteTitle;
    options.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = paletteEntryLabel(p);
      if (p.id === current) o.selected = true;
      (p.isDefault ? appGroup : catGroup).appendChild(o);
    });
    sel.appendChild(appGroup);
    if (catGroup.children.length) sel.appendChild(catGroup);
    row.appendChild(sel);

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'ql-btn';
    applyBtn.textContent = T.paletteApply;
    applyBtn.addEventListener('click', () => applyPresetPalette(sel.value));
    row.appendChild(applyBtn);
    wrap.appendChild(row);

    const preview = document.createElement('div');
    preview.className = 'ce-pal-preview';
    // Nº de series "seguro" bajo daltonismo -- Paso 4 de
    // qiimelab-prompt-editor-fase-6-presets-style-match-export-revista.md:
    // mostrar el N calculado por paletteValidator (vía maxSafeN, ya
    // computado en paletteCatalog.js), no una afirmación genérica de
    // "colorblind-safe" sin más. Nota SIEMPRE visible (no solo al
    // excederlo, que es lo que ya hacía `warn` más abajo).
    const safeNote = document.createElement('p');
    safeNote.className = 'ce-pal-safen';
    const warn = document.createElement('p');
    warn.className = 'ce-pal-warn';
    const paint = () => {
      const p = options.find((o) => o.id === sel.value);
      preview.innerHTML = '';
      if (p) preview.appendChild(swatchBarColors(p.colors));
      safeNote.textContent = (p && p.type === 'qualitative' && p.maxSafeN != null) ? T.paletteSafeN(p.maxSafeN) : '';
      warn.textContent = '';
      if (p && p.type === 'qualitative' && p.maxSafeN != null && paletteSeries.length > p.maxSafeN) {
        warn.textContent = '⚠ ' + T.paletteWarnSafeN(paletteSeries.length, p.maxSafeN);
      }
    };
    sel.addEventListener('change', paint);
    paint();
    wrap.appendChild(preview);
    wrap.appendChild(safeNote);
    wrap.appendChild(warn);

    return wrap;
  }

  /** Aviso de choque de color (ya existía antes de la Fase 2) — extraído a
   *  su propia función porque ahora lo consumen tanto el control sólido
   *  como el degradado (sobre su parada dominante, ver Paso 6: "sigue
   *  aplicando sobre el color representativo, no se desactiva para las
   *  series con relleno no sólido"). */
  function clashWarningFor(i, hex, currentHexes) {
    const warn = document.createElement('p');
    warn.className = 'ce-pal-warn';
    const paint = (h) => {
      warn.textContent = '';
      if (!h) return;
      if (!isValidHex(h)) { warn.textContent = '⚠ ' + T.paletteInvalidHex; return; }
      const others = paletteSeries.map((s2, j) => (j === i ? null : currentHexes[j])).filter(Boolean);
      const res = checkAgainstPalette(h, others);
      if (res.verdict === 'PASS') return;
      if (res.reason === 'clash') {
        const otherLabel = (paletteSeries.find((s2, j) => currentHexes[j] === res.other) || {}).label || res.other;
        warn.textContent = '⚠ ' + T.paletteWarnClash(otherLabel);
      } else if (res.reason === 'contrast') {
        warn.textContent = '⚠ ' + T.paletteWarnContrast;
      }
    };
    paint(hex);
    return { el: warn, paint };
  }

  /** Sólido (Paso 1, ya existía): color + campo hex, con vista previa en
   *  vivo sin persistir hasta confirmar — igual que siempre, solo que
   *  ahora vive en su propia función porque el resto de la fila cambia
   *  según el tipo de relleno elegido. */
  function renderSolidControls(s, i, currentHexes, paintWarn) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-pal-solid';
    const hex = currentHexes[i];

    const colorId = 'ce-pal-c-' + (++cePanelUid);
    const inpColor = document.createElement('input');
    inpColor.type = 'color'; inpColor.id = colorId;
    inpColor.value = isValidHex(hex) ? hex : '#888888';
    inpColor.setAttribute('aria-label', s.label + ' — ' + T.color);

    const inpHex = document.createElement('input');
    inpHex.type = 'text'; inpHex.className = 'ce-hexfield';
    inpHex.value = (isValidHex(hex) ? hex : '').toUpperCase();
    inpHex.setAttribute('aria-label', s.label + ' — ' + T.hex);
    inpHex.placeholder = '#RRGGBB';

    const preview = (h) => {
      const ok = h === '' || isValidHex(h);
      svg.querySelectorAll('[data-ce-series-fill="' + s.id + '"]').forEach((n) => { n.style.fill = ok ? h : ''; });
      if (!seriesStyle(s.id).border) {
        svg.querySelectorAll('[data-ce-series-stroke="' + s.id + '"]').forEach((n) => { n.style.stroke = ok ? h : ''; });
      }
    };
    const commit = (h) => { if (!h || isValidHex(h)) setSeriesColor(s.id, h || null); };

    inpColor.addEventListener('input', () => { inpHex.value = inpColor.value.toUpperCase(); paintWarn(inpColor.value); preview(inpColor.value); });
    inpColor.addEventListener('change', () => commit(inpColor.value));
    inpHex.addEventListener('input', () => {
      let v = inpHex.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      paintWarn(v);
      if (isValidHex(v)) { inpColor.value = v; preview(v); }
    });
    inpHex.addEventListener('change', () => {
      let v = inpHex.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (!v || isValidHex(v)) commit(v);
    });
    inpHex.addEventListener('keydown', (e) => { if (e.key === 'Enter') inpHex.blur(); });

    wrap.appendChild(inpColor);
    wrap.appendChild(inpHex);
    return wrap;
  }

  /** Degradado (Paso 3): 2-3 paradas + ángulo. Se siembra con
   *  defaultGradient() la primera vez (ver setSeriesFillType) así que aquí
   *  `style.gradient` ya existe siempre que fillType === 'gradient'. */
  function renderGradientControls(s, style, paintWarn) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-pal-gradient';
    const grad = style.gradient || defaultGradient(style.color);
    const stops = grad.stops && grad.stops.length >= 2 ? grad.stops : defaultGradient(style.color).stops;
    const commitGrad = (next) => setSeriesGradient(s.id, next);

    const stopsRow = document.createElement('div');
    stopsRow.className = 'ce-pal-grad-stops';
    stops.forEach((st, idx) => {
      const cInp = document.createElement('input');
      cInp.type = 'color'; cInp.value = isValidHex(st.color) ? st.color : '#888888';
      cInp.setAttribute('aria-label', s.label + ' — ' + T.paletteGradientStop(idx + 1));
      cInp.addEventListener('input', () => { if (idx === 0) paintWarn(cInp.value); });
      cInp.addEventListener('change', () => {
        commitGrad({ ...grad, stops: stops.map((s2, j) => (j === idx ? { ...s2, color: cInp.value } : s2)) });
      });
      stopsRow.appendChild(cInp);
    });
    wrap.appendChild(stopsRow);

    if (stops.length < 3) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'ql-btn ql-btn-ghost'; addBtn.textContent = T.paletteAddStop;
      addBtn.addEventListener('click', () => {
        commitGrad({ ...grad, stops: [stops[0], { color: stops[0].color, pos: 50 }, stops[stops.length - 1]] });
      });
      wrap.appendChild(addBtn);
    } else {
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button'; rmBtn.className = 'ql-btn ql-btn-ghost'; rmBtn.textContent = T.paletteRemoveStop;
      rmBtn.addEventListener('click', () => commitGrad({ ...grad, stops: [stops[0], stops[stops.length - 1]] }));
      wrap.appendChild(rmBtn);
    }

    const angleId = 'ce-pal-ga-' + (++cePanelUid);
    const angleLab = document.createElement('label');
    angleLab.setAttribute('for', angleId); angleLab.textContent = T.paletteGradientAngle;
    const angleInp = document.createElement('input');
    angleInp.type = 'number'; angleInp.id = angleId; angleInp.min = '0'; angleInp.max = '359'; angleInp.step = '15';
    angleInp.value = String(grad.angle != null ? grad.angle : 90);
    angleInp.addEventListener('change', () => {
      let v = parseFloat(angleInp.value);
      if (!Number.isFinite(v)) v = 0;
      commitGrad({ ...grad, angle: ((v % 360) + 360) % 360 });
    });
    wrap.appendChild(angleLab);
    wrap.appendChild(angleInp);

    return wrap;
  }

  /** Patrón (Paso 4): rayado diagonal / puntos / cuadrícula, trazo + fondo
   *  (transparente por defecto — un rayado de verdad, no un bloque de
   *  color con líneas encima) + separación + grosor, y ángulo solo para el
   *  rayado diagonal (los otros 2 tipos no lo usan). */
  function renderPatternControls(s, style) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-pal-pattern';
    const pat = style.pattern || defaultPattern(style.color);
    const commitPat = (next) => setSeriesPattern(s.id, next);

    const kindId = 'ce-pal-pk-' + (++cePanelUid);
    const kindLab = document.createElement('label'); kindLab.setAttribute('for', kindId); kindLab.textContent = T.palettePatternKind;
    const kindSel = document.createElement('select'); kindSel.id = kindId;
    [['diagonal', T.palettePatternDiagonal], ['dots', T.palettePatternDots], ['grid', T.palettePatternGrid]].forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (val === (pat.kind || 'diagonal')) o.selected = true;
      kindSel.appendChild(o);
    });
    kindSel.addEventListener('change', () => commitPat({ ...pat, kind: kindSel.value }));
    wrap.appendChild(kindLab); wrap.appendChild(kindSel);

    const fgInp = document.createElement('input');
    fgInp.type = 'color'; fgInp.value = isValidHex(pat.fg) ? pat.fg : '#888888';
    fgInp.setAttribute('aria-label', s.label + ' — ' + T.palettePatternFg);
    fgInp.addEventListener('change', () => commitPat({ ...pat, fg: fgInp.value }));
    wrap.appendChild(fgInp);

    const bgTransparent = !pat.bg || pat.bg === 'transparent';
    const bgInp = document.createElement('input');
    bgInp.type = 'color'; bgInp.value = isValidHex(pat.bg) ? pat.bg : '#ffffff';
    bgInp.disabled = bgTransparent;
    bgInp.setAttribute('aria-label', s.label + ' — ' + T.palettePatternBg);
    bgInp.addEventListener('change', () => { if (!bgChk.checked) commitPat({ ...pat, bg: bgInp.value }); });
    const bgChkId = 'ce-pal-pbgc-' + (++cePanelUid);
    const bgChk = document.createElement('input');
    bgChk.type = 'checkbox'; bgChk.id = bgChkId; bgChk.checked = bgTransparent;
    bgChk.addEventListener('change', () => {
      bgInp.disabled = bgChk.checked;
      commitPat({ ...pat, bg: bgChk.checked ? 'transparent' : bgInp.value });
    });
    const bgLab = document.createElement('label'); bgLab.setAttribute('for', bgChkId); bgLab.textContent = T.palettePatternTransparentBg;
    wrap.appendChild(bgInp); wrap.appendChild(bgChk); wrap.appendChild(bgLab);

    const numField = (labelText, val, min, max, step, onChange) => {
      const span = document.createElement('span'); span.className = 'ce-pal-pat-num';
      const id = 'ce-pal-pn-' + (++cePanelUid);
      const lab = document.createElement('label'); lab.setAttribute('for', id); lab.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.id = id; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(val);
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!Number.isFinite(v)) return;
        onChange(Math.max(min, Math.min(max, v)));
      });
      span.appendChild(lab); span.appendChild(inp);
      return span;
    };
    wrap.appendChild(numField(T.palettePatternSpacing, pat.spacing != null ? pat.spacing : 8, 3, 30, 1, (v) => commitPat({ ...pat, spacing: v })));
    wrap.appendChild(numField(T.palettePatternStroke, pat.strokeWidth != null ? pat.strokeWidth : 2, 0.5, 8, 0.5, (v) => commitPat({ ...pat, strokeWidth: v })));
    if ((pat.kind || 'diagonal') === 'diagonal') {
      wrap.appendChild(numField(T.palettePatternAngle, pat.angle != null ? pat.angle : 45, 0, 179, 5, (v) => commitPat({ ...pat, angle: v })));
    }

    return wrap;
  }

  /** Opacidad (Paso 2) — un control por serie, independiente del tipo de
   *  relleno (se aplica igual a sólido/degradado/patrón). */
  function renderOpacityControl(s) {
    const row = document.createElement('div');
    row.className = 'ce-pal-opacity';
    const curOpacity = seriesStyle(s.id).opacity;
    const opId = 'ce-pal-op-' + (++cePanelUid);
    const lab = document.createElement('label');
    lab.setAttribute('for', opId); lab.textContent = T.paletteOpacity;
    const opRange = document.createElement('input');
    opRange.type = 'range'; opRange.id = opId; opRange.min = '0'; opRange.max = '100'; opRange.step = '5';
    opRange.value = String(Math.round((curOpacity != null ? curOpacity : 1) * 100));
    opRange.setAttribute('aria-label', s.label + ' — ' + T.paletteOpacity);
    const opNum = document.createElement('span');
    opNum.className = 'ce-pal-op-val';
    opNum.textContent = opRange.value + '%';
    opRange.addEventListener('input', () => { opNum.textContent = opRange.value + '%'; });
    opRange.addEventListener('change', () => setSeriesOpacity(s.id, Math.max(0, Math.min(100, +opRange.value)) / 100));
    row.appendChild(lab); row.appendChild(opRange); row.appendChild(opNum);
    return row;
  }

  /** Borde independiente (Paso 5) — color/grosor/radio de esquina aparte
   *  del relleno. `<details>` nativo (sin estado propio que mantener): se
   *  abre solo si ya hay un borde configurado. El radio de esquina solo
   *  tiene efecto visual en series dibujadas con <rect> (applyPalette lo
   *  ignora en <path>/<circle> — Venn, puntos de dispersión…) pero el
   *  control se muestra igual: no sabemos de antemano la forma de cada
   *  serie sin auditar cada módulo, y dejarlo sin efecto ahí es inofensivo. */
  function renderBorderControls(s, style) {
    const det = document.createElement('details');
    det.className = 'ce-pal-border';
    if (style.border) det.open = true;
    const sum = document.createElement('summary'); sum.textContent = T.paletteBorderTitle;
    det.appendChild(sum);

    const b = style.border || {};
    const commitBorder = (next) => setSeriesBorder(s.id, next);
    const body = document.createElement('div');
    body.className = 'ce-pal-border-body';

    const field = (labelText, inputEl) => {
      const row = document.createElement('div'); row.className = 'ce-pal-border-row';
      const lab = document.createElement('label'); lab.setAttribute('for', inputEl.id); lab.textContent = labelText;
      row.appendChild(lab); row.appendChild(inputEl);
      return row;
    };

    const cInp = document.createElement('input');
    cInp.type = 'color'; cInp.id = 'ce-pal-bc-' + (++cePanelUid);
    cInp.value = isValidHex(b.color) ? b.color : (isValidHex(style.color) ? style.color : '#000000');
    cInp.addEventListener('change', () => commitBorder({ ...b, color: cInp.value }));
    body.appendChild(field(T.paletteBorderColor, cInp));

    const wInp = document.createElement('input');
    wInp.type = 'number'; wInp.id = 'ce-pal-bw-' + (++cePanelUid);
    wInp.min = '0'; wInp.max = '10'; wInp.step = '0.5'; wInp.value = String(b.width != null ? b.width : 1.5);
    wInp.addEventListener('change', () => {
      const v = parseFloat(wInp.value);
      if (Number.isFinite(v)) commitBorder({ ...b, width: Math.max(0, Math.min(10, v)) });
    });
    body.appendChild(field(T.paletteBorderWidth, wInp));

    const rInp = document.createElement('input');
    rInp.type = 'number'; rInp.id = 'ce-pal-br-' + (++cePanelUid);
    rInp.min = '0'; rInp.max = '30'; rInp.step = '1'; rInp.value = String(b.radius != null ? b.radius : 0);
    rInp.addEventListener('change', () => {
      const v = parseFloat(rInp.value);
      if (Number.isFinite(v)) commitBorder({ ...b, radius: Math.max(0, Math.min(30, v)) });
    });
    body.appendChild(field(T.paletteBorderRadius, rInp));

    det.appendChild(body);
    return det;
  }

  /** Una fila completa por serie: cabecera (etiqueta + selector de tipo de
   *  relleno) + controles según el tipo elegido + opacidad + borde +
   *  aviso de choque de color (Paso 6: jerarquía sólido/degradado/patrón
   *  mutuamente excluyente, opacidad y borde independientes de esa
   *  elección). */
  function renderSeriesRow(s, i, currentHexes) {
    const style = seriesStyle(s.id);
    const fillType = style.fillType || 'solid';

    const block = document.createElement('div');
    block.className = 'ce-pal-row-block';

    const head = document.createElement('div');
    head.className = 'ce-pal-row-head';
    const lab = document.createElement('label');
    lab.textContent = s.label;
    const ftId = 'ce-pal-ft-' + (++cePanelUid);
    lab.setAttribute('for', ftId);
    head.appendChild(lab);

    const ftSel = document.createElement('select');
    ftSel.id = ftId;
    [['solid', T.paletteFillSolid], ['gradient', T.paletteFillGradient], ['pattern', T.paletteFillPattern]].forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (val === fillType) o.selected = true;
      ftSel.appendChild(o);
    });
    ftSel.addEventListener('change', () => setSeriesFillType(s.id, ftSel.value));
    head.appendChild(ftSel);
    block.appendChild(head);

    const { el: warnEl, paint: paintWarn } = clashWarningFor(i, currentHexes[i], currentHexes);

    const fillWrap = document.createElement('div');
    fillWrap.className = 'ce-pal-row-fill';
    if (fillType === 'gradient') fillWrap.appendChild(renderGradientControls(s, style, paintWarn));
    else if (fillType === 'pattern') fillWrap.appendChild(renderPatternControls(s, style));
    else fillWrap.appendChild(renderSolidControls(s, i, currentHexes, paintWarn));
    block.appendChild(fillWrap);

    block.appendChild(renderOpacityControl(s));
    block.appendChild(renderBorderControls(s, style));
    block.appendChild(warnEl);

    return block;
  }

  function renderPaletteSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-palette';
    wrap.innerHTML = '<h5>' + T.paletteTitle + '</h5>';

    wrap.appendChild(renderPaletteChooser());

    const rows = document.createElement('div');
    rows.className = 'ce-pal-rows';
    const currentHexes = paletteSeries.map((s, i) => effectiveSeriesColor(s.id, i));
    paletteSeries.forEach((s, i) => { rows.appendChild(renderSeriesRow(s, i, currentHexes)); });
    wrap.appendChild(rows);
    return wrap;
  }

  // ---- geometría (parámetros estructurales que necesitan repintar) ----
  function geometryOverrides() { return store.__geometry || {}; }

  function setGeometryValue(id, val) {
    const geo = (store.__geometry = store.__geometry || {});
    geo[id] = val;
    writeStoreDebounced();
    if (cfg.onGeometryChange) try { cfg.onGeometryChange(id, val); } catch (e) { /* noop */ }
  }

  function renderGeometrySection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-geometry';
    wrap.innerHTML = '<h5>' + (T.geometryTitle || 'Geometría') + '</h5>';

    const rows = document.createElement('div');
    rows.className = 'ce-geom-rows';
    const geo = geometryOverrides();

    geometrySliders.forEach((sl) => {
      const current = geo[sl.id] !== undefined ? geo[sl.id] : sl.value;
      const toDisplay = (v) => (sl.isPercent ? Math.round(v * 100) : v);
      const fromDisplay = (v) => (sl.isPercent ? v / 100 : v);
      const min = toDisplay(sl.min), max = toDisplay(sl.max), step = toDisplay(sl.step);
      const unit = sl.isPercent ? '%' : (sl.unit || '');

      const row = document.createElement('div');
      row.className = 'ce-geom-row';
      const rowId = 'ce-geom-' + (++cePanelUid);
      const lab = document.createElement('label');
      lab.setAttribute('for', rowId);
      lab.textContent = sl.label + (unit ? ' (' + unit + ')' : '');
      row.appendChild(lab);

      const inputRow = document.createElement('div');
      inputRow.className = 'ql-inputrow';
      const rangeInp = document.createElement('input');
      rangeInp.type = 'range'; rangeInp.id = rowId;
      rangeInp.min = min; rangeInp.max = max; rangeInp.step = step; rangeInp.value = toDisplay(current);
      const numInp = document.createElement('input');
      numInp.type = 'number'; numInp.className = 'tabular';
      numInp.min = min; numInp.max = max; numInp.step = step; numInp.value = toDisplay(current);

      const onSliderChange = (raw) => {
        const num = parseFloat(raw);
        if (Number.isNaN(num)) return;
        const clamped = Math.max(min, Math.min(max, num));
        rangeInp.value = clamped; numInp.value = clamped;
        setGeometryValue(sl.id, fromDisplay(clamped));
      };
      rangeInp.addEventListener('input', () => onSliderChange(rangeInp.value));
      numInp.addEventListener('change', () => onSliderChange(numInp.value));

      inputRow.appendChild(rangeInp);
      inputRow.appendChild(numInp);
      row.appendChild(inputRow);
      rows.appendChild(row);
    });

    wrap.appendChild(rows);
    return wrap;
  }

  // ---- significación estadística (Paso 3 de qiimelab-prompt-editor-fase-1-
  // anotaciones-estadisticas.md) — a diferencia de estilo/paleta/geometría,
  // un cambio aquí obliga a RECALCULAR qué pares son significativos (no solo
  // repintar), así que se resuelve entero en cfg.onStatsChange (mismo
  // patrón que onReset: el módulo vuelve a llamar a su función de pintado).
  function statsOverrides() { return store.__stats || {}; }

  function setStatsValue(id, val) {
    const s = (store.__stats = store.__stats || {});
    if (val === '' || val === undefined || val === null) delete s[id]; else s[id] = val;
    if (!Object.keys(s).length) delete store.__stats;
    writeStore();
    if (cfg.onStatsChange) try { cfg.onStatsChange(store.__stats || {}); } catch (e) { /* noop */ }
  }

  function statsRow(labelText, controlEl) {
    const row = document.createElement('div');
    row.className = 'ce-stats-row';
    const id = 'ce-stats-' + (++cePanelUid);
    const lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = labelText;
    row.appendChild(lab);
    controlEl.id = id;
    row.appendChild(controlEl);
    return row;
  }

  function statsSelect(current, options, onChange) {
    const sel = document.createElement('select');
    options.forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (val === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function renderStatsSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-stats';
    wrap.innerHTML = '<h5>' + T.statsTitle + '</h5>';

    const rows = document.createElement('div');
    rows.className = 'ce-stats-rows';
    const s = statsOverrides();
    const mode = s.mode || 'stars+exact';

    rows.appendChild(statsRow(T.statsMode, statsSelect(mode, [
      ['stars', T.statsModeStars], ['exact', T.statsModeExact], ['stars+exact', T.statsModeBoth],
    ], (v) => setStatsValue('mode', v))));

    if (mode !== 'stars') {
      rows.appendChild(statsRow(T.statsStyle, statsSelect(s.style || 'gp', [
        ['gp', 'GraphPad'], ['apa', 'APA'], ['nejm', 'NEJM'],
      ], (v) => setStatsValue('style', v))));
    }

    const thresholdInp = document.createElement('input');
    thresholdInp.type = 'number'; thresholdInp.min = '0'; thresholdInp.max = '1'; thresholdInp.step = '0.01';
    thresholdInp.value = s.threshold != null ? s.threshold : 0.05;
    thresholdInp.addEventListener('change', () => {
      const v = parseFloat(thresholdInp.value);
      if (!Number.isFinite(v)) return;
      setStatsValue('threshold', Math.max(0, Math.min(1, v)));
    });
    rows.appendChild(statsRow(T.statsThreshold, thresholdInp));

    if (statsControls.hasMultiGroup) {
      rows.appendChild(statsRow(T.statsMethod, statsSelect(s.method || 'holm', [
        ['holm', 'Holm'], ['BH', 'Benjamini-Hochberg'], ['bonferroni', 'Bonferroni'],
        ['hochberg', 'Hochberg'], ['BY', 'Benjamini-Yekutieli'],
      ], (v) => setStatsValue('method', v))));
    }

    // Auto-selección de test (prompt "quick wins" 22 sep 2026, punto 2):
    // diagnóstico de normalidad (Shapiro-Wilk)/homogeneidad de varianzas
    // (Levene) que trae ya calculado el propio módulo (groupBoxplot.js,
    // vía js/lib/statAutoSelect.js) -- aquí solo se explica en lenguaje
    // llano y se deja el selector manual para forzar otro test.
    if (statsControls.diagnostic) {
      const d = statsControls.diagnostic;
      const box = document.createElement('div');
      box.className = 'ce-stats-diagnostic';
      box.textContent = d.reason;
      rows.appendChild(box);

      const testOptions2 = [['auto', T.statsTestAuto], ['student', T.statsTestStudent], ['welch', T.statsTestWelch], ['mannwhitney', T.statsTestMW]];
      const testOptionsK = [['auto', T.statsTestAuto], ['anova-tukey', T.statsTestAnovaTukey], ['welch-anova-gh', T.statsTestWelchGH], ['kruskal-dunn', T.statsTestKruskalDunn]];
      rows.appendChild(statsRow(T.statsTestLabel, statsSelect(s.testOverride || 'auto', statsControls.hasMultiGroup ? testOptionsK : testOptions2,
        (v) => setStatsValue('testOverride', v === 'auto' ? '' : v))));
    }

    wrap.appendChild(rows);
    return wrap;
  }

  // ---- escala de color continua (Paso 3 de qiimelab-prompt-editor-fase-3-
  // heatmaps-escalas-continuas.md) — igual que estadística: un cambio aquí
  // obliga a RECALCULAR el color de cada celda con js/lib/colorScale.js
  // (repintado completo, justificado a diferencia del motor --fig-*, que
  // nunca repinta), así que se resuelve entero en cfg.onColorScaleChange.
  function colorScaleOverrides() { return store.__colorScale || {}; }

  function setColorScaleValue(id, val) {
    const s = (store.__colorScale = store.__colorScale || {});
    if (val === '' || val === undefined || val === null) delete s[id]; else s[id] = val;
    if (!Object.keys(s).length) delete store.__colorScale;
    writeStore();
    if (cfg.onColorScaleChange) try { cfg.onColorScaleChange(store.__colorScale || {}); } catch (e) { /* noop */ }
  }

  function colorScaleRow(labelText, controlEl) {
    const row = document.createElement('div');
    row.className = 'ce-cs-row';
    const id = 'ce-cs-' + (++cePanelUid);
    const lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = labelText;
    row.appendChild(lab);
    controlEl.id = id;
    row.appendChild(controlEl);
    return row;
  }

  function renderColorScaleSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-colorscale';
    wrap.innerHTML = '<h5>' + T.colorScaleTitle + '</h5>';

    const rows = document.createElement('div');
    rows.className = 'ce-cs-rows';
    const s = colorScaleOverrides();
    const csType = colorScaleCfg.type === 'divergent' ? 'divergent' : 'sequential';
    const defaultPaletteId = colorScaleCfg.defaultPaletteId || ('app:' + csType);
    const currentPaletteId = s.paletteId || defaultPaletteId;

    // paleta — reutiliza el catálogo/desplegable de la Fase 2
    // (palettesForType) con la lista COMPLETA de paradas de cada paleta
    // (no solo 2-3 polos): colorScale.js interpola tantas paradas como
    // traiga la paleta elegida, así que una de 11 (viridis, RdBu…) se
    // aprovecha entera, no solo su primer/último tono.
    const paletteSel = document.createElement('select');
    palettesForType(csType).forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.isDefault ? (csType === 'divergent' ? T.paletteDivergent : T.paletteSequential) + ' — ' + T.paletteAppDefault : p.name;
      if (p.id === currentPaletteId) o.selected = true;
      paletteSel.appendChild(o);
    });
    paletteSel.addEventListener('change', () => setColorScaleValue('paletteId', paletteSel.value === defaultPaletteId ? '' : paletteSel.value));
    rows.appendChild(colorScaleRow(T.csPalette, paletteSel));

    // dominio min/max — por defecto el rango real de los datos que trae
    // `colorScaleCfg.domain` (recalculado por el módulo en cada pintado);
    // "restablecer" borra el override entero de una vez, no min y max por
    // separado (evita quedarse con solo uno de los dos personalizado sin
    // querer).
    const [dataMin, dataMax] = colorScaleCfg.domain || [0, 1];
    const domainWrap = document.createElement('div');
    domainWrap.className = 'ce-cs-domain';
    const minInp = document.createElement('input');
    minInp.type = 'number'; minInp.step = 'any'; minInp.value = s.domainMin != null ? s.domainMin : dataMin;
    minInp.setAttribute('aria-label', T.csDomainMin);
    minInp.addEventListener('change', () => { const v = parseFloat(minInp.value); if (Number.isFinite(v)) setColorScaleValue('domainMin', v); });
    const maxInp = document.createElement('input');
    maxInp.type = 'number'; maxInp.step = 'any'; maxInp.value = s.domainMax != null ? s.domainMax : dataMax;
    maxInp.setAttribute('aria-label', T.csDomainMax);
    maxInp.addEventListener('change', () => { const v = parseFloat(maxInp.value); if (Number.isFinite(v)) setColorScaleValue('domainMax', v); });
    domainWrap.appendChild(minInp);
    domainWrap.appendChild(maxInp);
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button'; resetBtn.className = 'ql-btn ql-btn-ghost'; resetBtn.textContent = T.csResetDomain;
    resetBtn.addEventListener('click', () => {
      const s2 = (store.__colorScale = store.__colorScale || {});
      delete s2.domainMin; delete s2.domainMax;
      if (!Object.keys(s2).length) delete store.__colorScale;
      writeStore();
      if (cfg.onColorScaleChange) try { cfg.onColorScaleChange(store.__colorScale || {}); } catch (e) { /* noop */ }
    });
    domainWrap.appendChild(resetBtn);
    rows.appendChild(colorScaleRow(T.csDomain, domainWrap));

    if (csType === 'divergent') {
      const midInp = document.createElement('input');
      midInp.type = 'number'; midInp.step = 'any';
      const defMid = colorScaleCfg.defaultMidpoint != null ? colorScaleCfg.defaultMidpoint : 0;
      midInp.value = s.midpoint != null ? s.midpoint : defMid;
      midInp.addEventListener('change', () => {
        const v = parseFloat(midInp.value);
        if (Number.isFinite(v)) setColorScaleValue('midpoint', v === defMid ? '' : v);
      });
      rows.appendChild(colorScaleRow(T.csMidpoint, midInp));
    }

    const stepsInp = document.createElement('input');
    stepsInp.type = 'number'; stepsInp.min = '0'; stepsInp.max = '20'; stepsInp.step = '1';
    stepsInp.value = s.steps != null ? s.steps : 0;
    stepsInp.addEventListener('change', () => {
      const v = parseInt(stepsInp.value, 10);
      if (!Number.isFinite(v)) return;
      setColorScaleValue('steps', Math.max(0, Math.min(20, v)) || '');
    });
    rows.appendChild(colorScaleRow(T.csSteps, stepsInp));

    const invertChk = document.createElement('input');
    invertChk.type = 'checkbox'; invertChk.checked = !!s.invert;
    invertChk.addEventListener('change', () => setColorScaleValue('invert', invertChk.checked ? true : ''));
    rows.appendChild(colorScaleRow(T.csInvert, invertChk));

    // ---- controles de celda (Paso 4 de qiimelab-prompt-editor-fase-3-
    // heatmaps-escalas-continuas.md) — universales para los 3 heatmaps,
    // aunque el valor por defecto de "valor en celda" lo decide cada
    // módulo (`colorScaleCfg.defaultShowValue`: correlograma/diferencial ya
    // lo dibujaban siempre, así que su valor por defecto es true; beta no
    // lo dibujaba, así que el suyo es false — el prompt pide "mostrar/
    // ocultar" en los 3, no "añadir solo a beta").
    const defShowVal = colorScaleCfg.defaultShowValue !== false;
    const showValChk = document.createElement('input');
    showValChk.type = 'checkbox';
    showValChk.checked = s.showValue != null ? s.showValue : defShowVal;
    showValChk.addEventListener('change', () => setColorScaleValue('showValue', showValChk.checked === defShowVal ? '' : showValChk.checked));
    rows.appendChild(colorScaleRow(T.csShowValue, showValChk));

    const cb = s.cellBorder || null;
    const borderWrap = document.createElement('div');
    borderWrap.className = 'ce-cs-domain'; // mismo layout de fila con varios controles
    const borderChk = document.createElement('input');
    borderChk.type = 'checkbox'; borderChk.checked = !!cb;
    borderChk.setAttribute('aria-label', T.csCellBorder);
    const bColorInp = document.createElement('input');
    bColorInp.type = 'color'; bColorInp.value = isValidHex(cb && cb.color) ? cb.color : '#000000';
    bColorInp.disabled = !borderChk.checked;
    bColorInp.setAttribute('aria-label', T.paletteBorderColor);
    const bWidthInp = document.createElement('input');
    bWidthInp.type = 'number'; bWidthInp.min = '0.5'; bWidthInp.max = '6'; bWidthInp.step = '0.5';
    bWidthInp.value = cb && cb.width != null ? cb.width : 1;
    bWidthInp.disabled = !borderChk.checked;
    bWidthInp.setAttribute('aria-label', T.paletteBorderWidth);
    const commitBorder = () => {
      bColorInp.disabled = !borderChk.checked;
      bWidthInp.disabled = !borderChk.checked;
      if (!borderChk.checked) { setColorScaleValue('cellBorder', ''); return; }
      const w = parseFloat(bWidthInp.value);
      setColorScaleValue('cellBorder', { color: bColorInp.value, width: Number.isFinite(w) ? Math.max(0.5, Math.min(6, w)) : 1 });
    };
    borderChk.addEventListener('change', commitBorder);
    bColorInp.addEventListener('change', commitBorder);
    bWidthInp.addEventListener('change', commitBorder);
    borderWrap.appendChild(borderChk);
    borderWrap.appendChild(bColorInp);
    borderWrap.appendChild(bWidthInp);
    rows.appendChild(colorScaleRow(T.csCellBorder, borderWrap));

    wrap.appendChild(rows);
    return wrap;
  }

  // ---- estructura del gráfico (Fase 4: eje G4, orden de categorías G4,
  // rejilla menor G5, márgenes G3 — qiimelab-prompt-editor-fase-4-ejes-
  // rejilla-leyenda-lienzo.md) — a diferencia del motor --fig-* (Fase 0,
  // nunca repinta) estos SÍ cambian geometría/orden de los datos, así que
  // se resuelven en cfg.onFigureOptionsChange (mismo patrón que
  // onStatsChange/onColorScaleChange: el módulo vuelve a pintar entero).
  function structureOverrides() { return store.__structure || {}; }

  function setStructureValue(id, val) {
    const s = (store.__structure = store.__structure || {});
    if (val === '' || val === undefined || val === null) delete s[id]; else s[id] = val;
    if (!Object.keys(s).length) delete store.__structure;
    writeStore();
    if (cfg.onFigureOptionsChange) try { cfg.onFigureOptionsChange(store.__structure || {}); } catch (e) { /* noop */ }
  }

  function structureRow(labelText, controlEl) {
    const row = document.createElement('div');
    row.className = 'ce-cs-row'; // mismo layout que la sección de escala de color
    const id = 'ce-struct-' + (++cePanelUid);
    const lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = labelText;
    row.appendChild(lab);
    controlEl.id = id;
    row.appendChild(controlEl);
    return row;
  }

  function renderStructureSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-colorscale'; // reutiliza el mismo estilo de sección que "Escala de color"
    wrap.innerHTML = '<h5>' + T.structureTitle + '</h5>';

    const rows = document.createElement('div');
    rows.className = 'ce-cs-rows';
    const s = structureOverrides();

    if (figureOptionsCfg.axis) {
      const [dMin, dMax] = figureOptionsCfg.axis.domain || [0, 1];
      const domainWrap = document.createElement('div');
      domainWrap.className = 'ce-cs-domain';
      const minInp = document.createElement('input');
      minInp.type = 'number'; minInp.step = 'any'; minInp.value = s.axisMin != null ? s.axisMin : dMin;
      minInp.setAttribute('aria-label', T.csDomainMin);
      minInp.addEventListener('change', () => { const v = parseFloat(minInp.value); if (Number.isFinite(v)) setStructureValue('axisMin', v); });
      const maxInp = document.createElement('input');
      maxInp.type = 'number'; maxInp.step = 'any'; maxInp.value = s.axisMax != null ? s.axisMax : dMax;
      maxInp.setAttribute('aria-label', T.csDomainMax);
      maxInp.addEventListener('change', () => { const v = parseFloat(maxInp.value); if (Number.isFinite(v)) setStructureValue('axisMax', v); });
      domainWrap.appendChild(minInp);
      domainWrap.appendChild(maxInp);
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button'; resetBtn.className = 'ql-btn ql-btn-ghost'; resetBtn.textContent = T.csResetDomain;
      resetBtn.addEventListener('click', () => {
        const s2 = (store.__structure = store.__structure || {});
        delete s2.axisMin; delete s2.axisMax;
        if (!Object.keys(s2).length) delete store.__structure;
        writeStore();
        if (cfg.onFigureOptionsChange) try { cfg.onFigureOptionsChange(store.__structure || {}); } catch (e) { /* noop */ }
      });
      domainWrap.appendChild(resetBtn);
      rows.appendChild(structureRow(T.axisDomain, domainWrap));

      if (figureOptionsCfg.axis.log) {
        const logChk = document.createElement('input');
        logChk.type = 'checkbox'; logChk.checked = !!s.axisLog;
        logChk.addEventListener('change', () => setStructureValue('axisLog', logChk.checked ? true : ''));
        rows.appendChild(structureRow(T.axisLog, logChk));
      }
    }

    if (figureOptionsCfg.categoryOrder) {
      const sel = document.createElement('select');
      [
        ['original', T.orderOriginal], ['alpha-asc', T.orderAlphaAsc], ['alpha-desc', T.orderAlphaDesc],
        ['value-asc', T.orderValueAsc], ['value-desc', T.orderValueDesc],
      ].forEach(([val, label]) => {
        const o = document.createElement('option'); o.value = val; o.textContent = label;
        if ((s.categoryOrder || 'original') === val) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => setStructureValue('categoryOrder', sel.value === 'original' ? '' : sel.value));
      rows.appendChild(structureRow(T.categoryOrderLabel, sel));
    }

    if (figureOptionsCfg.gridMinor) {
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = !!s.gridMinor;
      chk.addEventListener('change', () => setStructureValue('gridMinor', chk.checked ? true : ''));
      rows.appendChild(structureRow(T.gridMinorLabel, chk));
    }

    if (figureOptionsCfg.margins) {
      const base = figureOptionsCfg.margins.base || { top: 0, right: 0, bottom: 0, left: 0 };
      const m = s.marginExtra || {};
      const marginWrap = document.createElement('div');
      marginWrap.className = 'ce-cs-domain';
      ['top', 'right', 'bottom', 'left'].forEach((side) => {
        const inp = document.createElement('input');
        inp.type = 'number'; inp.step = '1'; inp.min = '-' + base[side]; inp.max = '200';
        inp.value = m[side] != null ? m[side] : 0;
        inp.setAttribute('aria-label', T.marginSide(side));
        inp.addEventListener('change', () => {
          const v = parseFloat(inp.value);
          if (!Number.isFinite(v)) return;
          const m2 = { ...(structureOverrides().marginExtra || {}) };
          if (v === 0) delete m2[side]; else m2[side] = v;
          setStructureValue('marginExtra', Object.keys(m2).length ? m2 : '');
        });
        marginWrap.appendChild(inp);
      });
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button'; resetBtn.className = 'ql-btn ql-btn-ghost'; resetBtn.textContent = T.csResetDomain;
      resetBtn.addEventListener('click', () => setStructureValue('marginExtra', ''));
      marginWrap.appendChild(resetBtn);
      rows.appendChild(structureRow(T.marginsLabel, marginWrap));
    }

    wrap.appendChild(rows);
    return wrap;
  }

  // ---- estilo de figura (motor de variables CSS de rol --fig-*) ----
  // Puro CSS custom properties sobre el propio <svg>: no repinta nada, así
  // que a diferencia de la paleta de series o la geometría no necesita
  // recalcular nada del gráfico — por eso no hay `cfg.onFigureStyleChange`.
  function figureStyleOverrides() { return store.__figureStyle || {}; }

  function applyFigureStyle() {
    const ov = figureStyleOverrides();
    FIG_STYLE_VARS.forEach((f) => {
      const v = ov[f.id];
      if (v === undefined || v === '') svg.style.removeProperty(f.css);
      else svg.style.setProperty(f.css, f.unit ? (v + f.unit) : String(v));
    });
  }

  function setFigureStyleValue(id, val) {
    const fs = (store.__figureStyle = store.__figureStyle || {});
    if (val === '' || val === undefined || val === null) delete fs[id];
    else fs[id] = val;
    if (!Object.keys(fs).length) delete store.__figureStyle;
    applyFigureStyle();
    writeStoreDebounced();
  }

  /** Valor por defecto para prellenar un control: lee el nodo de rol ya
   *  dibujado en el propio SVG (si existe) para no inventar un número que
   *  luego no coincida con lo que se ve — mismo principio que el color de
   *  serie en `effectiveSeriesColor`. */
  function figStyleDefault(f) {
    if (f.kind === 'font') {
      const node = svg.querySelector('.ql-tick-label, .ql-axis-label');
      return node ? getComputedStyle(node).fontFamily : '';
    }
    if (f.kind === 'dash') return 'none';
    if (f.kind === 'toggle') return true; // visible por defecto — 0 = oculto, el único valor que se persiste
    const node = f.role ? svg.querySelector(f.role) : null;
    if (!node) return f.kind === 'color' ? '#000000' : (f.min ?? 0);
    const cs = getComputedStyle(node);
    if (f.kind === 'color') return toHex(cs[f.prop]);
    return parseFloat(cs[f.prop]) || f.min;
  }

  function figStyleControl(id, ov, ariaLabel) {
    const f = FIG_STYLE_VARS.find((v) => v.id === id);
    const def = figStyleDefault(f);
    if (f.kind === 'toggle') {
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = ov[id] !== 0;
      inp.setAttribute('aria-label', ariaLabel);
      inp.addEventListener('change', () => setFigureStyleValue(id, inp.checked ? '' : 0));
      return inp;
    }
    if (f.kind === 'color') {
      const current = ov[id] || def;
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = isValidHex(current) ? current : '#000000';
      inp.setAttribute('aria-label', ariaLabel);
      inp.addEventListener('input', () => setFigureStyleValue(id, inp.value));
      return inp;
    }
    if (f.kind === 'number') {
      const current = ov[id] !== undefined ? ov[id] : def;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.className = 'tabular';
      inp.min = f.min; inp.max = f.max; inp.step = f.step;
      inp.value = current;
      inp.setAttribute('aria-label', ariaLabel);
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!Number.isFinite(v)) return;
        setFigureStyleValue(id, Math.max(f.min, Math.min(f.max, v)));
      });
      return inp;
    }
    // f.kind === 'dash'
    const current = ov[id] || def;
    const sel = document.createElement('select');
    [['none', T.dashSolid], ['2 2', T.dashDotted], ['4 4', T.dashDashed]].forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (val === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.setAttribute('aria-label', ariaLabel);
    sel.addEventListener('change', () => setFigureStyleValue(id, sel.value === 'none' ? '' : sel.value));
    return sel;
  }

  function figStyleFontRow(ov) {
    const row = document.createElement('div');
    row.className = 'ce-figstyle-row';
    const selId = 'ce-figstyle-font-' + (++cePanelUid);
    const lab = document.createElement('label');
    lab.setAttribute('for', selId);
    lab.textContent = T.font;
    row.appendChild(lab);
    const def = figStyleDefault(FIG_STYLE_VARS.find((v) => v.id === 'font'));
    const sel = document.createElement('select');
    sel.id = selId;
    FONTS.forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if ((ov.font || def) === val) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => setFigureStyleValue('font', sel.value));
    row.appendChild(sel);
    return row;
  }

  function figStyleGroupRow(label, ids, ov) {
    const row = document.createElement('div');
    row.className = 'ce-figstyle-row';
    const lab = document.createElement('label');
    lab.textContent = label;
    row.appendChild(lab);
    const controls = document.createElement('div');
    controls.className = 'ce-figstyle-controls';
    ids.forEach((id) => {
      const suffix = id.endsWith('Color') ? T.color : id.endsWith('Dash') ? T.dashLabel : T.size;
      controls.appendChild(figStyleControl(id, ov, label + ' — ' + suffix));
    });
    row.appendChild(controls);
    return row;
  }

  function renderFigureStyleSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-figstyle';
    wrap.innerHTML = '<h5>' + T.figureStyleTitle + '</h5>';

    const rows = document.createElement('div');
    rows.className = 'ce-figstyle-rows';
    const ov = figureStyleOverrides();

    rows.appendChild(figStyleFontRow(ov));
    rows.appendChild(figStyleGroupRow(T.gridLabel, ['gridColor', 'gridWidth', 'gridDash'], ov));
    rows.appendChild(figStyleSingleRow(T.gridVisibleLabel, 'gridVisible', ov));
    rows.appendChild(figStyleGroupRow(T.axisLabel, ['axisColor', 'axisWidth'], ov));
    rows.appendChild(figStyleGroupRow(T.tickLabel, ['tickColor', 'tickSize'], ov));
    rows.appendChild(figStyleGroupRow(T.axisTitleLabel, ['axisTitleColor', 'axisTitleSize'], ov));
    rows.appendChild(figStyleSingleRow(T.legendVisibleLabel, 'legendVisible', ov));
    rows.appendChild(figStyleGroupRow(T.panelBorderLabel, ['panelBorderColor', 'panelBorderWidth'], ov));
    rows.appendChild(figStyleSingleRow(T.panelBgLabel, 'panelBgColor', ov));
    rows.appendChild(figStyleSingleRow(T.pointsVisibleLabel, 'pointsVisible', ov));

    wrap.appendChild(rows);
    return wrap;
  }

  /** Fila con un único control (toggle/color suelto) — mismo layout que
   *  figStyleGroupRow, pero sin varios controles agrupados bajo una misma
   *  etiqueta. Paso 4 (G5/G6/G3): mostrar/ocultar rejilla, ocultar leyenda,
   *  fondo del panel. */
  function figStyleSingleRow(label, id, ov) {
    const row = document.createElement('div');
    row.className = 'ce-figstyle-row';
    const rowId = 'ce-figstyle-' + id + '-' + (++cePanelUid);
    const lab = document.createElement('label');
    lab.setAttribute('for', rowId);
    lab.textContent = label;
    row.appendChild(lab);
    const controls = document.createElement('div');
    controls.className = 'ce-figstyle-controls';
    const ctl = figStyleControl(id, ov, label);
    ctl.id = rowId;
    controls.appendChild(ctl);
    row.appendChild(controls);
    return row;
  }

  function mkBtn(icon, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon + '<span>' + label + '</span>';
    b.addEventListener('click', onClick);
    return b;
  }

  // ---- pantalla completa: mueve el <svg> real y la barra de herramientas
  // (no una copia) a un modal ancho; al cerrar, vuelven exactamente a su
  // sitio original. sync()/writeStore() no distinguen dónde vive el <svg>
  // en el DOM, así que editar, arrastrar y exportar funcionan igual dentro.
  function openFullscreen() {
    if (fsHandle) { fsHandle.close(); return; }
    const svgHome = { parent: svg.parentNode, next: svg.nextSibling };
    const toolbarHome = { parent: toolbar.parentNode, next: toolbar.nextSibling };
    if (!svgHome.parent || !toolbarHome.parent) return;
    fsHandle = openModalPanel({
      title: T.fullscreenTitle,
      extraClass: 'ql-modal-wide',
      closeLabel: T.close,
      render(bodyEl) {
        const stage = document.createElement('div');
        stage.className = 'ce-fs-stage';
        const svgWrap = document.createElement('div');
        svgWrap.className = 'ce-fs-svgwrap';
        svgWrap.appendChild(svg);
        stage.appendChild(svgWrap);
        stage.appendChild(toolbar);
        bodyEl.appendChild(stage);
        svg.classList.add('ce-fs-svg');
        return () => {
          fsHandle = null;
          svg.classList.remove('ce-fs-svg');
          try { svgHome.parent.insertBefore(svg, svgHome.next); } catch (e) { /* noop */ }
          try { toolbarHome.parent.insertBefore(toolbar, toolbarHome.next); } catch (e) { /* noop */ }
          renderToolbar();
        };
      },
    });
    renderToolbar();
  }

  function setEditing(on) {
    editing = on;
    svg.classList.toggle('ce-editing', on);
    if (!on) { closePanel(); selectedId = null; syncSelection(); }
    renderToolbar();
    sync();
  }

  // ---- crear / envolver elementos y aplicar estado ----
  function ensureEl(spec) {
    let inner = null;
    if (spec.selector) inner = svg.querySelector(spec.selector);
    if (!inner) inner = svg.querySelector('[data-ce="' + spec.id + '"]');
    if (!inner && spec.create) {
      inner = document.createElementNS(NS, 'text');
      inner.textContent = spec.create.text || '';
      inner.setAttribute('x', spec.create.x);
      inner.setAttribute('y', spec.create.y);
      inner.setAttribute('text-anchor', spec.create.anchor || 'middle');
      inner.setAttribute('data-ce', spec.id);
      if (spec.create.cls) inner.setAttribute('class', spec.create.cls);
      svg.appendChild(inner);
    }
    if (!inner) return null;

    // envolver en <g class="ce-el"> si no lo está ya
    let wrap = inner.parentNode;
    if (!(wrap && wrap.classList && wrap.classList.contains('ce-el'))) {
      wrap = document.createElementNS(NS, 'g');
      wrap.setAttribute('class', 'ce-el');
      wrap.setAttribute('data-ce-id', spec.id);
      inner.parentNode.insertBefore(wrap, inner);
      wrap.appendChild(inner);
    }
    wraps.set(spec.id, { wrap, inner, kind: spec.kind || 'text', create: spec.create });
    return wraps.get(spec.id);
  }

  function applyState(id) {
    const w = wraps.get(id);
    if (!w) return;
    const s = store[id] || {};
    w.wrap.setAttribute('transform', 'translate(' + (s.dx || 0) + ',' + (s.dy || 0) + ')');
    const targets = w.kind === 'group' ? w.wrap.querySelectorAll('text, tspan') : [w.inner];
    targets.forEach((el) => {
      el.style.fill = s.fill || '';
      el.style.fontFamily = s.font || '';
      el.style.fontWeight = s.bold ? '700' : (s.bold === false ? '400' : '');
      el.style.fontStyle = s.italic ? 'italic' : (s.italic === false ? 'normal' : '');
      el.style.fontSize = s.size ? s.size + 'px' : '';
    });
    if (w.kind === 'text' && typeof s.text === 'string') w.inner.textContent = s.text;
  }

  function decorate(id) {
    const w = wraps.get(id);
    if (!w) return;
    // quitar hit/outline previos
    w.wrap.querySelectorAll(':scope > .ce-hit, :scope > .ce-outline').forEach((n) => n.remove());
    if (!editing) return;
    let bb;
    try { bb = w.wrap.getBBox(); } catch (e) { return; }
    if (!bb || (bb.width === 0 && bb.height === 0)) return;
    const pad = 5;
    const mk = (cls) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', cls);
      r.setAttribute('x', bb.x - pad); r.setAttribute('y', bb.y - pad);
      r.setAttribute('width', bb.width + pad * 2); r.setAttribute('height', bb.height + pad * 2);
      r.setAttribute('rx', 3);
      return r;
    };
    const outline = mk('ce-outline');
    const hit = mk('ce-hit');
    // accesible por teclado: foco + rol + descripción; flechas mueven, Intro edita
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', T.handle(elLabel(id)));
    w.wrap.appendChild(outline);
    w.wrap.appendChild(hit);
    hit.addEventListener('pointerdown', (e) => startDrag(e, id, hit));
    hit.addEventListener('focus', () => { selectedId = id; syncSelection(); });
    hit.addEventListener('keydown', (e) => onHitKey(e, id, hit));
  }

  // teclado sobre un "tirador": flechas mueven, Mayús multiplica el paso,
  // Intro / Espacio abren el panel de estilo, Escape lo cierra.
  function onHitKey(e, id, hit) {
    if (!editing) return;
    const STEP = e.shiftKey ? 12 : 2;
    let dx = 0, dy = 0;
    switch (e.key) {
      case 'ArrowLeft': dx = -STEP; break;
      case 'ArrowRight': dx = STEP; break;
      case 'ArrowUp': dy = -STEP; break;
      case 'ArrowDown': dy = STEP; break;
      case 'Enter': case ' ': case 'Spacebar':
        e.preventDefault();
        openPanelForHit(id, hit);
        return;
      default:
        return;
    }
    e.preventDefault();
    const s = st(id);
    s.dx = (s.dx || 0) + dx;
    s.dy = (s.dy || 0) + dy;
    const w = wraps.get(id);
    if (w) w.wrap.setAttribute('transform', 'translate(' + s.dx + ',' + s.dy + ')');
    writeStoreDebounced();
  }

  // abre el panel anclado al centro del tirador (no hay puntero en teclado)
  function openPanelForHit(id, hit) {
    let r;
    try { r = hit.getBoundingClientRect(); } catch (err) { r = null; }
    const ev = r
      ? { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
      : null;
    selectAndOpen(id, ev);
    // llevar el foco al primer control editable del panel (no al botón de cerrar)
    if (panel) {
      const first = panel.querySelector('.ce-row input, .ce-row select') || panel.querySelector('button');
      if (first) first.focus();
    }
  }

  function syncSelection() {
    wraps.forEach((w, id) => w.wrap.classList.toggle('ce-selected', id === selectedId && editing));
  }

  /** Re-encuentra, re-envuelve y re-aplica todo. Llamar tras cada re-render del gráfico. */
  function sync() {
    wraps.clear();
    elements.forEach((spec) => ensureEl(spec));
    wraps.forEach((_, id) => applyState(id));
    wraps.forEach((_, id) => decorate(id));
    syncSelection();
    // último paso a propósito: en algún gráfico (p. ej. las etiquetas de
    // grupo del Venn) el mismo <text> es a la vez un elemento de texto
    // arrastrable Y una serie de datos — si hay override de paleta, gana él.
    applyPalette();
    applyFigureStyle();
  }

  // ---- arrastre ----
  function svgScale() {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
      ? svg.viewBox.baseVal.width : r.width;
    return r.width && vb ? r.width / vb : 1;
  }
  function startDrag(e, id, hit) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const s = st(id);
    const scale = svgScale();
    const startX = e.clientX, startY = e.clientY;
    const ox = s.dx || 0, oy = s.dy || 0;
    let moved = 0;
    try { hit.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    const onMove = (ev) => {
      const ddx = (ev.clientX - startX) / scale;
      const ddy = (ev.clientY - startY) / scale;
      moved = Math.max(moved, Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY));
      s.dx = ox + ddx; s.dy = oy + ddy;
      const w = wraps.get(id);
      if (w) w.wrap.setAttribute('transform', 'translate(' + s.dx + ',' + s.dy + ')');
    };
    const onUp = (ev) => {
      hit.removeEventListener('pointermove', onMove);
      hit.removeEventListener('pointerup', onUp);
      hit.removeEventListener('pointercancel', onUp);
      try { hit.releasePointerCapture(ev.pointerId); } catch (err) { /* noop */ }
      if (moved < 3) {
        // clic sin arrastre: si no cambió, no persistas el dx/dy=0 espurio
        if (!s.dx && !s.dy && Object.keys(s).length <= 2) { /* keep */ }
        selectAndOpen(id, ev);
      } else {
        writeStore();
      }
    };
    hit.addEventListener('pointermove', onMove);
    hit.addEventListener('pointerup', onUp);
    hit.addEventListener('pointercancel', onUp);
    selectAndOpen(id, e, true);
  }

  // ---- panel de estilo ----
  function selectAndOpen(id, ev, quiet) {
    selectedId = id;
    syncSelection();
    if (!quiet) openPanel(id, ev);
    else openPanel(id, ev);
  }
  function closePanel() {
    if (panel) { panel.remove(); panel = null; }
  }
  function openPanel(id, ev) {
    closePanel();
    const w = wraps.get(id);
    if (!w) return;
    const s = st(id);
    const cs = getComputedStyle(w.inner);
    panel = document.createElement('div');
    panel.className = 'ce-panel';
    panel.innerHTML = '<h4><span>' + elLabel(id) + '</span><button type="button" aria-label="' + T.close + '">×</button></h4>';

    const rows = document.createElement('div');
    panel.appendChild(rows);

    if (w.kind === 'text') {
      const rText = row(T.text);
      const inpText = document.createElement('input');
      inpText.type = 'text';
      inpText.value = (typeof s.text === 'string') ? s.text : w.inner.textContent;
      inpText.addEventListener('input', () => { s.text = inpText.value; w.inner.textContent = inpText.value; decorate(id); writeStoreDebounced(); });
      rText.appendChild(inpText);
      rows.appendChild(rText);
    }

    const rColor = row(T.color);
    const inpColor = document.createElement('input');
    inpColor.type = 'color';
    inpColor.value = toHex(s.fill || cs.fill);
    const inpColorHex = document.createElement('input');
    inpColorHex.type = 'text';
    inpColorHex.className = 'ce-hexfield';
    inpColorHex.setAttribute('aria-label', T.color + ' — ' + T.hex);
    inpColorHex.placeholder = '#RRGGBB';
    inpColorHex.value = inpColor.value.toUpperCase();
    inpColor.addEventListener('input', () => { s.fill = inpColor.value; inpColorHex.value = inpColor.value.toUpperCase(); applyState(id); writeStoreDebounced(); });
    inpColorHex.addEventListener('input', () => {
      let v = inpColorHex.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (!isValidHex(v)) return;
      inpColor.value = v; s.fill = v; applyState(id); writeStoreDebounced();
    });
    rColor.appendChild(inpColor);
    rColor.appendChild(inpColorHex);
    rows.appendChild(rColor);

    const rFont = row(T.font);
    const sel = document.createElement('select');
    FONTS.forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (s.font === val) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { s.font = sel.value; applyState(id); decorate(id); writeStore(); });
    rFont.appendChild(sel);
    rows.appendChild(rFont);

    const rSize = row(T.size);
    const inpSize = document.createElement('input');
    inpSize.type = 'number'; inpSize.min = '8'; inpSize.max = '36'; inpSize.step = '1';
    inpSize.value = Math.round(parseFloat(s.size || cs.fontSize) || 12);
    inpSize.addEventListener('input', () => {
      let v = parseInt(inpSize.value, 10);
      if (!isFinite(v)) return;
      v = Math.max(8, Math.min(36, v));
      s.size = v; applyState(id); decorate(id); writeStoreDebounced();
    });
    rSize.appendChild(inpSize);
    rows.appendChild(rSize);

    const rTog = row('');
    const togWrap = document.createElement('div');
    togWrap.className = 'ce-toggles';
    const bB = document.createElement('button'); bB.type = 'button'; bB.textContent = 'B'; bB.style.fontWeight = '700';
    bB.setAttribute('aria-label', T.bold);
    const bI = document.createElement('button'); bI.type = 'button'; bI.textContent = 'I'; bI.style.fontStyle = 'italic';
    bI.setAttribute('aria-label', T.italic);
    const isBold = s.bold ?? (parseInt(cs.fontWeight, 10) >= 600);
    const isItalic = s.italic ?? (cs.fontStyle === 'italic');
    bB.classList.toggle('on', !!isBold); bB.setAttribute('aria-pressed', String(!!isBold));
    bI.classList.toggle('on', !!isItalic); bI.setAttribute('aria-pressed', String(!!isItalic));
    bB.addEventListener('click', () => { const on = !bB.classList.contains('on'); s.bold = on; bB.classList.toggle('on', on); bB.setAttribute('aria-pressed', String(on)); applyState(id); decorate(id); writeStore(); });
    bI.addEventListener('click', () => { const on = !bI.classList.contains('on'); s.italic = on; bI.classList.toggle('on', on); bI.setAttribute('aria-pressed', String(on)); applyState(id); decorate(id); writeStore(); });
    togWrap.appendChild(bB); togWrap.appendChild(bI);
    rTog.appendChild(togWrap);
    rows.appendChild(rTog);

    // posiciones predefinidas de leyenda (Paso 4 G6 de qiimelab-prompt-
    // editor-fase-4-ejes-rejilla-leyenda-lienzo.md) — reutiliza el MISMO
    // mecanismo de arrastre (s.dx/s.dy) en vez de recalcular el layout: el
    // módulo aporta unos pocos desplazamientos ya sensatos relativos a la
    // posición natural en la que él mismo dibuja la leyenda.
    if (id === 'legend' && Array.isArray(cfg.legendPositions) && cfg.legendPositions.length) {
      const rPos = row(T.legendPosition);
      const posWrap = document.createElement('div');
      posWrap.className = 'ce-toggles';
      cfg.legendPositions.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = p.label;
        b.addEventListener('click', () => {
          s.dx = p.dx; s.dy = p.dy;
          w.wrap.setAttribute('transform', 'translate(' + s.dx + ',' + s.dy + ')');
          writeStoreDebounced();
        });
        posWrap.appendChild(b);
      });
      rPos.appendChild(posWrap);
      rows.appendChild(rPos);
    }

    // enlazar cada <label> de fila con su control (accesibilidad del panel)
    panel.querySelectorAll('.ce-row').forEach((r) => {
      const lab = r.querySelector(':scope > label');
      const ctl = r.querySelector('input, select');
      if (lab && ctl && lab.textContent.trim()) {
        if (!ctl.id) ctl.id = 'ce-f-' + (++cePanelUid);
        lab.setAttribute('for', ctl.id);
      }
    });

    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', elLabel(id));
    document.body.appendChild(panel);
    positionPanel(ev);
    panel.querySelector('h4 button').addEventListener('click', () => {
      closePanel(); selectedId = null; syncSelection();
      const w = wraps.get(id);
      const hit = w && w.wrap.querySelector(':scope > .ce-hit');
      if (hit) try { hit.focus(); } catch (e) { /* noop */ }
    });
  }
  function elLabel(id) {
    const es = lang === 'es';
    const map = { title: es ? 'Título de la figura' : 'Figure title',
                  xtitle: es ? 'Título eje X' : 'X axis title',
                  ytitle: es ? 'Título eje Y' : 'Y axis title',
                  legend: es ? 'Leyenda' : 'Legend' };
    if (map[id]) return map[id];
    if (/^grp\d+$/.test(id) || /^set\d+$/.test(id)) return es ? 'Etiqueta de grupo' : 'Group label';
    return id;
  }
  function row(label) {
    const r = document.createElement('div');
    r.className = 'ce-row';
    if (label) { const l = document.createElement('label'); l.textContent = label; r.appendChild(l); }
    else { const l = document.createElement('label'); l.textContent = ''; r.appendChild(l); }
    return r;
  }
  function positionPanel(ev) {
    if (!panel) return;
    const pr = panel.getBoundingClientRect();
    let x = (ev && ev.clientX ? ev.clientX + 16 : window.innerWidth / 2);
    let y = (ev && ev.clientY ? ev.clientY - 10 : 120);
    x = Math.min(x, window.innerWidth - pr.width - 12);
    y = Math.min(Math.max(12, y), window.innerHeight - pr.height - 12);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  let debTimer = null;
  function writeStoreDebounced() {
    clearTimeout(debTimer);
    debTimer = setTimeout(writeStore, 300);
  }

  // clic fuera → cerrar panel
  function onDocDown(e) {
    if (!editing) return;
    if (panel && (panel.contains(e.target))) return;
    if (svg.contains(e.target)) return; // clics dentro del svg los gestiona el hit
    closePanel(); selectedId = null; syncSelection();
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const back = selectedId;
    closePanel(); selectedId = null; syncSelection();
    // devolver el foco al tirador que abrió el panel (navegación solo-teclado)
    if (back && editing) {
      const w = wraps.get(back);
      const hit = w && w.wrap.querySelector(':scope > .ce-hit');
      if (hit) try { hit.focus(); } catch (err) { /* noop */ }
    }
  }
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey);

  // ---- reset ----
  function resetAll() {
    store = {};
    try {
      localStorage.removeItem(LSKEY);
      localStorage.removeItem(LEGACY_LSKEY);
    } catch (e) { /* noop */ }
    closePanel();
    selectedId = null;
    if (cfg.onReset) { cfg.onReset(); return; } // el módulo re-renderiza
    // fallback: limpiar in situ
    wraps.forEach((w, id) => {
      w.wrap.setAttribute('transform', 'translate(0,0)');
      const targets = w.kind === 'group' ? w.wrap.querySelectorAll('text, tspan') : [w.inner];
      targets.forEach((el) => { el.style.cssText = ''; });
      if (w.create && typeof w.create.text === 'string') w.inner.textContent = w.create.text;
    });
    sync();
    if (cfg.onChange) try { cfg.onChange(); } catch (e) {}
    renderToolbar();
  }

  // ---- exportar SVG/PNG/TIFF vía js/lib/figureExport.js (Paso 3 de
  // qiimelab-prompt-editor-fase-0-fundamentos.md): siempre en esquema claro
  // y sin var()/color() residual, con independencia del tema activo. SVG es
  // síncrono (solo serialización DOM); PNG/TIFF son async (decodifican la
  // figura en un <canvas> antes de poder leer sus bytes).
  function downloadFilename(ext) { return sanitizeFilename(filename, 'smart175_figura') + '.' + ext; }

  function triggerDownload(data, mime, name) {
    try {
      const blob = new Blob([data], { type: mime });
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        if (document.body) document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } }, 4000);
      }
    } catch (e) { /* entorno restringido / headless */ }
  }

  // ---- ancho de exportación físico (mm) -- Paso 3: un preset de revista
  // fija store.__export.widthMm; también editable a mano en el toolbar. ----
  function getExportWidthMm() { return (store.__export && store.__export.widthMm) || null; }
  function setExportWidthMm(mm) {
    if (mm > 0) store.__export = { widthMm: mm }; else delete store.__export;
    writeStoreDebounced();
  }

  function serialize() {
    return serializeForExport(svg, { scheme: 'light', background: 'white', widthMm: getExportWidthMm() }).svg;
  }

  function downloadSvg() {
    const str = serialize();
    triggerDownload(str, 'image/svg+xml;charset=utf-8', downloadFilename('svg'));
    return str;
  }

  async function downloadPng() {
    const res = await exportFigure(svg, { formats: ['png'], scheme: 'light', background: 'white', dpi: 300, widthMm: getExportWidthMm() });
    triggerDownload(res.png, 'image/png', downloadFilename('png'));
    return res;
  }

  async function downloadTiff() {
    const res = await exportFigure(svg, { formats: ['tiff'], scheme: 'light', background: 'white', dpi: 300, widthMm: getExportWidthMm() });
    triggerDownload(res.tiff, 'image/tiff', downloadFilename('tiff'));
    return res;
  }

  // ---- Presets (Fase 6 Paso 1/3): aplicar es sobreescribir `store` con el
  // contenido del preset (remapeando __palette por POSICIÓN si el nº de
  // series no coincide) y llamar a writeStore()+sync() -- cero código de
  // bajo nivel nuevo, reutiliza exactamente lo que ya existe para leer/
  // escribir `store`. ----
  function applyPresetSnapshot(preset) {
    const cloned = JSON.parse(JSON.stringify(preset.store || {}));
    if (cloned.__palette) {
      const order = Array.isArray(preset.seriesOrder) ? preset.seriesOrder : Object.keys(cloned.__palette);
      const newPal = {};
      if (paletteSeries.length) {
        const n = Math.min(order.length, paletteSeries.length);
        for (let i = 0; i < n; i++) {
          const oldId = order[i], newId = paletteSeries[i].id;
          if (cloned.__palette[oldId] !== undefined) newPal[newId] = cloned.__palette[oldId];
        }
      }
      if (Object.keys(newPal).length) cloned.__palette = newPal; else delete cloned.__palette;
    }
    store = cloned;
    writeStore();
    sync();
  }

  function savePresetAs(name) {
    if (!name || !name.trim()) return;
    const all = readPresets();
    const id = 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    all[id] = {
      id, name: name.trim(), builtin: false, savedAt: Date.now(),
      seriesOrder: paletteSeries.map((s) => s.id),
      store: JSON.parse(JSON.stringify(store)),
    };
    writePresets(all);
    renderToolbar();
  }

  function deleteUserPreset(id) {
    const all = readPresets();
    delete all[id];
    writePresets(all);
    renderToolbar();
  }

  function renderPresetsSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-presets ce-colorscale'; // reutiliza el estilo de sección de "Escala de color"/"Estructura"
    wrap.innerHTML = '<h5>' + T.presetsTitle + '</h5>';

    // ancho de exportación
    const widthRow = document.createElement('div');
    widthRow.className = 'ce-cs-row';
    const widthId = 'ce-exportwidth-' + (++cePanelUid);
    const widthLab = document.createElement('label');
    widthLab.setAttribute('for', widthId);
    widthLab.textContent = T.exportWidthLabel;
    const widthInp = document.createElement('input');
    widthInp.type = 'number'; widthInp.id = widthId; widthInp.min = '10'; widthInp.max = '400'; widthInp.step = '1';
    widthInp.value = getExportWidthMm() || '';
    widthInp.addEventListener('change', () => setExportWidthMm(parseFloat(widthInp.value) || null));
    widthRow.appendChild(widthLab); widthRow.appendChild(widthInp);
    wrap.appendChild(widthRow);
    const widthHelp = document.createElement('p');
    widthHelp.className = 'ce-hint';
    widthHelp.textContent = T.exportWidthHelp;
    wrap.appendChild(widthHelp);

    // guardar preset actual
    const saveRow = document.createElement('div');
    saveRow.className = 'ce-cs-row';
    const nameInp = document.createElement('input');
    nameInp.type = 'text'; nameInp.placeholder = T.presetNamePlaceholder; nameInp.setAttribute('aria-label', T.presetSaveLabel);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'ql-btn';
    saveBtn.textContent = T.presetSaveBtn;
    saveBtn.addEventListener('click', () => { savePresetAs(nameInp.value); nameInp.value = ''; });
    saveRow.appendChild(nameInp); saveRow.appendChild(saveBtn);
    wrap.appendChild(saveRow);

    // presets del usuario
    const userPresets = Object.values(readPresets()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    if (!userPresets.length) {
      const noneP = document.createElement('p');
      noneP.className = 'ce-hint';
      noneP.textContent = T.presetNone;
      wrap.appendChild(noneP);
    } else {
      userPresets.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'ce-cs-row';
        const lab = document.createElement('span');
        lab.textContent = p.name;
        lab.style.flex = '1 1 auto';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button'; applyBtn.className = 'ql-btn';
        applyBtn.textContent = T.presetApplyBtn;
        applyBtn.addEventListener('click', () => applyPresetSnapshot(p));
        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'ql-btn ql-btn-ghost';
        delBtn.textContent = T.presetDeleteBtn;
        delBtn.setAttribute('aria-label', T.presetDeleteBtn + ': ' + p.name);
        delBtn.addEventListener('click', () => deleteUserPreset(p.id));
        row.appendChild(lab); row.appendChild(applyBtn); row.appendChild(delBtn);
        wrap.appendChild(row);
      });
    }

    // presets de revista (Paso 3): no editables, reaplicar siempre vuelve a
    // la especificación oficial
    const journalH5 = document.createElement('h5');
    journalH5.textContent = T.presetJournalTitle;
    wrap.appendChild(journalH5);
    const journalHelp = document.createElement('p');
    journalHelp.className = 'ce-hint';
    journalHelp.textContent = T.presetJournalHelp;
    wrap.appendChild(journalHelp);
    const journalRow = document.createElement('div');
    journalRow.className = 'ce-cs-row';
    Object.values(JOURNAL_PRESETS).forEach((jp) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ql-btn';
      b.textContent = (jp.journal === 'nature' ? T.presetNatureLabel : T.presetCellLabel)(jp.widthMm);
      b.addEventListener('click', () => applyPresetSnapshot(jp));
      journalRow.appendChild(b);
    });
    wrap.appendChild(journalRow);

    return wrap;
  }

  function toHex(color) {
    if (!color) return '#000000';
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    const m = color.match(/rgba?\(([^)]+)\)/i);
    if (!m) return '#000000';
    const [r, g, b] = m[1].split(',').map((x) => parseInt(x, 10));
    return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x || 0)).toString(16).padStart(2, '0')).join('');
  }

  // ---- init ----
  if (editing) svg.classList.add('ce-editing'); // startEditing: ver más arriba
  renderToolbar();
  sync();

  return {
    sync,
    serialize,
    download: downloadSvg,
    downloadPng,
    isDirty: () => Object.keys(store).length > 0,
    isEditing: () => editing,
    destroy() {
      if (fsHandle) fsHandle.close(); // devuelve el <svg>/toolbar a casa antes de que el módulo limpie su contenedor
      clearTimeout(debTimer);
      closePanel();
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey);
      svg.classList.remove('ce-editing');
      toolbar.remove();
      svg.querySelectorAll('.ce-hit, .ce-outline').forEach((n) => n.remove());
    },
  };
}

/**
 * Sanitiza nombres de archivo para descargas de figuras científicas.
 */
export function sanitizeFilename(filename, defaultName = 'smart175_figura') {
  if (!filename || typeof filename !== 'string') return defaultName;
  let name = filename.trim().replace(/\.(svg|png)$/i, '');
  const clean = name.replace(/[^a-z0-9_\u00C0-\u024F-]+/gi, '_').replace(/^_+|_+$/g, '');
  return clean || defaultName;
}

/**
 * Copia estilos calculados (fills, strokes, tipografías) a atributos inline del clon
 * para garantizar que el SVG conserve su aspecto exacto fuera de la aplicación.
 */
export function inlineComputedStyles(srcRoot, dstRoot) {
  if (!srcRoot || !dstRoot) return;
  const getCS = (typeof getComputedStyle === 'function')
    ? getComputedStyle
    : ((typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') ? window.getComputedStyle : null);
  if (!getCS) return;

  const src = srcRoot.querySelectorAll ? srcRoot.querySelectorAll('*') : [];
  const dst = dstRoot.querySelectorAll ? dstRoot.querySelectorAll('*') : [];
  const props = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
    'stroke-linejoin', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight',
    'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'stop-color', 'stop-opacity'
  ];
  const copy = (a, b) => {
    try {
      const cs = getCS(a);
      if (!cs) return;
      let decl = '';
      props.forEach((p) => {
        const v = cs.getPropertyValue ? cs.getPropertyValue(p) : cs[p];
        if (v && v !== 'normal' && v !== 'none' || (p === 'fill' && v)) {
          if (v) decl += p + ':' + v + ';';
        }
      });
      if (decl && b.setAttribute) {
        const prev = b.getAttribute('style') || '';
        b.setAttribute('style', decl + prev);
      }
    } catch (e) {}
  };
  copy(srcRoot, dstRoot);
  for (let i = 0; i < src.length && i < dst.length; i++) {
    if (dst[i].classList && (dst[i].classList.contains('ce-hit') || dst[i].classList.contains('ce-outline'))) continue;
    copy(src[i], dst[i]);
  }
}

/**
 * Serializa un nodo SVG a XML estándar, incrustando estilos calculados y
 * añadiendo un fondo blanco sólido (#ffffff) permanente para revistas científicas.
 */
export function serializeSvg(svgEl) {
  if (!svgEl) return '';
  const clone = svgEl.cloneNode(true);
  if (clone.classList && clone.classList.remove) {
    clone.classList.remove('ce-editing');
  }
  if (clone.querySelectorAll) {
    clone.querySelectorAll('.ce-hit, .ce-outline').forEach((n) => n.remove());
    clone.querySelectorAll('.ce-el').forEach((g) => {
      if (g.classList && g.classList.remove) g.classList.remove('ce-selected');
    });
  }
  inlineComputedStyles(svgEl, clone);

  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  let w = vb && vb.width ? vb.width : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().width : 0);
  let h = vb && vb.height ? vb.height : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().height : 0);
  if (!w || !h) {
    w = parseFloat(svgEl.getAttribute('width')) || 800;
    h = parseFloat(svgEl.getAttribute('height')) || 600;
  }
  w = Math.round(w);
  h = Math.round(h);

  clone.setAttribute('xmlns', NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  if (!clone.getAttribute('viewBox')) {
    const vx = vb && vb.x !== undefined ? vb.x : 0;
    const vy = vb && vb.y !== undefined ? vb.y : 0;
    clone.setAttribute('viewBox', `${vx} ${vy} ${w} ${h}`);
  }
  clone.removeAttribute('style');

  // Fondo blanco sólido (#ffffff) permanente para publicación científica
  if (clone.querySelectorAll) {
    clone.querySelectorAll('.ce-export-bg').forEach((n) => n.remove());
  }
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('class', 'ce-export-bg');
  const vx = vb && vb.x !== undefined ? vb.x : 0;
  const vy = vb && vb.y !== undefined ? vb.y : 0;
  bg.setAttribute('x', String(vx));
  bg.setAttribute('y', String(vy));
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  let serializer;
  if (typeof XMLSerializer !== 'undefined') {
    serializer = new XMLSerializer();
  } else if (typeof globalThis !== 'undefined' && globalThis.XMLSerializer) {
    serializer = new globalThis.XMLSerializer();
  }
  let str = serializer ? serializer.serializeToString(clone) : (clone.outerHTML || '');
  if (!str.startsWith('<?xml')) {
    str = '<?xml version="1.0" encoding="UTF-8"?>\n' + str;
  }
  return str;
}

/**
 * Exporta un elemento SVG a archivo vectorial .svg con descarga automática en el navegador.
 *
 * @param {SVGElement} svgEl - Elemento SVG a exportar
 * @param {string} [filename='smart175_figura'] - Nombre de archivo
 * @returns {{ str: string, filename: string, blob: Blob|null }}
 */
export function exportSvg(svgEl, filename = 'smart175_figura') {
  if (!svgEl) {
    throw new Error('No SVG element provided for exportSvg');
  }
  const str = serializeSvg(svgEl);
  const downloadName = sanitizeFilename(filename, 'smart175_figura') + '.svg';
  let blob = null;

  try {
    blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.style.display = 'none';
      if (document.body) {
        document.body.appendChild(a);
      }
      a.click();
      a.remove();
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }, 4000);
    }
  } catch (e) {
    // Entorno restringido / headless
  }

  return { str, filename: downloadName, blob };
}

/**
 * Exporta un elemento SVG a imagen rasterizada PNG en alta resolución (300+ dpi)
 * renderizando en un <canvas> escalado en memoria con fondo blanco sólido (#ffffff).
 *
 * @param {SVGElement} svgEl - Elemento SVG a exportar
 * @param {string} [filename='smart175_figura'] - Nombre de archivo
 * @param {number} [scale=4] - Factor de escala para 300+ dpi (por defecto 4x)
 * @returns {Promise<{ canvas: HTMLCanvasElement, dataUrl: string, filename: string, width: number, height: number, scale: number }>}
 */
export function exportPng(svgEl, filename = 'smart175_figura', scale = 4) {
  return new Promise((resolve, reject) => {
    try {
      if (!svgEl) {
        throw new Error('No SVG element provided for exportPng');
      }

      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      let w = vb && vb.width ? vb.width : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().width : 0);
      let h = vb && vb.height ? vb.height : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().height : 0);
      if (!w || !h) {
        w = parseFloat(svgEl.getAttribute('width')) || 800;
        h = parseFloat(svgEl.getAttribute('height')) || 600;
      }
      w = Math.round(w);
      h = Math.round(h);

      const targetScale = Math.max(1, Number(scale) || 4);
      const str = serializeSvg(svgEl);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * targetScale);
      canvas.height = Math.round(h * targetScale);

      const ctx = canvas.getContext ? canvas.getContext('2d') : null;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const downloadName = sanitizeFilename(filename, 'smart175_figura') + '.png';
      const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
      const url = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
        ? URL.createObjectURL(blob)
        : ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str));

      const img = (typeof Image !== 'undefined') ? new Image() : (globalThis.Image ? new globalThis.Image() : null);
      if (!img) {
        throw new Error('Image constructor is not available');
      }

      img.onload = () => {
        try {
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          if (url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(url);
          }

          let dataUrl = '';
          if (typeof canvas.toDataURL === 'function') {
            dataUrl = canvas.toDataURL('image/png');
          }

          if (dataUrl && typeof document !== 'undefined') {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = downloadName;
            a.style.display = 'none';
            if (document.body) {
              document.body.appendChild(a);
            }
            a.click();
            a.remove();
          }

          resolve({
            canvas,
            dataUrl,
            filename: downloadName,
            width: canvas.width,
            height: canvas.height,
            scale: targetScale,
          });
        } catch (err) {
          if (url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            try { URL.revokeObjectURL(url); } catch (e) {}
          }
          reject(err);
        }
      };

      img.onerror = (err) => {
        if (url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try { URL.revokeObjectURL(url); } catch (e) {}
        }
        reject(err || new Error('Error decodificando imagen SVG para exportar a PNG'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

// =========================================================================
//  INFRAESTRUCTURA DEL EDITOR GRÁFICO GLOBAL (<dialog> MODAL)
// =========================================================================

/**
 * Abre un diálogo modal <dialog> amplio para editar en tiempo real los
 * parámetros de tipografía, colores y geometría de una gráfica.
 *
 * @param {Element|string} chartRef - Referencia al SVG, contenedor o clave del gráfico
 * @param {Object} [configOptions] - Parámetros de configuración iniciales
 * @param {Function} [onUpdate] - Callback en tiempo real (currentConfig, changedKey, changedValue)
 * @returns {{ dialog: HTMLDialogElement, close: () => void }}
 */
/**
 * @deprecated Vía de edición legacy — ver la nota de arquitectura al
 * principio del archivo (22 sep 2026). Sin uso en el repo desde que el
 * diagrama aluvial de taxaBarplot.js migró a `attachChartEditor` +
 * `cfg.geometrySliders`. No añadir casos de uso nuevos; se conserva el
 * código por ahora como red de seguridad, no como API recomendada.
 */
export function openChartEditor(chartRef, configOptions = {}, onUpdate = () => {}) {
  // 1. Cerrar cualquier diálogo de edición previo para evitar duplicados
  const prevDialog = document.querySelector('dialog.ql-chart-editor-dialog');
  if (prevDialog) {
    try { prevDialog.close(); } catch (e) {}
    prevDialog.remove();
  }

  let svgEl = null;
  if (chartRef) {
    if (typeof chartRef === 'object' && chartRef.tagName) {
      svgEl = chartRef.tagName.toLowerCase() === 'svg' ? chartRef : (chartRef.querySelector ? chartRef.querySelector('svg') : null);
    } else if (typeof chartRef === 'string') {
      const found = document.querySelector(chartRef);
      if (found) svgEl = found.tagName.toLowerCase() === 'svg' ? found : found.querySelector('svg');
    }
  }

  // 2. Clon de configuración y valores por defecto
  const typography = Object.assign({
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    isBold: false,
    isItalic: false,
  }, configOptions.typography || {});

  const colors = Object.assign({
    palette: 'categorical',
    series: [],
    linkOpacity: 0.4,
  }, configOptions.colors || {});

  const geometry = Object.assign({
    nodeWidth: 20,
    nodeGap: 2,
    linkOpacity: 0.4,
    sliders: [],
  }, configOptions.geometry || {});

  // Sliders por defecto para diagrama aluvial si no se especificaron
  if (geometry.sliders.length === 0 && (configOptions.chartType === 'alluvial' || geometry.nodeWidth !== undefined)) {
    geometry.sliders = [
      { id: 'nodeWidth', key: 'nodeWidth', label: 'Ancho de los nodos/barras', min: 6, max: 60, step: 2, value: geometry.nodeWidth || 20, unit: 'px' },
      { id: 'nodeGap', key: 'nodeGap', label: 'Separación entre nodos', min: 0, max: 14, step: 1, value: geometry.nodeGap ?? 2, unit: 'px' },
      { id: 'linkOpacity', key: 'linkOpacity', label: 'Opacidad de los flujos', min: 0.1, max: 0.95, step: 0.05, value: geometry.linkOpacity ?? colors.linkOpacity ?? 0.4, isPercent: true },
    ];
  }

  const currentConfig = {
    title: configOptions.title || 'Ajustes de la gráfica',
    subtitle: configOptions.subtitle || 'Modifica tipografía, colores y geometría con previsualización en tiempo real.',
    chartType: configOptions.chartType || 'generic',
    typography,
    colors,
    geometry,
  };

  const initialConfig = JSON.parse(JSON.stringify(currentConfig));

  function notify(key, val) {
    if (typeof onUpdate === 'function') {
      try {
        onUpdate(key, val, currentConfig);
      } catch (err) {
        console.warn('onUpdate callback error:', err);
      }
    }
  }

  // 3. Crear el elemento nativo <dialog>
  const dialog = document.createElement('dialog');
  dialog.className = 'ql-chart-editor-dialog';
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('role', 'dialog');

  // Cabecera
  const header = document.createElement('header');
  header.className = 'ql-ce-dialog-header';
  header.innerHTML = `
    <div>
      <h2 class="ql-ce-dialog-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>${escapeHtml(currentConfig.title)}</span>
      </h2>
      <p class="ql-ce-dialog-subtitle">${escapeHtml(currentConfig.subtitle)}</p>
    </div>
    <button type="button" class="ql-ce-dialog-close" title="Cerrar" aria-label="Cerrar">✕</button>
  `;
  dialog.appendChild(header);

  // Navegación de pestañas (Tipografía | Colores | Geometría)
  const nav = document.createElement('nav');
  nav.className = 'ql-ce-dialog-nav';
  const tabs = [
    { id: 'geometry', label: 'Geometría' },
    { id: 'typography', label: 'Tipografía' },
    { id: 'colors', label: 'Colores' },
  ];
  let activeTab = 'geometry';

  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ql-ce-tab-btn' + (t.id === activeTab ? ' is-active' : '');
    btn.textContent = t.label;
    btn.setAttribute('data-tab', t.id);
    btn.addEventListener('click', () => {
      activeTab = t.id;
      dialog.querySelectorAll('.ql-ce-tab-btn').forEach((b) => {
        b.classList.toggle('is-active', b.getAttribute('data-tab') === activeTab);
      });
      dialog.querySelectorAll('.ql-ce-tab-panel').forEach((p) => {
        p.classList.toggle('is-active', p.getAttribute('data-panel') === activeTab);
      });
    });
    nav.appendChild(btn);
  });
  dialog.appendChild(nav);

  // Cuerpo con paneles
  const body = document.createElement('div');
  body.className = 'ql-ce-dialog-body';

  // --- PANEL 1: GEOMETRÍA ---
  const panelGeom = document.createElement('div');
  panelGeom.className = 'ql-ce-tab-panel' + (activeTab === 'geometry' ? ' is-active' : '');
  panelGeom.setAttribute('data-panel', 'geometry');

  if (currentConfig.geometry.sliders && currentConfig.geometry.sliders.length > 0) {
    currentConfig.geometry.sliders.forEach((sl) => {
      const sliderField = document.createElement('div');
      sliderField.className = 'ql-field';
      const val = sl.isPercent ? Math.round(sl.value * 100) : sl.value;
      const min = sl.isPercent ? Math.round(sl.min * 100) : sl.min;
      const max = sl.isPercent ? Math.round(sl.max * 100) : sl.max;
      const step = sl.isPercent ? Math.round(sl.step * 100) : sl.step;
      const unit = sl.isPercent ? '%' : (sl.unit || '');

      sliderField.innerHTML = `<label for="ql-ce-sl-${sl.id}">${escapeHtml(sl.label)}${unit ? ' (' + unit + ')' : ''}</label>` +
        `<div class="ql-inputrow">` +
        `<input type="range" id="ql-ce-sl-${sl.id}-r" min="${min}" max="${max}" step="${step}" value="${val}">` +
        `<input type="number" id="ql-ce-sl-${sl.id}" class="ql-num-small tabular" min="${min}" max="${max}" step="${step}" value="${val}">` +
        `</div>`;

      const rInput = sliderField.querySelector(`#ql-ce-sl-${sl.id}-r`);
      const nInput = sliderField.querySelector(`#ql-ce-sl-${sl.id}`);

      const onSliderChange = (rawVal) => {
        const num = parseFloat(rawVal);
        const actualVal = sl.isPercent ? num / 100 : num;
        sl.value = actualVal;
        currentConfig.geometry[sl.key || sl.id] = actualVal;
        rInput.value = num;
        nInput.value = num;
        notify(sl.key || sl.id, actualVal);
      };

      rInput.addEventListener('input', () => onSliderChange(rInput.value));
      nInput.addEventListener('change', () => onSliderChange(nInput.value));

      panelGeom.appendChild(sliderField);
    });
  }
  body.appendChild(panelGeom);

  // --- PANEL 2: TIPOGRAFÍA Y TÍTULOS ---
  const panelTypo = document.createElement('div');
  panelTypo.className = 'ql-ce-tab-panel' + (activeTab === 'typography' ? ' is-active' : '');
  panelTypo.setAttribute('data-panel', 'typography');

  // Sección de Títulos globales del gráfico y ejes
  const modalTitleDefs = [
    { id: 'title', label: 'Título del Gráfico', inputId: 'ql-ce-title-input', selector: '.ql-chart-main-title, .ce-title, [data-ce="title"]' },
    { id: 'xtitle', label: 'Título Eje X', inputId: 'ql-ce-xtitle-input', selector: '.ql-chart-x-title, [data-ce="xtitle"]' },
    { id: 'ytitle', label: 'Título Eje Y', inputId: 'ql-ce-ytitle-input', selector: '.ql-chart-y-title, [data-ce="ytitle"]' },
  ];

  const titlesSection = document.createElement('div');
  titlesSection.className = 'ql-field ql-ce-titles-container';
  titlesSection.innerHTML = '<label style="font-weight:600;">Títulos de la figura</label>' +
    '<p class="ql-field-help" style="margin-bottom:8px;">Edición reactiva de títulos en tiempo real.</p>';

  const titleRows = document.createElement('div');
  titleRows.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:6px;margin-bottom:14px;';

  modalTitleDefs.forEach((td) => {
    const subField = document.createElement('div');
    subField.className = 'ql-field';
    subField.style.marginBottom = '6px';

    const lab = document.createElement('label');
    lab.setAttribute('for', td.inputId);
    lab.textContent = td.label;
    subField.appendChild(lab);

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = td.inputId;
    inp.className = 'ql-input ' + td.inputId;
    inp.placeholder = td.label;

    if (svgEl) {
      const match = svgEl.querySelector(td.selector);
      if (match && match.textContent) inp.value = match.textContent.trim();
    }
    if (!inp.value && configOptions[td.id]) {
      inp.value = configOptions[td.id];
    }

    inp.addEventListener('input', () => {
      const val = inp.value;
      if (svgEl) {
        const matches = svgEl.querySelectorAll(td.selector);
        matches.forEach((el) => { el.textContent = val; });
      }
      currentConfig[td.id] = val;
      notify(td.id, val);
    });

    subField.appendChild(inp);
    titleRows.appendChild(subField);
  });

  titlesSection.appendChild(titleRows);
  panelTypo.appendChild(titlesSection);

  const fontField = document.createElement('div');
  fontField.className = 'ql-field';
  fontField.innerHTML = '<label for="ql-ce-font-select">Familia tipográfica</label>';
  const fontSelect = document.createElement('select');
  fontSelect.id = 'ql-ce-font-select';
  fontSelect.className = 'ql-select';
  FONTS.forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (currentConfig.typography.fontFamily === val) opt.selected = true;
    fontSelect.appendChild(opt);
  });
  fontSelect.addEventListener('change', () => {
    currentConfig.typography.fontFamily = fontSelect.value;
    notify('fontFamily', fontSelect.value);
  });
  fontField.appendChild(fontSelect);
  panelTypo.appendChild(fontField);

  const fontStylesField = document.createElement('div');
  fontStylesField.className = 'ql-field';
  fontStylesField.innerHTML = '<label>Estilos de texto</label>';

  const checkRow = document.createElement('div');
  checkRow.style.cssText = 'display:flex;gap:20px;margin-top:4px;flex-wrap:wrap;';

  const boldLabel = document.createElement('label');
  boldLabel.className = 'ql-ce-checkbox-label';
  const boldChk = document.createElement('input');
  boldChk.type = 'checkbox';
  boldChk.checked = Boolean(currentConfig.typography.isBold);
  boldChk.addEventListener('change', () => {
    currentConfig.typography.isBold = boldChk.checked;
    notify('isBold', boldChk.checked);
  });
  boldLabel.appendChild(boldChk);
  boldLabel.appendChild(document.createTextNode(' Texto en negrita (600)'));
  checkRow.appendChild(boldLabel);

  const italicLabel = document.createElement('label');
  italicLabel.className = 'ql-ce-checkbox-label';
  const italicChk = document.createElement('input');
  italicChk.type = 'checkbox';
  italicChk.checked = Boolean(currentConfig.typography.isItalic);
  italicChk.addEventListener('change', () => {
    currentConfig.typography.isItalic = italicChk.checked;
    notify('isItalic', italicChk.checked);
  });
  italicLabel.appendChild(italicChk);
  italicLabel.appendChild(document.createTextNode(' Texto en cursiva'));
  checkRow.appendChild(italicLabel);

  fontStylesField.appendChild(checkRow);
  panelTypo.appendChild(fontStylesField);

  const sizeField = document.createElement('div');
  sizeField.className = 'ql-field';
  sizeField.innerHTML = '<label for="ql-ce-font-size">Tamaño de fuente (px)</label>' +
    '<div class="ql-inputrow">' +
    '<input type="range" id="ql-ce-font-size-r" min="9" max="22" step="1" value="' + (currentConfig.typography.fontSize || 13) + '">' +
    '<input type="number" id="ql-ce-font-size" class="ql-num-small tabular" min="9" max="22" step="1" value="' + (currentConfig.typography.fontSize || 13) + '">' +
    '</div>';
  {
    const rInput = sizeField.querySelector('#ql-ce-font-size-r');
    const nInput = sizeField.querySelector('#ql-ce-font-size');
    const onSizeChange = (v) => {
      const nv = Math.max(9, Math.min(22, parseInt(v, 10) || 13));
      rInput.value = nv;
      nInput.value = nv;
      currentConfig.typography.fontSize = nv;
      notify('fontSize', nv);
    };
    rInput.addEventListener('input', () => onSizeChange(rInput.value));
    nInput.addEventListener('change', () => onSizeChange(nInput.value));
  }
  panelTypo.appendChild(sizeField);
  body.appendChild(panelTypo);

  // --- PANEL 3: COLORES ---
  const panelColors = document.createElement('div');
  panelColors.className = 'ql-ce-tab-panel' + (activeTab === 'colors' ? ' is-active' : '');
  panelColors.setAttribute('data-panel', 'colors');

  if (currentConfig.colors.series && currentConfig.colors.series.length > 0) {
    const seriesSec = document.createElement('div');
    seriesSec.className = 'ql-field';
    seriesSec.innerHTML = '<label>Colores asignados por serie o taxón</label>' +
      '<p class="ql-field-help" style="margin-bottom:8px;">Ajusta los colores principales de los elementos.</p>';
    const colorList = document.createElement('div');
    colorList.style.cssText = 'max-height:220px;overflow-y:auto;padding-right:4px;display:flex;flex-direction:column;gap:6px;';

    currentConfig.colors.series.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'ql-ce-color-row';
      const name = document.createElement('span');
      name.style.cssText = 'font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;';
      name.textContent = s.label || s.id;
      row.appendChild(name);

      const colorInp = document.createElement('input');
      colorInp.type = 'color';
      colorInp.style.cssText = 'width:36px;height:26px;border:none;border-radius:4px;cursor:pointer;padding:0;background:none;';
      let initialColor = s.color || '#3b82f6';
      if (!initialColor.startsWith('#')) initialColor = '#3b82f6';
      colorInp.value = initialColor;

      colorInp.addEventListener('input', () => {
        s.color = colorInp.value;
        notify('seriesColor', { id: s.id, color: colorInp.value });
      });
      row.appendChild(colorInp);
      colorList.appendChild(row);
    });
    seriesSec.appendChild(colorList);
    panelColors.appendChild(seriesSec);
  }

  const opField = document.createElement('div');
  opField.className = 'ql-field';
  const currOp = currentConfig.colors.linkOpacity ?? currentConfig.geometry.linkOpacity ?? 0.4;
  opField.innerHTML = '<label for="ql-ce-op-r">Opacidad de los flujos (%)</label>' +
    '<div class="ql-inputrow">' +
    '<input type="range" id="ql-ce-op-r" min="10" max="95" step="5" value="' + Math.round(currOp * 100) + '">' +
    '<input type="number" id="ql-ce-op" class="ql-num-small tabular" min="10" max="95" step="5" value="' + Math.round(currOp * 100) + '">' +
    '</div>';
  {
    const rInput = opField.querySelector('#ql-ce-op-r');
    const nInput = opField.querySelector('#ql-ce-op');
    const onOpChange = (v) => {
      const nv = Math.max(10, Math.min(95, parseInt(v, 10) || 40));
      rInput.value = nv;
      nInput.value = nv;
      const frac = nv / 100;
      currentConfig.colors.linkOpacity = frac;
      currentConfig.geometry.linkOpacity = frac;
      notify('linkOpacity', frac);
    };
    rInput.addEventListener('input', () => onOpChange(rInput.value));
    nInput.addEventListener('change', () => onOpChange(nInput.value));
  }
  panelColors.appendChild(opField);
  body.appendChild(panelColors);

  dialog.appendChild(body);

  // Pie del modal
  const footer = document.createElement('footer');
  footer.className = 'ql-ce-dialog-footer';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'ql-btn ql-btn-ghost';
  resetBtn.textContent = 'Restablecer valores';
  resetBtn.addEventListener('click', () => {
    Object.assign(currentConfig.typography, initialConfig.typography);
    Object.assign(currentConfig.colors, initialConfig.colors);
    Object.assign(currentConfig.geometry, initialConfig.geometry);

    fontSelect.value = currentConfig.typography.fontFamily;
    boldChk.checked = currentConfig.typography.isBold;
    italicChk.checked = currentConfig.typography.isItalic;

    if (currentConfig.geometry.sliders) {
      currentConfig.geometry.sliders.forEach((sl) => {
        const orig = initialConfig.geometry.sliders.find((s) => s.id === sl.id);
        if (orig) {
          sl.value = orig.value;
          const r = dialog.querySelector(`#ql-ce-sl-${sl.id}-r`);
          const n = dialog.querySelector(`#ql-ce-sl-${sl.id}`);
          const displayVal = sl.isPercent ? Math.round(sl.value * 100) : sl.value;
          if (r) r.value = displayVal;
          if (n) n.value = displayVal;
        }
      });
    }

    modalTitleDefs.forEach((td) => {
      const orig = initialConfig[td.id] !== undefined ? initialConfig[td.id] : '';
      currentConfig[td.id] = orig;
      const inp = dialog.querySelector('#' + td.inputId);
      if (inp) inp.value = orig;
      if (svgEl && orig) {
        const matches = svgEl.querySelectorAll(td.selector);
        matches.forEach((el) => { el.textContent = orig; });
      }
    });

    notify('reset', currentConfig);
  });
  footer.appendChild(resetBtn);

  const actionsRight = document.createElement('div');
  actionsRight.className = 'ql-ce-dialog-footer-actions';
  actionsRight.style.display = 'flex';
  actionsRight.style.gap = '8px';
  actionsRight.style.alignItems = 'center';

  if (svgEl) {
    const dlSvgBtn = document.createElement('button');
    dlSvgBtn.type = 'button';
    dlSvgBtn.className = 'ql-btn';
    dlSvgBtn.innerHTML = `${CE_ICONS.download} <span>Descargar SVG</span>`;
    dlSvgBtn.title = 'Descargar SVG vectorial';
    dlSvgBtn.addEventListener('click', () => {
      exportSvg(svgEl, currentConfig.filename || configOptions.filename || 'smart175_figura');
    });
    actionsRight.appendChild(dlSvgBtn);

    const dlPngBtn = document.createElement('button');
    dlPngBtn.type = 'button';
    dlPngBtn.className = 'ql-btn';
    dlPngBtn.innerHTML = `${CE_ICONS.download} <span>Descargar PNG</span>`;
    dlPngBtn.title = 'Descargar PNG en alta resolución (300 dpi)';
    dlPngBtn.addEventListener('click', () => {
      exportPng(svgEl, currentConfig.filename || configOptions.filename || 'smart175_figura', 4);
    });
    actionsRight.appendChild(dlPngBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ql-btn ql-btn-primary';
  closeBtn.textContent = 'Cerrar';
  closeBtn.addEventListener('click', () => dialog.close());
  actionsRight.appendChild(closeBtn);

  footer.appendChild(actionsRight);

  dialog.appendChild(footer);

  // Eventos de cierre y clic fuera
  header.querySelector('.ql-ce-dialog-close').addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (ev) => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= ev.clientY && ev.clientY <= rect.top + rect.height &&
      rect.left <= ev.clientX && ev.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      dialog.close();
    }
  });

  dialog.addEventListener('close', () => {
    dialog.remove();
  });

  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }

  return {
    dialog,
    close: () => {
      try { dialog.close(); } catch (e) { dialog.remove(); }
    },
  };
}

