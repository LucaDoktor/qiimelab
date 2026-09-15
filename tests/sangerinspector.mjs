// Test unitario para el rediseño horizontal de doble cadena Sanger (renderOverlapHTML).
// Valida el contenedor scrollable (ql-ds-container), el carril continuo (ql-ds-track),
// las columnas con bloques apilados (Forward arriba y RevComp abajo), las etiquetas
// direccionales 5' y 3', los bloques vacíos en extremos no solapados y los colores de fondo.
//
// Ejecución:
//   node tests/sangerinspector.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseAb1 } from '../js/lib/ab1Parser.js';
import { trimRead } from '../js/lib/sangerTrim.js';
import { mergeReads, reverseComplement } from '../js/lib/sangerOverlap.js';
import {
  renderOverlapHTML,
  buildOverlapData,
  renderMinimapHTML,
  drawMinimapCanvas,
  calculateMinimapViewport,
  calculateScrollFromMinimap,
  openOverlapModal,
} from '../js/modules/sanger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_ROOT = resolve(__dirname, '..');

let failed = false;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (detail ? '  ' + detail : ''));
  if (!ok) failed = true;
}

function loadTrimmed(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const read = parseAb1(ab);
  const trim = trimRead(read.quality, { method: 'mott', errorProbThreshold: 0.05, minLength: 50 });
  return {
    sequence: read.sequence.slice(trim.start, trim.end),
    quality: read.quality ? read.quality.slice(trim.start, trim.end) : null,
  };
}

console.log('\n--- 1. Caso real: B13 (doble cadena con solapamiento amplio) ---');
{
  const f = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-27F.ab1');
  const r = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-1492R.ab1');
  const res = mergeReads(f, r, { expectedAmpliconLen: 1450 });
  const fSeq = f.sequence;
  const rcSeq = reverseComplement(r.sequence);

  const html = renderOverlapHTML(fSeq, rcSeq, res.consensus);

  check('genera contenedor con clase ql-ds-container', html.includes('class="ql-ds-container"'));
  check('genera carril con clase ql-ds-track', html.includes('class="ql-ds-track"'));
  check('incluye etiquetas fijas Forward y RevComp', html.includes('Forward') && html.includes('RevComp'));
  check('contiene columnas de nucleótidos ql-ds-col', html.includes('class="ql-ds-col"'));
  check('bloques con clase fwd-only (flanco 5\' Forward)',
    html.includes('fwd-only') || html.includes('ql-overlap-fwd'));
  check('bloques con clase rev-only (flanco 3\' RevComp)',
    html.includes('rev-only') || html.includes('ql-overlap-rev'));
  check('bloques con clase overlap-match en zona de solape',
    html.includes('overlap-match') || html.includes('ql-overlap-match'));
  check('incluye bloques vacíos ql-ds-empty en extremos opuestos', html.includes('ql-ds-empty'));
  check('incluye etiquetas 5\' y 3\' de direccionalidad de ADN',
    html.includes(">5'<") && html.includes(">3'<"));
  check('muestra la longitud de las secuencias en la cabecera',
    html.includes(`Forward: <strong>${fSeq.length} pb</strong>`) && html.includes(`RevComp: <strong>${rcSeq.length} pb</strong>`));
  check('muestra la longitud del consenso en la cabecera',
    html.includes(`${res.consensus.length} pb`));
}

console.log('\n--- 2. Caso sintético con mismatch en la zona de solapamiento ---');
{
  // Solape de 12 pb donde una base discrepa (T vs A -> R en consenso)
  const fwdSeq = 'AAAAAA' + 'TTTTTT' + 'GGGGGG';
  const rcSeq  = 'TTTATT' + 'GGGGGG' + 'CCCCCC';
  const consSeq = 'AAAAAATTTATTGGGGGGCCCCCC';

  const html = renderOverlapHTML(fwdSeq, rcSeq, consSeq);

  check('resalta el mismatch con overlap-mismatch',
    html.includes('overlap-mismatch') || html.includes('ql-overlap-mismatch'));
  check('contiene bloques fwd-only y rev-only en los flancos',
    (html.includes('fwd-only') || html.includes('ql-overlap-fwd')) &&
    (html.includes('rev-only') || html.includes('ql-overlap-rev')));
  check('contiene etiquetas 5\' y 3\' en posiciones de arranque y final',
    html.includes(">5'<") && html.includes(">3'<"));
}

