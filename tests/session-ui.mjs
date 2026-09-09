// UI de guardar/cargar sesión en #/cargar: los botones aparecen y se habilitan
// con datos, "Guardar" produce un JSON grande, y el modal de confirmación de
// carga es accesible (role=dialog, aria-modal, aria-labelledby real, foco en
// el botón de aceptar, Escape lo cierra resolviendo false).
//
//   node tests/session-ui.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'session-ui' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

try {
  await c.goto();
  await sleep(1500);
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealCommunityData(); })()`);
  await sleep(2000);
  await c.ev(`location.hash = '#/cargar'`);
  await sleep(1500);

  const bar = await c.ev(`[...document.querySelectorAll('.ql-session-bar button')].map(b => ({ txt: b.textContent, disabled: b.disabled }))`);
  check('botones "Guardar sesión" / "Cargar sesión" presentes y habilitados con datos',
    bar.length === 2 && bar.every((b) => !b.disabled) && /Guardar|Save/.test(bar[0].txt) && /Cargar|Load/.test(bar[1].txt),
    JSON.stringify(bar));

  const bytes = await c.ev(`(async () => {
    const { exportSession } = await import('/js/lib/session.js');
    return JSON.stringify(exportSession(), null, 2).length;
  })()`);
  check('exportSession() produce un JSON no trivial', bytes > 100000, bytes + ' bytes');

  const modal = await c.ev(`(async () => {
    const { openConfirm } = await import('/js/lib/modal.js');
    const p = openConfirm({ title: 'Prueba', bodyHtml: '<p>cuerpo</p>', confirmLabel: 'Sí', cancelLabel: 'No', danger: true });
    await new Promise((r) => setTimeout(r, 150));
    const dlg = document.querySelector('.ql-modal[role="dialog"]');
    const lb = dlg && dlg.getAttribute('aria-labelledby');
    const info = {
      exists: !!dlg,
      ariaModal: dlg && dlg.getAttribute('aria-modal'),
      labelledbyResolves: !!(lb && document.getElementById(lb) && document.getElementById(lb).textContent.trim()),
      focusOnConfirm: document.activeElement && /S[íi]/.test(document.activeElement.textContent || ''),
      hasDanger: !!(dlg && dlg.querySelector('.ql-btn-danger')),
    };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    info.escapeResolvesFalse = (await p) === false;
    info.dismissed = !document.querySelector('.ql-modal-backdrop');
    return info;
  })()`);
  check('modal: role=dialog + aria-modal=true', modal.exists && modal.ariaModal === 'true');
  check('modal: aria-labelledby apunta a un título real', modal.labelledbyResolves);
  check('modal: el foco entra en el botón de aceptar', modal.focusOnConfirm);
  check('modal: variante danger', modal.hasDanger);
  check('modal: Escape lo cierra resolviendo false', modal.escapeResolvesFalse && modal.dismissed, JSON.stringify(modal));

  check('sin errores de consola', c.problems.length === 0, c.problems.join('; '));
} catch (e) {
  console.error('EXCEPCIÓN:', e.message);
  failed = true;
} finally {
  c.kill();
  if (server.started) server.stop();
}
console.log('\nRESULTADO session-ui: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
