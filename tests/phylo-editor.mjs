// Editor de gráficos en #/arbol (Fase 5.2 de qiimelab-prompt-editor-fase-5-
// especificos-por-tipo.md). Cambios de producción en esta fase:
//   - paletteSeries nuevo en el attachChartEditor de phylo.js: una serie
//     'branch' (ramas sin clado, backbone) + una por cada categoría de
//     matchedCategories -- antes solo la leyenda SVG llevaba
//     data-ce-series-fill (sembrado ya en una sesión previa) pero sin
//     paletteSeries registrado no hacía NADA al editarla.
//   - las líneas de rama/guía, el punto de hoja y la etiqueta de hoja
//     ahora llevan data-ce-series-fill/-stroke: si la hoja calza con una
//     categoría, 's'+índice (mismo id que su swatch de leyenda); si no,
//     'branch' (líneas/puntos sin clado -- las ETIQUETAS de texto NO
//     llevan 'branch' a propósito, para no perder legibilidad si alguien
//     pone las ramas de un color fuerte).
//   - se eliminó el bloque HTML #phylo-legend, redundante con la leyenda
//     ya dibujada DENTRO del svg (ahora la única, y ya editable).
//   - la barra de escala es ahora su propio elemento data-ce="scalebar"
//     (arrastrable/ocultable, como 'legend' o 'leaflabels').
// La cursiva del nombre de hoja NO necesitó código nuevo: 'leaflabels' ya
// estaba registrado como elemento kind:'group', y chartEditor.js YA aplica
// el toggle de cursiva a todo `text/tspan` dentro de un grupo -- este test
// lo confirma en vez de reimplementarlo.
// Soporte de bootstrap: NO implementado -- neighborJoining.js no calcula
// valores de soporte (no hay remuestreo bootstrap en el pipeline), así que
// no hay dato que anotar; añadirlo requeriría construir esa estadística
// primero, fuera del alcance de "controles del editor".
//
//   node tests/phylo-editor.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'phylo-editor' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

const openEditor = async () => {
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Personalizar|Customise/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(600);
};

