// statAnnotations.js: drawSignificanceBrackets — apilado de corchetes por
// pares (Paso 1 de qiimelab-prompt-editor-fase-1-anotaciones-estadisticas.md,
// refactor puro verificado abajo) + integración real en groupBoxplot.js
// (Paso 2: Mann-Whitney con 2 grupos / Dunn+ajuste con ≥3, leyendo las
// opciones persistidas del Paso 3 vía getStatsOptions).

import { drawSignificanceBrackets } from '../js/lib/statAnnotations.js';
import { mannWhitneyU, dunnTest } from '../js/lib/pairwiseStats.js';

// localStorage in-memory: getStatsOptions()/readChartStyleRaw() de
// chartEditor.js lo usan (con try/catch — sin esto seguirían funcionando,
// solo que siempre con las opciones por defecto). Con esto se puede probar
// también la lectura de opciones persistidas.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
})();

let failed = false;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (detail ? '  ' + detail : ''));
  if (!ok) failed = true;
}

// ---- mock DOM mínimo: solo lo que svgEl()/appendChild/removeChild tocan ----
function makeMockDoc() {
  function makeEl(tag) {
    const el = {
      tagName: tag,
      attributes: {},
      children: [],
      _text: '',
      setAttribute(k, v) { el.attributes[k] = String(v); },
      getAttribute(k) { return el.attributes[k] !== undefined ? el.attributes[k] : null; },
      appendChild(c) { el.children.push(c); return c; },
      removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
      get firstChild() { return el.children[0] || null; },
      get textContent() { return el._text; },
      set textContent(v) { el._text = v; },
      addEventListener() {},
      style: {},
    };
    return el;
  }
  return { createElementNS: (ns, tag) => makeEl(tag), createElement: (tag) => makeEl(tag) };
}
globalThis.document = makeMockDoc();

function findAll(el, pred, acc = []) {
  if (pred(el)) acc.push(el);
  el.children.forEach((c) => findAll(c, pred, acc));
  return acc;
}

console.log('--- drawSignificanceBrackets: un solo par ---');
{
  const svg = document.createElementNS('svg', 'svg');
  const res = drawSignificanceBrackets(svg, {
    pairs: [{ i: 0, j: 2, p: 0.02, label: '∗  Kruskal–Wallis, p = 0.0200' }],
    xPositions: [70, 210, 350],
    yTop: 28,
  });
  const paths = findAll(svg, (e) => e.tagName === 'path');
  const texts = findAll(svg, (e) => e.tagName === 'text');
  check('dibuja 1 path + 1 text', paths.length === 1 && texts.length === 1);
  check('path va de x=70 a x=350, con la muesca de 6px arriba/abajo de yTop',
    paths[0].getAttribute('d') === 'M70 34 V28 H350 V34');
  check('texto centrado en el punto medio, 5px por encima de yTop, con el label dado tal cual',
    texts[0].getAttribute('x') === '210' && texts[0].getAttribute('y') === '23' &&
    texts[0].textContent === '∗  Kruskal–Wallis, p = 0.0200');
  check('altura reservada = 1 fila (26) + margen (10) = 36, topY = yTop', res.height === 36 && res.topY === 28 && res.count === 1);
}

console.log('\n--- drawSignificanceBrackets: apilado cuando 2 pares chocan en X ---');
{
  const svg = document.createElementNS('svg', 'svg');
  const xPositions = [0, 100, 200];
  // (0,1) y (1,2) NO chocan entre sí (comparten solo el punto x=100) → misma fila;
  // (0,2) choca con ambos → sube una fila.
  const res = drawSignificanceBrackets(svg, {
    pairs: [{ i: 0, j: 1, p: 0.03 }, { i: 1, j: 2, p: 0.04 }, { i: 0, j: 2, p: 0.001 }],
    xPositions,
    yTop: 100,
    rowHeight: 26,
  });
  const paths = findAll(svg, (e) => e.tagName === 'path').map((p) => p.getAttribute('d'));
  check('(0,1) y (1,2) quedan en la fila 0 (y=100)', paths[0].includes(' V100 ') && paths[1].includes(' V100 '));
  check('(0,2) sube a la fila 1 (y=74 = 100-26)', paths[2].includes(' V74 '));
  check('altura reservada cubre 2 filas: 2*26+10=62, topY=100-26=74', res.height === 62 && res.topY === 74 && res.count === 3);
}

