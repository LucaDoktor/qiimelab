// Enlace pequeño "¿qué significa esto?" a un término del glosario
// (#/glosario?t=<id>). Mismo patrón y misma clase que las tarjetas de home.js;
// aquí como HTML para insertarlo junto a cualquier nota corta.
//
// El aria-label añade el nombre del término: varias notas de una misma página
// enlazan con el mismo texto visible y, sin él, un lector de pantalla
// anunciaría "¿qué significa esto?" varias veces sin decir de qué.

import { t } from './i18n.js';
import { escapeHtml } from './dom.js';

/**
 * @param {string} id     id de un término de js/modules/glosario.js
 * @param {string} [style] estilo en línea opcional (ajuste de márgenes)
 * @returns {string}
 */
export function glossaryLinkHtml(id, style = 'display:inline-block;') {
  const label = t('home.glosLink');
  return '<a class="ql-modcard-glos" style="' + style + '" href="#/glosario?t=' + id +
    '" aria-label="' + escapeHtml(label + ': ' + t('glosario.n.' + id)) + '">' + label + '</a>';
}