console.log('\n--- 3. Formato de entrada tipo objeto { fwdSeq, rcSeq, consensus } ---');
{
  const obj = {
    fwdSeq: 'AAAAAATTTTTT',
    rcSeq: 'TTTTTTCCCCCC',
    consensus: 'AAAAAATTTTTTCCCCCC',
  };
  const html = renderOverlapHTML(obj);
  check('acepta invocación con objeto único como primer argumento',
    html.includes('class="ql-ds-container"') && html.includes('ql-ds-track'));
}

console.log('\n--- 4. Caso stitched / sin solapamiento directo ---');
{
  const fwdSeq = 'AAAAAA';
  const rcSeq = 'CCCCCC';
  const consSeq = 'AAAAAANNNNNNNNNNCCCCCC';

  const html = renderOverlapHTML(fwdSeq, rcSeq, consSeq);
  check('maneja secuencias stitched en doble cadena sin error',
    html.includes('class="ql-ds-container"') && html.includes('ql-ds-track'));
  check('muestra ambos flancos y etiquetas en stitched',
    html.includes('fwd-only') && html.includes('rev-only') && html.includes(">5'<") && html.includes(">3'<"));
}

console.log('\n--- 5. Entradas vacías o nulas (modo seguro) ---');
{
  const htmlEmpty = renderOverlapHTML('', '', '');
  check('devuelve contenedor con mensaje sin lanzar excepción cuando no hay datos',
    htmlEmpty.includes('ql-ds-container'));
}

console.log('\n--- 6. Minimapa y visualización condensada ---');
{
  const fwdSeq = 'AAAAAA' + 'TTTTTT' + 'GGGGGG';
  const rcSeq  = 'TTTATT' + 'GGGGGG' + 'CCCCCC';
  const consSeq = 'AAAAAATTTATTGGGGGGCCCCCC';
  const data = buildOverlapData(fwdSeq, rcSeq, consSeq);

  check('buildOverlapData genera array de columnas', Array.isArray(data.cols) && data.cols.length > 0);
  check('buildOverlapData calcula métricas de solape', data.overlapBases > 0 && data.mismatches === 1);

  const miniHtml = renderMinimapHTML(data);
  check('genera contenedor con clase ql-minimap-wrap', miniHtml.includes('class="ql-minimap-wrap"'));
  check('genera carril con clase ql-minimap-track', miniHtml.includes('class="ql-minimap-track"'));
  check('genera elemento canvas ql-minimap-canvas', miniHtml.includes('<canvas') && miniHtml.includes('ql-minimap-canvas'));
  check('no inyecta miles de nodos ql-minimap-bar (usa canvas)', !miniHtml.includes('ql-minimap-bar'));
  check('incluye recuadro de viewport ql-minimap-viewport', miniHtml.includes('class="ql-minimap-viewport"'));
  check('el canvas no contiene letras de nucleótidos',
    !miniHtml.includes('>A<') && !miniHtml.includes('>T<') && !miniHtml.includes('>G<') && !miniHtml.includes('>C<'));

  // Verificación de la función de dibujo en Canvas
  let fillRectCalls = 0;
  const colorsUsed = [];
  const mockCtx = {
    clearRect: () => {},
    fillRect: (x, y, w, h) => { fillRectCalls++; colorsUsed.push(mockCtx.fillStyle); },
    fillStyle: '',
  };
  const mockCanvas = {
    width: data.cols.length,
    height: 14,
    getContext: (type) => (type === '2d' ? mockCtx : null),
  };
  drawMinimapCanvas(mockCanvas, data);
  check('drawMinimapCanvas dibuja sobre el contexto 2D usando fillRect', fillRectCalls === data.cols.length);
  check('drawMinimapCanvas aplica colores específicos para match, mismatch y flancos',
    colorsUsed.includes('#059669') && colorsUsed.includes('#dc2626') && colorsUsed.includes('#0284c7') && colorsUsed.includes('#9333ea'));
}

