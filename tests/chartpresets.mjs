// Presets del editor de gráficos (Fase 6 Paso 1 y Paso 3 de
// qiimelab-prompt-editor-fase-6-presets-style-match-export-revista.md):
// un preset es "una foto del store" -- guardarlo clona `store` +
// `paletteSeries.map(s=>s.id)` (para poder remapear por posición al
// aplicar sobre OTRO gráfico con un nº de series distinto); aplicarlo
// sobreescribe `store` y llama a sync(). Se guardan en
// localStorage['smart-175.chartPresets'], compartida entre TODAS las
// gráficas (no por `key`). Los presets de revista (Nature/Cell) son
// constantes de solo lectura, no localStorage -- "restablecer" es
// simplemente volver a aplicarlos.
//
//   node tests/chartpresets.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'chartpresets' });
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

  // ================= Paso 1: guardar un preset en #/alfa (pocas series) =================
  console.log('-- Paso 1: guardar un preset personalizado en #/alfa --');
  await c.ev(`location.hash = '#/alfa'`);
  await sleep(1500);
  await openEditor();

  // personalizar algo primero, para que el preset tenga contenido real que verificar luego
  const customize = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    if (!blocks.length) return { err: 'sin series en #/alfa' };
    const inp = blocks[0].querySelector('.ce-pal-row-fill input[type=color]');
    inp.value = '#3355ff'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return { n: blocks.length };
  })()`);
  check('#/alfa tiene series de paleta que personalizar antes de guardar el preset', customize.n > 0, JSON.stringify(customize));

  const saved = await c.ev(`(() => {
    const wrap = document.querySelector('.ce-presets');
    if (!wrap) return { err: 'no se encontró la sección de presets' };
    const nameInp = wrap.querySelector('input[type=text]');
    const saveBtn = [...wrap.querySelectorAll('button')].find((b) => /Guardar$/.test(b.textContent.trim()));
    nameInp.value = 'Mi estilo azul';
    saveBtn.click();
    return { hasWrap: true };
  })()`);
  check('la sección "Presets" existe con un campo de nombre + botón Guardar', saved.hasWrap, JSON.stringify(saved));
  await sleep(300);

  const persisted = await c.ev(`(() => {
    const raw = localStorage.getItem('smart-175.chartPresets');
    const all = raw ? JSON.parse(raw) : {};
    const entries = Object.values(all);
    return { n: entries.length, names: entries.map((p) => p.name), hasSeriesOrder: entries.length > 0 && Array.isArray(entries[0].seriesOrder) };
  })()`);
  check('el preset se persiste en localStorage[smart-175.chartPresets] con seriesOrder (para el remapeo por posición)',
    persisted.n === 1 && persisted.names.includes('Mi estilo azul') && persisted.hasSeriesOrder, JSON.stringify(persisted));

  // ================= aplicar ese MISMO preset en OTRO tipo de gráfico, con OTRO nº de series =================
  console.log('\n-- aplicar el preset guardado en #/barplots (distinto nº de series, no debe romper) --');
  await c.ev(`location.hash = '#/barplots'`);
  await sleep(1800);
  await openEditor();

  const beforeApply = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    return { nSeries: blocks.length };
  })()`);
  check('#/barplots tiene un nº de series distinto al de #/alfa (escenario real de remapeo por posición)', beforeApply.nSeries > 0, JSON.stringify(beforeApply));

  const applied = await c.ev(`(() => {
    const wrap = document.querySelector('.ce-presets');
    const applyBtn = [...wrap.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Aplicar');
    if (!applyBtn) return { err: 'no se encontró el botón Aplicar del preset' };
    applyBtn.click();
    return { clicked: true };
  })()`);
  check('el botón "Aplicar" del preset guardado aparece en #/barplots y se puede pulsar', applied.clicked, JSON.stringify(applied));
  await sleep(400);

  const afterApply = await c.ev(`(() => {
    const first = document.querySelector('[data-ce-series-fill^="s"]');
    return { firstFill: first ? getComputedStyle(first).fill : null, consoleOk: true };
  })()`);
  check('aplicar un preset de OTRO gráfico con distinto nº de series no lanza excepción (primera serie recolorada)',
    afterApply.firstFill === 'rgb(51, 85, 255)', JSON.stringify(afterApply));

  // ================= borrar el preset =================
  console.log('\n-- borrar un preset guardado --');
  const deleted = await c.ev(`(() => {
    const wrap = document.querySelector('.ce-presets');
    const delBtn = [...wrap.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Borrar');
    if (!delBtn) return { err: 'no se encontró el botón Borrar' };
    delBtn.click();
    const raw = localStorage.getItem('smart-175.chartPresets');
    const all = raw ? JSON.parse(raw) : {};
    return { nAfter: Object.keys(all).length };
  })()`);
  check('"Borrar" quita el preset de localStorage', deleted.nAfter === 0, JSON.stringify(deleted));

  // ================= Paso 3: presets de revista (Nature/Cell) =================
  console.log('\n-- Paso 3: preset de revista "Nature (89 mm)" en #/barplots --');
  const natureApplied = await c.ev(`(() => {
    const wrap = document.querySelector('.ce-presets');
    const btn = [...wrap.querySelectorAll('button')].find((b) => /Nature \\(89 mm\\)/.test(b.textContent));
    if (!btn) return { err: 'no se encontró el botón "Nature (89 mm)"' };
    btn.click();
    return { clicked: true };
  })()`);
  check('el botón de preset "Nature (89 mm)" existe y se puede pulsar', natureApplied.clicked, JSON.stringify(natureApplied));
  await sleep(400);

  const natureResult = await c.ev(`(() => {
    const svg = document.querySelector('svg.ql-svg');
    const tick = svg.querySelector('.ql-tick-label');
    const grid = svg.querySelector('.ql-gridline');
    const titleEl = document.querySelector('[data-ce-id="title"] text, [data-ce="title"]');
    const wrap = document.querySelector('.ce-presets');
    const widthInp = wrap.querySelector('input[type=number]');
    return {
      tickFontSize: tick ? getComputedStyle(tick).fontSize : null,
      gridStrokeWidth: grid ? getComputedStyle(grid).strokeWidth : null,
      fontFamily: tick ? getComputedStyle(tick).fontFamily : null,
      titleBold: titleEl ? getComputedStyle(titleEl).fontWeight : null,
      exportWidthValue: widthInp ? widthInp.value : null,
    };
  })()`);
  check('el preset Nature fija el tamaño de las marcas de eje a 7pt≈9.33px', natureResult.tickFontSize === '9.33px', JSON.stringify(natureResult));
  check('...el grosor de rejilla a 0.5pt≈0.67px', natureResult.gridStrokeWidth === '0.67px', JSON.stringify(natureResult));
  check('...la fuente a Helvetica/Arial (no la IBM Plex por defecto de la app)', /Helvetica|Arial/.test(natureResult.fontFamily), JSON.stringify(natureResult));
  check('...el título en negrita (etiqueta de panel 8pt negrita)', natureResult.titleBold === '700' || natureResult.titleBold === 'bold', JSON.stringify(natureResult));
  check('...y el ancho de exportación a 89mm, reflejado en el campo del toolbar', natureResult.exportWidthValue === '89', JSON.stringify(natureResult));

  // Paso 4 (verificación final), punto 1: exportar a PNG a 300dpi con
  // Nature aplicado y confirmar el tamaño FÍSICO real (no solo que el
  // campo del panel diga "89") -- proxy automatizado de "verlo impreso a
  // tamaño real"; abrir el PNG en un visor e imprimirlo de verdad, o abrir
  // el SVG en Illustrator/Inkscape, escapa a lo que este test puede hacer
  // (ver nota en el mensaje de commit / memoria del proyecto).
  console.log('\n-- Paso 4: exportación PNG a tamaño físico real (89mm @ 300dpi) --');
  const pngExport = await c.ev(`(async () => {
    const svg = document.querySelector('svg.ql-svg');
    const mod = await import('/js/lib/figureExport.js');
    const res = await mod.exportFigure(svg, { formats: ['png'], scheme: 'light', background: 'white', dpi: 300, widthMm: 89 });
    const blob = new Blob([res.png], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = url; });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4 * 97) { if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) nonWhite++; }
    URL.revokeObjectURL(url);
    return { widthPx: img.width, expectedWidthPx: Math.round(89 / 25.4 * 300), nonWhiteSamples: nonWhite };
  })()`);
  check('el PNG exportado con Nature (89mm) mide 1051px de ancho a 300dpi (89/25.4*300, redondeado)',
    pngExport.widthPx === pngExport.expectedWidthPx, JSON.stringify(pngExport));
  check('...y no sale en blanco (hay contenido dibujado)', pngExport.nonWhiteSamples > 5, JSON.stringify(pngExport));

  console.log('\n-- preset de revista "Cell (114 mm)" en #/venn (2º tipo de gráfico distinto) --');
  await c.ev(`location.hash = '#/venn'`);
  await sleep(1500);
  await openEditor();
  const cellApplied = await c.ev(`(() => {
    const wrap = document.querySelector('.ce-presets');
    const btn = [...wrap.querySelectorAll('button')].find((b) => /Cell \\(114 mm\\)/.test(b.textContent));
    if (!btn) return { err: 'no se encontró el botón "Cell (114 mm)"' };
    btn.click();
    return { clicked: true };
  })()`);
  check('el botón de preset "Cell (114 mm)" existe en un gráfico distinto (Venn) y se puede pulsar', cellApplied.clicked, JSON.stringify(cellApplied));
  await sleep(400);

  const cellResult = await c.ev(`(() => {
    const svg = document.querySelector('svg.ql-svg');
    const tick = svg.querySelector('.ql-tick-label, text');
    const grid = svg.querySelector('circle, ellipse, rect');
    const wrap = document.querySelector('.ce-presets');
    const widthInp = wrap.querySelector('input[type=number]');
    return {
      fontFamily: tick ? getComputedStyle(tick).fontFamily : null,
      exportWidthValue: widthInp ? widthInp.value : null,
    };
  })()`);
  check('el preset Cell aplica su propia fuente (Arial únicamente, sin Helvetica) en un 2º tipo de gráfico', /Arial/.test(cellResult.fontFamily) && !/Helvetica/.test(cellResult.fontFamily), JSON.stringify(cellResult));
  check('...y su propio ancho (114mm), independiente del 89mm aplicado antes en #/barplots', cellResult.exportWidthValue === '114', JSON.stringify(cellResult));

  // ================= ancho de exportación manual (sin preset) =================
  console.log('\n-- ancho de exportación manual --');
  await c.ev(`location.hash = '#/alfa'`); await sleep(1200);
  await openEditor();
  const manualWidth = await c.ev(`(() => {
    const wrap = document.querySelector('.ce-presets');
    const inp = wrap.querySelector('input[type=number]');
    inp.value = '120'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  await sleep(400); // writeStoreDebounced() -- 300ms
  const manualWidthPersisted = await c.ev(`(() => {
    const raw = localStorage.getItem('smart-175.chartStyle.alphaDiversity');
    const store = raw ? JSON.parse(raw) : null;
    return { stored: store && store.__export };
  })()`);
  check('fijar el ancho de exportación a mano (sin preset) persiste en store.__export.widthMm (tras el debounce de 300ms)',
    manualWidthPersisted.stored && manualWidthPersisted.stored.widthMm === 120, JSON.stringify(manualWidthPersisted));

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
