// buildRectVennLayout() (js/lib/setDiagram.js) — geometría del Venn de
// rectángulos para 2, 3 y 4 conjuntos. Un Venn de 4 CÍRCULOS es imposible
// (un 4º círculo no puede cortar a los otros tres de la forma necesaria); la
// versión de rectángulos SÍ puede, y este test comprueba que la construcción
// (código Gray de 2 bits en columnas + partición simple o Gray en filas) es
// exacta: las 2^n-1 combinaciones no vacías aparecen todas, ninguna se repite,
// y cada etiqueta cae geométricamente dentro/fuera de los rectángulos que le
// corresponden según su máscara (no solo un recuento de claves).
//
//   node tests/venngeometry.mjs

import { APP_ROOT } from './lib/env.mjs';
const { buildRectVennLayout } = await import(APP_ROOT + '/js/lib/setDiagram.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

for (const n of [2, 3, 4]) {
  const layout = buildRectVennLayout(n);
  const maskKeys = Object.keys(layout.labels).map(Number);
  const expected = [];
  for (let m = 1; m < (1 << n); m++) expected.push(m);

  check(`n=${n}: exactamente ${expected.length} regiones etiquetadas (2^${n}-1)`, maskKeys.length === expected.length, 'got ' + maskKeys.length);
  check(`n=${n}: todas las combinaciones 1..${(1 << n) - 1} tienen etiqueta`,
    expected.every((m) => maskKeys.includes(m)), 'missing=' + expected.filter((m) => !maskKeys.includes(m)));
  check(`n=${n}: la máscara 0 (fuera de todos los conjuntos) no se etiqueta`, !('0' in layout.labels));
  check(`n=${n}: hay exactamente ${n} rectángulos (uno por conjunto)`, layout.shapes.length === n, 'got ' + layout.shapes.length);
  check(`n=${n}: los ${n} conjuntos tienen posición de nombre (nameAt)`, Object.keys(layout.nameAt).length === n);

  // geometría real: cada etiqueta debe caer DENTRO de los rectángulos de los
  // conjuntos que marca su máscara y FUERA de los demás — no basta con que
  // existan las claves, tienen que corresponder a la forma dibujada de verdad.
  let geomOk = true;
  for (const [maskStr, [lx, ly]] of Object.entries(layout.labels)) {
    const mask = Number(maskStr);
    for (let gi = 0; gi < n; gi++) {
      const sh = layout.shapes[gi];
      const inside = lx >= sh.x && lx <= sh.x + sh.width && ly >= sh.y && ly <= sh.y + sh.height;
      const shouldBeInside = !!((mask >> gi) & 1);
      if (inside !== shouldBeInside) {
        geomOk = false;
        console.log(`    mismatch: máscara ${mask}, conjunto ${gi}, dentro=${inside}, esperado=${shouldBeInside}`);
      }
    }
  }
  check(`n=${n}: cada etiqueta cae dentro/fuera de los rectángulos correctos (geometría real, no solo conteo)`, geomOk);

  const [, , vw, vh] = layout.vb;
  check(`n=${n}: todos los rectángulos caben en el viewBox`,
    layout.shapes.every((sh) => sh.x >= 0 && sh.y >= 0 && sh.x + sh.width <= vw && sh.y + sh.height <= vh));
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
