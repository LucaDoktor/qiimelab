// NNI (Nearest-Neighbor Interchange) y enraizado por punto medio
// (js/lib/neighborJoining.js `nniRefine`/`midpointRoot`).
//
// NNI: sobre un árbol de 4 hojas construido a mano con una topología
// EQUIVOCADA a propósito (y una matriz de distancias aditiva real para la
// topología CORRECTA), nniRefine debe detectar la mejora en la rama interna
// raíz-hijo (caso "ambos lados concretos") y corregirla exactamente a la
// topología y longitudes de rama verdaderas. Un segundo caso de 6 hojas
// pone la topología equivocada un nivel más adentro (una rama interna que
// NO es la raíz), para probar el lado "virtual" del algoritmo (el clúster
// que queda al otro lado de un nodo no-raíz, que no es un hijo concreto
// sino el resto del árbol por resta). Un tercer caso, sobre datos
// aleatorios ya construidos por Neighbor-Joining, comprueba la propiedad de
// seguridad general: NNI nunca puede EMPEORAR la longitud total del árbol.
//
// Midpoint: sobre un árbol con longitudes conocidas a mano, el nuevo punto
// medio debe quedar exactamente equidistante de las dos hojas más
// separadas, sin perder ni añadir longitud total al árbol.
//
//   node tests/phylonni.mjs

import { APP_ROOT } from './lib/env.mjs';
const { neighborJoining, nniRefine, midpointRoot, rerootAtLeaf, collectLeaves } = await import(APP_ROOT + '/js/lib/neighborJoining.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

function totalLength(node) {
  let sum = 0;
  for (const { node: child, length } of node.children) { sum += length; sum += totalLength(child); }
  return sum;
}
const leaf = (id, label) => ({ id, label, children: [] });

// ---- 1. NNI en la rama raíz-hijo (los 4 clústeres son todos concretos) ----
{
  // árbol aditivo verdadero (0,1)|(2,3): e=2, pendientes 0:1 1:1.5 2:1 3:1.5
  const D = [
    [0, 2.5, 4, 4.5],
    [2.5, 0, 4.5, 5],
    [4, 4.5, 0, 2.5],
    [4.5, 5, 2.5, 0],
  ];
  const [l0, l1, l2, l3] = [leaf(0, 'A'), leaf(1, 'B'), leaf(2, 'C'), leaf(3, 'D')];
  // árbol EQUIVOCADO a mano: (0,2)|(1,3) en vez de (0,1)|(2,3)
  const V = { id: 5, label: null, children: [{ node: l1, length: 2.5 }, { node: l3, length: 2.5 }] };
  const root = { id: 4, label: null, children: [{ node: V, length: -1 }, { node: l0, length: 2 }, { node: l2, length: 2 }] };
  const wrongTotal = totalLength(root);

  const res = nniRefine(root, D, {});
  check('NNI (raíz): aplica exactamente 1 intercambio', res.swaps === 1, 'swaps=' + res.swaps);
  const total = totalLength(res.root);
  check('NNI (raíz): la longitud total baja al óptimo conocido (7)', Math.abs(total - 7) < 1e-9, 'total=' + total.toFixed(6) + ' (antes=' + wrongTotal + ')');

  // comprobar la topología resultante: A y B deben quedar en el mismo clúster (cereza)
  const cherry = res.root.children.find((c) => c.node.children.length);
  const cherryLabels = cherry ? cherry.node.children.map((c) => c.node.label).sort() : [];
  check('NNI (raíz): corrige la topología a (A,B)|(C,D)', JSON.stringify(cherryLabels) === JSON.stringify(['A', 'B']), cherryLabels.join(','));
  // y las longitudes de rama deben coincidir con las verdaderas (1, 1.5, 1, 1.5, 2)
  const lens = res.root.children.map((c) => c.length).sort((a, b) => a - b);
  check('NNI (raíz): recalcula las longitudes de rama exactas', JSON.stringify(lens.map((x) => +x.toFixed(3))) === JSON.stringify([1, 1.5, 2]), lens.join(','));
}

// ---- 2. NNI en una rama interna NO-raíz (lado "virtual", por resta) ----
// Construido "revolviendo" dos hojas de sitio sobre un árbol VERDADERO (las
// longitudes de rama son las reales del árbol correcto, no inventadas a
// mano para la prueba) — así la comparación es justa: cualquier diferencia
// de puntuación viene de la topología, no de longitudes poco realistas.
{
  const [l0, l1, l3, l4, l5] = [leaf(0, '0'), leaf(1, '1'), leaf(3, '3'), leaf(4, '4'), leaf(5, '5')];
  // D verdadera para el árbol correcto ((0,1),3) colgado de una raíz con 4,5
  // (fila/columna 2 sin usar — solo 5 hojas relevantes en este caso)
  const D = [
    [0, 2, 0, 4, 4.5, 4.5],
    [2, 0, 0, 4, 4.5, 4.5],
    [0, 0, 0, 0, 0, 0],
    [4, 4, 0, 0, 4.5, 4.5],
    [4.5, 4.5, 0, 4.5, 0, 3],
    [4.5, 4.5, 0, 4.5, 3, 0],
  ];
  // árbol EQUIVOCADO: mismas longitudes que el correcto ((0,1):1,1 / (X,3):1,2
  // / raíz:1,1.5,1.5), pero con 0 y 3 cambiados de sitio -- X'=(3,1), W'=(X',0)
  const Xp = { id: 10, label: null, children: [{ node: l3, length: 1 }, { node: l1, length: 1 }] };
  const Wp = { id: 11, label: null, children: [{ node: Xp, length: 1 }, { node: l0, length: 2 }] };
  const root = { id: 12, label: null, children: [{ node: Wp, length: 1 }, { node: l4, length: 1.5 }, { node: l5, length: 1.5 }] };
  const before = totalLength(root);

  const res = nniRefine(root, D, {});
  check('NNI (no-raíz, lado virtual): aplica al menos 1 intercambio', res.swaps >= 1, 'swaps=' + res.swaps);
  const total = totalLength(res.root);
  check('NNI (no-raíz): la longitud total no empeora', total <= before + 1e-9, 'antes=' + before + ' después=' + total.toFixed(6));

  // comprobar que 0 y 1 acaban en la misma cereza (topología correcta)
  function findCherry(node) {
    if (!node.children.length) return null;
    if (node.children.every((c) => !c.node.children.length)) return node.children.map((c) => c.node.label).sort();
    for (const c of node.children) { const r = findCherry(c.node); if (r) return r; }
    return null;
  }
  const cherry = findCherry(res.root);
  check('NNI (no-raíz): corrige la topología — 0 y 1 quedan como cereza', JSON.stringify(cherry) === JSON.stringify(['0', '1']), JSON.stringify(cherry));
}

// ---- 3. Seguridad general: NNI nunca empeora un árbol ya construido por NJ ----
{
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(2026);
  const n = 10;
  const labels = Array.from({ length: n }, (_, i) => 'T' + i);
  const D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = 1 + rnd() * 9; D[i][j] = v; D[j][i] = v; }
  const tree = neighborJoining(D, labels);
  const before = totalLength(tree);
  const res = nniRefine(tree, D, {});
  const after = totalLength(res.root);
  check('NNI (aleatorio, n=10): nunca aumenta la longitud total', after <= before + 1e-9, 'antes=' + before.toFixed(4) + ' después=' + after.toFixed(4));
  const res2 = nniRefine(res.root, D, {});
  check('NNI: converge (una segunda pasada sobre el resultado ya no mejora nada)', res2.swaps === 0, 'swaps de la 2ª pasada=' + res2.swaps);
}

