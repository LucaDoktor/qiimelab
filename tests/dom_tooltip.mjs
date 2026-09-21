// tests/dom_tooltip.mjs
// Suite de pruebas unitarias para js/lib/dom.js y js/lib/tooltip.js
//
//   node tests/dom_tooltip.mjs

import { escapeHtml, svgEl, moreDetailsHtml, splitLead } from '../js/lib/dom.js';
import { createTooltip, hideTooltip, showTooltip } from '../js/lib/tooltip.js';

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// Mock de DOM mínimo para Node.js si window / document no están definidos
const prevDoc = globalThis.document;
const prevWin = globalThis.window;

class MockClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  toString() { return Array.from(this.set).join(' '); }
}

class MockElement {
  constructor(tag, ns = null) {
    this.tagName = tag.toUpperCase();
    this.namespaceURI = ns;
    this.attributes = new Map();
    this.style = {};
    this.classList = new MockClassList();
    this.children = [];
    this.parentNode = null;
    this._innerHTML = '';
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.clientWidth = 500;
    this.scrollWidth = 500;
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  querySelector(sel) {
    if (sel === ':scope > .ql-tooltip' || sel === '.ql-tooltip') {
      return this.children.find((c) => c.classList.contains('ql-tooltip')) || null;
    }
    return null;
  }
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320 };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) { this._innerHTML = String(val); }
  get className() { return this.classList.toString(); }
  set className(val) {
    this.classList.set.clear();
    val.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
  }
}

globalThis.document = {
  createElement(tag) { return new MockElement(tag); },
  createElementNS(ns, tag) { return new MockElement(tag, ns); },
};
globalThis.window = globalThis;

console.log('--- 1. js/lib/dom.js: escapeHtml ---');
{
  check('escapa &', escapeHtml('A & B') === 'A &amp; B');
  check('escapa < y >', escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
  check('escapa comillas simples y dobles', escapeHtml('"hola" y \'adiós\'') === '&quot;hola&quot; y &#39;adiós&#39;');
  check('soporta cadenas sin caracteres especiales', escapeHtml('secuencia_123') === 'secuencia_123');
  check('maneja números convirtiéndolos a string', escapeHtml(42) === '42');
  check('maneja null o undefined como cadena vacía o string', escapeHtml(null) === 'null' || escapeHtml(null) === '');
}

console.log('\n--- 2. js/lib/dom.js: svgEl ---');
{
  const rect = svgEl('rect', { x: 10, y: 20, width: 100, height: 50, fill: '#ff0000' });
  check('crea elemento SVG con namespace correcto', rect.namespaceURI === 'http://www.w3.org/2000/svg');
  check('asigna atributo x', rect.getAttribute('x') === '10');
  check('asigna atributo y', rect.getAttribute('y') === '20');
  check('asigna width y height', rect.getAttribute('width') === '100' && rect.getAttribute('height') === '50');
  check('asigna fill', rect.getAttribute('fill') === '#ff0000');
}

console.log('\n--- 3. js/lib/tooltip.js: createTooltip, hideTooltip, showTooltip ---');
{
  const wrap = new MockElement('div');
  const tt = createTooltip(wrap);
  check('createTooltip añade elemento .ql-tooltip al contenedor', wrap.children.includes(tt));
  check('posee rol tooltip y aria-hidden inicial', tt.getAttribute('role') === 'tooltip' && tt.getAttribute('aria-hidden') === 'true');

  const tt2 = createTooltip(wrap);
  check('createTooltip reutiliza el tooltip existente en vez de duplicar', tt2 === tt && wrap.children.length === 1);

  // showTooltip con título y filas
  showTooltip(wrap, 100, 150, 'Taxón A', ['Abundancia: 15.2%', 'Grupo: Control'], { clamp: false });
  check('showTooltip activa clase is-show', tt.classList.contains('is-show'));
  check('showTooltip posiciona left y top', tt.style.left === '100.0px' && tt.style.top === '150.0px');
  check('showTooltip formatea ql-tt-name', tt.innerHTML.includes('class="ql-tt-name">Taxón A</div>'));
  check('showTooltip formatea filas ql-tt-row', tt.innerHTML.includes('Abundancia: 15.2%') && tt.innerHTML.includes('Grupo: Control'));
  check('showTooltip actualiza aria-hidden a false', tt.getAttribute('aria-hidden') === 'false');

  // hideTooltip
  hideTooltip(wrap);
  check('hideTooltip elimina clase is-show', !tt.classList.contains('is-show'));
  check('hideTooltip actualiza aria-hidden a true', tt.getAttribute('aria-hidden') === 'true');

  // showTooltip con SVG y escalado de coordenadas
  const svg = new MockElement('svg', 'http://www.w3.org/2000/svg');
  svg.getBoundingClientRect = () => ({ left: 20, top: 40, width: 800, height: 600 });
  wrap.getBoundingClientRect = () => ({ left: 10, top: 20, width: 800, height: 600 });

  showTooltip(wrap, 200, 100, 'Pico Sanger', ['Intensidad: 450 RFU'], {
    svg, W: 400, H: 300, clamp: false,
  });
  // scaleX = 800/400 = 2. left = (20 - 10) + 200 * 2 = 10 + 400 = 410px
  // scaleY = 600/300 = 2. top = (40 - 20) + 100 * 2 = 20 + 200 = 220px
  check('showTooltip calcula coordenadas proyectadas de SVG a wrap', tt.style.left === '410.0px' && tt.style.top === '220.0px');

  // showTooltip con rawHtml / html personalizado
  showTooltip(wrap, 50, 50, null, null, {
    html: '<span class="custom-tt">Info personalizada</span>',
  });
  check('showTooltip soporta opción html personalizada', tt.innerHTML === '<span class="custom-tt">Info personalizada</span>');
}

// --- moreDetailsHtml / splitLead (detalle plegable de las notas largas) ---
{
  const h = moreDetailsHtml('Más detalles', '<b>texto</b> largo');
  check('moreDetailsHtml: <details class="ql-more"> con resumen y cuerpo',
    h.startsWith('<details class="ql-more"><summary>Más detalles</summary>') && h.includes('<div class="ql-more-body"><b>texto</b> largo</div>') && h.endsWith('</details>'));
  const long = 'x'.repeat(150);
  const a = splitLead('<b>Qué falló:</b> ' + long);
  check('splitLead: separa la cabecera en negrita del resto', a.lead === '<b>Qué falló:</b>' && a.rest === long, JSON.stringify(a).slice(0, 80));
  const b = splitLead('<b>Corto:</b> poco texto');
  check('splitLead: si el resto es corto no hay nada que plegar', b.rest === '' && b.lead === '<b>Corto:</b> poco texto');
  const c = splitLead('Sin cabecera en negrita ' + long);
  check('splitLead: sin <b> inicial devuelve todo como lead', c.rest === '' && c.lead.startsWith('Sin cabecera'));
  const d = splitLead('<b>Ok:</b> ' + 'y'.repeat(60), 40);
  check('splitLead: respeta minRest', d.rest.length === 60);
}

// Restaurar globales
globalThis.document = prevDoc;
globalThis.window = prevWin;

console.log('\nRESULTADO DOM & TOOLTIP: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
