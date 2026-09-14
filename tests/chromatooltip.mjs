// Test unitario para el tooltip interactivo y crosshair de cromatograma Sanger.
// Valida:
// 1. Matemáticas de Phred Q -> error E = 10^(-Q/10) -> confianza (1 - E) * 100
// 2. Búsqueda binaria O(log N) del pico más cercano (nearestBaseIndexAtX)
// 3. Extracción de datos reales desde .ab1 (sequence, quality, peakLocations)
// 4. Formato exacto "Base: [Letra] | Phred: [Valor] | Confianza: [99.9%]"
// 5. Interacción DOM: mouseenter, mousemove, mouseleave (ocultación al salir)
// 6. Supresión de tooltip durante arrastre de corte
// 7. Reglas CSS requeridas (.ql-chroma-tooltip, .ql-chroma-crosshair)
//
// Ejecución:
//   node tests/chromatooltip.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseAb1 } from '../js/lib/ab1Parser.js';
import {
  phredConfidence,
  formatConfidence,
  nearestBaseIndexAtX,
  clientXToSvgX,
  attachChromatogramTooltip,
  drawChromatogram,
  getIntensityTicks,
  getPositionTicks,
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

console.log('\n--- 1. Matemáticas de Confianza Phred (Modo Seguro) ---');
{
  check('Q=0 -> E=1 -> Confianza=0.0%', Math.abs(phredConfidence(0) - 0) < 1e-9);
  check('formato Q=0 -> "0.0%"', formatConfidence(phredConfidence(0)) === '0.0%');

  const c10 = phredConfidence(10);
  check('Q=10 -> E=0.1 -> Confianza=90.0%', Math.abs(c10 - 90) < 1e-9);
  check('formato Q=10 -> "90.0%"', formatConfidence(c10) === '90.0%');

  const c20 = phredConfidence(20);
  check('Q=20 -> E=0.01 -> Confianza=99.0%', Math.abs(c20 - 99) < 1e-9);
  check('formato Q=20 -> "99.0%"', formatConfidence(c20) === '99.0%');

  const c30 = phredConfidence(30);
  check('Q=30 -> E=0.001 -> Confianza=99.9%', Math.abs(c30 - 99.9) < 1e-9);
  check('formato Q=30 -> "99.9%"', formatConfidence(c30) === '99.9%');

  const c40 = phredConfidence(40);
  check('Q=40 -> E=0.0001 -> Confianza=99.99%', Math.abs(c40 - 99.99) < 1e-9);

  // Casos límite
  check('Q negativo devuelve 0', phredConfidence(-5) === 0);
  check('Q no numérico o null devuelve 0', phredConfidence(null) === 0 && phredConfidence(NaN) === 0);
  check('formatConfidence con valor null devuelve "—"', formatConfidence(null) === '—');
}

console.log('\n--- 2. Búsqueda de Pico Más Cercano (nearestBaseIndexAtX) ---');
{
  const peaks = [100, 120, 140, 160, 180];
  const xOfBase = (i) => peaks[i];
  const nBases = peaks.length;

  check('exactamente en el pico 0 (x=100) -> 0', nearestBaseIndexAtX(100, nBases, xOfBase) === 0);
  check('exactamente en el pico 2 (x=140) -> 2', nearestBaseIndexAtX(140, nBases, xOfBase) === 2);
  check('exactamente en el pico 4 (x=180) -> 4', nearestBaseIndexAtX(180, nBases, xOfBase) === 4);

  check('entre pico 0 y 1, más cerca de 0 (x=108) -> 0', nearestBaseIndexAtX(108, nBases, xOfBase) === 0);
  check('entre pico 0 y 1, más cerca de 1 (x=112) -> 1', nearestBaseIndexAtX(112, nBases, xOfBase) === 1);
  check('a la izquierda del primer pico (x=50) -> 0', nearestBaseIndexAtX(50, nBases, xOfBase) === 0);
  check('a la derecha del último pico (x=250) -> 4', nearestBaseIndexAtX(250, nBases, xOfBase) === 4);

  check('nBases=0 -> -1', nearestBaseIndexAtX(100, 0, xOfBase) === -1);
}

console.log('\n--- 3. Verificación con Archivo Real AB1 (B13-27F.ab1) ---');
{
  const buf = readFileSync(APP_ROOT + '/datos-ejemplo/sanger/B13-27F.ab1');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const read = parseAb1(ab);

  check('contiene secuencia llamada', typeof read.sequence === 'string' && read.sequence.length > 500);
  check('contiene calidades Phred', read.quality instanceof Uint8Array && read.quality.length === read.sequence.length);
  check('contiene posiciones de picos (peakLocations)', read.peakLocations instanceof Int16Array && read.peakLocations.length === read.sequence.length);

  const nBases = read.sequence.length;
  const traceMax = read.trace.A.length - 1;
  const W = 6000, marginL = 44, marginR = 16;
  const xOfBase = (bi) => marginL + (read.peakLocations[bi] / traceMax) * (W - marginL - marginR);

  // Probar sobre base 150
  const x150 = xOfBase(150);
  const nearest150 = nearestBaseIndexAtX(x150, nBases, xOfBase);
  check('localiza exactamente el pico 150', nearest150 === 150);

  const q150 = read.quality[150];
  const conf150 = phredConfidence(q150);
  check('calidad Phred es número válido (0-65)', Number.isFinite(q150) && q150 >= 0 && q150 <= 65, 'Q=' + q150);
  check('confianza calculada entre 0% y 100%', conf150 >= 0 && conf150 <= 100, 'Conf=' + conf150.toFixed(2) + '%');
}

console.log('\n--- 4. Entorno DOM Mock e Interactividad (Modo Seguro) ---');
{
  // Simulación ligera de DOM para ejecutar en Node ESM
  class MockElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.attributes = {};
      this.listeners = {};
      this.textContent = '';
      this.offsetWidth = 180;
      this.offsetHeight = 28;
      this.clientWidth = 800;
      this.scrollLeft = 0;
      this.scrollTop = 0;
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k]; }
    appendChild(el) {
      el.parentNode = this;
      this.children.push(el);
      return el;
    }
    removeChild(el) {
      const idx = this.children.indexOf(el);
      if (idx >= 0) this.children.splice(idx, 1);
      el.parentNode = null;
      return el;
    }
    querySelector(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const c of this.children) {
          if (c.className === cls || (c.getAttribute && c.getAttribute('class') === cls)) return c;
        }
      }
      return null;
    }
    addEventListener(ev, fn) {
      this.listeners[ev] = this.listeners[ev] || [];
      this.listeners[ev].push(fn);
    }
    removeEventListener(ev, fn) {
      if (!this.listeners[ev]) return;
      this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn);
    }
    dispatchEvent(ev) {
      const list = this.listeners[ev.type] || [];
      list.forEach((fn) => fn(ev));
    }
    getBoundingClientRect() {
      return { left: 50, top: 100, width: 1000, height: 260 };
    }
  }

  const chartWrap = new MockElement('div');
  chartWrap.className = 'ql-chroma-wrap';
  const svg = new MockElement('svg');
  svg.viewBox = { baseVal: { x: 0, y: 0, width: 1000, height: 260 } };
  chartWrap.appendChild(svg);

  // Instalar temporalmente document si no existe
  const origDoc = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    createElementNS: (ns, tag) => new MockElement(tag),
  };

  try {
    const mockRead = {
      sequence: 'ACGTACGT',
      quality: new Uint8Array([30, 20, 40, 10, 30, 25, 35, 15]),
      peakLocations: new Int16Array([50, 100, 150, 200, 250, 300, 350, 400]),
    };
    const xOfBase = (i) => mockRead.peakLocations[i];

    let isDraggingActive = false;
    const handle = attachChromatogramTooltip({
      svg,
      chartWrap,
      read: mockRead,
      xOfBase,
      nBases: 8,
      isDragging: () => isDraggingActive,
    });

    check('attachChromatogramTooltip crea el elemento tooltip', Boolean(handle.tooltip));
    check('tooltip tiene la clase ql-chroma-tooltip', handle.tooltip.className === 'ql-chroma-tooltip');
    check('tooltip arranca oculto', handle.tooltip.style.display === 'none');
    check('attachChromatogramTooltip crea o detecta la línea guía', Boolean(handle.guideLine));
    check('línea guía arranca oculta', handle.guideLine.style.display === 'none');

    // Simular mousemove sobre el pico 0 (x=50 relativo en SVG -> clientX = 50 + 50 = 100)
    svg.dispatchEvent({ type: 'mousemove', clientX: 100, clientY: 150 });
    check('al mover el ratón el tooltip se muestra (display block)', handle.tooltip.style.display === 'block');
    check('al mover el ratón la guía se muestra', handle.guideLine.style.display === '');
    check('guía posicionada en x=50', handle.guideLine.getAttribute('x1') === '50.0');

    // Verificar formato exacto: "Base: [Letra] | Phred: [Valor] | Confianza: [99.9%]"
    // Base 0 es 'A', Phred 30, Confianza 99.9%
    check('contenido del tooltip con formato requerido',
      handle.tooltip.textContent === 'Base: A | Phred: 30 | Confianza: 99.9%',
      handle.tooltip.textContent
    );

    // Mover sobre pico 1 (Base 'C', Phred 20 -> 99.0%)
    svg.dispatchEvent({ type: 'mousemove', clientX: 150, clientY: 150 });
    check('actualiza a Base: C | Phred: 20 | Confianza: 99.0%',
      handle.tooltip.textContent === 'Base: C | Phred: 20 | Confianza: 99.0%',
      handle.tooltip.textContent
    );

    // Mover sobre pico 3 (Base 'T', Phred 10 -> 90.0%)
    svg.dispatchEvent({ type: 'mousemove', clientX: 250, clientY: 150 });
    check('actualiza a Base: T | Phred: 10 | Confianza: 90.0%',
      handle.tooltip.textContent === 'Base: T | Phred: 10 | Confianza: 90.0%',
      handle.tooltip.textContent
    );

    // Simular mouseleave del SVG
    svg.dispatchEvent({ type: 'mouseleave' });
    check('al salir el ratón (mouseleave SVG), el tooltip desaparece', handle.tooltip.style.display === 'none');
    check('al salir el ratón (mouseleave SVG), la guía desaparece', handle.guideLine.style.display === 'none');

    // Simular mouseenter / mousemove
    svg.dispatchEvent({ type: 'mouseenter', clientX: 100, clientY: 150 });
    svg.dispatchEvent({ type: 'mousemove', clientX: 100, clientY: 150 });
    check('vuelve a mostrarse tras mouseenter/mousemove', handle.tooltip.style.display === 'block');

    // Simular mouseleave del contenedor chartWrap
    chartWrap.dispatchEvent({ type: 'mouseleave' });
    check('al salir el ratón (mouseleave contenedor), el tooltip desaparece', handle.tooltip.style.display === 'none');

    // Simular arrastre activo (isDragging=true)
    isDraggingActive = true;
    svg.dispatchEvent({ type: 'mousemove', clientX: 100, clientY: 150 });
    check('durante arrastre de corte, el tooltip se suprime/permanece oculto', handle.tooltip.style.display === 'none');
    isDraggingActive = false;

    // Destruir
    handle.destroy();
    check('destroy desengancha listeners sin error', true);
  } finally {
    globalThis.document = origDoc;
  }
}