console.log('\n--- 7. Lógica matemática de sincronización bidireccional ---');
{
  // Vista principal: scrollWidth = 10000, clientWidth = 2000 -> maxScroll = 8000
  // Minimapa: width = 800
  // visibleRatio = 2000 / 10000 = 0.20 -> vpWidth = 0.20 * 800 = 160
  // Rango de desplazamiento del viewport = 800 - 160 = 640

  // 1. Scroll al inicio (scrollLeft = 0)
  const v0 = calculateMinimapViewport(0, 10000, 2000, 800);
  check('scrollLeft=0 -> indicator left=0 y scrollPct=0', v0.left === 0 && v0.scrollPct === 0);
  check('ancho del indicador proporcional a ventana visible', Math.abs(v0.vpWidth - 160) < 1e-5);

  // 2. Scroll al 50% (scrollLeft = 4000)
  const v50 = calculateMinimapViewport(4000, 10000, 2000, 800);
  check('scrollLeft=50% -> indicator left centrado al 50% del recorrido',
    Math.abs(v50.scrollPct - 0.5) < 1e-5 && Math.abs(v50.left - 320) < 1e-5);

  // 3. Scroll al final (scrollLeft = 8000)
  const v100 = calculateMinimapViewport(8000, 10000, 2000, 800);
  check('scrollLeft=max -> indicator a la derecha exacta (minimapW - vpWidth)',
    Math.abs(v100.scrollPct - 1.0) < 1e-5 && Math.abs(v100.left - 640) < 1e-5);

  // 4. Interacción en minimapa: Clic en x=0
  const s0 = calculateScrollFromMinimap(0, 800, 10000, 2000);
  check('clic x=0 -> targetScrollLeft=0', s0.targetScrollLeft === 0 && s0.clickPct === 0);

  // 5. Interacción en minimapa: Clic al 50% (x=400)
  const s50 = calculateScrollFromMinimap(400, 800, 10000, 2000);
  check('clic x=50% -> targetScrollLeft=4000 (mitad de maxScroll)',
    s50.targetScrollLeft === 4000 && s50.clickPct === 0.5);

  // 6. Interacción en minimapa: Clic al final (x=800)
  const s100 = calculateScrollFromMinimap(800, 800, 10000, 2000);
  check('clic x=100% -> targetScrollLeft=8000 (maxScroll)',
    s100.targetScrollLeft === 8000 && s100.clickPct === 1.0);
}