try {
  await c.goto();
  await sleep(1500);
  await c.ev(`location.hash = '#/arbol'`);
  await sleep(1000);

  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Cargar ejemplo|Load example/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(2000);

  // metadatos sintéticos con las 16 hojas del FASTA de ejemplo repartidas
  // en 2 categorías -- así se puede ejercitar el color por clado sin
  // depender de que ningún dataset real comparta IDs con este árbol
  await c.ev(`(async () => {
    const st = await import('/js/state.js');
    const gramPos = ['Lactobacillus','Enterococcus','Streptococcus','Staphylococcus','Bifidobacterium','Corynebacterium','Actinomyces','Propionibacterium'];
    const gramNeg = ['Bacteroides','Prevotella','Porphyromonas','Alistipes','Escherichia','Salmonella','Klebsiella','Pseudomonas'];
    const rows = [
      ...gramPos.map((g) => ({ 'sample-id': g, grupo: 'Gram+' })),
      ...gramNeg.map((g) => ({ 'sample-id': g, grupo: 'Gram-' })),
    ];
    st.setSlot('metadata', { sourceFileId: null, headers: ['sample-id', 'grupo'], rows, sampleIdKey: 'sample-id' });
  })()`);
  await sleep(500);

  const colorSetup = await c.ev(`(() => {
    const sel = document.querySelector('#phylo-color-col');
    if (!sel) return { err: 'no hay selector de color por metadatos' };
    const hasGrupo = [...sel.options].some((o) => o.value === 'grupo');
    if (hasGrupo) { sel.value = 'grupo'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    return { hasGrupo };
  })()`);
  check('el selector "colorear por metadatos" ofrece la columna "grupo" tras cargar los metadatos sintéticos', colorSetup.hasGrupo, JSON.stringify(colorSetup));
  await sleep(800);

  // ================= leyenda única (sin duplicado HTML) =================
  console.log('-- leyenda: solo la del <svg>, sin el bloque HTML redundante --');
  const legendSetup = await c.ev(`(() => ({
    noDuplicateHtmlLegend: !document.getElementById('phylo-legend'),
    svgLegendPresent: !!document.querySelector('svg.ql-svg [data-ce="legend"]'),
    swatchCount: document.querySelectorAll('svg.ql-svg [data-ce="legend"] [data-ce-series-fill]').length,
  }))()`);
  check('ya no existe el bloque HTML #phylo-legend duplicado', legendSetup.noDuplicateHtmlLegend, JSON.stringify(legendSetup));
  check('la leyenda dentro del <svg> existe con 2 swatches (Gram+/Gram-), cada uno con data-ce-series-fill',
    legendSetup.svgLegendPresent && legendSetup.swatchCount === 2, JSON.stringify(legendSetup));

  // ================= paletteSeries: branch + clados =================
  console.log('\n-- editor: serie "Ramas" + una serie por clado --');
  await openEditor();
  const seriesSetup = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    const labels = blocks.map((b) => b.querySelector('.ce-pal-row-head label').textContent);
    return { n: blocks.length, labels };
  })()`);
  check('el panel de paleta trae 3 filas: "Ramas" + "Gram+" + "Gram-"',
    seriesSetup.n === 3 && seriesSetup.labels.includes('Ramas') && seriesSetup.labels.includes('Gram+') && seriesSetup.labels.includes('Gram-'),
    JSON.stringify(seriesSetup));

  // ---- editar la serie de clado "Gram+": recolorea puntos+etiquetas+ramas cercanas a la vez ----
  const beforeGramPos = await c.ev(`(() => {
    const dot = document.querySelector('[data-ce-series-fill="s0"].ql-phylo-leafdot');
    const label = document.querySelector('text[data-ce-series-fill="s0"].ql-phylo-leaflabel');
    return { dotFill: dot ? getComputedStyle(dot).fill : null, labelFill: label ? getComputedStyle(label).fill : null };
  })()`);
  const gramPosApplied = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    const block = blocks.find((b) => b.querySelector('.ce-pal-row-head label').textContent === 'Gram+');
    const inp = block.querySelector('.ce-pal-row-fill input[type=color]');
    inp.value = '#ff6600'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const dot = document.querySelector('[data-ce-series-fill="s0"].ql-phylo-leafdot');
    const label = document.querySelector('text[data-ce-series-fill="s0"].ql-phylo-leaflabel');
    const branchLine = document.querySelector('line[data-ce-series-stroke="s0"]');
    const legendSwatch = document.querySelector('[data-ce="legend"] [data-ce-series-fill="s0"]');
    return {
      dotFill: dot ? getComputedStyle(dot).fill : null,
      labelFill: label ? getComputedStyle(label).fill : null,
      branchStroke: branchLine ? getComputedStyle(branchLine).stroke : null,
      legendSwatchFill: legendSwatch ? getComputedStyle(legendSwatch).fill : null,
    };
  })()`);
  check('editar la serie "Gram+" recolorea el punto de hoja (fill:#ff6600)',
    gramPosApplied.dotFill === 'rgb(255, 102, 0)' && gramPosApplied.dotFill !== beforeGramPos.dotFill, JSON.stringify({ beforeGramPos, ...gramPosApplied }));
  check('...también la etiqueta de texto de esa hoja', gramPosApplied.labelFill === 'rgb(255, 102, 0)', JSON.stringify(gramPosApplied));
  check('...también la rama que llega a esa hoja (mismo id de serie)', gramPosApplied.branchStroke === 'rgb(255, 102, 0)', JSON.stringify(gramPosApplied));
  check('...y el swatch de la leyenda EN VIVO dentro del svg (antes estático/no editable)', gramPosApplied.legendSwatchFill === 'rgb(255, 102, 0)', JSON.stringify(gramPosApplied));

  // ---- editar la serie "branch": solo afecta al backbone sin clado, no a las hojas coloreadas ----
  console.log('\n-- editor: serie "Ramas" (backbone sin clado) --');
  const branchApplied = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    const block = blocks.find((b) => b.querySelector('.ce-pal-row-head label').textContent === 'Ramas');
    const inp = block.querySelector('.ce-pal-row-fill input[type=color]');
    inp.value = '#0000ff'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const backbone = document.querySelector('line[data-ce-series-stroke="branch"]');
    const gramPosDotStillOrange = document.querySelector('[data-ce-series-fill="s0"].ql-phylo-leafdot');
    return {
      backboneStroke: backbone ? getComputedStyle(backbone).stroke : null,
      gramPosDotFill: gramPosDotStillOrange ? getComputedStyle(gramPosDotStillOrange).fill : null,
    };
  })()`);
  check('editar "Ramas" recolorea el backbone (líneas internas sin clado) a azul',
    branchApplied.backboneStroke === 'rgb(0, 0, 255)', JSON.stringify(branchApplied));
  check('...sin tocar el punto de hoja ya recoloreado de la serie "Gram+" (series independientes)',
    branchApplied.gramPosDotFill === 'rgb(255, 102, 0)', JSON.stringify(branchApplied));

  // ================= barra de escala: elemento propio arrastrable =================
  console.log('\n-- barra de escala como elemento propio (data-ce="scalebar") --');
  const scalebarSetup = await c.ev(`(() => {
    const hits = [...document.querySelectorAll('.ce-hit')];
    const h = hits.find((el) => el.closest('.ce-el') && el.closest('.ce-el').querySelector('[data-ce="scalebar"]'));
    if (!h) return { err: 'no se encontró el tirador de scalebar', n: hits.length };
    h.focus();
    window.__sh = h; window.__swrap = h.closest('.ce-el');
    return { ok: true };
  })()`);
  check('la barra de escala es un elemento registrado y arrastrable (tirador .ce-hit)', scalebarSetup.ok, JSON.stringify(scalebarSetup));
  if (scalebarSetup.ok) {
    for (let i = 0; i < 4; i++) { await c.ev(`window.__sh.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))`); await sleep(60); }
    const moved = await c.ev(`(() => { const m = /translate\\(([-\\d.]+),\\s*([-\\d.]+)\\)/.exec(window.__swrap.getAttribute('transform') || ''); return { dx: m ? +m[1] : null }; })()`);
    check('4 × flecha derecha mueve la barra de escala 8px (2px por paso)', moved.dx === 8, JSON.stringify(moved));
  }

  // ================= cursiva del nombre de hoja: generalización ya existente, sin código nuevo =================
  console.log('\n-- cursiva de las etiquetas de hoja (grupo "leaflabels", ya genérico) --');
  const italicSetup = await c.ev(`(() => {
    const wrap = document.querySelector('[data-ce-id="leaflabels"]');
    if (!wrap) return { err: 'no se encontró el grupo leaflabels registrado' };
    wrap.querySelector('.ce-hit')?.focus();
    return { ok: true };
  })()`);
  // el panel de un elemento se abre pulsando su tirador (Intro) o haciendo clic en él directamente
  const italicApplied = await c.ev(`(() => {
    const hit = document.querySelector('[data-ce-id="leaflabels"] .ce-hit');
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return { panelOpen: !!document.querySelector('.ce-panel') };
  })()`);
  await sleep(300);
  const italicResult = await c.ev(`(() => {
    const iBtn = [...document.querySelectorAll('.ce-panel button')].find((b) => b.textContent.trim() === 'I');
    if (!iBtn) return { err: 'no se encontró el botón de cursiva en el panel' };
    iBtn.click();
    const labels = [...document.querySelectorAll('svg.ql-svg text.ql-phylo-leaflabel')];
    const allItalic = labels.length > 0 && labels.every((t) => getComputedStyle(t).fontStyle === 'italic');
    return { nLabels: labels.length, allItalic };
  })()`);
  check('activar cursiva en el grupo "leaflabels" pone font-style:italic en las 16 etiquetas de hoja a la vez (comportamiento genérico kind:"group", sin código nuevo en phylo.js)',
    italicResult.nLabels === 16 && italicResult.allItalic, JSON.stringify({ italicSetup, italicApplied, ...italicResult }));

  check('sin errores de consola', c.problems.length === 0, c.problems.join('; '));
} catch (e) {
  console.error('EXCEPCIÓN:', e.message);
  failed = true;
} finally {
  c.kill();
  if (server.started) server.stop();
}
console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