console.log('\n--- drawSignificanceBrackets: hideAbove filtra pares no significativos ---');
{
  const svg = document.createElementNS('svg', 'svg');
  const res = drawSignificanceBrackets(svg, {
    pairs: [{ i: 0, j: 1, p: 0.2 }, { i: 1, j: 2, p: 0.01 }],
    xPositions: [0, 100, 200],
    yTop: 50,
    hideAbove: 0.05,
  });
  check('solo dibuja el par con p <= 0.05', res.count === 1 && findAll(svg, (e) => e.tagName === 'path').length === 1);
}

console.log('\n--- drawSignificanceBrackets: sin pares → no dibuja nada ---');
{
  const svg = document.createElementNS('svg', 'svg');
  const res = drawSignificanceBrackets(svg, { pairs: [], xPositions: [0, 100], yTop: 50 });
  check('height=0, count=0, topY=yTop, sin hijos', res.height === 0 && res.count === 0 && res.topY === 50 && svg.children.length === 0);
}

console.log('\n--- drawSignificanceBrackets: sin label usa formatPStyled (estilo GP por defecto) ---');
{
  const svg = document.createElementNS('svg', 'svg');
  drawSignificanceBrackets(svg, { pairs: [{ i: 0, j: 1, p: 0.002 }], xPositions: [0, 100], yTop: 50 });
  const text = findAll(svg, (e) => e.tagName === 'text')[0];
  check('p=0.002 sin label → "**" (estilo GraphPad por defecto: ≤0.01, no ≤0.001)', text.textContent === '**');
}

console.log('\n--- Paso 2: drawGroupBoxplot/drawGroupStripPlot con 2 grupos usa Mann-Whitney directo ---');
{
  const { drawGroupBoxplot, drawGroupStripPlot } = await import('../js/lib/groupBoxplot.js');
  const groupNames = ['A', 'B'];
  const groupData = { A: [1, 2, 3, 4, 5], B: [10, 11, 12, 13, 14] }; // separación total
  const chartWrap = document.createElement('div');
  const tooltip = document.createElement('div');
  const expectedMw = mannWhitneyU(groupData.A, groupData.B);

  [['drawGroupBoxplot', drawGroupBoxplot], ['drawGroupStripPlot', drawGroupStripPlot]].forEach(([name, fn]) => {
    const svg = document.createElementNS('svg', 'svg');
    const { kw, statsControls } = fn({
      svg, chartWrap, tooltip, groupNames, groupData, key: 'test-2groups-' + name,
      title: 't', xTitle: 'x', yTitle: 'y', valueLabel: 'v',
    });
    check(name + ': sigue calculando Kruskal-Wallis (informativo, para el cuadro de estadística)', kw && isFinite(kw.p));
    check(name + ': statsControls.hasMultiGroup es false con 2 grupos', statsControls.hasMultiGroup === false);

    const sigG = findAll(svg, (e) => e.getAttribute && e.getAttribute('data-ce') === 'sig')[0];
    const text = sigG && findAll(sigG, (e) => e.tagName === 'text')[0];
    // por defecto: mode='stars+exact', style='gp' → "** (0.0079)", NO la
    // frase de Kruskal-Wallis de antes de Paso 2 (el propio prompt pide
    // Mann-Whitney directo con 2 grupos, no un post-hoc de un solo par).
    const expectedStars = expectedMw.p <= 0.0001 ? '****' : expectedMw.p <= 0.001 ? '***' : expectedMw.p <= 0.01 ? '**' : expectedMw.p <= 0.05 ? '*' : 'ns';
    const expectedText = expectedStars + ' (' + expectedMw.p.toFixed(4) + ')';
    check(name + ': el corchete usa el p de mannWhitneyU (no el de kruskalWallis)',
      text && text.textContent === expectedText,
      'esperado="' + expectedText + '" obtenido="' + (text && text.textContent) + '" (mw.p=' + expectedMw.p + ', kw.p=' + kw.p + ')');
  });
}

