// Motor de sunburst taxonómico en SVG puro, estilo Krona — solo geometría y
// construcción del árbol; el dibujo (svgEl), el color y la interacción
// (zoom, tooltip) viven en el módulo que lo consume (taxaBarplot.js), igual
// que ya separa alluvial.js (path de las cintas) de su render en el módulo.
//
// Ondov BD, Bergman NH, Phillippy AM. "Interactive metagenomic visualization
// in a web browser." BMC Bioinformatics 12, 385 (2011).
//
// Convención angular: 0 rad arriba (12h), sentido horario — la misma que ya
// usa el cladograma radial de phylo.js (point = cx + r·sin, cy − r·cos), así
// que un lector que ya conoce esa vista reconoce la orientación aquí.

const RANK_PREFIX_RE = /^[a-z]__/i;
const DOMAIN_SEG_RE = /^\s*d__/i;
const UNCLASSIFIED_RE = /^(unclassified|unassigned|unidentified|uncultured)$/i;

/**
 * Limpia UN segmento de linaje: quita el prefijo de rango (p__, g__…) y
 * espacios. Devuelve '' si el segmento no aporta nombre (rango vacío,
 * "unclassified"…) — quien llama decide si eso corta la ruta ahí.
 */
export function cleanRankSegment(seg) {
  const s = String(seg == null ? '' : seg).trim().replace(RANK_PREFIX_RE, '').trim();
  if (!s || UNCLASSIFIED_RE.test(s)) return '';
  return s;
}

/**
 * A partir de un linaje separado por ';' (formato QIIME2:
 * "d__Bacteria;p__Firmicutes;c__…;g__Blautia"), devuelve la ruta de nombres
 * limpios — SIN el dominio (si el primer segmento es "d__…" se descarta:
 * el sunburst empieza en filo, no en dominio, que con un solo valor
 * ("Bacteria" en casi todo) desperdiciaría un anillo entero) — y CORTADA en
 * el primer rango vacío/"unclassified": "f__Lachnospiraceae;g__" se queda
 * en ['Lachnospiraceae'], no añade un "(sin clasificar)" de más.
 */
export function lineageToPath(lineage) {
  const raw = String(lineage == null ? '' : lineage).split(';');
  const segs = raw.length && DOMAIN_SEG_RE.test(raw[0]) ? raw.slice(1) : raw;
  const path = [];
  for (const seg of segs) {
    const clean = cleanRankSegment(seg);
    if (!clean) break;
    path.push(clean);
  }
  return path;
}

/**
 * Índice nombre-corto -> ruta completa (sin dominio), a partir de filas de
 * una tabla de taxonomía QIIME2 (Feature ID + Taxon/Taxonomy). El nombre
 * corto es el ÚLTIMO segmento de cada linaje — así un encabezado de
 * taxaBarplot en formato "ancho" (solo el género, sin ';') puede recuperar
 * filo/clase/orden/familia cruzando por ese nombre. Primer linaje que
 * aparece gana si dos taxones distintos comparten nombre corto (mismo
 * compromiso que matchTaxonToAbundance en differentialAbundance.js — no hay
 * forma de desambiguar sin más información).
 * @param {Array<Object>} taxonomyRows
 * @param {string} taxonCol - nombre de la columna con el linaje completo
 * @returns {Map<string,string[]>}
 */
export function buildLineageIndex(taxonomyRows, taxonCol) {
  const index = new Map();
  (taxonomyRows || []).forEach((row) => {
    const path = lineageToPath(row[taxonCol]);
    if (!path.length) return;
    const shortName = path[path.length - 1];
    if (!index.has(shortName)) index.set(shortName, path);
  });
  return index;
}

/** Nodo raíz vacío de un árbol de sunburst. */
export function createSunburstRoot() {
  return { name: '', value: 0, depth: 0, path: [], children: [], meta: null };
}

/**
 * Inserta un taxón (ruta de nombres + valor) en el árbol, sumando `value`
 * en cada nodo a lo largo de la ruta (raíz incluida) — así el valor de un
 * nodo es, por construcción, la suma de sus descendientes, sin necesitar
 * una segunda pasada. Una ruta vacía solo aporta al total de la raíz (no
 * crea ningún nodo — taxón sin ninguna información de linaje).
 * @param {object} root
 * @param {string[]} path
 * @param {number} value
 * @param {object} [meta] - se guarda en el nodo hoja (p. ej. { header })
 */
export function insertTaxon(root, path, value, meta) {
  const v = Math.max(0, Number(value) || 0);
  if (!(v > 0)) return;
  root.value += v;
  if (!path.length) return;
  let node = root;
  let acc = [];
  path.forEach((name, i) => {
    acc = acc.concat([name]);
    let child = node.children.find((c) => c.name === name);
    if (!child) {
      child = { name, value: 0, depth: i + 1, path: acc.slice(), children: [], meta: null };
      node.children.push(child);
    }
    child.value += v;
    if (i === path.length - 1 && meta) child.meta = meta;
    node = child;
  });
}

