// Coherencia entre gráficas (23 sep 2026): TODAS las figuras llevan el mismo
// par Personalizar + rueda Ajustes, y el panel de Ajustes trae "Estructura"
// (márgenes del lienzo, rangos de eje, orden) y "Geometría" (tamaño de
// puntos, grosor de línea, anchura de barras/cajas, tamaño de celda).
// Además comprueba que esos ajustes funcionan de verdad (no solo que
// existan), que Personalizar y Ajustes son paneles exclusivos y que el
// modo abierto sobrevive a un repintado del módulo.
//
//   node tests/chart-consistency.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'chart-consistency' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

const goto = async (route, parts = []) => {
  await c.ev(`location.hash = '#/cargar'`); await sleep(350);
  await c.ev(`location.hash = ${JSON.stringify(route)}`); await sleep(1200);
  await c.ev(`(() => { if (!document.querySelector('#app-view .ql-empty')) return; const b = [...document.querySelectorAll('#app-view button')].find((x) => /ejemplo|example/i.test(x.textContent)); if (b) b.click(); })()`); await sleep(1500);
  for (const part of parts) {
    await c.ev(`(() => { const b = [...document.querySelectorAll('#app-view .ql-tab, #app-view .ql-seg-btn, #app-view button')].find((x) => x.textContent.trim().indexOf(${JSON.stringify(part)}) === 0); if (b) b.click(); })()`);
    await sleep(900);
  }
};
const clickBtn = (re) => c.ev(`(() => { const b = [...document.querySelectorAll('#app-view .ce-toolbar button')].find((x) => ${re}.test(x.textContent)); if (b) b.click(); return !!b; })()`);
const sections = () => c.ev(`[...document.querySelectorAll('#app-view .ce-toolbar h5')].map((h) => h.textContent.trim())`);
// pone un slider de geometría (por parte del texto de su etiqueta) a un valor
const setGeo = (labelRe, v) => c.ev(`(() => {
  const row = [...document.querySelectorAll('.ce-geom-row')].find((r) => ${labelRe}.test(r.querySelector('label').textContent));
  if (!row) return false;
  const n = row.querySelector('input[type=number]'); n.value = ${JSON.stringify(String(v))}; n.dispatchEvent(new Event('change', { bubbles: true })); return true;
})()`);

