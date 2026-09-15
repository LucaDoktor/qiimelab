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