console.log('\n--- Paso 2: con ≥3 grupos usa Dunn post-hoc + ajuste (holm por defecto) ---');
{
  const { drawGroupBoxplot } = await import('../js/lib/groupBoxplot.js');
  const groupNames = ['A', 'B', 'C'];
  const groupData = { A: [1, 2, 2, 3, 4], B: [10, 11, 12, 13, 14], C: [1.5, 2.5, 2, 3.5, 3] }; // B muy distinto de A y C; A≈C
  const chartWrap = document.createElement('div');
  const tooltip = document.createElement('div');
  const expectedDunn = dunnTest(groupNames.map((g) => ({ label: g, values: groupData[g] })));

  const svg = document.createElementNS('svg', 'svg');
  const { statsControls } = drawGroupBoxplot({
    svg, chartWrap, tooltip, groupNames, groupData, key: 'test-3groups',
    title: 't', xTitle: 'x', yTitle: 'y', valueLabel: 'v',
  });
  check('statsControls.hasMultiGroup es true con 3 grupos', statsControls.hasMultiGroup === true);

  const sigG = findAll(svg, (e) => e.getAttribute && e.getAttribute('data-ce') === 'sig')[0];
  const texts = sigG ? findAll(sigG, (e) => e.tagName === 'text').map((t) => t.textContent) : [];
  const expectedShown = expectedDunn.comparisons.filter((c) => c.adj.holm <= 0.05);
  check('dibuja exactamente los pares cuyo p ajustado por Holm es significativo (' + expectedShown.length + ')',
    texts.length === expectedShown.length, 'obtenido=' + JSON.stringify(texts));
}

console.log('\n--- Paso 3: getStatsOptions persistidas cambian modo/estilo/umbral/método ---');
{
  const { drawGroupBoxplot } = await import('../js/lib/groupBoxplot.js');
  const groupNames = ['A', 'B', 'C'];
  const groupData = { A: [1, 2, 2, 3, 4], B: [10, 11, 12, 13, 14], C: [1.5, 2.5, 2, 3.5, 3] };
  const chartWrap = document.createElement('div');
  const tooltip = document.createElement('div');
  const key = 'test-custom-options';
  const expectedDunn = dunnTest(groupNames.map((g) => ({ label: g, values: groupData[g] })));

  // modo 'stars' puro + umbral laxo (0.5, deja pasar más pares) + método BH
  localStorage.setItem('smart-175.chartStyle.' + key, JSON.stringify({
    __stats: { mode: 'stars', threshold: 0.5, method: 'BH' },
  }));

  const svg = document.createElementNS('svg', 'svg');
  drawGroupBoxplot({
    svg, chartWrap, tooltip, groupNames, groupData, key,
    title: 't', xTitle: 'x', yTitle: 'y', valueLabel: 'v',
  });
  const sigG = findAll(svg, (e) => e.getAttribute && e.getAttribute('data-ce') === 'sig')[0];
  const texts = sigG ? findAll(sigG, (e) => e.tagName === 'text').map((t) => t.textContent) : [];
  check('modo "stars" no incluye el p exacto entre paréntesis', texts.every((t) => !t.includes('(')), JSON.stringify(texts));
  const expectedShownBH = expectedDunn.comparisons.filter((c) => c.adj.BH <= 0.5);
  check('umbral 0.5 + método BH: nº de pares mostrados coincide con adj.BH<=0.5 (' + expectedShownBH.length + ')',
    texts.length === expectedShownBH.length, 'obtenido=' + JSON.stringify(texts));

  localStorage.removeItem('smart-175.chartStyle.' + key);
}

console.log('\n--- Resumen ---');
if (failed) {
  console.error('❌ Fallaron algunos tests.');
  process.exit(1);
} else {
  console.log('✅ Todos los tests pasaron exitosamente.');
  process.exit(0);
}
