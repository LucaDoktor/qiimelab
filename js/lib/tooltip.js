// Motor centralizado de tooltips interactivos (.ql-tooltip) para Smart-175
import { escapeHtml } from './dom.js';

/**
 * Crea o localiza un elemento .ql-tooltip dentro de un contenedor wrap.
 * @param {HTMLElement} [wrap]
 * @returns {HTMLElement}
 */
export function createTooltip(wrap) {
  let tt = wrap ? wrap.querySelector(':scope > .ql-tooltip') : null;
  if (!tt) {
    tt = document.createElement('div');
    tt.className = 'ql-tooltip';
    tt.setAttribute('role', 'tooltip');
    tt.setAttribute('aria-hidden', 'true');
    if (wrap) wrap.appendChild(tt);
  }
  return tt;
}

/**
 * Oculta el tooltip eliminando la clase `is-show`.
 * @param {HTMLElement} [tooltipOrWrap]
 */
export function hideTooltip(tooltipOrWrap) {
  if (!tooltipOrWrap) return;
  const tt = tooltipOrWrap.classList && tooltipOrWrap.classList.contains('ql-tooltip')
    ? tooltipOrWrap
    : (tooltipOrWrap.querySelector ? tooltipOrWrap.querySelector('.ql-tooltip') : null);
  if (tt) {
    tt.classList.remove('is-show');
    tt.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Muestra y posiciona un tooltip formateado con título y filas de contenido.
 *
 * @param {HTMLElement} wrap - Contenedor posicionado donde reside el tooltip
 * @param {number} targetX - Posición horizontal (en px de SVG si se pasa opts.svg, o px del wrap)
 * @param {number} targetY - Posición vertical (en px de SVG si se pasa opts.svg, o px del wrap)
 * @param {string} [title] - Título o nombre principal (.ql-tt-name)
 * @param {string|string[]|Array<{label: string, value: any}>} [rows] - Contenido de filas (.ql-tt-row)
 * @param {Object} [opts] - Opciones adicionales
 * @param {HTMLElement} [opts.tooltip] - Instancia existente de .ql-tooltip (si no se pasa, busca o crea en wrap)
 * @param {SVGElement} [opts.svg] - Elemento SVG origen de las coordenadas
 * @param {number} [opts.W] - Ancho del viewBox del SVG
 * @param {number} [opts.H] - Alto del viewBox del SVG
 * @param {boolean} [opts.rawHtml=false] - Si true, no escapa el contenido HTML
 * @param {string} [opts.html] - HTML completo personalizado
 * @param {boolean} [opts.clamp=true] - Si true, ajusta horizontalmente a los márgenes del wrap
 * @returns {HTMLElement}
 */
export function showTooltip(wrap, targetX, targetY, title, rows, opts = {}) {
  const tt = opts.tooltip || (wrap ? createTooltip(wrap) : null);
  if (!tt) return null;

  let left = Number(targetX) || 0;
  let top = Number(targetY) || 0;

  // Si se proporciona SVG, convertimos coordenadas de usuario SVG al espacio de wrap
  if (opts.svg && wrap) {
    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = opts.svg.getBoundingClientRect();
    const W = opts.W || svgRect.width || 1;
    const H = opts.H || svgRect.height || 1;
    const scaleX = svgRect.width / W;
    const scaleY = svgRect.height / H;
    left = (svgRect.left - wrapRect.left) + targetX * scaleX + (wrap.scrollLeft || 0);
    top = (svgRect.top - wrapRect.top) + targetY * scaleY + (wrap.scrollTop || 0);
  } else if (wrap) {
    left += (wrap.scrollLeft || 0);
    top += (wrap.scrollTop || 0);
  }

  // Clamping opcional para evitar que se corte por los bordes en pantallas estrechas
  if (opts.clamp !== false && wrap && wrap.clientWidth > 0) {
    const maxW = wrap.scrollWidth || wrap.clientWidth;
    left = Math.max(10, Math.min(maxW - 10, left));
  }

  tt.style.left = left.toFixed(1) + 'px';
  tt.style.top = top.toFixed(1) + 'px';

  if (opts.html) {
    tt.innerHTML = opts.html;
  } else {
    let content = '';
    const shouldEscape = !opts.rawHtml;
    const renderStr = (val) => {
      if (val == null) return '';
      if (!shouldEscape) return String(val);
      const s = String(val);
      // Si ya contiene etiquetas HTML o entidades conocidas, respetarlas
      if (/<[a-z][\s\S]*>|&(?:rarr|larr|middot|hellip|#\d+);/i.test(s)) return s;
      return escapeHtml(s);
    };

    if (title != null && title !== '') {
      content += '<div class="ql-tt-name">' + renderStr(title) + '</div>';
    }

    if (Array.isArray(rows)) {
      rows.forEach((r) => {
        if (r == null) return;
        if (typeof r === 'object' && r.label !== undefined) {
          content += '<div class="ql-tt-row">' +
            renderStr(r.label) + ': ' + renderStr(r.value) + '</div>';
        } else {
          content += '<div class="ql-tt-row">' + renderStr(r) + '</div>';
        }
      });
    } else if (rows != null && rows !== '') {
      content += '<div class="ql-tt-row">' + renderStr(rows) + '</div>';
    }

    tt.innerHTML = content;
  }

  tt.classList.add('is-show');
  tt.setAttribute('aria-hidden', 'false');
  return tt;
}
