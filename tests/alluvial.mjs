// Tests unitarios para el motor de diagramas aluviales en SVG puro (js/lib/alluvial.js)
// Verifica la fórmula estricta de curvas Bézier para enlaces, cálculo de matriz
// promediada por grupos y cálculo de layout de nodos y flujos.
//
// Ejecución:
//   node tests/alluvial.mjs

import { buildAlluvialLinkPath, computeGroupTaxaMatrix, computeAlluvialLayout } from '../js/lib/alluvial.js';

let failed = false;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (detail ? '  ' + detail : ''));
  if (!ok) failed = true;
}

console.log('\n--- 1. Fórmula estricta de enlace aluvial (curva Bézier) ---');
{
  const x0 = 100, y0 = 50, h0 = 40;
  const x1 = 300, y1 = 80, h1 = 30;
  const cx = (x0 + x1) / 2; // 200

  const path = buildAlluvialLinkPath(x0, y0, h0, x1, y1, h1);

  // M {x0},{y0} C {cx},{y0} {cx},{y1} {x1},{y1} L {x1},{y1+h1} C {cx},{y1+h1} {cx},{y0+h0} {x0},{y0+h0} Z
  // Esperado: M 100,50 C 200,50 200,80 300,80 L 300,110 C 200,110 200,90 100,90 Z
  const expected = `M 100,50 C 200,50 200,80 300,80 L 300,110 C 200,110 200,90 100,90 Z`;
  check('genera path con comando M en (x0, y0)', path.startsWith('M 100,50'));
  check('calcula cx exactamente como (x0+x1)/2 (200)', path.includes('C 200,50 200,80 300,80'));
  check('desciende por el borde derecho con L x1,y1+h1 (300,110)', path.includes('L 300,110'));
  check('curva de retorno con control points en cx (200)', path.includes('C 200,110 200,90 100,90'));
  check('cierra el polígono con comando Z', path.endsWith('Z'));
  check('cumple exactamente la fórmula requerida', path === expected, `path="${path}"`);
}

console.log('\n--- 2. Cálculo de matriz taxonómica promediada por grupos ---');
{
  const rows = [
    { sampleId: 'S1', group: 'T0', Bacteroides: '40', Firmicutes: '60' },
    { sampleId: 'S2', group: 'T0', Bacteroides: '20', Firmicutes: '80' },
    { sampleId: 'S3', group: 'T1', Bacteroides: '50', Firmicutes: '50' },
    { sampleId: 'S4', group: 'T1', Bacteroides: '70', Firmicutes: '30' },
  ];

  const res = computeGroupTaxaMatrix(
    rows,
    'sampleId',
    ['Bacteroides', 'Firmicutes'],
    (id) => rows.find((r) => r.sampleId === id)?.group
  );

  check('detecta los grupos únicos T0 y T1', res.groups.length === 2 && res.groups[0] === 'T0' && res.groups[1] === 'T1');
  check('cuenta muestras correctamente por grupo (2 en T0, 2 en T1)', res.sampleCounts.T0 === 2 && res.sampleCounts.T1 === 2);

  // En T0: S1 Bacteroides = 40/100 = 0.4, S2 Bacteroides = 20/100 = 0.2 -> media = 0.30
  check('calcula media de Bacteroides en T0 (0.30)', Math.abs(res.matrix.T0.Bacteroides - 0.3) < 1e-5);
  // En T0: Firmicutes media = 0.70
  check('calcula media de Firmicutes en T0 (0.70)', Math.abs(res.matrix.T0.Firmicutes - 0.7) < 1e-5);
  // En T1: S3 Bacteroides = 0.5, S4 = 0.7 -> media = 0.60
  check('calcula media de Bacteroides en T1 (0.60)', Math.abs(res.matrix.T1.Bacteroides - 0.6) < 1e-5);
  check('calcula media de Firmicutes en T1 (0.40)', Math.abs(res.matrix.T1.Firmicutes - 0.4) < 1e-5);

  // Suma de abundancias en cada grupo normaliza a 1.0 (100%)
  const sumT0 = res.matrix.T0.Bacteroides + res.matrix.T0.Firmicutes;
  const sumT1 = res.matrix.T1.Bacteroides + res.matrix.T1.Firmicutes;
  check('suma de abundancias en T0 normaliza a 1.0', Math.abs(sumT0 - 1.0) < 1e-5);
  check('suma de abundancias en T1 normaliza a 1.0', Math.abs(sumT1 - 1.0) < 1e-5);
}