// ---- 4. Midpoint rooting: nueva raíz equidistante del diámetro, sin perder longitud ----
{
  const [A, B, C] = [leaf(0, 'A'), leaf(1, 'B'), leaf(2, 'C')];
  // raíz con 3 hijos: A a 1, B a 9, C a 1 -> diámetro A-B=10, punto medio a 5 de cada extremo
  const root = { id: 3, label: null, children: [{ node: A, length: 1 }, { node: B, length: 9 }, { node: C, length: 1 }] };
  const before = totalLength(root);
  const { root: rooted, diameter } = midpointRoot(root);
  check('midpoint: diámetro correcto (A-B = 10)', Math.abs(diameter - 10) < 1e-9, 'diameter=' + diameter);
  check('midpoint: la nueva raíz tiene exactamente 2 hijos (árbol enraizado, no trifurcación)', rooted.children.length === 2);
  function depthsOfLeaves(node, depth, out) {
    if (!node.children.length) { out[node.label] = depth; return; }
    for (const { node: c, length } of node.children) depthsOfLeaves(c, depth + length, out);
  }
  const depths = {};
  depthsOfLeaves(rooted, 0, depths);
  check('midpoint: A y B quedan equidistantes de la nueva raíz (5 cada uno)',
    Math.abs(depths.A - 5) < 1e-9 && Math.abs(depths.B - 5) < 1e-9, JSON.stringify(depths));
  check('midpoint: no se pierde ni se añade longitud total al árbol', Math.abs(totalLength(rooted) - before) < 1e-9,
    'antes=' + before + ' después=' + totalLength(rooted));
}

