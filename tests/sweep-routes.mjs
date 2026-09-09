// Barrido headless de las 16 rutas/subvistas en claro y oscuro con todos los
// ejemplos cargados. Falla si aparece cualquier error de consola o excepción.
//
//   node tests/sweep-routes.mjs
//
// exit 0 = sin errores · 1 = errores · 2 = no hay Chrome / no se puede servir

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { ROUTES, LOAD_ALL, walkRoute, waitQC, sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

let failed = false;

for (const dark of [false, true]) {
  const themeName = dark ? 'OSCURO' : 'CLARO';
  const c = await connect({ dark, url: server.url + '/index.html', label: 'boot-' + themeName });
  try {
    await c.goto();
    await sleep(1600);
    c.setLabel('carga de ejemplos');
    await c.ev(LOAD_ALL);
    await sleep(2500);
    await waitQC(c);

    for (const route of ROUTES) {
      c.setLabel(route + ' (' + themeName + ')');
      await walkRoute(c, route, {
        report: route === '#/informe',
        onInfo: (m) => console.log('  ' + m),
      });
    }

    console.log(`\n===== ${themeName} =====`);
    if (c.problems.length === 0) {
      console.log('  0 errores de consola / excepciones en las 16 rutas/subvistas');
    } else {
      failed = true;
      c.problems.forEach((p) => console.log('  ✗ ' + p));
    }
  } finally {
    c.kill();
  }
}

if (server.started) server.stop();
process.exit(failed ? 1 : 0);
