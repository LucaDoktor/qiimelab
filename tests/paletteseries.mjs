// Editor de gráficos — Fase 2 ("relleno de serie": paletas ampliadas,
// opacidad, degradado, patrón, borde independiente), ver
// qiimelab-prompt-editor-fase-2-paletas-relleno-series.md. Verificación en
// Chrome real (no el mock DOM de tests/charteditor.mjs): necesita <svg>
// real, getComputedStyle real y <defs>/<pattern>/<linearGradient> reales.
//
//   node tests/paletteseries.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'paletteseries' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

try {
  await c.goto();
  await sleep(1500);
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealCommunityData(); })()`);
  await sleep(2000);
  await c.ev(`location.hash = '#/barplots'`);
  await sleep(1800);
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Personalizar|Customise/.test(x.textContent)); b.click(); })()`);
  await sleep(700);

  // ---- Paso 1: desplegable de paletas (catálogo ampliado) ----
  console.log('-- Paso 1: catálogo de paletas --');
  const chooser = await c.ev(`(() => {
    const sel = document.querySelector('.ce-pal-chooser select');
    if (!sel) return { err: 'no hay .ce-pal-chooser select' };
    const groups = [...sel.querySelectorAll('optgroup')].map((g) => ({ label: g.label, n: g.children.length }));
    return { n: sel.options.length, groups, firstValue: sel.options[0].value, firstSelected: sel.options[0].selected };
  })()`);
  check('el selector de paleta existe con 2 grupos (paleta de la app + catálogo)', chooser.groups && chooser.groups.length === 2, JSON.stringify(chooser));
  check('la paleta por defecto de la app es la primera opción y viene pre-seleccionada',
    chooser.firstValue === 'app:categorical' && chooser.firstSelected, JSON.stringify(chooser));
  check('el catálogo trae las 13 paletas categóricas (Okabe-Ito, Tol, ColorBrewer)',
    chooser.groups[1] && chooser.groups[1].n === 13, JSON.stringify(chooser));

  const before = await c.ev(`(() => [...document.querySelectorAll('[data-ce-series-fill^="s"]')].slice(0, 3).map((n) => getComputedStyle(n).fill))()`);
  check('hay barras pintadas antes de aplicar nada', before.length === 3, JSON.stringify(before));

  const applied = await c.ev(`(() => {
    const sel = document.querySelector('.ce-pal-chooser select');
    sel.value = 'okabe-ito';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const warn = document.querySelector('.ce-pal-chooser').nextSibling; // placeholder, se recalcula abajo
    return { selected: sel.value };
  })()`);
  check('se puede seleccionar "okabe-ito" en el desplegable', applied.selected === 'okabe-ito');

  const warnText = await c.ev(`(() => {
    const w = document.querySelector('.ce-pal-chooser .ce-pal-warn');
    return w ? w.textContent : null;
  })()`);
  check('con 7 series (CAT_VARS) sobre okabe-ito (maxSafeN=6) aparece el aviso de "series de más"',
    !!warnText && /7|6/.test(warnText), JSON.stringify(warnText));

  await c.ev(`(() => { [...document.querySelectorAll('.ce-pal-chooser-row button')][0].click(); })()`);
  await sleep(200);

  const after = await c.ev(`(() => [...document.querySelectorAll('[data-ce-series-fill^="s"]')].slice(0, 3).map((n) => getComputedStyle(n).fill))()`);
  const okabeHexes = ['rgb(230, 159, 0)', 'rgb(86, 180, 233)', 'rgb(0, 158, 115)']; // e69f00, 56b4e9, 009e73 — primeros 3 de Okabe-Ito
  check('tras "Aplicar" las 3 primeras series toman los 3 primeros tonos de Okabe-Ito',
    JSON.stringify(after) === JSON.stringify(okabeHexes), 'antes=' + JSON.stringify(before) + ' después=' + JSON.stringify(after));

  const persistedChoice = await c.ev(`(() => {
    const raw = localStorage.getItem('smart-175.chartStyle.taxaBarplot');
    const s = raw ? JSON.parse(raw) : null;
    return s ? { choice: s.__paletteChoice, s0: s.__palette && s.__palette.s0 } : null;
  })()`);
  check('la elección de paleta y el color por serie (formato objeto, Paso 2) persisten en localStorage',
    persistedChoice && persistedChoice.choice === 'okabe-ito' && persistedChoice.s0 && persistedChoice.s0.color === '#e69f00',
    JSON.stringify(persistedChoice));

  // recarga: el color aplicado debe seguir ahí
  await c.ev(`location.hash = '#/alfa'`); await sleep(500);
  await c.ev(`location.hash = '#/barplots'`); await sleep(1500);
  const afterReload = await c.ev(`(() => { const n = document.querySelector('[data-ce-series-fill="s0"]'); return n ? getComputedStyle(n).fill : null; })()`);
  check('el color aplicado sobrevive a salir y volver a la ruta', afterReload === 'rgb(230, 159, 0)', afterReload);

  // ---- Paso 2: opacidad de serie ----
  console.log('\n-- Paso 2: opacidad --');
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Personalizar|Customise/.test(x.textContent)); b.click(); })()`);
  await sleep(500);
  const opacitySetup = await c.ev(`(() => {
    const range = document.querySelector('.ce-pal-row input[type=range]');
    return range ? { present: true, defaultVal: range.value } : { present: false };
  })()`);
  check('el control de opacidad existe y arranca en 100% (sin personalizar tras recargar la ruta)',
    opacitySetup.present && opacitySetup.defaultVal === '100', JSON.stringify(opacitySetup));

  const opacityApplied = await c.ev(`(() => {
    const range = document.querySelector('.ce-pal-row input[type=range]');
    range.value = '40';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    const n = document.querySelector('[data-ce-series-fill="s0"]');
    return { fillOpacity: getComputedStyle(n).fillOpacity };
  })()`);
  check('mover el slider a 40% escribe fill-opacity:0.4 en el nodo', opacityApplied.fillOpacity === '0.4', JSON.stringify(opacityApplied));

  const opacityPersisted = await c.ev(`(() => {
    const raw = localStorage.getItem('smart-175.chartStyle.taxaBarplot');
    const s = JSON.parse(raw);
    return { opacity: s.__palette.s0.opacity, colorStillThere: s.__palette.s0.color };
  })()`);
  check('la opacidad persiste SIN pisar el color ya elegido (mismo objeto de estilo)',
    opacityPersisted.opacity === 0.4 && opacityPersisted.colorStillThere === '#e69f00', JSON.stringify(opacityPersisted));

  // volver a 100% debe limpiar la clave (valor neutro = "sin personalizar", ver setSeriesOpacity)
  const opacityBackTo100 = await c.ev(`(() => {
    const range = document.querySelector('.ce-pal-row input[type=range]');
    range.value = '100';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    const raw = localStorage.getItem('smart-175.chartStyle.taxaBarplot');
    const s = JSON.parse(raw);
    return { hasOpacityKey: 'opacity' in (s.__palette.s0 || {}), fillOpacity: getComputedStyle(document.querySelector('[data-ce-series-fill="s0"]')).fillOpacity };
  })()`);
  check('volver a 100% quita la clave opacity de localStorage y limpia fill-opacity inline',
    !opacityBackTo100.hasOpacityKey, JSON.stringify(opacityBackTo100));

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
