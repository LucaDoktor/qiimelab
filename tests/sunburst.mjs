// Tests unitarios para el motor de sunburst taxonómico en SVG puro (js/lib/sunburst.js)
// Verifica limpieza de linajes, construcción del árbol por inserción, el
// recorte de hijos con cubo "Otros", el layout angular proporcional y la
// geometría de los arcos (path SVG).
//
// Ejecución:
//   node tests/sunburst.mjs

import {
  cleanRankSegment, lineageToPath, buildLineageIndex,
  createSunburstRoot, insertTaxon, capChildren,
  computeSunburstLayout, polarPoint, arcPath, findNodeByPath, treeMaxDepth,
} from '../js/lib/sunburst.js';

let failed = false;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (detail ? '  ' + detail : ''));
  if (!ok) failed = true;
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

console.log('\n--- 1. cleanRankSegment / lineageToPath ---');
{
  check('quita el prefijo de rango', cleanRankSegment('g__Blautia') === 'Blautia');
  check('quita espacios sobrantes', cleanRankSegment('  p__Firmicutes  ') === 'Firmicutes');
  check('rango vacío -> cadena vacía', cleanRankSegment('f__') === '');
  check('"unclassified" -> cadena vacía (case-insensitive)', cleanRankSegment('g__Unclassified') === '' && cleanRankSegment('UNASSIGNED') === '');
  check('sin prefijo de rango, se queda igual', cleanRankSegment('Lactobacillus') === 'Lactobacillus');

  const full = lineageToPath('d__Bacteria;p__Firmicutes;c__Clostridia;o__Eubacteriales;f__Lachnospiraceae;g__Blautia');
  check('descarta el dominio (empieza en filo)', full[0] === 'Firmicutes');
  check('ruta completa hasta género (5 rangos: filo..género)', full.length === 5, JSON.stringify(full));
  check('último elemento = género', full[full.length - 1] === 'Blautia');

  const cutFamily = lineageToPath('d__Bacteria;p__Firmicutes;c__Clostridia;o__Eubacteriales;f__Lachnospiraceae;g__');
  check('rango final vacío corta la ruta ahí (no añade "(sin clasificar)")', cutFamily.length === 4 && cutFamily[3] === 'Lachnospiraceae');

  const cutMid = lineageToPath('d__Bacteria;p__Firmicutes;c__;o__Eubacteriales;f__Lachnospiraceae');
  check('un rango vacío EN MEDIO corta ahí, aunque haya rangos más profundos con nombre', cutMid.length === 1 && cutMid[0] === 'Firmicutes', JSON.stringify(cutMid));

  const noDomain = lineageToPath('p__Bacteroidota;c__Bacteroidia;o__Bacteroidales');
  check('sin dominio explícito, no se pierde el primer rango real', noDomain.length === 3 && noDomain[0] === 'Bacteroidota');

  check('linaje vacío/null -> ruta vacía', lineageToPath('').length === 0 && lineageToPath(null).length === 0);
}

console.log('\n--- 2. buildLineageIndex ---');
{
  const rows = [
    { Taxon: 'd__Bacteria;p__Firmicutes;c__Clostridia;o__Eubacteriales;f__Lachnospiraceae;g__Blautia' },
    { Taxon: 'd__Bacteria;p__Bacteroidota;c__Bacteroidia;o__Bacteroidales;f__Bacteroidaceae;g__Bacteroides' },
    { Taxon: 'd__Bacteria;p__Proteobacteria;c__Gammaproteobacteria;o__Enterobacterales;f__Enterobacteriaceae;g__Bacteroides' }, // nombre corto duplicado a propósito
  ];
  const idx = buildLineageIndex(rows, 'Taxon');
  check('indexa por el ÚLTIMO segmento (nombre corto)', idx.has('Blautia') && idx.has('Bacteroides'));
  check('la ruta indexada es la completa (sin dominio)', idx.get('Blautia').join(';') === 'Firmicutes;Clostridia;Eubacteriales;Lachnospiraceae;Blautia');
  check('nombre corto duplicado: gana el PRIMER linaje visto', idx.get('Bacteroides')[0] === 'Bacteroidota');
  check('linaje sin nombre útil no se indexa', !buildLineageIndex([{ Taxon: 'd__Bacteria;p__;c__' }], 'Taxon').size);
}

