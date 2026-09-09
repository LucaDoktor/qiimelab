// Panel de estado de los datos tipo semáforo (🟢🟡🔴). Sintetiza
// summariseHealth() (js/lib/dataHealth.js) en una tira compacta que se ve
// antes de entrar a cualquier módulo de análisis: en la portada y en #/cargar.

import { t } from './i18n.js';
import { summariseHealth } from './dataHealth.js';

const DOT = {
  good: '#1a9e57', warning: '#c98a11', error: '#d33a3a', empty: 'var(--baseline)',
};
const CSSVAR = {
  good: 'var(--good)', warning: 'var(--warning)', error: 'var(--critical)', empty: 'var(--ink-muted)',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Devuelve un <section> con el semáforo.
 * @param {object} [opt]
 * @param {boolean} [opt.compact]   solo la línea de titular (portada)
 * @param {boolean} [opt.link]      añade un enlace a #/cargar (portada)
 * @param {boolean} [opt.hideWhenEmpty]  no devuelve nada si aún no hay datos
 * @returns {HTMLElement|null}
 */
export function healthBannerEl(opt = {}) {
  const h = summariseHealth();
  if (h.level === 'empty' && opt.hideWhenEmpty) return null;

  const card = document.createElement('section');
  card.className = 'ql-card ql-panel ql-health-banner is-' + h.level;
  card.setAttribute('role', 'status');

  const headline =
    h.level === 'empty' ? t('health.sem.empty')
      : h.level === 'good' ? t('health.sem.good')
        : h.level === 'error' ? t('health.sem.error', { n: h.counts.error })
          : t('health.sem.warning', { n: h.counts.warning });

  const extra = [];
  if (h.level !== 'empty') {
    if (h.counts.error) extra.push(t('health.sem.nErrors', { n: h.counts.error }));
    if (h.counts.warning) extra.push(t('health.sem.nWarnings', { n: h.counts.warning }));
    if (h.counts.info) extra.push(t('health.sem.nInfos', { n: h.counts.info }));
    if (extra.length === 0) extra.push(t('health.sem.checksOk'));
  }

  let html = '<div class="ql-health-banner-row">' +
    '<span class="ql-health-light" aria-hidden="true" style="background:' + DOT[h.level] + ';box-shadow:0 0 0 4px color-mix(in srgb, ' + CSSVAR[h.level] + ' 18%, transparent);"></span>' +
    '<div class="ql-health-banner-txt">' +
    '<strong>' + escapeHtml(headline) + '</strong>' +
    (extra.length ? '<span class="ql-health-banner-sub">' + escapeHtml(extra.join(' · ')) + '</span>' : '') +
    '</div>';
  if (opt.link && h.level !== 'empty') {
    html += '<a class="ql-health-banner-link" href="#/cargar">' + t('health.sem.review') + '</a>';
  }
  html += '</div>';
  card.innerHTML = html;

  // versión completa: la lista de hallazgos debajo (para #/cargar)
  if (!opt.compact && h.findings.length) {
    const ul = document.createElement('ul');
    ul.className = 'ql-health-list';
    ul.style.marginTop = '12px';
    h.findings.forEach((f) => {
      const cls = f.level === 'error' ? 'is-error' : f.level === 'warning' ? 'is-warning' : 'is-info';
      let ids = '';
      if (f.sampleIds && f.sampleIds.length) {
        const shown = f.sampleIds.slice(0, 12).map(escapeHtml).join(', ');
        const more = f.sampleIds.length > 12 ? ' ' + t('health.andMore', { n: f.sampleIds.length - 12 }) : '';
        ids = '<span class="ql-health-ids">' + escapeHtml(t('health.samplesLabel')) + ': ' + shown + more + '</span>';
      }
      const li = document.createElement('li');
      li.className = 'ql-health-item';
      li.innerHTML = '<span class="ql-health-dot ' + cls + '" aria-hidden="true"></span>' +
        '<span><span class="ql-health-msg">' + escapeHtml(f.message) + '</span>' + ids + '</span>';
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }

  return card;
}
