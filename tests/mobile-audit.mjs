// Auditoría móvil/tablet — INFORMATIVO, no pasa/falla. Recorre las 13 rutas a
// 375px (móvil) y 768px (tablet) y clasifica lo que encuentra:
//   ROMPE     la página se ensancha más allá del viewport (scroll-x del body /
//             zoom-out), o un control queda fuera de alcance
//   APRETADO  entra pero muy justo
//
//   node tests/mobile-audit.mjs
//
// Siempre sale 0 (o 2 si no hay navegador). Su salida alimenta el informe.

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { ROUTES, LOAD_ALL, walkRoute, waitQC, sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

// `EXP` = ancho de viewport que pedimos. En móvil el navegador ensancha el
// layout hasta el contenido más ancho, así que scrollWidth/EXP > 1 ⇒ desborda.
const PROBE = (exp) => `(() => {
  const EXP = ${exp};
  const de = document.documentElement;
  const layoutW = de.scrollWidth;
  const scrollableUp = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 2) return true;
    }
    return false;
  };
  const out = { EXP, layoutW, ratio: +(layoutW / EXP).toFixed(2), widest: [], controlsOut: [] };
  if (layoutW <= EXP + 4) return out;

  const seen = new Set();
  document.querySelectorAll('main *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height === 0) return;
    if (r.width <= EXP + 4) return;              // cabe en el viewport pedido
    if (scrollableUp(el)) return;                 // va dentro de un contenedor con scroll-x → ok
    const tag = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');
    if (seen.has(tag)) return;
    seen.add(tag);
    out.widest.push({ tag, w: Math.round(r.width) });
    const ctl = /^(input|select|button|textarea|a)$/.test(el.tagName.toLowerCase());
    if (ctl && r.left > EXP) out.controlsOut.push(tag);
  });
  out.widest.sort((a, b) => b.w - a.w);
  out.widest = out.widest.slice(0, 4);
  return out;
})()`;

const c = await connect({ url: server.url + '/index.html', label: 'mobile-audit' });
try {
  await c.goto();
  await sleep(1600);
  await c.ev(LOAD_ALL);
  await sleep(2500);
  await waitQC(c);

  const summary = { rompe: [], apretado: [] };
  for (const [w, tag] of [[375, 'MÓVIL 375px'], [768, 'TABLET 768px']]) {
    await c.setViewport(w, 1600);
    console.log('\n════════ ' + tag + ' ════════');
    for (const route of ROUTES) {
      c.setLabel(route + ' @' + w);
      await walkRoute(c, route, { report: route === '#/informe' });
      await sleep(150);
      const r = await c.ev(PROBE(w));
      if (r.ratio > 1.04) {
        const worst = r.widest.map((x) => `${x.tag}=${x.w}px`).join(', ');
        const ctl = r.controlsOut.length ? `  ⚠ controles fuera: ${r.controlsOut.join(', ')}` : '';
        console.log(`  ✗ ${route.padEnd(15)} desborda ×${r.ratio}  (layout ${r.layoutW}px)  ${worst}${ctl}`);
        summary.rompe.push(`${route} @${w}px ×${r.ratio}${ctl ? ' + control inalcanzable' : ''}`);
      } else if (r.ratio > 1.0) {
        console.log(`  ~ ${route.padEnd(15)} justo ×${r.ratio}`);
        summary.apretado.push(`${route} @${w}px ×${r.ratio}`);
      } else {
        console.log(`  ✓ ${route.padEnd(15)} ok`);
      }
    }
  }

  console.log('\n──────── RESUMEN ────────');
  console.log('ROMPE (' + summary.rompe.length + '):');
  summary.rompe.forEach((s) => console.log('  · ' + s));
  console.log('APRETADO (' + summary.apretado.length + '):');
  summary.apretado.forEach((s) => console.log('  · ' + s));
  console.log('\n(informativo — no cuenta como fallo del runner)');
} catch (e) {
  console.error('EXCEPCIÓN:', e.message);
} finally {
  c.kill();
  if (server.started) server.stop();
}
process.exit(0);
