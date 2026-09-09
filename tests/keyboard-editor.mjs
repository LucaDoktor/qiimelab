// El editor de gráficos usado SOLO con teclado: enfocar un texto arrastrable,
// moverlo con flechas (Shift = paso mayor), abrir el panel con Intro (el foco
// entra en el panel), cerrarlo con Escape (el foco vuelve al tirador), y la
// posición persiste en localStorage.
//
//   node tests/keyboard-editor.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'keyboard-editor' });
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

  const setup = await c.ev(`(() => {
    const hits = [...document.querySelectorAll('.ce-hit')];
    if (!hits.length) return { err: 'no hay .ce-hit' };
    const h = hits[0];
    h.focus();
    const wrap = h.closest('.ce-el');
    window.__h = h; window.__wrap = wrap;
    return { n: hits.length, tabindex: h.getAttribute('tabindex'), role: h.getAttribute('role'),
      aria: h.getAttribute('aria-label'), focused: document.activeElement === h };
  })()`);
  check('el tirador es enfocable (tabindex=0, role=button, aria-label)',
    setup.tabindex === '0' && setup.role === 'button' && !!setup.aria && setup.focused, JSON.stringify(setup));

  const key = async (k, shift = false) => {
    await c.ev(`window.__h.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, shiftKey: ${shift}, bubbles: true, cancelable: true }))`);
    await sleep(60);
  };
  for (let i = 0; i < 5; i++) await key('ArrowRight');   // 5 × 2px = 10
  for (let i = 0; i < 2; i++) await key('ArrowDown', true); // 2 × 12px = 24

  const moved = await c.ev(`(() => {
    const m = /translate\\(([-\\d.]+),\\s*([-\\d.]+)\\)/.exec(window.__wrap.getAttribute('transform') || '');
    return { dx: m ? +m[1] : null, dy: m ? +m[2] : null };
  })()`);
  check('flechas mueven 2px, Shift+flecha 12px', moved.dx === 10 && moved.dy === 24, JSON.stringify(moved));

  await key('Enter');
  await sleep(300);
  const opened = await c.ev(`(() => {
    const p = document.querySelector('.ce-panel');
    return { open: !!p, role: p && p.getAttribute('role'), focusInPanel: p ? p.contains(document.activeElement) : false };
  })()`);
  check('Intro abre el panel (role=group) y el foco entra en él',
    opened.open && opened.role === 'group' && opened.focusInPanel, JSON.stringify(opened));

  await c.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  const closed = await c.ev(`(() => ({ open: !!document.querySelector('.ce-panel'), backOnHit: document.activeElement === window.__h }))()`);
  check('Escape cierra el panel y devuelve el foco al tirador', !closed.open && closed.backOnHit, JSON.stringify(closed));

  await c.ev(`location.hash = '#/beta'`); await sleep(500);
  await c.ev(`location.hash = '#/barplots'`); await sleep(1500);
  const persisted = await c.ev(`(() => { const raw = localStorage.getItem('qiimelab.chartStyle.taxaBarplot'); return raw ? JSON.parse(raw) : null; })()`);
  check('la posición persiste tras recargar la ruta', !!persisted && Object.keys(persisted).length > 0, JSON.stringify(persisted));

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
