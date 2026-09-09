// Heurísticas de accesibilidad por ruta × tema: nombre accesible en cada
// botón/enlace, etiqueta en cada control de formulario, aria-label en cada
// svg[role=img], landmarks (<main tabindex=-1>, <nav aria-label>), enlace
// "saltar al contenido", aria-current en la navegación activa.
//
//   node tests/sweep-a11y.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { ROUTES, LOAD_ALL, walkRoute, waitQC, A11Y_PROBE, sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

let failed = false;

for (const dark of [false, true]) {
  const themeName = dark ? 'OSCURO' : 'CLARO';
  const c = await connect({ dark, url: server.url + '/index.html', label: 'a11y-' + themeName });
  try {
    await c.goto();
    await sleep(1600);
    await c.ev(LOAD_ALL);
    await sleep(2500);
    await waitQC(c);

    const findings = [];
    for (const route of ROUTES) {
      c.setLabel(route + ' (' + themeName + ')');
      await walkRoute(c, route, { report: route === '#/informe' });
      const bad = await c.ev(A11Y_PROBE);
      if (bad.length) findings.push([route, bad]);
    }

    console.log(`\n===== ${themeName} =====`);
    if (findings.length === 0 && c.problems.length === 0) {
      console.log('  0 hallazgos de accesibilidad en las 14 rutas');
    } else {
      failed = true;
      findings.forEach(([r, b]) => console.log('  ' + r + ':\n    - ' + b.join('\n    - ')));
      c.problems.forEach((p) => console.log('  ✗ ' + p));
    }
  } finally {
    c.kill();
  }
}

if (server.started) server.stop();
process.exit(failed ? 1 : 0);
