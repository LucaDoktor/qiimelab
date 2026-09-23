// Elipses de confianza en el PCoA 2D (prompt "quick wins" del 22 sep 2026,
// punto 3): toggle "Mostrar elipses de confianza", una por grupo (normal
// bivariante, equivalente a vegan::ordiellipse), en el mismo color que ya
// tiene cada grupo, omitida si n<4 (con aviso). La geometría en sí ya se
// valida contra R en tests/stats/confidenceellipse.mjs (Mahalanobis exacta
// sobre los 72 vértices) -- este test cubre la parte de INTERFAZ: el
// toggle aparece, dibuja/oculta de verdad, colorea igual que el grupo
// (mismo data-ce-series-fill que el punto y la leyenda) y avisa de los
// grupos omitidos.
//
//   node tests/pcoa-ellipses.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'pcoa-ellipses' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

try {
  await c.goto();
  await sleep(1500);
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealCommunityData(); })()`);
  await sleep(2000);
  await c.ev(`location.hash = '#/beta'`);
  await sleep(1200);
  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-tab')].find((x) => /PCoA/i.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(1200);

  const setup = await c.ev(`(() => {
    const cb = [...document.querySelectorAll('input[type=checkbox]')].find((el) => el.closest('label') && /elipses/i.test(el.closest('label').textContent));
    return { hasCheckbox: !!cb, checkedByDefault: cb ? cb.checked : null, ellipsesBefore: document.querySelectorAll('svg.ql-svg polygon').length };
  })()`);
  check('el toggle "Mostrar elipses de confianza" existe y arranca desmarcado (comportamiento previo intacto)',
    setup.hasCheckbox && setup.checkedByDefault === false && setup.ellipsesBefore === 0, JSON.stringify(setup));

  await c.ev(`(() => {
    const cb = [...document.querySelectorAll('input[type=checkbox]')].find((el) => el.closest('label') && /elipses/i.test(el.closest('label').textContent));
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(800);

  const drawn = await c.ev(`(() => {
    const polys = [...document.querySelectorAll('svg.ql-svg [data-ce="ellipses"] polygon')];
    const points = [...document.querySelectorAll('svg.ql-svg circle[data-i]')];
    const legendSwatches = [...document.querySelectorAll('svg.ql-svg [data-ce="legend"] rect')];
    return {
      nEllipses: polys.length,
      firstPointsCount: polys.length > 0 ? polys[0].getAttribute('points').split(' ').length : 0,
      omittedNote: [...document.querySelectorAll('.ql-field-help')].map((p) => p.textContent).find((t) => /Elipse omitida/.test(t)),
    };
  })()`);
  check('marcar el toggle dibuja al menos 1 elipse (polígono de 72 vértices)',
    drawn.nEllipses > 0 && drawn.firstPointsCount === 72, JSON.stringify(drawn));
  check('avisa qué grupos se omiten por tener menos de 4 muestras', !!drawn.omittedNote, JSON.stringify(drawn));

  const colorMatch = await c.ev(`(() => {
    const poly = document.querySelector('svg.ql-svg [data-ce="ellipses"] polygon[data-ce-series-fill]');
    if (!poly) return { err: 'no se dibujó ninguna elipse' };
    const sid = poly.getAttribute('data-ce-series-fill');
    const point = document.querySelector('svg.ql-svg circle[data-i][data-ce-series-fill="' + sid + '"]');
    if (!point) return { err: 'no se encontró un punto con la misma serie ' + sid };
    return { sid, ellipseStroke: getComputedStyle(poly).stroke, pointFill: getComputedStyle(point).fill };
  })()`);
  check('una elipse dibujada usa el mismo color que los puntos de su mismo grupo (misma serie data-ce-series-fill)',
    colorMatch.ellipseStroke && colorMatch.pointFill && colorMatch.ellipseStroke === colorMatch.pointFill, JSON.stringify(colorMatch));

  // desmarcar vuelve a ocultarlas
  await c.ev(`(() => {
    const cb = [...document.querySelectorAll('input[type=checkbox]')].find((el) => el.closest('label') && /elipses/i.test(el.closest('label').textContent));
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(500);
  const hidden = await c.ev(`(() => document.querySelectorAll('svg.ql-svg polygon').length)()`);
  check('desmarcarlo vuelve a quitar las elipses del todo', hidden === 0, 'n=' + hidden);

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
