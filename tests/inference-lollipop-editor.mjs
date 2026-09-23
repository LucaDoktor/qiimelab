// Editor de gráficos en el lollipop de #/inferencia (Fase 5.6 de
// qiimelab-prompt-editor-fase-5-especificos-por-tipo.md, bullet "grosor
// de línea de palillo en AMBOS lollipop"). El de differentialAbundance.js
// YA tenía data-ce-series-stroke + paletteSeries (confirmado por lectura
// de código, sin cambios ahí); el de inference.js NO -- exactamente lo
// que el prompt decía haber confirmado en su auditoría. Cambios:
//   - la línea de "palillo" (tallo desde 0, o el rango entre grupos)
//     ahora lleva data-ce-series-stroke:'stick', con una serie 'stick'
//     nueva en paletteSeries -- color y grosor editables vía el control
//     de "borde independiente" de la Fase 2 (mismo patrón que sanger.js).
//   - bug real encontrado de paso, mismo patrón que ya se corrigió en
//     otros módulos: paint() destruye `editor` ANTES de despachar a
//     renderLollipop/renderStackedBarplot/renderAlluvialDiagram
//     (funciones hermanas) sin capturar isEditing() -- cambiar de vista o
//     de base de datos con "Personalizar" abierto lo cerraba solo. Ahora
//     las 3 usan startEditing.
// Las otras 2 sub-fases de 5.6 (etiquetas de punto en volcano, tamaño de
// punto por abundancia) NO se tocan aquí: las etiquetas de punto YA
// estaban implementadas de fábrica en differentialAbundance.js (labelN,
// selección top-N por padj, evitación de solape por niveles) -- otro caso
// de auditoría del prompt ya desactualizada; el tamaño por abundancia
// media SÍ es un hueco real pero necesita una fuente de datos que hoy no
// existe (ningún campo de abundancia media en las filas de resultado),
// fuera del alcance de "enganchar infraestructura ya existente" con el
// tiempo que queda de esta sesión.
//
//   node tests/inference-lollipop-editor.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'inference-lollipop-editor' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

const openEditor = async () => {
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Personalizar|Customise/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(600);
};

try {
  await c.goto();
  await sleep(1500);
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealCommunityData(); })()`);
  await sleep(2000);
  await c.ev(`location.hash = '#/inferencia'`);
  await sleep(1800);

  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-seg-btn')].find((x) => x.textContent.trim() === 'Lollipop'); if (b) b.click(); })()`);
  await sleep(1000);
  const drawn = await c.ev(`document.querySelectorAll('svg[role=img] line[data-ce-series-stroke="stick"]').length`);
  check('el lollipop dibuja al menos una línea de palillo etiquetada data-ce-series-stroke="stick"', drawn > 0, 'n=' + drawn);

  console.log('\n-- editor: serie "Palillo" (color + grosor) --');
  await openEditor();
  const seriesSetup = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    return { n: blocks.length, labels: blocks.map((b) => b.querySelector('.ce-pal-row-head label').textContent) };
  })()`);
  check('el panel trae la serie "Palillo"', seriesSetup.n >= 1 && seriesSetup.labels.includes('Palillo'), JSON.stringify(seriesSetup));

  const before = await c.ev(`(() => {
    const l = document.querySelector('line[data-ce-series-stroke="stick"]');
    return { stroke: l ? getComputedStyle(l).stroke : null, width: l ? getComputedStyle(l).strokeWidth : null };
  })()`);
  const colorApplied = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    const block = blocks.find((b) => b.querySelector('.ce-pal-row-head label').textContent === 'Palillo');
    const inp = block.querySelector('.ce-pal-row-fill input[type=color]');
    inp.value = '#ab00ff'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const l = document.querySelector('line[data-ce-series-stroke="stick"]');
    return { stroke: l ? getComputedStyle(l).stroke : null };
  })()`);
  check('cambiar el color de la serie "Palillo" recolorea la línea de tallo',
    colorApplied.stroke === 'rgb(171, 0, 255)' && colorApplied.stroke !== before.stroke, JSON.stringify({ before, ...colorApplied }));

  const widthApplied = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    const block = blocks.find((b) => b.querySelector('.ce-pal-row-head label').textContent === 'Palillo');
    const det = block.querySelector('.ce-pal-border');
    if (!det) return { err: 'no hay control de borde en esta serie' };
    det.open = true;
    const widthInp = [...det.querySelectorAll('input[type=number]')][0];
    widthInp.value = '4'; widthInp.dispatchEvent(new Event('change', { bubbles: true }));
    const l = document.querySelector('line[data-ce-series-stroke="stick"]');
    return { width: l ? getComputedStyle(l).strokeWidth : null };
  })()`);
  check('el control de "borde" de la serie "Palillo" fija su grosor (nodo solo -stroke, sin -fill)',
    widthApplied.width === '4px' && widthApplied.width !== before.width, JSON.stringify({ before, ...widthApplied }));

  console.log('\n-- startEditing: cambiar de vista (Barras <-> Lollipop) no cierra el editor --');
  const beforeSwitch = await c.ev(`(() => ({ open: document.querySelectorAll('.ce-pal-row-block').length > 0 }))()`);
  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-seg-btn')].find((x) => /Barras/i.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(700);
  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-seg-btn')].find((x) => x.textContent.trim() === 'Lollipop'); if (b) b.click(); })()`);
  await sleep(700);
  const afterSwitch = await c.ev(`(() => ({ open: document.querySelectorAll('.ce-pal-row-block').length > 0 }))()`);
  check('tras alternar Barras -> Lollipop, "Personalizar" sigue abierto (startEditing corrige el cierre automático)',
    beforeSwitch.open && afterSwitch.open, JSON.stringify({ beforeSwitch, afterSwitch }));

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
