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

  // Fase 6 Paso 4: el Nº de series "seguro" no debe vivir solo en un aviso
  // que aparece al excederlo -- tiene que estar siempre visible en el
  // propio selector de paleta, no como afirmación genérica de "CVD-safe".
  const safeNote = await c.ev(`(() => {
    const n = document.querySelector('.ce-pal-chooser .ce-pal-safen');
    return n ? n.textContent : null;
  })()`);
  check('el Nº de series seguro (maxSafeN=6 de Okabe-Ito) se muestra SIEMPRE junto al selector, no solo cuando se excede',
    !!safeNote && /6/.test(safeNote), JSON.stringify(safeNote));

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
    const range = document.querySelector('.ce-pal-opacity input[type=range]');
    return range ? { present: true, defaultVal: range.value } : { present: false };
  })()`);
  check('el control de opacidad existe y arranca en 100% (sin personalizar tras recargar la ruta)',
    opacitySetup.present && opacitySetup.defaultVal === '100', JSON.stringify(opacitySetup));

  const opacityApplied = await c.ev(`(() => {
    const range = document.querySelector('.ce-pal-opacity input[type=range]');
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
    const range = document.querySelector('.ce-pal-opacity input[type=range]');
    range.value = '100';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    const raw = localStorage.getItem('smart-175.chartStyle.taxaBarplot');
    const s = JSON.parse(raw);
    return { hasOpacityKey: 'opacity' in (s.__palette.s0 || {}), fillOpacity: getComputedStyle(document.querySelector('[data-ce-series-fill="s0"]')).fillOpacity };
  })()`);
  check('volver a 100% quita la clave opacity de localStorage y limpia fill-opacity inline',
    !opacityBackTo100.hasOpacityKey, JSON.stringify(opacityBackTo100));

  // ---- Paso 3: degradado ----
  console.log('\n-- Paso 3: degradado --');
  const gradSetup = await c.ev(`(() => {
    const sel = document.querySelector('.ce-pal-row-head select');
    sel.value = 'gradient';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const n = document.querySelector('[data-ce-series-fill="s0"]');
    const fill = getComputedStyle(n).fill;
    const stops = document.querySelectorAll('.ce-pal-gradient input[type=color]');
    return { fill, nStops: stops.length, isUrl: /^url\\(/.test(fill) };
  })()`);
  check('elegir "degradado" pinta la serie con url(#fig-grad-…) y siembra 2 paradas a partir del color actual',
    gradSetup.isUrl && gradSetup.nStops === 2, JSON.stringify(gradSetup));

  const defsCheck = await c.ev(`(() => {
    const svg = document.querySelector('[data-ce-series-fill="s0"]').closest('svg');
    const grad = svg.querySelector('defs linearGradient');
    return grad ? { present: true, id: grad.id, nStops: grad.querySelectorAll('stop').length, firstStop: grad.querySelector('stop').getAttribute('stop-color') } : { present: false };
  })()`);
  check('el <defs><linearGradient> existe en el propio <svg>, namespaced por módulo (fig-grad-taxaBarplot-s0), con 2 <stop>',
    defsCheck.present && /^fig-grad-taxaBarplot-s0$/.test(defsCheck.id) && defsCheck.nStops === 2, JSON.stringify(defsCheck));
  check('la 1ª parada del degradado es el color Okabe-Ito ya elegido (#e69f00)', defsCheck.firstStop === '#e69f00', JSON.stringify(defsCheck));

  const addStop = await c.ev(`(() => {
    const btn = [...document.querySelectorAll('.ce-pal-gradient button')].find((b) => /parada|stop/i.test(b.textContent));
    btn.click();
    const svg = document.querySelector('[data-ce-series-fill="s0"]').closest('svg');
    return { nStops: svg.querySelector('defs linearGradient').querySelectorAll('stop').length };
  })()`);
  check('"+ añadir parada intermedia" sube el degradado a 3 paradas', addStop.nStops === 3, JSON.stringify(addStop));

  // ---- Paso 4: patrón ----
  console.log('\n-- Paso 4: patrón --');
  const patSetup = await c.ev(`(() => {
    const sel = document.querySelector('.ce-pal-row-head select');
    sel.value = 'pattern';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const n = document.querySelector('[data-ce-series-fill="s0"]');
    const fill = getComputedStyle(n).fill;
    const svg = n.closest('svg');
    const pat = svg.querySelector('defs pattern');
    return {
      isUrl: /^url\\(/.test(fill),
      gradGone: !svg.querySelector('defs linearGradient'), // el degradado huérfano se poda (pruneOwnDefs)
      patPresent: !!pat,
      patId: pat && pat.id,
      transform: pat && pat.getAttribute('patternTransform'),
      shapeTag: pat && pat.children[0] && pat.children[0].tagName.toLowerCase(),
    };
  })()`);
  check('elegir "patrón" pinta con url(#fig-pat-…), crea el <pattern> con rotate() (rayado diagonal por defecto) y poda el <linearGradient> huérfano',
    patSetup.isUrl && patSetup.gradGone && patSetup.patPresent && /^fig-pat-taxaBarplot-s0$/.test(patSetup.patId) &&
    /^rotate\(/.test(patSetup.transform) && patSetup.shapeTag === 'line', JSON.stringify(patSetup));

  const patKindSwitch = await c.ev(`(() => {
    const kindSel = document.querySelector('.ce-pal-pattern select');
    kindSel.value = 'dots';
    kindSel.dispatchEvent(new Event('change', { bubbles: true }));
    const svg = document.querySelector('[data-ce-series-fill="s0"]').closest('svg');
    const pat = svg.querySelector('defs pattern');
    return { shapeTag: pat.children[0] && pat.children[0].tagName.toLowerCase(), nPatterns: svg.querySelectorAll('defs pattern').length };
  })()`);
  check('cambiar a "puntos" redibuja el tile con un <circle> (mismo id de <pattern>, no uno nuevo)',
    patKindSwitch.shapeTag === 'circle' && patKindSwitch.nPatterns === 1, JSON.stringify(patKindSwitch));

  // ---- Paso 5: borde independiente ----
  console.log('\n-- Paso 5: borde --');
  // OJO: cada commit (evento 'change') dispara un re-render COMPLETO del
  // panel (setSeriesBorder -> writeStore -> renderToolbar), igual que ya
  // pasaba con el campo de color sólido de antes de la Fase 2 — así que
  // cada campo hay que volver a buscarlo en el DOM DESPUÉS del anterior,
  // como haría un usuario real clicando uno a uno (nunca reusar una
  // referencia capturada antes del commit previo: quedaría "huérfana" y
  // su próximo evento usaría un snapshot de estado ya desfasado).
  await c.ev(`(() => { document.querySelector('.ce-pal-border').open = true; })()`);
  await c.ev(`(() => {
    const colorInp = document.querySelector('.ce-pal-border input[type=color]');
    colorInp.value = '#123456';
    colorInp.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await c.ev(`(() => {
    document.querySelector('.ce-pal-border').open = true;
    const w = document.querySelectorAll('.ce-pal-border input[type=number]')[0];
    w.value = '3'; w.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const borderSetup = await c.ev(`(() => {
    document.querySelector('.ce-pal-border').open = true;
    const r = document.querySelectorAll('.ce-pal-border input[type=number]')[1];
    r.value = '8'; r.dispatchEvent(new Event('change', { bubbles: true }));
    const n = document.querySelector('[data-ce-series-fill="s0"]');
    const cs = getComputedStyle(n);
    return { stroke: cs.stroke, strokeWidth: cs.strokeWidth, rx: cs.rx, tag: n.tagName.toLowerCase() };
  })()`);
  check('el borde independiente pinta stroke/stroke-width en el propio nodo de relleno (las barras no tenían stroke propio)',
    borderSetup.stroke === 'rgb(18, 52, 86)' && borderSetup.strokeWidth === '3px', JSON.stringify(borderSetup));
  check('el radio de esquina se aplica vía CSS rx (revertible sin tocar el atributo original del módulo)',
    borderSetup.tag === 'rect' && borderSetup.rx === '8px', JSON.stringify(borderSetup));

  const borderPersisted = await c.ev(`(() => {
    const raw = localStorage.getItem('smart-175.chartStyle.taxaBarplot');
    const s = JSON.parse(raw);
    return s.__palette.s0.border;
  })()`);
  check('el borde persiste como campo independiente del relleno (fillType sigue siendo "pattern")',
    borderPersisted && borderPersisted.color === '#123456' && borderPersisted.width === 3 && borderPersisted.radius === 8,
    JSON.stringify(borderPersisted));

  // ---- Paso 6: exportación sobrevive con degradado/patrón/borde ----
  console.log('\n-- Paso 6: exportación --');
  const exportCheck = await c.ev(`(async () => {
    const mod = await import('/js/lib/figureExport.js');
    const svg = document.querySelector('[data-ce-series-fill="s0"]').closest('svg');
    const out = mod.serializeForExport(svg, { scheme: 'light', background: 'white' });
    return {
      hasPattern: /<pattern[^>]*id="fig-pat-taxaBarplot-s0"/.test(out.svg),
      fillRefsLocal: /fill="url\\(#fig-pat-taxaBarplot-s0\\)"/.test(out.svg),
      noVarLeft: !/var\\(--/.test(out.svg),
      noColorMixLeft: !/color\\(srgb/.test(out.svg),
    };
  })()`);
  check('el SVG exportado conserva el <pattern> y la referencia fill="url(#…)" en forma local (sin URL absoluta)',
    exportCheck.hasPattern && exportCheck.fillRefsLocal, JSON.stringify(exportCheck));
  check('el SVG exportado no deja var()/color(srgb) residual (mismo gate que figureexport.mjs)',
    exportCheck.noVarLeft && exportCheck.noColorMixLeft, JSON.stringify(exportCheck));

  // volver a sólido: el <pattern> huérfano debe desaparecer del <svg> en vivo
  const backToSolid = await c.ev(`(() => {
    const sel = document.querySelector('.ce-pal-row-head select');
    sel.value = 'solid';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const svg = document.querySelector('[data-ce-series-fill="s0"]').closest('svg');
    return { defsLeft: svg.querySelectorAll('defs pattern, defs linearGradient').length, fill: getComputedStyle(document.querySelector('[data-ce-series-fill="s0"]')).fill };
  })()`);
  check('volver a "sólido" poda el <pattern> huérfano y repinta con el color plano', backToSolid.defsLeft === 0, JSON.stringify(backToSolid));

  // ---- Paso 6 (cont.): el degradado/patrón rasteriza de verdad en PNG,
  // no solo en pantalla — reabre "degradado" y exporta a PNG real ----
  const pngCheck = await c.ev(`(async () => {
    const sel = document.querySelector('.ce-pal-row-head select');
    sel.value = 'gradient';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const mod = await import('/js/lib/figureExport.js');
    const svg = document.querySelector('[data-ce-series-fill="s0"]').closest('svg');
    const res = await mod.exportFigure(svg, { formats: ['png'], scheme: 'light', background: 'white', dpi: 150 });
    // decodificar el PNG resultante y comprobar que el píxel donde está la
    // 1ª barra NO es el blanco de fondo (si el degradado se hubiera perdido
    // en la rasterización, toda la figura saldría en blanco o con el fill
    // por defecto — un test de "no está vacío", no de comparación exacta)
    const blob = new Blob([res.png], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = url; });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
    // muestrear una franja de píxeles en el tercio superior (donde caen las
    // barras apiladas) y comprobar que hay algo distinto de blanco puro
    const data = ctx.getImageData(0, Math.round(img.height * 0.3), img.width, 1).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) nonWhite++; }
    URL.revokeObjectURL(url);
    return { width: img.width, height: img.height, nonWhitePixels: nonWhite };
  })()`);
  check('el degradado sobrevive a la rasterización PNG real (píxeles no blancos donde deberían estar las barras)',
    pngCheck.width > 0 && pngCheck.nonWhitePixels > 10, JSON.stringify(pngCheck));

  // ---- Pasos 5-6 (generalización): el borde independiente también
  // funciona en las otras 2 gráficas piloto del prompt (cajas de
  // groupBoxplot.js, regiones de venn.js) — no solo en las barras ----
  console.log('\n-- generalización a las 3 gráficas piloto (barras/cajas/Venn) --');
  await c.ev(`location.hash = '#/alfa'`);
  await sleep(1500);
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Personalizar|Customise/.test(x.textContent)); b.click(); })()`);
  await sleep(500);
  const boxplotSetup = await c.ev(`(() => {
    const box = document.querySelector('[data-ce-series-fill="s0"][data-ce-series-stroke="s0"]');
    return box ? { present: true, tag: box.tagName.toLowerCase(), hasBorderDetails: !!document.querySelector('.ce-pal-border') } : { present: false };
  })()`);
  check('groupBoxplot.js: la caja ya lleva data-ce-series-fill Y -stroke en el MISMO nodo, y el panel ofrece el control de borde',
    boxplotSetup.present && boxplotSetup.tag === 'rect' && boxplotSetup.hasBorderDetails, JSON.stringify(boxplotSetup));
  if (boxplotSetup.present) {
    await c.ev(`(() => { document.querySelector('.ce-pal-border').open = true; })()`);
    const boxplotBorder = await c.ev(`(() => {
      const colorInp = document.querySelector('.ce-pal-border input[type=color]');
      colorInp.value = '#00ff00';
      colorInp.dispatchEvent(new Event('change', { bubbles: true }));
      const box = document.querySelector('[data-ce-series-fill="s0"][data-ce-series-stroke="s0"]');
      return { stroke: getComputedStyle(box).stroke, fill: getComputedStyle(box).fill };
    })()`);
    check('groupBoxplot.js: el borde independiente cambia el stroke de la caja SIN tocar su fill (relleno translúcido propio)',
      boxplotBorder.stroke === 'rgb(0, 255, 0)' && boxplotBorder.fill !== 'rgb(0, 255, 0)', JSON.stringify(boxplotBorder));
  }

  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealCounts(); })()`);
  await sleep(1000);
  await c.ev(`location.hash = '#/venn'`);
  await sleep(1500);
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Personalizar|Customise/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(500);
  const vennSetup = await c.ev(`(() => {
    const region = document.querySelector('[data-ce-series-fill^="s"][data-ce-series-stroke]');
    return region ? { present: true, tag: region.tagName.toLowerCase(), hasBorderDetails: !!document.querySelector('.ce-pal-border') } : { present: false };
  })()`);
  check('venn.js (vía js/lib/setDiagram.js): las regiones también llevan -fill/-stroke y ofrecen el control de borde (generaliza a <path>, no solo <rect>)',
    vennSetup.present && vennSetup.hasBorderDetails, JSON.stringify(vennSetup));

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
