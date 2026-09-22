// Paletas de color por defecto para el selector del editor de gráficos
// (js/lib/chartEditor.js). Colores literales (no `var()`): al aplicar una
// paleta el usuario fija colores concretos a propósito, así que dejan de
// seguir el tema claro/oscuro — igual que ya pasa hoy con el color de texto
// que se elige a mano en el panel de estilo.
//
// Construidas para pasar js/lib/paletteValidator.js — ver tests/palettes.mjs.

import { PALETTE_CATALOG } from './paletteCatalog.js';

/**
 * Categórica — 8 tonos, ORDEN FIJO (nunca ciclar: una 9ª serie va a "Otros").
 * Los 7 primeros son exactamente --cat-1..7 de css/tokens.css (tema claro);
 * el 8º es --enriched (tema claro) — ya validado en tests/cvd.mjs/contrast.mjs
 * por su otro uso, así que no se inventa un tono nuevo sin verificar.
 * Perfil de accesibilidad (ver tests/palettes.mjs): igual que la paleta
 * --cat-* ya existente — todas las parejas ADYACENTES ΔE≥8 salvo cat4×cat5
 * (ya documentada, solo por tritanopía); el subconjunto "seguro para
 * scatter" (los 4 primeros) no tiene ningún FAIL en ninguna pareja.
 */
export const CATEGORICAL = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];

/** En scatter/PCoA/red de co-ocurrencia (cualquier punto puede acabar junto a
 *  cualquier otro) no todos los pares de las 8 se distinguen — limitar a esto. */
export const CATEGORICAL_SCATTER_MAX = 4;

/**
 * Secuencial — un tono (azul, mismo matiz que --depleted), claro→oscuro, 5
 * paradas. Generada interpolando luminosidad en OKLab manteniendo el matiz
 * del ancla (ver scratchpad de la sesión que la creó) — no a ojo.
 * Para heatmaps/abundancia. El extremo claro tiene poco contraste sobre
 * fondo claro y el extremo oscuro poco contraste sobre fondo oscuro — es
 * intencional (es lo que hace que se vea como una rampa continua, igual
 * que --corr-zero ya se funde a propósito con el fondo); documentado como
 * desviación conocida, mismo patrón que tests/contrast.mjs.
 */
export const SEQUENTIAL = ['#e4f0ff', '#a9c4e8', '#7099d0', '#366eb6', '#00429c'];

/** Los 2 extremos de la rampa secuencial — para gradientes CONTINUOS de 2
 *  polos (mapa de calor de distancias: color-mix entre "cerca" y "lejos"),
 *  donde no tiene sentido pedir las 5 paradas discretas. */
export const SEQUENTIAL_POLES = [SEQUENTIAL[0], SEQUENTIAL[SEQUENTIAL.length - 1]];

/**
 * Divergente — dos tonos + centro gris neutro, para volcano plots y
 * correlogramas (signo +/−). pos/neg son los mismos hex que --depleted/
 * --enriched (tema claro) — reutiliza el par ya verificado en tests/cvd.mjs
 * (ΔE ≥ 19 en las 3 dicromacias) en vez de inventar uno nuevo. El centro es
 * --neutral/--cat-8 (mismo gris "sin señal" que ya usa el resto de la app).
 */
export const DIVERGENT = { neg: '#e34948', mid: '#a6a49c', pos: '#2a78d6' };

/** Paleta de degradado como array de 3 paradas (para pintarla como rampa). */
export const DIVERGENT_STOPS = [DIVERGENT.neg, DIVERGENT.mid, DIVERGENT.pos];

/** Solo los 2 polos (sin el centro neutro) — para series discretas de 2
 *  valores que ya tienen su propio "sin dato" fijo (p. ej. "ns" en un
 *  volcano plot, que se queda gris y no entra en la paleta). */
export const DIVERGENT_POLES = [DIVERGENT.neg, DIVERGENT.pos];

export const PALETTES = {
  categorical: { colors: CATEGORICAL, scatterMax: CATEGORICAL_SCATTER_MAX },
  sequential: { colors: SEQUENTIAL },
  sequentialPoles: { colors: SEQUENTIAL_POLES },
  divergent: { colors: DIVERGENT_STOPS },
  divergentPoles: { colors: DIVERGENT_POLES },
};

/** Color de la serie `i` de una paleta con tope opcional (scatter). Cicla
 *  solo si `total` es mayor que la paleta — igual que el resto de la app,
 *  ciclar es el último recurso, no el comportamiento esperado. */
export function paletteColorAt(name, i, { max } = {}) {
  const def = PALETTES[name];
  if (!def) return null;
  const colors = max ? def.colors.slice(0, max) : def.colors;
  return colors[i % colors.length];
}

// ---------------------------------------------------------------------
// Catálogo ampliado (Fase 2, Paso 1 de qiimelab-prompt-editor-fase-2-
// paletas-relleno-series.md) — 40 paletas adicionales seleccionables desde
// el editor de gráficos, además de las 3 de arriba (que siguen siendo LA
// paleta por defecto: la que se usa si el usuario no toca nada). Ver
// js/lib/paletteCatalog.js para las fuentes/licencias/metadatos completos.

