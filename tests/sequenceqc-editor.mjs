// Editor de gráficos en #/qc (Fase 5.1 de qiimelab-prompt-editor-fase-5-
// especificos-por-tipo.md): las 3 funciones de dibujo de sequenceQC.js
// (drawPerPosQuality/drawLines/drawBars) viven FUERA de render() — no
// tienen paint() propio al que volver a llamar, así que dependen del
// fallback interno de resetAll() en chartEditor.js. Cada tarjeta de
// métrica recibe una clave única 'qc-<archivo>-<métrica>' (helper qk() en
// renderReport) para que 8 gráficas independientes en la MISMA página no
// colisionen en localStorage — y como cada tarjeta abre su PROPIA
// instancia de attachChartEditor (no hay un único editor global que se
// cierre solo al abrir el siguiente), todas las consultas del DOM en este
// test se limitan explícitamente a la tarjeta activa (window.__card) y
// cada tarjeta se cierra ("Terminar") antes de pasar a la siguiente.
//
//   node tests/sequenceqc-editor.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'sequenceqc-editor' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

// abre el editor de UNA tarjeta de métrica concreta y guarda su nodo en
// window.__card para que las siguientes consultas queden limitadas a ella
const openCardEditor = (titleRegexSrc) => c.ev(`(() => {
  const cards = [...document.querySelectorAll('.ql-card.ql-panel')];
  const card = cards.find((c) => c.querySelector('h2') && new RegExp(${JSON.stringify(titleRegexSrc)}, 'i').test(c.querySelector('h2').textContent));
  if (!card) return { err: 'no se encontró la tarjeta' };
  window.__card = card;
  const btn = [...card.querySelectorAll('button')].find((b) => /Personalizar|Customise/.test(b.textContent));
  if (!btn) return { err: 'no se encontró el botón Personalizar en la tarjeta' };
  btn.click();
  return { ok: true };
})()`);

const closeCardEditor = () => c.ev(`(() => {
  if (!window.__card) return { err: 'no hay tarjeta activa' };
  const btn = [...window.__card.querySelectorAll('button')].find((b) => /Terminar|Done/.test(b.textContent));
  if (btn) btn.click();
  return { ok: !!btn };
})()`);