// ---- 5. Midpoint rooting sobre un árbol NJ real de mayor tamaño: sigue sin perder longitud ----
{
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(99);
  const n = 12;
  const labels = Array.from({ length: n }, (_, i) => 'S' + i);
  const D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = 1 + rnd() * 9; D[i][j] = v; D[j][i] = v; }
  const tree = neighborJoining(D, labels);
  const before = totalLength(tree);
  const { root: rooted } = midpointRoot(tree);
  check('midpoint (n=12, NJ real): raíz con 2 hijos', rooted.children.length === 2);
  check('midpoint (n=12, NJ real): longitud total conservada', Math.abs(totalLength(rooted) - before) < 1e-6,
    'antes=' + before.toFixed(6) + ' después=' + totalLength(rooted).toFixed(6));
}

// ---- 6. rerootAtLeaf: reenraizado por cepa de referencia (outgroup) ----
{
  const [A, B, C] = [leaf(0, 'A'), leaf(1, 'B'), leaf(2, 'C')];
  // raíz con 3 hijos: A a 6, B a 2, C a 2 -- reenraizar en A debe dejar la
  // mitad de SU rama (3) como distancia A-nuevaRaíz, y (B,C) como el resto
  // del árbol colgando del otro lado, sin perder longitud total
  const root = { id: 3, label: null, children: [{ node: A, length: 6 }, { node: B, length: 2 }, { node: C, length: 2 }] };
  const before = totalLength(root);
  const idOfA = collectLeaves(root).find((l) => l.label === 'A').id;
  const { root: rooted } = rerootAtLeaf(root, idOfA);
  check('rerootAtLeaf: la nueva raíz tiene exactamente 2 hijos', rooted.children.length === 2);
  function depthsOfLeaves(node, depth, out) {
    if (!node.children.length) { out[node.label] = depth; return; }
    for (const { node: c, length } of node.children) depthsOfLeaves(c, depth + length, out);
  }
  const depths = {};
  depthsOfLeaves(rooted, 0, depths);
  check('rerootAtLeaf: A queda a mitad de su propia rama (3 de 6) respecto a la nueva raíz',
    Math.abs(depths.A - 3) < 1e-9, JSON.stringify(depths));
  check('rerootAtLeaf: A queda como grupo externo (uno de los 2 hijos directos de la raíz es A)',
    rooted.children.some((ch) => ch.node.label === 'A' && Math.abs(ch.length - 3) < 1e-9), JSON.stringify(rooted.children.map((c) => [c.node.label, c.length])));
  check('rerootAtLeaf: no se pierde ni se añade longitud total al árbol', Math.abs(totalLength(rooted) - before) < 1e-9,
    'antes=' + before + ' después=' + totalLength(rooted));

  const idOfNonLeaf = 3; // el id de la raíz original, nunca es una hoja
  check('rerootAtLeaf: devuelve null si el id no es una hoja del árbol', rerootAtLeaf(root, idOfNonLeaf) === null);
  check('rerootAtLeaf: devuelve null con un id que no existe en el árbol', rerootAtLeaf(root, 9999) === null);
}

// ---- 7. rerootAtLeaf sobre un árbol NJ real: sigue sin perder longitud, converge con "sin enraizar -> referencia directa" ----
{
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(7);
  const n = 8;
  const labels = Array.from({ length: n }, (_, i) => 'R' + i);
  const D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = 1 + rnd() * 9; D[i][j] = v; D[j][i] = v; }
  const tree = neighborJoining(D, labels); // "sin enraizar" -- trifurcación directa de NJ
  const before = totalLength(tree);
  const idOfR3 = collectLeaves(tree).find((l) => l.label === 'R3').id;
  // aplicar directamente sobre el árbol SIN ENRAIZAR (sin pasar antes por midpointRoot), como pide el prompt
  const { root: rooted } = rerootAtLeaf(tree, idOfR3);
  check('rerootAtLeaf (NJ real, árbol sin enraizar previamente): raíz con 2 hijos', rooted.children.length === 2);
  check('rerootAtLeaf (NJ real): longitud total conservada', Math.abs(totalLength(rooted) - before) < 1e-6,
    'antes=' + before.toFixed(6) + ' después=' + totalLength(rooted).toFixed(6));
  check('rerootAtLeaf (NJ real): la cepa de referencia (R3) es uno de los 2 hijos directos de la nueva raíz',
    rooted.children.some((ch) => ch.node.label === 'R3'), JSON.stringify(rooted.children.map((c) => c.node.label)));
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