console.log('\n--- 3. insertTaxon: el árbol se construye por acumulación ---');
{
  const root = createSunburstRoot();
  insertTaxon(root, ['Firmicutes', 'Clostridia', 'Blautia'], 10, { header: 'Blautia' });
  insertTaxon(root, ['Firmicutes', 'Clostridia', 'Roseburia'], 6, { header: 'Roseburia' });
  insertTaxon(root, ['Firmicutes', 'Bacilli', 'Lactobacillus'], 4, { header: 'Lactobacillus' });
  insertTaxon(root, ['Bacteroidota', 'Bacteroidia', 'Bacteroides'], 20, { header: 'Bacteroides' });

  check('el valor de la raíz es la suma de TODOS los taxones insertados', close(root.value, 40));
  check('la raíz tiene 2 hijos directos (2 filos distintos)', root.children.length === 2);

  const firmicutes = root.children.find((c) => c.name === 'Firmicutes');
  check('un nodo intermedio compartido (Firmicutes) suma el valor de TODOS sus descendientes', close(firmicutes.value, 20));
  check('Firmicutes tiene 2 hijos (Clostridia, Bacilli) — ramas distintas conviven bajo el mismo padre', firmicutes.children.length === 2);

  const clostridia = firmicutes.children.find((c) => c.name === 'Clostridia');
  check('Clostridia (nieto de la raíz) suma sus 2 hijos (Blautia+Roseburia=16)', close(clostridia.value, 16));
  const blautia = clostridia.children.find((c) => c.name === 'Blautia');
  check('una hoja guarda su valor propio y los metadatos pasados', close(blautia.value, 10) && blautia.meta.header === 'Blautia');
  check('cada nodo lleva su ruta completa desde la raíz (path)', blautia.path.join('/') === 'Firmicutes/Clostridia/Blautia');
  check('la profundidad (depth) coincide con la longitud de la ruta', blautia.depth === blautia.path.length);

  const root2 = createSunburstRoot();
  insertTaxon(root2, [], 5, null);
  check('una ruta vacía solo aporta al total de la raíz, no crea nodos', close(root2.value, 5) && root2.children.length === 0);
  insertTaxon(root2, ['X'], 0, null);
  insertTaxon(root2, ['X'], -3, null);
  check('valores 0 o negativos se ignoran (no revientan ni crean nodos fantasma)', root2.children.length === 0 && close(root2.value, 5));

  check('treeMaxDepth calcula la profundidad real del árbol', treeMaxDepth(root) === 3);
  check('findNodeByPath localiza un nodo por su ruta', findNodeByPath(root, ['Firmicutes', 'Clostridia']) === clostridia);
  check('findNodeByPath devuelve null si la ruta no existe (p. ej. tras cambiar de dataset)', findNodeByPath(root, ['Firmicutes', 'NoExiste']) === null);
}

console.log('\n--- 4. capChildren: recorte a "Otros" sin perder información ---');
{
  const kids = [];
  for (let i = 0; i < 30; i++) kids.push({ name: 'sp' + i, value: 30 - i, depth: 2, path: ['G', 'sp' + i], children: [] });
  const capped = capChildren(kids, 10, 'Otros');
  check('no supera maxChildren', capped.length === 10);
  check('se queda con los 9 de mayor valor + 1 "Otros"', capped.slice(0, 9).every((c, i) => c.name === 'sp' + i));
  const other = capped[capped.length - 1];
  check('el último es el cubo "Otros"', other.name === 'Otros' && other.isOther === true);
  const restSum = kids.slice(9).reduce((s, c) => s + c.value, 0);
  check('"Otros" suma exactamente el valor de los recortados', close(other.value, restSum));
  check('"Otros" conserva los nodos recortados como children (zoom no pierde info)', other.children.length === 21 && other.children[0].name === 'sp9');
  check('la ruta de "Otros" cuelga del mismo padre que los hijos recortados', other.path.join('/') === 'G/Otros');

  const few = [{ name: 'a', value: 1, depth: 1, path: ['a'], children: [] }, { name: 'b', value: 2, depth: 1, path: ['b'], children: [] }];
  const notCapped = capChildren(few, 10, 'Otros');
  check('con menos hijos que el tope, no se toca nada (y queda ordenado por valor desc)', notCapped.length === 2 && notCapped[0].name === 'b');
}