/** `paletteType` de attachChartEditor ('categorical'/'sequential'/
 *  'sequentialPoles'/'divergent'/'divergentPoles') → familia de
 *  PALETTE_CATALOG a ofrecer en el desplegable. Un módulo que pide
 *  'divergent' no debe ver paletas 'qualitative' en la lista: la familia
 *  amplia (categórica/secuencial/divergente) no cambia aunque el usuario
 *  elija otra paleta dentro de ella. */
export const PALETTE_TYPE_FAMILY = {
  categorical: 'qualitative',
  sequential: 'sequential', sequentialPoles: 'sequential',
  divergent: 'diverging', divergentPoles: 'diverging',
};

/** La entrada "paleta por defecto de la app" como si fuera una fila más del
 *  catálogo — para que el desplegable pueda listarla junto a las demás sin
 *  duplicar su lógica de color (sigue siendo PALETTES[paletteType], no una
 *  copia). Un id estable con prefijo reservado ('app:') que nunca puede
 *  chocar con un id de PALETTE_CATALOG (los suyos no llevan ':'). */
export function defaultPaletteEntry(paletteType) {
  const fam = PALETTE_TYPE_FAMILY[paletteType] || 'qualitative';
  const def = PALETTES[paletteType];
  if (!def) return null;
  return {
    id: 'app:' + paletteType, name: null /* se resuelve con T.paletteCategorical/etc en chartEditor.js */,
    type: fam, overflowMode: fam === 'qualitative' ? 'cycle' : 'clamp',
    maxSafeN: def.scatterMax || null, maxCleanN: null,
    colors: def.colors, isDefault: true,
  };
}

/** Todas las paletas de una familia (`app:<paletteType>` primero, luego el
 *  catálogo ampliado) — lista lista para pintar el desplegable agrupado. */
export function palettesForType(paletteType) {
  const fam = PALETTE_TYPE_FAMILY[paletteType] || 'qualitative';
  const app = defaultPaletteEntry(paletteType);
  const rest = PALETTE_CATALOG.filter((p) => p.type === fam);
  return app ? [app, ...rest] : rest;
}

function findCatalogPalette(id) {
  if (!id) return null;
  const fromApp = Object.keys(PALETTE_TYPE_FAMILY).find((k) => 'app:' + k === id);
  if (fromApp) return defaultPaletteEntry(fromApp);
  return PALETTE_CATALOG.find((p) => p.id === id) || null;
}

/** Los colores crudos (con tope opcional) de una paleta de PALETTE_CATALOG
 *  o `app:<paletteType>`, sin resolver desbordamiento — para
 *  `evenlySampleColors` o cualquier otro consumidor que necesite la rampa
 *  entera en vez de un índice suelto. */
export function paletteColorsOf(id, { max } = {}) {
  const pal = findCatalogPalette(id);
  if (!pal) return [];
  return max ? pal.colors.slice(0, max) : pal.colors;
}

/** Como `paletteColorAt`, pero resolviendo por id de PALETTE_CATALOG (o
 *  `app:<paletteType>` para la paleta por defecto) en vez de por los 5
 *  nombres fijos de PALETTES. Aplica `overflowMode`: 'cycle' repite desde
 *  el principio (categóricas), 'clamp' repite el tono más extremo en vez
 *  de ciclar una rampa continua (secuenciales/divergentes — ciclar
 *  rompería su lectura de orden). Uso: asignar UN color por serie discreta
 *  en el mismo orden que trae la paleta (categóricas). Para muestrear una
 *  rampa continua en N paradas arbitrarias (p. ej. los 2-3 "polos" de un
 *  degradado continuo), usar `evenlySampleColors` en su lugar — indexar
 *  0,1,2… en una rampa de 11 paradas daría los 3 tonos más oscuros, no
 *  extremo-centro-extremo. */
export function resolvePaletteColors(id, i, { max } = {}) {
  const colors = paletteColorsOf(id, { max });
  if (!colors.length) return null;
  if (i < colors.length) return colors[i];
  const pal = findCatalogPalette(id);
  return pal.overflowMode === 'clamp' ? colors[colors.length - 1] : colors[i % colors.length];
}

/** Muestrea `n` paradas EQUIESPACIADAS (por posición, ida y vuelta con
 *  Math.round) a lo largo de `colors` — para aplicar una paleta de M
 *  paradas a una figura que solo tiene N<M marcas fijas (los 2 polos de un
 *  degradado continuo, o los 3 neg/mid/pos de una escala divergente):
 *  n=2 siempre da [primero, último]; n=3 da [primero, medio, último];
 *  n>=M se comporta como identidad (cada parada de `colors` aparece, con
 *  repetición solo si n>M). */
export function evenlySampleColors(colors, n) {
  if (!colors || !colors.length) return [];
  if (n <= 1) return [colors[0]];
  const m = colors.length;
  const out = [];
  for (let j = 0; j < n; j++) {
    const idx = m === 1 ? 0 : Math.round((j * (m - 1)) / (n - 1));
    out.push(colors[idx]);
  }
  return out;
}