console.log('\n--- 8. Modal interactivo y destrucción de listeners (ciclo de vida) ---');
{
  const events = {
    windowAdded: [],
    windowRemoved: [],
    mainAdded: [],
    mainRemoved: [],
    minimapAdded: [],
    minimapRemoved: [],
  };

  const fakeElement = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      attributes: {},
      children: [],
      classList: {
        add: () => {},
        contains: () => false,
      },
      setAttribute: (k, v) => { el.attributes[k] = String(v); },
      getAttribute: (k) => el.attributes[k] || null,
      appendChild: (child) => {
        if (child) {
          el.children.push(child);
          child.parentElement = el;
        }
        return child;
      },
      append: (...nodes) => { nodes.forEach(n => el.appendChild(n)); },
      remove: () => {
        if (el.parentElement) {
          const idx = el.parentElement.children.indexOf(el);
          if (idx >= 0) el.parentElement.children.splice(idx, 1);
        }
      },
      get firstElementChild() {
        if (!el.children.length) el.appendChild(fakeElement('div'));
        return el.children[0];
      },
      set innerHTML(v) {
        el._html = String(v);
        if (!el.children.length) el.appendChild(fakeElement('div'));
      },
      get innerHTML() { return el._html || ''; },
      querySelector: (selector) => {
        if (selector.includes('ql-ds-container')) return mainContainer;
        if (selector.includes('ql-minimap-container')) return minimapContainer;
        if (selector.includes('ql-minimap-track')) return minimapTrack;
        if (selector.includes('ql-minimap-viewport')) return minimapViewport;
        return null;
      },
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 16 }),
      clientWidth: 800,
      scrollWidth: 8000,
      scrollLeft: 0,
      focus: () => {},
      addEventListener: (type, fn) => {},
      removeEventListener: (type, fn) => {},
    };
    return el;
  };

  const mainContainer = fakeElement('div');
  mainContainer.addEventListener = (type) => { events.mainAdded.push(type); };
  mainContainer.removeEventListener = (type) => { events.mainRemoved.push(type); };

  const minimapContainer = fakeElement('div');
  minimapContainer.addEventListener = (type) => { events.minimapAdded.push(type); };
  minimapContainer.removeEventListener = (type) => { events.minimapRemoved.push(type); };

  const minimapTrack = fakeElement('div');
  const minimapViewport = fakeElement('div');

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;

  globalThis.document = {
    activeElement: null,
    createElement: (tag) => fakeElement(tag),
    body: {
      children: [],
      appendChild: (c) => { globalThis.document.body.children.push(c); return c; },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  globalThis.window = {
    addEventListener: (type) => { events.windowAdded.push(type); },
    removeEventListener: (type) => { events.windowRemoved.push(type); },
  };

  try {
    const modal = openOverlapModal({
      id: 'B13',
      fSeq: 'AAAAAATTTTTT',
      rcSeq: 'TTTTTTCCCCCC',
      consensus: 'AAAAAATTTTTTCCCCCC',
      method: 'merged',
    });

    check('openOverlapModal devuelve objeto con método close()', typeof modal.close === 'function');
    check('registra listener scroll en mainContainer', events.mainAdded.includes('scroll'));
    check('registra listener pointerdown en minimapContainer', events.minimapAdded.includes('pointerdown'));
    check('registra listener click en minimapContainer', events.minimapAdded.includes('click'));
    check('registra listeners de arrastre y resize en window',
      events.windowAdded.includes('pointermove') &&
      events.windowAdded.includes('pointerup') &&
      events.windowAdded.includes('resize'));

    modal.close();

    check('destruye listener scroll de mainContainer al cerrar', events.mainRemoved.includes('scroll'));
    check('destruye listener pointerdown de minimapContainer al cerrar', events.minimapRemoved.includes('pointerdown'));
    check('destruye listener click de minimapContainer al cerrar', events.minimapRemoved.includes('click'));
    check('destruye listeners de window al cerrar (evita fugas de memoria)',
      events.windowRemoved.includes('pointermove') &&
      events.windowRemoved.includes('pointerup') &&
      events.windowRemoved.includes('resize'));
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
}

console.log('\n--- 9. Robustez de ab1Parser (guardas iniciales) ---');
{
  let caughtNull = false;
  try {
    parseAb1(null);
  } catch (err) {
    caughtNull = true;
    check('lanza error con buffer null', err && typeof err.message === 'string');
  }
  check('captura error cuando el buffer es null', caughtNull);

  let caughtShort = false;
  try {
    parseAb1(new ArrayBuffer(16));
  } catch (err) {
    caughtShort = true;
    check('lanza error con buffer menor a 34 bytes', err && typeof err.message === 'string');
  }
  check('captura error cuando buffer.byteLength < 34', caughtShort);
}

console.log('\nRESULTADO INSPECTOR SANGER: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);