console.log('\n--- 5. Verificación de Estilos CSS (css/components.css) ---');
{
  const css = readFileSync(APP_ROOT + '/css/components.css', 'utf-8');

  check('contiene selector .ql-chroma-tooltip', css.includes('.ql-chroma-tooltip'));
  check('tooltip tiene position: absolute', /\.ql-chroma-tooltip\s*\{[^}]*position:\s*absolute/s.test(css));
  check('tooltip tiene z-index alto (>= 10)', /\.ql-chroma-tooltip\s*\{[^}]*z-index:\s*(100|[1-9]\d{2,})/s.test(css));
  check('tooltip tiene fondo oscuro', /\.ql-chroma-tooltip\s*\{[^}]*background:\s*rgba?\(\s*1[0-9]/s.test(css));
  check('tooltip tiene texto blanco (#fff)', /\.ql-chroma-tooltip\s*\{[^}]*color:\s*#ffffff/s.test(css));
  check('tooltip tiene bordes redondeados (border-radius)', /\.ql-chroma-tooltip\s*\{[^}]*border-radius:/s.test(css));

  check('contiene selector .ql-chroma-crosshair', css.includes('.ql-chroma-crosshair'));
  check('crosshair tiene pointer-events: none', /\.ql-chroma-crosshair\s*\{[^}]*pointer-events:\s*none/s.test(css));
}

console.log('\n--- 6. Verificación de Etiquetas y Unidades Físicas de Ejes (drawChromatogram) ---');
{
  class MockElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.attributes = {};
      this.textContent = '';
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k]; }
    appendChild(el) {
      el.parentNode = this;
      this.children.push(el);
      return el;
    }
    querySelector(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const c of this.children) {
          if (c.className === cls || (c.getAttribute && c.getAttribute('class') === cls)) return c;
        }
      }
      return null;
    }
  }

  const origDoc = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    createElementNS: (ns, tag) => new MockElement(tag),
  };

  try {
    const svg = new MockElement('svg');
    const mockReadWithTrace = {
      sequence: 'ACGTACGT',
      quality: new Uint8Array([30, 20, 40, 10, 30, 25, 35, 15]),
      trace: {
        A: [10, 50, 10, 0, 10, 50, 10, 0],
        C: [0, 10, 50, 10, 0, 10, 50, 10],
        G: [10, 0, 10, 50, 10, 0, 10, 50],
        T: [50, 10, 0, 10, 50, 10, 0, 10],
      },
      peakLocations: new Int16Array([50, 100, 150, 200, 250, 300, 350, 400]),
    };

    const chart = drawChromatogram(svg, mockReadWithTrace, { start: 1, end: 7 });

    check('drawChromatogram genera el objeto labels', Boolean(chart.labels));

    // 1. Eje Y panel superior: Intensidad (RFU)
    const lblIntensity = chart.labels.intensity;
    check('existe etiqueta de Intensidad (panel superior)', Boolean(lblIntensity));
    check('texto exacto es "Intensidad (RFU)" (no clave i18n)', lblIntensity.textContent === 'Intensidad (RFU)');
    check('rotado -90 grados', (lblIntensity.getAttribute('transform') || '').includes('rotate(-90'));
    check('anclado centrado (text-anchor="middle")', lblIntensity.getAttribute('text-anchor') === 'middle');
    check('en margen izquierdo (x=16 <= 20)', parseFloat(lblIntensity.getAttribute('x')) <= 20);
    check('clase .ql-chroma-axis-label', (lblIntensity.getAttribute('class') || '').includes('ql-chroma-axis-label'));

    // Ticks numéricos de Intensidad
    const traceTicks = getIntensityTicks(50);
    check('getIntensityTicks genera entre 3 y 4 ticks', traceTicks.length >= 3 && traceTicks.length <= 4, JSON.stringify(traceTicks));
    check('getIntensityTicks para 2383 genera escala con 1000 y 2000', getIntensityTicks(2383).includes(1000) && getIntensityTicks(2383).includes(2000));

    // 2. Eje Y panel inferior: Calidad (Phred Q)
    const lblQuality = chart.labels.quality;
    check('existe etiqueta de Calidad (panel inferior)', Boolean(lblQuality));
    check('texto exacto es "Calidad (Phred Q)" (no clave i18n)', lblQuality.textContent === 'Calidad (Phred Q)');
    check('rotado -90 grados', (lblQuality.getAttribute('transform') || '').includes('rotate(-90'));
    check('anclado centrado (text-anchor="middle")', lblQuality.getAttribute('text-anchor') === 'middle');
    check('en margen izquierdo (x=16 <= 20)', parseFloat(lblQuality.getAttribute('x')) <= 20);
    check('clase .ql-chroma-axis-label', (lblQuality.getAttribute('class') || '').includes('ql-chroma-axis-label'));

    // 3. Eje X general: Posición (pb)
    const lblPos = chart.labels.position;
    check('existe etiqueta de Posición (eje X general)', Boolean(lblPos));
    check('texto exacto es "Posición (pb)" (no clave i18n)', lblPos.textContent === 'Posición (pb)');
    check('centrado horizontalmente (text-anchor="middle")', lblPos.getAttribute('text-anchor') === 'middle');
    check('en margen inferior (y > 250)', parseFloat(lblPos.getAttribute('y')) > 250);
    check('clase .ql-chroma-axis-label', (lblPos.getAttribute('class') || '').includes('ql-chroma-axis-label'));

    // Ticks numéricos de Posición
    const posTicks = getPositionTicks(1000, 7);
    check('getPositionTicks adapta marcas cada 50 pb para zoom 7px/base', posTicks.includes(1) && posTicks.includes(50) && posTicks.includes(100));

    // Caso sin traza (FASTQ/FASTA sin canales electroforéticos)
    const svgNoTrace = new MockElement('svg');
    const mockReadNoTrace = {
      sequence: 'ACGTACGT',
      quality: new Uint8Array([30, 20, 40, 10, 30, 25, 35, 15]),
    };
    const chartNoTrace = drawChromatogram(svgNoTrace, mockReadNoTrace, { start: 1, end: 7 });
    check('sin traza no dibuja etiqueta de Intensidad (RFU)', !chartNoTrace.labels.intensity);
    check('sin traza sí dibuja etiqueta de Calidad (Phred Q)', Boolean(chartNoTrace.labels.quality));
    check('sin traza sí dibuja etiqueta de Posición (pb)', Boolean(chartNoTrace.labels.position));

    // Verificación CSS para .ql-chroma-axis-label, .ql-axis-tick-label, .ql-axis-tick-line
    const css = readFileSync(APP_ROOT + '/css/components.css', 'utf-8');
    check('CSS contiene selector .ql-chroma-axis-label', css.includes('.ql-chroma-axis-label'));
    check('.ql-chroma-axis-label usa color secundario var(--ink-muted)', /\.ql-chroma-axis-label\s*\{[^}]*fill:\s*var\(--ink-muted/s.test(css));
    check('.ql-chroma-axis-label usa fuente pequeña (<= 12px)', /\.ql-chroma-axis-label\s*\{[^}]*font-size:\s*(1[0-2]|9|8)(\.\d+)?px/s.test(css));
    check('CSS contiene selector .ql-axis-tick-label', css.includes('.ql-axis-tick-label'));
    check('CSS contiene selector .ql-axis-tick-line', css.includes('.ql-axis-tick-line'));
  } finally {
    globalThis.document = origDoc;
  }
}

console.log('\n----------------------------------------');
if (failed) {
  console.error('RESULTADO: ALGUNOS TESTS FALLARON');
  process.exit(1);
} else {
  console.log('RESULTADO: TODOS LOS TESTS PASARON EXITOSAMENTE (PASS)');
  process.exit(0);
}