try {
  await c.goto(); await sleep(1500);
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealCommunityData(); await m.loadRealDifferentialAbundance(); await m.loadRealFunctionalWithMeta(); if (m.loadRealDiffComparisons) await m.loadRealDiffComparisons(); if (m.loadExampleMicrobialCountsPlate) await m.loadExampleMicrobialCountsPlate(); })()`);
  await sleep(2500);

  console.log('-- todas las gráficas: rueda + Estructura + Geometría --');
  const CASES = [
    ['#/barplots', ['Barras clásicas']], ['#/barplots', ['Flujos']], ['#/barplots', ['Sunburst']], ['#/barplots', ['Biomarcadores']], ['#/barplots', ['Burbujas']],
    ['#/alfa', ['Boxplot']], ['#/alfa', ['Curvas']], ['#/alfa', ['Violín']],
    ['#/beta', ['Mapa de calor']], ['#/beta', ['PCoA']], ['#/beta', ['RDA']],
    ['#/diferencial', ['Individual', 'Volcano']], ['#/diferencial', ['Individual', 'Lollipop']], ['#/diferencial', ['Individual', 'Mapa de calor']], ['#/diferencial', ['Individual', 'Cajas']], ['#/diferencial', ['Comparar']],
    ['#/recuentos', []], ['#/correlograma', ['Matriz']], ['#/correlograma', ['Red']], ['#/funcional', []],
    ['#/inferencia', ['Gráfico de Barras']], ['#/inferencia', ['Diagrama Aluvial']], ['#/inferencia', ['Lollipop']],
    ['#/temporal', []], ['#/venn', []], ['#/arbol', []],
  ];
  const missing = [];
  for (const [route, parts] of CASES) {
    await goto(route, parts);
    const info = await c.ev(`(() => { const tb = document.querySelector('#app-view .ce-toolbar'); return { tb: !!tb, gear: !!(tb && tb.querySelector('.ce-settings-btn')), pers: !!tb && [...tb.querySelectorAll('button')].some((b) => /Personalizar/.test(b.textContent)) }; })()`);
    await clickBtn('/Ajustes/');
    await sleep(350);
    const secs = await sections();
    const ok = info.tb && info.gear && info.pers && secs.includes('Estructura') && secs.includes('Geometría');
    if (!ok) missing.push(route + ' ' + parts.join('>') + ' ' + JSON.stringify({ ...info, secs }));
  }
  check('las ' + CASES.length + ' vistas tienen Personalizar + rueda + Estructura + Geometría', missing.length === 0, missing.join(' | '));

  console.log('\n-- los ajustes universales funcionan --');
  // puntos (PCoA)
  await goto('#/beta', ['PCoA']);
  await clickBtn('/Ajustes/'); await sleep(300);
  const r0 = await c.ev(`(() => +document.querySelector('#app-view svg circle[data-ce-role="marker"]').getAttribute('r'))()`);
  await setGeo('/puntos|Point/i', 2); await sleep(400);
  const r1 = await c.ev(`(() => +document.querySelector('#app-view svg circle[data-ce-role="marker"]').getAttribute('r'))()`);
  check('"Tamaño de los puntos ×2" duplica el radio (PCoA)', Math.abs(r1 - 2 * r0) < 0.05, JSON.stringify({ r0, r1 }));
  check('el panel de Ajustes sigue abierto tras el cambio', (await sections()).includes('Geometría'));

  // anchura de barras (Barplots apiladas)
  await goto('#/barplots', ['Barras clásicas']);
  await clickBtn('/Ajustes/'); await sleep(300);
  const w0 = await c.ev(`(() => +document.querySelector('#app-view svg rect[data-ce-role="bar"]').getAttribute('width'))()`);
  await setGeo('/barras|Bar/i', 0.5); await sleep(400);
  const w1 = await c.ev(`(() => +document.querySelector('#app-view svg rect[data-ce-role="bar"]').getAttribute('width'))()`);
  check('"Anchura de barras ×0.5" reduce el ancho a la mitad', Math.abs(w1 - w0 / 2) < 0.1, JSON.stringify({ w0, w1 }));

  // grosor de línea (temporal)
  await goto('#/temporal');
  await clickBtn('/Ajustes/'); await sleep(300);
  await setGeo('/líneas|Line/i', 2); await sleep(400);
  const sw = await c.ev(`(() => parseFloat(getComputedStyle(document.querySelector('#app-view svg polyline[data-ce-role="line"]')).strokeWidth))()`);
  check('"Grosor de las líneas ×2" dobla el trazo (temporal: 2 → 4)', Math.abs(sw - 4) < 0.1, JSON.stringify({ sw }));

  // tamaño de celdas (heatmap beta)
  await goto('#/beta', ['Mapa de calor']);
  await clickBtn('/Ajustes/'); await sleep(300);
  const cw0 = await c.ev(`(() => +document.querySelector('#app-view svg rect[data-ce-role="cell"]').getAttribute('width'))()`);
  await setGeo('/celdas|Cell/i', 0.5); await sleep(400);
  const cw1 = await c.ev(`(() => +document.querySelector('#app-view svg rect[data-ce-role="cell"]').getAttribute('width'))()`);
  check('"Tamaño de las celdas ×0.5" encoge las celdas del mapa de calor', Math.abs(cw1 - cw0 / 2) < 0.1, JSON.stringify({ cw0, cw1 }));

  // márgenes del lienzo (genérico) + rango de eje (temporal)
  await goto('#/temporal');
  const vb0 = await c.ev(`document.querySelector('#app-view svg.ql-svg').getAttribute('viewBox')`);
  await clickBtn('/Ajustes/'); await sleep(300);
  await c.ev(`(() => { const row = [...document.querySelectorAll('.ce-cs-row')].find((r) => /Margen|margin/i.test(r.querySelector('label').textContent)); const i = row.querySelectorAll('input[type=number]')[0]; i.value = '40'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(400);
  const vb1 = await c.ev(`document.querySelector('#app-view svg.ql-svg').getAttribute('viewBox')`);
  check('el margen extra arriba amplía el lienzo (viewBox) sin repintar el módulo', vb1 !== vb0 && vb1.split(' ')[1] === '-40', JSON.stringify({ vb0, vb1 }));
  await c.ev(`(() => { const row = [...document.querySelectorAll('.ce-cs-row')].find((r) => /eje X|X axis/.test(r.querySelector('label').textContent)); const i = row.querySelectorAll('input[type=number]')[1]; i.value = '10'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(600);
  const ticks = await c.ev(`[...document.querySelectorAll('#app-view svg .ql-tick-label')].map((t) => t.textContent)`);
  check('el rango manual del eje X recorta el eje a 10 (temporal)', ticks.includes('10'), JSON.stringify(ticks.slice(-6)));
  check('tras cambiar el rango el panel de Ajustes sigue abierto (el modo sobrevive al repintado)', (await sections()).includes('Estructura'));

  console.log('\n-- paneles exclusivos y el modo se conserva --');
  await goto('#/alfa', ['Boxplot']);
  await clickBtn('/Personalizar/'); await sleep(300);
  const editSecs = await sections();
  await clickBtn('/Ajustes/'); await sleep(300);
  const setSecs = await sections();
  check('Personalizar muestra Títulos/Estilo/Paleta y NO Estructura', editSecs.some((s) => /Títulos/.test(s)) && !editSecs.includes('Estructura'), JSON.stringify(editSecs));
  check('Ajustes muestra Estructura/Geometría/Significación y NO Títulos (paneles exclusivos)', setSecs.includes('Estructura') && setSecs.includes('Geometría') && !setSecs.some((s) => /Títulos/.test(s)), JSON.stringify(setSecs));

  console.log('\n-- lo que antes faltaba --');
  await goto('#/diferencial', ['Comparar']);
  const cmp = await c.ev(`(() => { const tb = document.querySelector('#app-view .ce-toolbar'); return { tb: !!tb, n: tb ? tb.querySelectorAll('button').length : 0 }; })()`);
  check('el Venn de "Comparar varias" ya tiene la barra del editor', cmp.tb && cmp.n >= 5, JSON.stringify(cmp));

  await goto('#/inferencia', ['Diagrama Aluvial']);
  await clickBtn('/Personalizar/'); await sleep(400);
  const inf0 = await c.ev(`(() => getComputedStyle(document.querySelector('#app-view svg [data-ce-series-fill="s0"]')).fill)()`);
  await c.ev(`(() => { const i = document.querySelector('.ce-palette input[type=color]'); i.value = '#00aa00'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(500);
  const inf1 = await c.ev(`(() => getComputedStyle(document.querySelector('#app-view svg [data-ce-series-fill="s0"]')).fill)()`);
  check('el aluvial de Inferencia ya se puede recolorear desde Paleta', inf0 !== inf1 && inf1 === 'rgb(0, 170, 0)', JSON.stringify({ inf0, inf1 }));

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
