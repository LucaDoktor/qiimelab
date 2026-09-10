// Paletas de color por defecto para el selector del editor de gráficos
// (js/lib/chartEditor.js). Colores literales (no `var()`): al aplicar una
// paleta el usuario fija colores concretos a propósito, así que dejan de
// seguir el tema claro/oscuro — igual que ya pasa hoy con el color de texto
// que se elige a mano en el panel de estilo.
//
// Construidas para pasar js/lib/paletteValidator.js — ver tests/palettes.mjs.

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
