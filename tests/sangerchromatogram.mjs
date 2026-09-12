// Arrastre de los marcadores de recorte del cromatograma (#/sanger): un
// arrastre real dispara varios `pointermove` en `window` mientras el puntero
// se mueve. La primera versión de este visor confirmaba el recorte (y
// repintaba TODO el módulo, destruyendo el <svg>) en cada `pointermove` — el
// siguiente evento de ese mismo arrastre seguía disparando el listener
// "zombi" enganchado al <svg> ya destruido. Ahora el arrastre solo mueve el
// marcador EN VIVO sobre el propio SVG y confirma el recorte una única vez,
// al soltar. Este test reproduce la secuencia completa (pointerdown en el
// marcador, varios pointermove en window, pointerup) y comprueba que no
// queda ningún listener zombi después de soltar.
//
//   node tests/sangerchromatogram.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'sanger-chromatogram' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

try {
  await c.goto();
  await sleep(1200);
  await c.ev(`location.hash = '#/sanger'`);
  await sleep(800);
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /muestra limpia|clean sample/i.test(x.textContent)); b.click(); })()`);
  let loaded = false;
  for (let i = 0; i < 40; i++) {
    if (await c.ev(`document.querySelectorAll('.ql-table tbody tr').length`) > 0) { loaded = true; break; }
    await sleep(300);
  }
  check('el ejemplo B13 carga una fila de muestra', loaded);

  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-tab')].find(x => /Cromatograma|Chromatogram/i.test(x.textContent)); b.click(); })()`);
  let drawn = false;
  for (let i = 0; i < 30; i++) {
    if (await c.ev(`document.querySelectorAll('svg[role=img] polyline').length`) > 0) { drawn = true; break; }
    await sleep(300);
  }
  check('el cromatograma dibuja las 4 trazas', drawn);

  const wide = await c.ev(`(() => {
    const svg = document.querySelector('svg[role=img]');
    const wrap = svg.closest('div');
    return { scroll: wrap.scrollWidth, client: wrap.clientWidth, bodyOverflows: document.body.scrollWidth > document.body.clientWidth };
  })()`);
  check('el SVG es más ancho que su contenedor (scroll horizontal real, no encogido)', wide.scroll > wide.client * 1.5, JSON.stringify(wide));
  check('la página NO desborda horizontalmente (el scroll queda contenido en el visor)', !wide.bodyOverflows);

  const beforeEnd = await c.ev(`document.getElementById('sgTrimEnd').value`);
  await c.ev(`(() => {
    const g = document.querySelector('svg[role=img] [data-trim="end"]');
    const r = g.getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.x, clientY: r.y, bubbles: true }));
  })()`);
  // varios pointermove del mismo arrastre — es justo la secuencia que antes
  // dejaba el listener zombi en cuanto el primero repintaba el módulo.
  for (let dx = -300; dx <= -60; dx += 60) {
    await c.ev(`window.dispatchEvent(new PointerEvent('pointermove', { clientX: ${dx}, clientY: 0, bubbles: true }))`);
    await sleep(40);
  }
  const duringDrag = await c.ev(`document.getElementById('sgTrimEnd').value`);
  await c.ev(`window.dispatchEvent(new PointerEvent('pointerup', { clientX: -60, clientY: 0, bubbles: true }))`);
  await sleep(400);
  const afterDrop = await c.ev(`document.getElementById('sgTrimEnd') ? document.getElementById('sgTrimEnd').value : 'SIN_INPUT'`);
  check('el arrastre movió el valor de fin de recorte antes de soltar', +duringDrag !== +beforeEnd, 'antes=' + beforeEnd + ' durante=' + duringDrag);
  check('al soltar, el módulo repinta con el valor confirmado', afterDrop !== 'SIN_INPUT' && +afterDrop === +duringDrag, 'durante=' + duringDrag + ' después=' + afterDrop);

  // sin listener zombi: un pointermove fantasma tras soltar no debe mover nada más
  await c.ev(`window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 0, bubbles: true }))`);
  await sleep(250);
  const afterGhost = await c.ev(`document.getElementById('sgTrimEnd') ? document.getElementById('sgTrimEnd').value : 'SIN_INPUT'`);
  check('ningún listener de arrastre "zombi" sigue activo tras soltar', afterGhost === afterDrop, 'después=' + afterDrop + ' fantasma=' + afterGhost);

  check('sin errores de consola / excepciones', c.problems.length === 0, JSON.stringify(c.problems));
} catch (err) {
  check('ejecución sin excepciones', false, err.message);
} finally {
  c.kill();
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
