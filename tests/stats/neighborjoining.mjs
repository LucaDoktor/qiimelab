// neighborJoining(distMatrix, labels) contra el ejemplo de 5 taxones publicado
// en la entrada de Wikipedia "Neighbor joining" (sección "Example"), con
// verificación adicional contra `ape::nj()` — mismo patrón que el resto de
// tests/stats/: JS vs GOLDEN siempre, R vivo si está disponible.
//
// La matriz de entrada es exactamente la publicada; el GOLDEN son las
// distancias patrísticas (suma de longitudes de rama por el camino entre
// cada pareja de hojas) que el propio artículo dice que el árbol reproduce
// EXACTO a partir de la matriz original — no depende de cómo cada
// implementación numere sus nodos internos, así que compara limpio contra
// ape::nj() sin asumir su indexado interno. Aparte, se comprueban a mano las
// 7 longitudes de rama con nombre que da el artículo (a=2, b=3, u→v=3, c=4,
// v→w=2, d=2, e=1), como referencia citable independiente de ape.

import { APP_ROOT, hasR, hasRPackage, verify, tmp, done } from './_shared.mjs';

const { neighborJoining } = await import(APP_ROOT + '/js/lib/neighborJoining.js');

const labels = ['a', 'b', 'c', 'd', 'e'];
const D = [
  [0, 5, 9, 9, 8],
  [5, 0, 10, 10, 9],
  [9, 10, 0, 8, 7],
  [9, 10, 8, 0, 3],
  [8, 9, 7, 3, 0],
];
const tree = neighborJoining(D, labels);

function patristic(root, a, b) {
  function pathTo(node, label, acc) {
    if (node.label === label) return acc;
    for (const ch of node.children) {
      const r = pathTo(ch.node, label, [...acc, { id: ch.node.id, length: ch.length }]);
      if (r) return r;
    }
    return null;
  }
  const pa = pathTo(root, a, []), pb = pathTo(root, b, []);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i].id === pb[i].id) i++;
  const sumFrom = (arr, start) => arr.slice(start).reduce((s, e) => s + e.length, 0);
  return sumFrom(pa, i) + sumFrom(pb, i);
}

const PAIRS = [['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e'], ['b', 'c'], ['b', 'd'], ['b', 'e'], ['c', 'd'], ['c', 'e'], ['d', 'e']];
const js = PAIRS.map(([a, b]) => patristic(tree, a, b));
// GOLDEN = la propia matriz de entrada (el artículo dice que este árbol la
// reproduce exacta) — confirmado también recalculando con ape::nj() +
// cophenetic() al escribir este test (ver rScript de abajo).
const GOLDEN = PAIRS.map(([a, b]) => D[labels.indexOf(a)][labels.indexOf(b)]);

let ok = verify({
  name: 'NJ: distancias patrísticas reproducen la matriz original (Wikipedia, ejemplo NJ)',
  js, golden: GOLDEN, tol: 1e-9, rPkg: 'ape',
  rScript: () => {
    const f = tmp('njD.json', JSON.stringify({ D, labels }));
    return `suppressMessages(library(ape)); library(jsonlite)
d <- jsonlite::fromJSON("${f}")
labels <- d$labels
Dm <- matrix(unlist(d$D), nrow=length(labels), byrow=TRUE, dimnames=list(labels, labels))
tree <- nj(as.dist(Dm))
cop <- cophenetic(tree)
pairs <- list(c('a','b'),c('a','c'),c('a','d'),c('a','e'),c('b','c'),c('b','d'),c('b','e'),c('c','d'),c('c','e'),c('d','e'))
vals <- sapply(pairs, function(p) cop[p[1], p[2]])
cat(jsonlite::toJSON(vals, digits=16))`;
  },
});

// --- valores de rama con nombre, tal cual los publica el artículo ---
const checks = [];
const note = (m, pass) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m); };
const approx = (v, exp) => Math.abs(v - exp) < 1e-9;

function findNode(node, pred) {
  if (pred(node)) return node;
  for (const ch of node.children) { const f = findNode(ch.node, pred); if (f) return f; }
  return null;
}
note('raíz = trifurcación (árbol NJ propiamente no enraizado)', tree.children.length === 3);
const u = findNode(tree, (n) => n.children.length === 2 && n.children.some((c) => c.node.label === 'a') && n.children.some((c) => c.node.label === 'b'));
note('nodo u = join(a,b) existe', !!u);
if (u) {
  note('rama a = 2', approx(u.children.find((c) => c.node.label === 'a').length, 2));
  note('rama b = 3', approx(u.children.find((c) => c.node.label === 'b').length, 3));
}
const v = u && findNode(tree, (n) => n.children.length === 2 && n.children.some((c) => c.node === u) && n.children.some((c) => c.node.label === 'c'));
note('nodo v = join(u,c) existe', !!v);
if (v) {
  note('rama u→v = 3', approx(v.children.find((c) => c.node === u).length, 3));
  note('rama c = 4', approx(v.children.find((c) => c.node.label === 'c').length, 4));
  const vEdge = tree.children.find((c) => c.node === v);
  const dEdge = tree.children.find((c) => c.node.label === 'd');
  const eEdge = tree.children.find((c) => c.node.label === 'e');
  note('rama v→w = 2', !!vEdge && approx(vEdge.length, 2));
  note('rama d = 2', !!dEdge && approx(dEdge.length, 2));
  note('rama e = 1', !!eEdge && approx(eEdge.length, 1));
}

// --- casos pequeños (n=2, n=3), no cubiertos por el ejemplo de 5 taxones ---
const t2 = neighborJoining([[0, 4], [4, 0]], ['x', 'y']);
note('n=2: dos hojas, rama = d/2 cada una', t2.children.length === 2 && approx(t2.children[0].length, 2) && approx(t2.children[1].length, 2));
const t3 = neighborJoining([[0, 5, 9], [5, 0, 10], [9, 10, 0]], ['p', 'q', 'r']);
note('n=3: trifurcación directa de las 3 hojas', t3.children.length === 3 && t3.children.every((c) => c.node.children.length === 0));
note('n=3: fórmula del triángulo (p,q,r)', approx(t3.children.find((c) => c.node.label === 'p').length, (5 + 9 - 10) / 2));

if (!hasR() || !hasRPackage('ape')) {
  console.log('  (R/ape no disponible: solo modo GOLDEN)');
}

done('neighborjoining', ok && checks.every(Boolean));
