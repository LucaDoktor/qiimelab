// Evolución temporal (#/temporal, prompt "quick wins" del 22 sep 2026,
// punto 5 -- el módulo nuevo, el más grande del prompt). Cubre: estado
// vacío, las 3 fuentes de variable Y (diversidad alfa/taxón/columna
// numérica de metadata), el eje X resaltando columnas "sugeridas" por
// nombre sin bloquear las demás, el modo "Media ± error" (conecta el
// promedio del grupo en cada punto, con tooltip agregado n/±), el modo
// "Individual" con columna de sujeto (spaghetti plot, líneas de verdad) y
// sin ella (puntos sueltos, sin forzar conexiones), y la integración con
// chartEditor.js.
//
//   node tests/temporal.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'temporal' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

try {
  await c.goto();
  await sleep(1500);

  // ================= estado vacío (sin datos cargados) =================
  console.log('-- estado vacío --');
  await c.ev(`location.hash = '#/temporal'`);
  await sleep(1000);
  const empty = await c.ev(`(() => ({ hasEmpty: !!document.querySelector('.ql-empty'), hasChart: !!document.querySelector('svg.ql-svg') }))()`);
  check('sin datos cargados muestra el estado vacío, sin intentar dibujar un gráfico', empty.hasEmpty && !empty.hasChart, JSON.stringify(empty));

  // ================= con datos reales =================
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealCommunityData(); })()`);
  await sleep(1500);
  await c.ev(`location.hash = '#/temporal'`);
  await sleep(1200);

  console.log('\n-- eje X: columna sugerida por nombre, sin bloquear las demás --');
  const xSetup = await c.ev(`(() => {
    const sels = [...document.querySelectorAll('select')];
    const xSel = sels.find((s) => [...s.options].some((o) => /sugerida/.test(o.textContent)));
    if (!xSel) return { err: 'no se encontró el selector de eje X con una opción sugerida' };
    return { value: xSel.value, allOptions: [...xSel.options].map((o) => o.value), suggestedLabel: [...xSel.options].find((o) => /sugerida/.test(o.textContent)).textContent };
  })()`);
  check('la columna "tiempo_dias" aparece marcada como sugerida y viene preseleccionada',
    xSetup.value === 'tiempo_dias' && /tiempo_dias/.test(xSetup.suggestedLabel), JSON.stringify(xSetup));
  check('el resto de columnas de metadata siguen disponibles en el mismo selector, sin bloquear',
    xSetup.allOptions && xSetup.allOptions.length > 1, JSON.stringify(xSetup));

  console.log('\n-- modo "Media ± error" (por defecto): conecta el promedio, tooltip con n y ± --');
  const meanMode = await c.ev(`(() => {
    const poly = document.querySelector('svg.ql-svg polyline');
    const circles = document.querySelectorAll('svg.ql-svg circle');
    return { hasPolyline: !!poly, nCircles: circles.length };
  })()`);
  check('dibuja una línea conectando los promedios (3 puntos temporales en el dataset de ejemplo)',
    meanMode.hasPolyline && meanMode.nCircles === 3, JSON.stringify(meanMode));

  await c.ev(`(() => { document.querySelector('svg.ql-svg circle').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); })()`);
  await sleep(300);
  const tooltip = await c.ev(`(() => { const t = document.querySelector('.ql-tooltip'); return t ? t.textContent : null; })()`);
  check('el tooltip de un punto en modo "Media" muestra n y el ± del error elegido',
    !!tooltip && /n=\d/.test(tooltip) && tooltip.includes('±'), tooltip);

  console.log('\n-- las 3 fuentes de variable Y funcionan --');
  for (const [labelRe, name] of [[/Abundancia de un taxón/, 'taxón'], [/Columna numérica/, 'metadata numérico'], [/Diversidad alfa/, 'diversidad alfa']]) {
    await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-seg-btn')].find((x) => ${labelRe}.test(x.textContent)); if (b) b.click(); })()`);
    await sleep(700);
    const r = await c.ev(`(() => ({ n: document.querySelectorAll('svg.ql-svg circle').length }))()`);
    check('fuente "' + name + '": dibuja puntos de verdad', r.n > 0, JSON.stringify(r));
  }

  console.log('\n-- agrupar por una columna categórica --');
  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-seg-btn')].find((x) => /Diversidad alfa/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(600);
  const groupSetup = await c.ev(`(() => {
    const sels = [...document.querySelectorAll('select')];
    const gSel = sels.find((s) => [...s.options].some((o) => /Sin agrupar/.test(o.textContent)));
    if (!gSel) return { err: 'no se encontró el selector de agrupación' };
    gSel.value = 'grupo';
    gSel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  await sleep(700);
  const grouped = await c.ev(`(() => ({
    nLegendItems: document.querySelectorAll('svg.ql-svg [data-ce="legend"] text').length,
    nCircleSeries: new Set([...document.querySelectorAll('svg.ql-svg circle')].map((c) => c.getAttribute('data-ce-series-fill'))).size,
  }))()`);
  check('agrupar por "grupo" reparte los puntos en varias series con su propia leyenda',
    groupSetup.ok && grouped.nLegendItems > 1 && grouped.nCircleSeries > 1, JSON.stringify({ groupSetup, grouped }));

  console.log('\n-- modo "Individual" con columna de sujeto: spaghetti plot de verdad --');
  // deshace la agrupación por "grupo" del paso anterior: en el dataset real
  // "grupo" está totalmente confundido con "tiempo_dias" (cada uno de sus 14
  // valores solo existe en un único punto temporal), así que agrupar por
  // "grupo" a la vez que se conecta por sujeto deja como mucho 1 punto por
  // (grupo,sujeto) -- ninguna línea que dibujar, no por un fallo del módulo.
  await c.ev(`(() => {
    const sels = [...document.querySelectorAll('select')];
    const gSel = sels.find((s) => [...s.options].some((o) => /Sin agrupar/.test(o.textContent)));
    if (gSel) { gSel.value = ''; gSel.dispatchEvent(new Event('change', { bubbles: true })); }
  })()`);
  await sleep(400);
  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-seg-btn')].find((x) => /Individual/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(700);
  const subjSetup = await c.ev(`(() => {
    const sels = [...document.querySelectorAll('select')];
    const sSel = sels.find((s) => [...s.options].some((o) => /Sin sujeto/.test(o.textContent)));
    if (!sSel) return { err: 'no se encontró el selector de columna de sujeto' };
    const hasReplicate = [...sSel.options].some((o) => o.value === 'replicate');
    if (hasReplicate) { sSel.value = 'replicate'; sSel.dispatchEvent(new Event('change', { bubbles: true })); }
    return { ok: true, hasReplicate };
  })()`);
  await sleep(700);
  const spaghetti = await c.ev(`(() => ({ nPolylines: document.querySelectorAll('svg.ql-svg polyline').length, nCircles: document.querySelectorAll('svg.ql-svg circle').length }))()`);
  check('con columna de sujeto elegida, conecta las muestras del mismo sujeto (varias líneas, "spaghetti")',
    subjSetup.ok && subjSetup.hasReplicate && spaghetti.nPolylines > 1, JSON.stringify({ subjSetup, spaghetti }));

  console.log('\n-- modo "Individual" SIN columna de sujeto: puntos sueltos, sin forzar conexiones --');
  await c.ev(`(() => {
    const sels = [...document.querySelectorAll('select')];
    const sSel = sels.find((s) => [...s.options].some((o) => /Sin sujeto/.test(o.textContent)));
    sSel.value = ''; sSel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(700);
  const noSubject = await c.ev(`(() => ({ nPolylines: document.querySelectorAll('svg.ql-svg polyline').length, nCircles: document.querySelectorAll('svg.ql-svg circle').length }))()`);
  check('sin columna de sujeto, no dibuja ninguna línea (solo puntos sueltos por muestra)',
    noSubject.nPolylines === 0 && noSubject.nCircles > 0, JSON.stringify(noSubject));

  console.log('\n-- integración con chartEditor.js --');
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Personalizar|Customise/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(600);
  const editorSetup = await c.ev(`(() => ({
    hasToolbar: !!document.querySelector('.ce-toolbar'),
    hasPalette: document.querySelectorAll('.ce-pal-row-block').length > 0,
  }))()`);
  check('el editor de gráficos se engancha (toolbar + paleta por grupo)', editorSetup.hasToolbar && editorSetup.hasPalette, JSON.stringify(editorSetup));

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