/**
 * Recorta los hijos de un nodo a los `maxChildren` de mayor valor,
 * agrupando el resto en un hijo sintético "Otros" cuyos `children` son los
 * nodos recortados de verdad (no se pierde información: si se hace zoom en
 * ese "Otros" se ve su propio desglose, recortado a su vez si hace falta).
 * No muta el árbol original.
 */
export function capChildren(children, maxChildren, otherLabel) {
  const sorted = (children || []).slice().sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name)));
  if (sorted.length <= maxChildren) return sorted;
  const kept = sorted.slice(0, Math.max(0, maxChildren - 1));
  const rest = sorted.slice(kept.length);
  const otherValue = rest.reduce((s, c) => s + c.value, 0);
  if (!(otherValue > 0)) return kept;
  const anyRest = rest[0] || kept[0];
  const parentPath = anyRest.path.slice(0, -1);
  return kept.concat([{
    name: otherLabel, value: otherValue, depth: anyRest.depth,
    path: parentPath.concat([otherLabel]), children: rest, meta: null, isOther: true,
  }]);
}

/**
 * Calcula el layout angular (a0/a1 en radianes, [0, 2π), 0 arriba, sentido
 * horario) de los descendientes de `node` hasta `maxDepth` anillos,
 * proporcional al valor dentro de cada padre — geometría estándar de
 * sunburst/icicle. `node` mismo ocupa el círculo completo (no aparece en el
 * resultado: lo representa el breadcrumb, no un anillo).
 *
 * @param {object} node - nodo foco
 * @param {{maxDepth?: number, maxChildren?: number, otherLabel?: string}} [opts]
 * @returns {Array<{node:object, depth:number, a0:number, a1:number, parentValue:number}>}
 *   depth=1 = hijos directos de `node`; `parentValue` es la suma de valor de
 *   TODOS los hermanos de ese arco (para calcular su % dentro del padre)
 */
export function computeSunburstLayout(node, opts = {}) {
  const maxDepth = opts.maxDepth || 4;
  const maxChildren = opts.maxChildren || 24;
  const otherLabel = opts.otherLabel || 'Otros';
  const arcs = [];
  function walk(n, a0, a1, depth) {
    if (depth > maxDepth || !(a1 > a0)) return;
    const kids = capChildren(n.children, maxChildren, otherLabel);
    const total = kids.reduce((s, c) => s + c.value, 0);
    if (!(total > 0)) return;
    let a = a0;
    kids.forEach((c) => {
      const span = (c.value / total) * (a1 - a0);
      const ca1 = a + span;
      arcs.push({ node: c, depth, a0: a, a1: ca1, parentValue: total });
      walk(c, a, ca1, depth + 1);
      a = ca1;
    });
  }
  walk(node, 0, 2 * Math.PI, 1);
  return arcs;
}

/** Punto en coordenadas polares centradas en (cx, cy): 0 rad arriba, sentido
 *  horario — misma convención que drawCladogramCircular en phylo.js. */
export function polarPoint(cx, cy, r, angle) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

/**
 * Path `d` de un segmento de anillo (sector de corona circular, o sector
 * completo si r0<=0) entre radios r0..r1 y ángulos a0..a1. Un span >= 2π
 * (un único nodo en todo el círculo, p. ej. la raíz) se recorta a un pelo
 * menos de 2π — un arco SVG de 360° exactos no se dibuja (inicio = fin).
 */
export function arcPath(cx, cy, r0, r1, a0, a1) {
  const FULL = 2 * Math.PI - 1e-4;
  let end = a1;
  if (end - a0 >= FULL) end = a0 + FULL;
  const large = (end - a0) > Math.PI ? 1 : 0;
  const po0 = polarPoint(cx, cy, r1, a0), po1 = polarPoint(cx, cy, r1, end);
  if (!(r0 > 0)) {
    return 'M ' + cx + ' ' + cy +
      ' L ' + po0.x + ' ' + po0.y +
      ' A ' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + po1.x + ' ' + po1.y +
      ' Z';
  }
  const pi0 = polarPoint(cx, cy, r0, a0), pi1 = polarPoint(cx, cy, r0, end);
  return 'M ' + pi0.x + ' ' + pi0.y +
    ' L ' + po0.x + ' ' + po0.y +
    ' A ' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + po1.x + ' ' + po1.y +
    ' L ' + pi1.x + ' ' + pi1.y +
    ' A ' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + pi0.x + ' ' + pi0.y +
    ' Z';
}

/** Busca el nodo correspondiente a una ruta (array de nombres) partiendo de
 *  la raíz — null si algún segmento no existe (p. ej. la ruta guardada de
 *  un zoom anterior ya no es válida tras cambiar de nivel/grupo). */
export function findNodeByPath(root, path) {
  let node = root;
  for (const name of path) {
    node = (node.children || []).find((c) => c.name === name);
    if (!node) return null;
  }
  return node;
}

/** Profundidad máxima del árbol (0 = solo la raíz, sin ningún taxón con ruta). */
export function treeMaxDepth(node) {
  if (!node.children || !node.children.length) return node.depth || 0;
  return Math.max(...node.children.map(treeMaxDepth));
}
