// Editor de gráficos en #/sanger, pestaña Cromatograma (Fase 5.3 de
// qiimelab-prompt-editor-fase-5-especificos-por-tipo.md). El color por
// base (paletteSeries base-A/base-C/base-G/base-T) ya funcionaba de
// fábrica -- lo que faltaba y se añade aquí:
//   - elements: [] -> ahora trae un título ('Cromatograma').
//   - startEditing: paintCromatograma() vive en el mismo nivel que paint()
//     (funciones hermanas, no anidadas -- el mismo patrón de bug que ya se
//     corrigió en otros 6 módulos en fases anteriores) y destruye/recrea el
//     editor en cada repintado sin capturar isEditing() antes; cambiar de
//     muestra o de dirección F/R con el panel "Personalizar" abierto lo
//     cerraba solo. Ahora captura wasEditing y lo pasa como startEditing.
// El grosor de traza y la paleta CVD-alternativa NO necesitaron código
// nuevo: el control de "borde independiente" (Fase 2) ya permite fijar
// stroke-width por serie en un nodo que solo tiene data-ce-series-stroke
// (sin -fill), y el selector de paleta ya ofrece Okabe-Ito (CVD-safe con
// maxSafeN=6, sobra para 4 bases) sin forzar el cambio del color por
// defecto de la app. La banda de calidad Phred superpuesta con umbral
// configurable NO se implementó en esta fase (anotación nueva, no
// "enganchar infraestructura ya existente" como el resto de 5.3) --
// decisión de alcance documentada en el roadmap, no un olvido.
//
//   node tests/sanger-editor.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const c = await connect({ url: server.url + '/index.html', label: 'sanger-editor' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

const openEditor = async () => {
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Personalizar|Customise/.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(600);
};

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
  check('el ejemplo B13 (forward+reverse) carga', loaded);

  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-tab')].find(x => /Cromatograma|Chromatogram/i.test(x.textContent)); b.click(); })()`);
  let drawn = false;
  for (let i = 0; i < 30; i++) {
    if (await c.ev(`document.querySelectorAll('svg[role=img] polyline').length`) > 0) { drawn = true; break; }
    await sleep(300);
  }
  check('el cromatograma dibuja las 4 trazas', drawn);

  // ================= título nuevo =================
  console.log('\n-- título nuevo (antes elements: []) --');
  await openEditor();
  const titleSetup = await c.ev(`(() => {
    const t = document.querySelector('svg[role=img] [data-ce="title"]');
    return { present: !!t, text: t ? t.textContent : null };
  })()`);
  check('el cromatograma ahora trae un título editable/arrastrable', titleSetup.present && !!titleSetup.text, JSON.stringify(titleSetup));

  // ================= color por base (ya existía, confirmar) =================
  console.log('\n-- color por base (ya existía de fábrica) --');
  const seriesSetup = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    return { n: blocks.length, labels: blocks.map((b) => b.querySelector('.ce-pal-row-head label').textContent) };
  })()`);
  check('el panel trae 4 series, una por base (A/C/G/T)',
    seriesSetup.n === 4 && ['A', 'C', 'G', 'T'].every((b) => seriesSetup.labels.includes(b)), JSON.stringify(seriesSetup));

  const colorApplied = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    const block = blocks.find((b) => b.querySelector('.ce-pal-row-head label').textContent === 'A');
    const inp = block.querySelector('.ce-pal-row-fill input[type=color]');
    inp.value = '#123abc'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const trace = document.querySelector('polyline[data-ce-series-stroke="base-A"]');
    return { stroke: trace ? getComputedStyle(trace).stroke : null };
  })()`);
  check('cambiar el color de la base A recolorea su traza (polyline data-ce-series-stroke)',
    colorApplied.stroke === 'rgb(18, 58, 188)', JSON.stringify(colorApplied));

  // ================= grosor de traza vía "borde independiente" (Fase 2, genérico) =================
  console.log('\n-- grosor de traza (control de borde independiente, ya genérico) --');
  const widthBefore = await c.ev(`(() => {
    const trace = document.querySelector('polyline[data-ce-series-stroke="base-A"]');
    return { strokeWidth: trace ? getComputedStyle(trace).strokeWidth : null };
  })()`);
  const widthApplied = await c.ev(`(() => {
    const blocks = [...document.querySelectorAll('.ce-pal-row-block')];
    const block = blocks.find((b) => b.querySelector('.ce-pal-row-head label').textContent === 'A');
    const det = block.querySelector('.ce-pal-border');
    if (!det) return { err: 'no hay control de borde en esta serie' };
    det.open = true;
    const widthInp = [...det.querySelectorAll('input[type=number]')][0];
    widthInp.value = '3.5'; widthInp.dispatchEvent(new Event('change', { bubbles: true }));
    const trace = document.querySelector('polyline[data-ce-series-stroke="base-A"]');
    return { strokeWidth: trace ? getComputedStyle(trace).strokeWidth : null };
  })()`);
  check('el control de "borde" de la serie A permite fijar el grosor de SU traza (nodo solo con -stroke, sin -fill)',
    widthApplied.strokeWidth === '3.5px' && widthApplied.strokeWidth !== widthBefore.strokeWidth, JSON.stringify({ widthBefore, ...widthApplied }));

  // ================= paleta CVD-alternativa disponible sin forzarla =================
  console.log('\n-- paleta alternativa validada (Okabe-Ito) disponible, sin forzar el cambio --');
  const paletteChooser = await c.ev(`(() => {
    const sel = document.querySelector('.ce-pal-chooser select');
    if (!sel) return { err: 'no hay selector de paleta' };
    const hasOkabe = [...sel.options].some((o) => o.value === 'okabe-ito');
    return { hasOkabe, currentDefault: sel.options[0].value, currentSelected: sel.value };
  })()`);
  check('el catálogo de paletas incluye Okabe-Ito (CVD-safe, maxSafeN=6, sobra para 4 bases)', paletteChooser.hasOkabe, JSON.stringify(paletteChooser));
  check('la app NO fuerza Okabe-Ito por defecto -- sigue en la paleta propia de la app hasta que el usuario la elija',
    paletteChooser.currentDefault === 'app:categorical', JSON.stringify(paletteChooser));

  // ================= startEditing: cambiar de dirección no cierra el editor =================
  console.log('\n-- startEditing: cambiar de dirección F/R no cierra "Personalizar" --');
  const beforeSwitch = await c.ev(`(() => ({ panelOpenBefore: !!document.querySelector('.ce-toolbar .ce-on, .ce-toolbar button.ce-on') || document.querySelectorAll('.ce-pal-row-block').length > 0 }))()`);
  await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Reverse$/i.test(x.textContent.trim()) && !x.disabled); if (b) b.click(); })()`);
  await sleep(600);
  const afterSwitch = await c.ev(`(() => ({ stillEditing: document.querySelectorAll('.ce-pal-row-block').length > 0 }))()`);
  check('tras cambiar a la lectura reverse, el panel "Personalizar" sigue abierto (startEditing corrige el cierre automático)',
    beforeSwitch.panelOpenBefore && afterSwitch.stillEditing, JSON.stringify({ beforeSwitch, afterSwitch }));

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