try {
  await c.goto();
  await sleep(1500);
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealSequenceQC(); })()`);
  await sleep(2500);
  await c.ev(`location.hash = '#/qc'`);
  await sleep(2500);

  // el análisis FASTQ corre en el hilo principal tras cargar -- esperar a
  // que el informe completo aparezca (hasta 15s, sondeando)
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const state = await c.ev(`(() => ({ n: document.querySelectorAll('.ql-card.ql-panel svg.ql-svg').length }))()`);
    if (state.n >= 7) { ready = true; break; }
    await sleep(500);
  }
  check('el informe de QC termina de analizarse y pinta varias gráficas', ready);

  // ---- 1. hay una gráfica (con su propio editor) por cada métrica ----
  console.log('\n-- recuento de editores independientes --');
  const svgCount = await c.ev(`(() => document.querySelectorAll('.ql-card.ql-panel svg.ql-svg').length)()`);
  check('8 tarjetas de métrica tienen gráfica propia (perpos/seqq/basecontent/ncontent/gcdist/lengthdist/duplication/adapter)',
    svgCount === 8, 'svgCount=' + svgCount);

  // ---- 2. abrir el editor en la tarjeta "calidad media por lectura" (bar chart de 1 serie) ----
  console.log('\n-- edición de color en una tarjeta (barras, 1 serie) --');
  const openSeqQ = await openCardEditor('media por lectura|per.read');
  check('el botón "Personalizar" de la tarjeta de calidad media se encuentra y se puede pulsar', openSeqQ.ok, JSON.stringify(openSeqQ));
  await sleep(500);

  const seqqColorBefore = await c.ev(`(() => {
    const n = window.__card.querySelector('[data-ce-series-fill="s0"]');
    return n ? getComputedStyle(n).fill : null;
  })()`);
  check('la barra tiene un color aplicado antes de editar', !!seqqColorBefore, seqqColorBefore);

  const seqqApplied = await c.ev(`(() => {
    const inp = window.__card.querySelector('.ce-pal-row-fill input[type=color]');
    if (!inp) return { err: 'no hay input de color' };
    inp.value = '#ff00ff';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    const n = window.__card.querySelector('[data-ce-series-fill="s0"]');
    return { fill: getComputedStyle(n).fill };
  })()`);
  check('cambiar el color en el picker repinta la barra de inmediato (sin paint() propio, escritura directa en el nodo)',
    seqqApplied.fill === 'rgb(255, 0, 255)', JSON.stringify(seqqApplied));

  const seqqKey = await c.ev(`(() => Object.keys(localStorage).filter((k) => k.startsWith('smart-175.chartStyle.qc-')))()`);
  check('la clave persistida sigue el patrón qc-<archivo>-seqq', seqqKey.some((k) => /qc-.*-seqq$/.test(k)), JSON.stringify(seqqKey));
  await closeCardEditor();
  await sleep(300);

  // ---- 3. abrir el editor en OTRA tarjeta (distribución de %GC, también barras) y confirmar que NO comparte color ----
  console.log('\n-- independencia entre tarjetas (sin colisión de clave) --');
  const openGc = await openCardEditor('%GC|GC content|distribución de.*GC');
  check('el botón "Personalizar" de la tarjeta de %GC se encuentra', openGc.ok, JSON.stringify(openGc));
  await sleep(500);

  const gcColorBefore = await c.ev(`(() => {
    const n = window.__card.querySelector('[data-ce-series-fill="s0"]');
    return n ? getComputedStyle(n).fill : null;
  })()`);
  check('la tarjeta de %GC NO heredó el magenta aplicado en la tarjeta de calidad media (claves independientes)',
    gcColorBefore !== 'rgb(255, 0, 255)', gcColorBefore);
  await closeCardEditor();
  await sleep(300);

  // ---- 4. multi-serie: composición de bases (A/C/G/T) ----
  console.log('\n-- editor multi-serie (composición de bases) --');
  const openBase = await openCardEditor('composición de bases|base content|base composition');
  check('el botón "Personalizar" de la tarjeta de composición de bases se encuentra', openBase.ok, JSON.stringify(openBase));
  await sleep(500);

  const baseSeries = await c.ev(`(() => ({ n: window.__card.querySelectorAll('.ce-pal-row-block').length }))()`);
  check('la tarjeta de composición de bases ofrece 4 filas de serie (A/C/G/T), una por trazo', baseSeries.n === 4, JSON.stringify(baseSeries));

  const strokeBefore = await c.ev(`(() => {
    const n = window.__card.querySelector('[data-ce-series-stroke="s0"]');
    return n ? getComputedStyle(n).stroke : null;
  })()`);
  const strokeApplied = await c.ev(`(() => {
    const inp = window.__card.querySelector('.ce-pal-row-fill input[type=color]');
    inp.value = '#00aa00';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    const n = window.__card.querySelector('[data-ce-series-stroke="s0"]');
    return { stroke: getComputedStyle(n).stroke };
  })()`);
  check('editar el color de la 1ª serie (A) recolorea su <polyline> vía data-ce-series-stroke',
    strokeApplied.stroke === 'rgb(0, 170, 0)' && strokeApplied.stroke !== strokeBefore, JSON.stringify({ strokeBefore, ...strokeApplied }));

  // ---- 5. arrastre por teclado del título del eje X (xtitle), limitado a esta tarjeta ----
  console.log('\n-- arrastre del título del eje X --');
  const dragSetup = await c.ev(`(() => {
    const hits = [...window.__card.querySelectorAll('.ce-hit')];
    const h = hits.find((el) => el.closest('.ce-el') && el.closest('.ce-el').querySelector('[data-ce="xtitle"]'));
    if (!h) return { err: 'no se encontró el tirador de xtitle', n: hits.length };
    h.focus();
    window.__xh = h;
    window.__xwrap = h.closest('.ce-el');
    return { ok: true, focused: document.activeElement === h };
  })()`);
  check('el título del eje X de la gráfica multi-serie es arrastrable (tirador .ce-hit enfocable)', dragSetup.ok, JSON.stringify(dragSetup));

  if (dragSetup.ok) {
    for (let i = 0; i < 3; i++) {
      await c.ev(`window.__xh.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))`);
      await sleep(60);
    }
    const moved = await c.ev(`(() => {
      const m = /translate\\(([-\\d.]+),\\s*([-\\d.]+)\\)/.exec(window.__xwrap.getAttribute('transform') || '');
      return { dx: m ? +m[1] : null, dy: m ? +m[2] : null };
    })()`);
    check('3 × flecha abajo mueve el título del eje X 6px (2px por paso)', moved.dy === 6, JSON.stringify(moved));

    const dragKey = await c.ev(`(() => Object.keys(localStorage).filter((k) => k.startsWith('smart-175.chartStyle.qc-') && k.includes('basecontent')))()`);
    check('la posición del título persiste bajo la clave qc-<archivo>-basecontent', dragKey.length === 1, JSON.stringify(dragKey));
  }

  // ---- 6. "Restablecer" usa el fallback interno (sin paint() propio) ----
  console.log('\n-- Restablecer (fallback interno de resetAll, sin paint() del módulo) --');
  const resetResult = await c.ev(`(() => {
    const btn = [...window.__card.querySelectorAll('button')].find((b) => /Restablecer|Reset/.test(b.textContent) && !/valores/.test(b.textContent));
    if (!btn) return { err: 'no se encontró el botón Restablecer' };
    btn.click();
    const n = window.__card.querySelector('[data-ce-series-stroke="s0"]');
    return { stroke: n ? getComputedStyle(n).stroke : null };
  })()`);
  check('"Restablecer" revierte el color de la serie A a su valor por defecto sin necesitar un paint() del módulo',
    resetResult.stroke && resetResult.stroke !== 'rgb(0, 170, 0)', JSON.stringify(resetResult));
  await closeCardEditor();
  await sleep(300);

  // ---- 7. "Restablecer" en una tarjeta borra SU clave (localStorage.removeItem)
  // sin tocar la clave de otra tarjeta editada antes -- confirma que las 2
  // ediciones nunca compartieron el mismo hueco de localStorage ----
  console.log('\n-- resumen de claves --');
  const allKeys = await c.ev(`(() => Object.keys(localStorage).filter((k) => k.startsWith('smart-175.chartStyle.qc-')))()`);
  check('tras "Restablecer" en la tarjeta de composición de bases, solo queda la clave de "seqq" (nunca compartieron hueco)',
    allKeys.length === 1 && /qc-.*-seqq$/.test(allKeys[0]), JSON.stringify(allKeys));

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