console.log('\n--- 3. Cálculo de diseño Alluvial (Nodos y Enlaces) ---');
{
  const layout = computeAlluvialLayout({
    groups: ['T0', 'T1', 'T2'],
    taxa: [
      { key: 'Bac', label: 'Bacteroides', colorVar: '--cat-1' },
      { key: 'Fir', label: 'Firmicutes', colorVar: '--cat-2' },
      { key: 'Act', label: 'Actinobacteria', colorVar: '--cat-3' },
    ],
    matrix: {
      T0: { Bac: 0.5, Fir: 0.3, Act: 0.2 },
      T1: { Bac: 0.4, Fir: 0.4, Act: 0.2 },
      T2: { Bac: 0.2, Fir: 0.6, Act: 0.2 },
    },
    sampleCounts: { T0: 5, T1: 5, T2: 5 },
  }, {
    width: 600,
    height: 400,
    nodeWidth: 20,
    nodeGap: 2,
    margin: { top: 40, right: 40, bottom: 40, left: 40 },
  });

  check('genera 3 columnas', layout.columns.length === 3);
  check('posiciona primera columna en margin.left (40)', layout.columns[0].x === 40);
  check('posiciona última columna en width - margin.right - nodeWidth (540)', layout.columns[2].x === 540);
  check('genera 9 nodos (3 taxones × 3 grupos)', layout.nodes.length === 9);
  check('todos los nodos tienen coordenadas finitas y válidas',
    layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.width) && Number.isFinite(n.height)));

  // Enlaces: 3 taxones × 2 transiciones (T0->T1, T1->T2) = 6 enlaces
  check('genera 6 enlaces entre grupos adyacentes', layout.links.length === 6);
  check('todos los enlaces tienen path SVG válido no vacío',
    layout.links.every((l) => typeof l.d === 'string' && l.d.startsWith('M ') && l.d.endsWith(' Z')));

  // Enlace T0 -> T1 para Bacteroides
  const lBac01 = layout.links.find((l) => l.taxonKey === 'Bac' && l.sourceGroup === 'T0' && l.targetGroup === 'T1');
  check('enlace de Bacteroides conecta T0 con T1', Boolean(lBac01));
  check('x0 del enlace coincide con el borde derecho del nodo origen', lBac01.x0 === 40 + 20);
  check('x1 del enlace coincide con el borde izquierdo del nodo destino', lBac01.x1 === layout.columns[1].x);
}

console.log('\n--- 4. Casos límite (taxón que aparece o desaparece) ---');
{
  const layoutEdge = computeAlluvialLayout({
    groups: ['Antes', 'Después'],
    taxa: [
      { key: 'A', label: 'Taxon A', colorVar: '--cat-1' },
      { key: 'B', label: 'Taxon B', colorVar: '--cat-2' },
    ],
    matrix: {
      Antes: { A: 1.0, B: 0.0 }, // B no está presente
      Después: { A: 0.3, B: 0.7 }, // B aparece
    },
  });

  const nodeBAntes = layoutEdge.nodes.find((n) => n.taxonKey === 'B' && n.group === 'Antes');
  const nodeBDesp = layoutEdge.nodes.find((n) => n.taxonKey === 'B' && n.group === 'Después');
  check('nodo B en "Antes" tiene altura 0 (no presente)', nodeBAntes.height === 0);
  check('nodo B en "Después" tiene altura > 0 (aparece)', nodeBDesp.height > 0);

  const linkB = layoutEdge.links.find((l) => l.taxonKey === 'B');
  check('enlace para taxón B se genera correctamente expandiéndose desde h0=0',
    Boolean(linkB) && linkB.h0 === 0 && linkB.h1 > 0 && linkB.d.includes('Z'));
}

console.log('\nRESULTADO ALLUVIAL: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);

