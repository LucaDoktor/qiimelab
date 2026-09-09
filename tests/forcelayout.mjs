// Invariantes del layout de fuerzas (js/lib/forceLayout.js), sin depender del
// navegador: (a) sin NaN/Infinity, (b) componentes conexas separadas,
// (c) misma semilla → coordenadas bit-idénticas.
//
//   node tests/forcelayout.mjs

import { APP_ROOT } from './lib/env.mjs';
const { forceLayout } = await import(APP_ROOT + '/js/lib/forceLayout.js');

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// caso de juguete: 4 nodos, 2 parejas conectadas, sin aristas entre parejas
const nodes = ['a', 'b', 'c', 'd'];
const edges = [
  { source: 'a', target: 'b', weight: 0.8 },
  { source: 'c', target: 'd', weight: 0.8 },
];
const r1 = forceLayout(nodes, edges, { width: 600, height: 440, seed: 12345, iterations: 300 });
const r2 = forceLayout(nodes, edges, { width: 600, height: 440, seed: 12345, iterations: 300 });

check('(a) todas las coordenadas finitas',
  nodes.every((id) => Number.isFinite(r1[id].x) && Number.isFinite(r1[id].y)));

const intra = Math.max(dist(r1.a, r1.b), dist(r1.c, r1.d));
const inter = Math.min(dist(r1.a, r1.c), dist(r1.a, r1.d), dist(r1.b, r1.c), dist(r1.b, r1.d));
const ratio = inter / intra;
check('(b) componentes conexas separadas (ratio > 1.5)', ratio > 1.5,
  `intra=${intra.toFixed(1)} inter=${inter.toFixed(1)} ratio=${ratio.toFixed(2)}`);

check('(c) misma semilla → coordenadas bit-idénticas',
  nodes.every((id) => r1[id].x === r2[id].x && r1[id].y === r2[id].y));

// robustez extra: cadena de 10 nodos y grafo sin aristas → sin NaN
const big = Array.from({ length: 10 }, (_, i) => 'n' + i);
const bigEdges = big.slice(1).map((_, i) => ({ source: 'n' + i, target: 'n' + (i + 1), weight: 0.2 + (i % 5) * 0.15 }));
const rb = forceLayout(big, bigEdges, { seed: 777 });
check('extra: 10 nodos → todas finitas', big.every((id) => Number.isFinite(rb[id].x) && Number.isFinite(rb[id].y)));
const rn = forceLayout(['x', 'y', 'z'], [], { seed: 1 });
check('extra: 0 aristas → todas finitas', ['x', 'y', 'z'].every((id) => Number.isFinite(rn[id].x)));

// determinismo con semilla distinta de la de arranque
const s1 = forceLayout(nodes, edges, { seed: 42 });
const s2 = forceLayout(nodes, edges, { seed: 42 });
check('extra: otra semilla también bit-idéntica', nodes.every((id) => s1[id].x === s2[id].x && s1[id].y === s2[id].y));

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