console.log('\n--- 5. computeSunburstLayout: ángulos proporcionales al valor ---');
{
  const root = createSunburstRoot();
  insertTaxon(root, ['A', 'A1'], 30);
  insertTaxon(root, ['A', 'A2'], 10);
  insertTaxon(root, ['B', 'B1'], 60);

  const arcs = computeSunburstLayout(root, { maxDepth: 2, maxChildren: 24, otherLabel: 'Otros' });
  const depth1 = arcs.filter((a) => a.depth === 1);
  const depth2 = arcs.filter((a) => a.depth === 2);
  check('un anillo por profundidad pedida (aquí, 2: filo y el siguiente rango)', new Set(arcs.map((a) => a.depth)).size === 2);
  check('depth=1 tiene un arco por hijo directo de la raíz (A, B)', depth1.length === 2);

  const totalSpan = depth1.reduce((s, a) => s + (a.a1 - a.a0), 0);
  check('los arcos de un mismo anillo cubren el círculo completo (2π), sin huecos ni solapes', close(totalSpan, 2 * Math.PI, 1e-9), 'span=' + totalSpan);

  const arcA = depth1.find((a) => a.node.name === 'A');
  const arcB = depth1.find((a) => a.node.name === 'B');
  check('el ángulo de cada arco es proporcional a su valor (A=40, B=60 de un total de 100)', close(arcA.a1 - arcA.a0, 2 * Math.PI * 0.4) && close(arcB.a1 - arcB.a0, 2 * Math.PI * 0.6));
  // orden por valor descendente (igual que capChildren): B (60) va antes que A (40)
  check('los arcos son contiguos y en orden (B, el de más valor, empieza en 0; A sigue sin hueco)', close(arcB.a0, 0) && close(arcB.a1, arcA.a0), 'B a0=' + arcB.a0 + ' a1=' + arcB.a1 + ' · A a0=' + arcA.a0);

  const childrenOfA = depth2.filter((a) => a.node.path[0] === 'A');
  const spanA = childrenOfA.reduce((s, a) => s + (a.a1 - a.a0), 0);
  check('los hijos de A (siguiente anillo) reparten exactamente el arco heredado de A, no todo el círculo', close(spanA, arcA.a1 - arcA.a0));

  const shallow = computeSunburstLayout(root, { maxDepth: 1, maxChildren: 24, otherLabel: 'Otros' });
  check('maxDepth limita los anillos devueltos (aquí solo depth=1, nada de depth=2)', shallow.every((a) => a.depth === 1));

  const single = createSunburstRoot();
  insertTaxon(single, ['Unico'], 5);
  const arcsSingle = computeSunburstLayout(single, { maxDepth: 1 });
  check('un solo hijo ocupa el círculo completo (0 a 2π)', close(arcsSingle[0].a0, 0) && close(arcsSingle[0].a1, 2 * Math.PI));

  const empty = createSunburstRoot();
  check('árbol vacío (sin taxones insertados) da layout vacío, sin reventar', computeSunburstLayout(empty, { maxDepth: 4 }).length === 0);
}

console.log('\n--- 6. polarPoint / arcPath: geometría SVG ---');
{
  const p0 = polarPoint(100, 100, 50, 0);
  check('ángulo 0 (arriba) -> encima del centro, mismo x', close(p0.x, 100) && close(p0.y, 50));
  const p90 = polarPoint(100, 100, 50, Math.PI / 2);
  check('ángulo π/2 (sentido horario desde arriba) -> a la derecha del centro', close(p90.x, 150) && close(p90.y, 100));

  const dHole = arcPath(100, 100, 40, 60, 0, Math.PI / 2);
  check('con radio interior > 0, el path arranca en el radio INTERIOR (hay agujero, no pasa por el centro)', dHole.startsWith('M 100 60'), dHole.slice(0, 30));
  check('contiene un comando de arco (A) para el borde exterior', / A 60 60 /.test(dHole));
  check('contiene un comando de arco (A) para el borde interior', / A 40 40 /.test(dHole));
  check('el path se cierra (Z)', dHole.trim().endsWith('Z'));

  const dFull = arcPath(100, 100, 0, 60, 0, Math.PI / 2);
  check('con radio interior 0, el path pasa por el CENTRO (sector completo, sin agujero)', dFull.startsWith('M 100 100'));

  const d360 = arcPath(100, 100, 0, 60, 0, 2 * Math.PI);
  check('un span de 2π completo no degenera (el arco SVG de 360° exactos no se dibuja) — se recorta un pelo', d360.length > 10 && /A 60 60/.test(d360));
}

console.log('\nRESULTADO SUNBURST: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
