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

  const axisLabels = await c.ev(`(() => {
    const list = [...document.querySelectorAll('svg[role=img] text.ql-chroma-axis-label')];
    return list.map(el => ({
      text: el.textContent.trim(),
      axis: el.getAttribute('data-axis'),
      transform: el.getAttribute('transform') || '',
      anchor: el.getAttribute('text-anchor') || '',
    }));
  })()`);
  check('el cromatograma contiene las 3 etiquetas de ejes con unidades físicas',
    Array.isArray(axisLabels) &&
    axisLabels.some(l => l.axis === 'y-trace' && l.text === 'Intensidad (RFU)') &&
    axisLabels.some(l => l.axis === 'y-qual' && l.text === 'Calidad (Phred Q)') &&
    axisLabels.some(l => l.axis === 'x-pos' && l.text === 'Posición (pb)'),
    JSON.stringify(axisLabels)
  );

  const ticksCheck = await c.ev(`(() => {
    const yTraceTicks = [...document.querySelectorAll('svg[role=img] text[data-tick-y-trace]')].map(n => n.textContent.trim());
    const yQualTicks = [...document.querySelectorAll('svg[role=img] text[data-tick-y-qual]')].map(n => n.textContent.trim());
    const xPosTicks = [...document.querySelectorAll('svg[role=img] text[data-tick-x-pos]')].map(n => n.textContent.trim());
    const tickLines = document.querySelectorAll('svg[role=img] line.ql-axis-tick-line').length;

    // Comprobación visual: calcular bounding rects para asegurar que los títulos de ejes y los ticks no se solapan
    const yTraceLabel = document.querySelector('svg[role=img] text[data-axis="y-trace"]');
    const yQualLabel = document.querySelector('svg[role=img] text[data-axis="y-qual"]');
    const yTraceTick0 = document.querySelector('svg[role=img] text[data-tick-y-trace="0"]');

    const traceX = parseFloat(yTraceLabel ? yTraceLabel.getAttribute('x') : '0');
    const tickX = parseFloat(yTraceTick0 ? yTraceTick0.getAttribute('x') : '0');
    const noOverlapX = tickX > traceX + 15; // separación horizontal suficiente en margen izquierdo

    return {
      yTraceTicks,
      yQualTicks,
      xPosTicksCount: xPosTicks.length,
      tickLinesCount: tickLines,
      noOverlapX,
    };
  })()`);

  check('el eje Y superior tiene ticks numéricos distribuidos (ej. 0, 1000, 2000)',
    ticksCheck.yTraceTicks.length >= 3 && ticksCheck.yTraceTicks.includes('0') && ticksCheck.yTraceTicks.includes('1000'),
    JSON.stringify(ticksCheck.yTraceTicks)
  );
  check('el eje Y inferior tiene ticks fijos de Phred 0, 20, 40, 60',
    ticksCheck.yQualTicks.join(',') === '0,20,40,60',
    JSON.stringify(ticksCheck.yQualTicks)
  );
  check('el eje X general tiene marcas numéricas adaptadas a la escala',
    ticksCheck.xPosTicksCount > 10,
    'total=' + ticksCheck.xPosTicksCount
  );
  check('los títulos de ejes y los números de ticks no se pisan en el margen izquierdo',
    ticksCheck.noOverlapX,
    'separación confirmada'
  );

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

  // --- Test de Ajustes de Recorte Dinámico (Mott Q-score y Longitud Mínima) ---
  const trimPanelCheck = await c.ev(`(() => {
    const phredSlider = document.getElementById('sgPhredSlider');
    const minLenSlider = document.getElementById('sgMinLenSlider');
    const phredVal = document.getElementById('sgPhredVal');
    const minLenVal = document.getElementById('sgMinLenVal');
    const prev = document.getElementById('sgConsensusPreview');
    return {
      hasPhred: !!phredSlider,
      phredMin: phredSlider ? phredSlider.min : '',
      phredMax: phredSlider ? phredSlider.max : '',
      phredVal: phredSlider ? phredSlider.value : '',
      phredBadge: phredVal ? phredVal.textContent.trim() : '',
      hasMinLen: !!minLenSlider,
      minLenMin: minLenSlider ? minLenSlider.min : '',
      minLenMax: minLenSlider ? minLenSlider.max : '',
      minLenVal: minLenSlider ? minLenSlider.value : '',
      minLenBadge: minLenVal ? minLenVal.textContent.trim() : '',
      hasPreview: !!prev,
      previewText: prev ? prev.textContent.trim() : '',
    };
  })()`);

  check('el panel de ajustes de recorte contiene los deslizadores de Phred y Longitud Mínima',
    trimPanelCheck.hasPhred && trimPanelCheck.hasMinLen && trimPanelCheck.hasPreview,
    JSON.stringify(trimPanelCheck)
  );
  check('el deslizador de Phred tiene rango 10 a 60 y valor por defecto Q20',
    trimPanelCheck.phredMin === '10' && trimPanelCheck.phredMax === '60' && trimPanelCheck.phredVal === '20',
    trimPanelCheck.phredBadge
  );
  check('el deslizador de longitud mínima tiene rango 10 a 500 y valor 50 pb',
    trimPanelCheck.minLenMin === '10' && trimPanelCheck.minLenMax === '500' && trimPanelCheck.minLenVal === '50',
    trimPanelCheck.minLenBadge
  );

  // Mover el deslizador de Phred de Q20 a Q30 y comprobar la respuesta instantánea
  await c.ev(`(() => {
    const s = document.getElementById('sgPhredSlider');
    s.value = '30';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  const instantCheck = await c.ev(`(() => {
    const phredVal = document.getElementById('sgPhredVal');
    const startInp = document.getElementById('sgTrimStart');
    const endInp = document.getElementById('sgTrimEnd');
    return {
      badge: phredVal ? phredVal.textContent.trim() : '',
      start: startInp ? startInp.value : '',
      end: endInp ? endInp.value : '',
    };
  })()`);

  check('mover el slider a Q30 actualiza inmediatamente la chapa y recalcula el recorte Mott',
    instantCheck.badge.includes('Q30') && instantCheck.badge.includes('0.0010'),
    JSON.stringify(instantCheck)
  );

  // Esperar el debounce (350ms) y comprobar que el consenso se actualizó
  await sleep(400);
  const debouncedCheck = await c.ev(`(() => {
    const prev = document.getElementById('sgConsensusPreview');
    return prev ? prev.textContent.trim() : '';
  })()`);

  check('tras el debounce (300ms), la previsualización del consenso refleja el nuevo consenso',
    debouncedCheck.includes('pb') && /actualizado|recalculado/i.test(debouncedCheck),
    debouncedCheck
  );

  check('sin errores de consola / excepciones', c.problems.length === 0, JSON.stringify(c.problems));
} catch (err) {
  check('ejecución sin excepciones', false, err.message);
} finally {
  c.kill();
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
