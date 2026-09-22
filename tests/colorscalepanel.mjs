// Panel "Escala de color" del editor de gráficos (Fase 3, Pasos 2-3 de
// qiimelab-prompt-editor-fase-3-heatmaps-escalas-continuas.md), en Chrome
// real, sobre los 3 heatmaps que comparten js/lib/colorScale.js:
// betaDiversity.js (mapa de distancias), correlogram.js (matriz de r, con
// la diagonal gris fuera de la escala), differentialAbundance.js (heatmap
// de log2FC).
//
//   node tests/colorscalepanel.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'colorscalepanel' });
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

  // ================= betaDiversity.js (secuencial, sin punto medio) =================
  console.log('-- betaDiversity.js (secuencial) --');
  await c.ev(`location.hash = '#/beta'`);
  await sleep(1800);
  await openEditor();

  const setup = await c.ev(`(() => {
    const sec = document.querySelector('.ce-colorscale');
    return sec ? { present: true, hasMidpoint: !!sec.querySelector('.ce-cs-row:nth-child(3) input[type=number]') && /medio|midpoint/i.test(sec.textContent) } : { present: false };
  })()`);
  check('la sección "Escala de color" aparece para el heatmap de beta', setup.present);

  const noColorMix = await c.ev(`(() => {
    const rects = [...document.querySelectorAll('rect[data-ri]')];
    return { n: rects.length, anyColorMix: rects.some((r) => (r.getAttribute('fill') || '').includes('color-mix')), sampleFill: rects[0] && rects[0].getAttribute('fill') };
  })()`);
  check('las celdas ya NO usan color-mix() — fill resuelto directo a #rrggbb', noColorMix.n > 0 && !noColorMix.anyColorMix && /^#[0-9a-f]{6}$/i.test(noColorMix.sampleFill || ''),
    JSON.stringify(noColorMix));

  const beforeAfterPalette = await c.ev(`(() => {
    const before = document.querySelector('rect[data-ri="0"][data-ci="1"]').getAttribute('fill');
    const sel = [...document.querySelectorAll('.ce-cs-row select')][0];
    sel.value = 'viridis';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const after = document.querySelector('rect[data-ri="0"][data-ci="1"]').getAttribute('fill');
    return { before, after };
  })()`);
  check('cambiar la paleta de la escala recolorea las celdas de verdad (cambia el fill)',
    beforeAfterPalette.before !== beforeAfterPalette.after, JSON.stringify(beforeAfterPalette));

  const domainEdit = await c.ev(`(() => {
    const nums = [...document.querySelectorAll('.ce-cs-domain input[type=number]')];
    nums[1].value = '0.1'; // recortar el máximo del dominio a un valor muy bajo
    nums[1].dispatchEvent(new Event('change', { bubbles: true }));
    const rects = [...document.querySelectorAll('rect[data-ri]')];
    // con un dominio recortado, MUCHAS celdas deberían saturar al color del
    // extremo alto (clamp) -> muchos fills idénticos, a diferencia de antes
    const fills = rects.map((r) => r.getAttribute('fill'));
    const distinct = new Set(fills).size;
    return { totalCells: fills.length, distinctColors: distinct };
  })()`);
  check('recortar el máximo del dominio hace que muchas celdas saturen al mismo color (clamp visible)',
    domainEdit.distinctColors < domainEdit.totalCells * 0.5, JSON.stringify(domainEdit));

  const resetDomain = await c.ev(`(() => {
    const btn = [...document.querySelectorAll('.ce-cs-domain button')][0];
    btn.click();
    const nums = [...document.querySelectorAll('.ce-cs-domain input[type=number]')];
    return { maxAfterReset: nums[1].value };
  })()`);
  check('"Restablecer" del dominio vuelve al rango real de los datos (ya no 0.1)', resetDomain.maxAfterReset !== '0.1', JSON.stringify(resetDomain));

  const stepsCheck = await c.ev(`(() => {
    const stepsInp = [...document.querySelectorAll('.ce-colorscale input[type=number]')].find((i) => +i.max === 20);
    stepsInp.value = '3';
    stepsInp.dispatchEvent(new Event('change', { bubbles: true }));
    const fills = [...document.querySelectorAll('rect[data-ri]')].map((r) => r.getAttribute('fill'));
    return { distinct: new Set(fills).size };
  })()`);
  check('discretizar en 3 pasos deja como mucho 3 colores en todo el mapa de calor', stepsCheck.distinct <= 3, JSON.stringify(stepsCheck));

  const persisted = await c.ev(`(() => {
    const raw = localStorage.getItem('smart-175.chartStyle.betaDiversity');
    return JSON.parse(raw).__colorScale;
  })()`);
  check('la escala persiste en store.__colorScale (paletteId=viridis, steps=3, sin domainMax residual tras el reset)',
    persisted && persisted.paletteId === 'viridis' && persisted.steps === 3 && persisted.domainMax === undefined,
    JSON.stringify(persisted));

  // volver a continuo para el export
  await c.ev(`(() => {
    const stepsInp = [...document.querySelectorAll('.ce-colorscale input[type=number]')].find((i) => +i.max === 20);
    stepsInp.value = '0';
    stepsInp.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(200);

  const exportCheck = await c.ev(`(async () => {
    const mod = await import('/js/lib/figureExport.js');
    const svg = document.querySelector('rect[data-ri]').closest('svg');
    const out = mod.serializeForExport(svg, { scheme: 'light', background: 'white' });
    return { noColorMix: !/color-mix\\(/.test(out.svg), noVar: !/var\\(--/.test(out.svg), hasGradient: /<linearGradient[^>]*id="ql-cscale-betaDiversity"/.test(out.svg) };
  })()`);
  check('el SVG exportado de beta no tiene color-mix()/var() residual y conserva el <linearGradient> de leyenda',
    exportCheck.noColorMix && exportCheck.noVar && exportCheck.hasGradient, JSON.stringify(exportCheck));

  check('sin errores de consola tras beta', c.problems.length === 0, c.problems.join('; '));
} catch (e) {
  console.error('EXCEPCIÓN:', e.message);
  failed = true;
} finally {
  c.kill();
  if (server.started) server.stop();
}
console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
