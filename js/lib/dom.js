// Utilidades DOM y SVG compartidas para Smart-175

/**
 * Escapa caracteres especiales de HTML para inserción segura en el DOM.
 * @param {*} s
 * @returns {string}
 */
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Crea un elemento SVG en el namespace http://www.w3.org/2000/svg con los atributos dados.
 * @param {string} tag
 * @param {Object} [attrs]
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null) el.setAttribute(k, v);
    }
  }
  return el;
}

/**
 * Delegación de eventos de hover: un único listener en `container` que
 * detecta entradas/salidas de los elementos que coinciden con `selector`,
 * en vez de un listener `mouseenter`/`mouseleave` por elemento. Evita crear
 * miles de listeners en gráficos con muchos nodos (heatmaps, scatter, etc.).
 * @param {HTMLElement|SVGElement} container
 * @param {string} selector
 * @param {Object} [opts]
 * @param {(el: Element, e: PointerEvent) => void} [opts.onEnter]
 * @param {(el: Element, e: PointerEvent) => void} [opts.onLeave]
 * @param {(el: Element, e: PointerEvent) => void} [opts.onMove] - opcional, para tooltips que siguen al cursor (p. ej. inference.js)
 */
export function delegateHover(container, selector, { onEnter, onLeave, onMove } = {}) {
  let current = null;
  container.addEventListener('pointerover', (e) => {
    const el = e.target.closest(selector);
    if (!el || el === current || !container.contains(el)) return;
    current = el;
    onEnter && onEnter(el, e);
  });
  container.addEventListener('pointerout', (e) => {
    const el = e.target.closest(selector);
    if (!el || el !== current) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    current = null;
    onLeave && onLeave(el, e);
  });
  if (onMove) {
    container.addEventListener('pointermove', (e) => {
      if (!current || !e.target.closest(selector)) return;
      onMove(current, e);
    });
  }
}
