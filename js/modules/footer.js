// Pie de página común a todas las vistas. Pequeño y discreto: autoría
// (BioInCode), contacto y enlace al repositorio. Vive fuera de #app-view,
// así que no lo tocan los módulos al repintar.

import { t } from '../lib/i18n.js';

const REPO_URL = 'https://github.com/LucaDoktor/qiimelab';
const CONTACT = 'bioincode.info@gmail.com';

export function renderFooter(el) {
  if (!el) return;
  el.innerHTML =
    '<div class="ql-footer-inner">' +
    '<span class="ql-footer-brand">QiimeLab</span>' +
    '<span class="ql-footer-sep" aria-hidden="true">·</span>' +
    '<span class="ql-footer-by">' + t('footer.by') + ' <strong>BioInCode</strong></span>' +
    '<a class="ql-footer-link" href="mailto:' + CONTACT + '">' + CONTACT + '</a>' +
    '<a class="ql-footer-link" href="' + REPO_URL + '" target="_blank" rel="noopener noreferrer">' + t('footer.source') + '</a>' +
    '</div>';
}
