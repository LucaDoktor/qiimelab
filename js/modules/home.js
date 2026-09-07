import { state, subscribe } from '../state.js';
import { t } from '../lib/i18n.js';

// route = fragmento de ruta; los rótulos y descripciones salen de i18n.
const MODULES_INFO = [
  { route: 'barplots', nameKey: 'nav.barplots', descKey: 'modules.barplots.desc' },
  { route: 'alfa', nameKey: 'nav.alpha', descKey: 'modules.alpha.desc' },
  { route: 'beta', nameKey: 'nav.beta', descKey: 'modules.beta.desc' },
  { route: 'diferencial', nameKey: 'nav.differential', descKey: 'modules.differential.desc' },
  { route: 'venn', nameKey: 'nav.venn', descKey: 'modules.venn.desc' },
  { route: 'qc', nameKey: 'nav.qc', descKey: 'modules.qc.desc' },
];

export function render(container) {
  function paint() {
    container.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('home.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">QiimeLab</h1>' +
      '<p class="ql-page-sub">' + t('home.subtitle') + '</p>';
    container.appendChild(header);

    const stack = document.createElement('div');
    stack.className = 'ql-stack';

    // CTA / estado de carga
    const cta = document.createElement('section');
    cta.className = 'ql-card ql-panel';
    const anyData = state.metadata || state.taxonomy || state.taxaBarplot || state.alphaDiversity ||
      state.betaDiversity || state.differentialAbundance || state.taxaCounts ||
      (Array.isArray(state.sequenceQC) && state.sequenceQC.length > 0);
    cta.innerHTML = anyData
      ? '<h2>' + t('home.ctaLoadedTitle') + '</h2><p class="ql-panel-note">' + t('home.ctaLoadedNote') + '</p>'
      : '<h2>' + t('home.ctaEmptyTitle') + '</h2><p class="ql-panel-note">' + t('home.ctaEmptyNote') + '</p>';
    const ctaBtn = document.createElement('a');
    ctaBtn.href = '#/cargar';
    ctaBtn.className = 'ql-btn ql-btn-primary';
    ctaBtn.textContent = anyData ? t('home.ctaBtnMore') : t('home.ctaBtnLoad');
    cta.appendChild(ctaBtn);
    stack.appendChild(cta);

    // resumen de slots
    const summary = document.createElement('section');
    summary.className = 'ql-card ql-panel';
    summary.innerHTML = '<h2>' + t('home.summaryTitle') + '</h2><p class="ql-panel-note">' + t('home.summaryNote') + '</p>';
    const stats = document.createElement('div');
    stats.className = 'ql-stats';
    const rows = [
      [t('slots.metadata'), !!state.metadata],
      [t('slots.taxonomy'), !!state.taxonomy],
      [t('slots.taxaBarplot'), !!state.taxaBarplot],
      [t('slots.taxaCounts'), !!state.taxaCounts],
      [t('slots.alpha'), !!state.alphaDiversity],
      [t('slots.beta'), !!state.betaDiversity],
      [t('slots.differential'), !!state.differentialAbundance],
      [t('slots.fastq'), Array.isArray(state.sequenceQC) && state.sequenceQC.length > 0],
    ];
    rows.forEach(([lbl, done]) => {
      const tile = document.createElement('div');
      tile.className = 'ql-stat';
      tile.innerHTML = '<div class="ql-stat-label">' + lbl + '</div><div class="ql-stat-value" style="font-size:14px;color:' +
        (done ? 'var(--good)' : 'var(--ink-muted)') + '">' + (done ? t('common.available') : t('common.noData')) + '</div>';
      stats.appendChild(tile);
    });
    summary.appendChild(stats);
    stack.appendChild(summary);

    // módulos
    const modsSection = document.createElement('section');
    modsSection.className = 'ql-card ql-panel';
    modsSection.innerHTML = '<h2>' + t('home.modulesTitle') + '</h2><p class="ql-panel-note">' + t('home.modulesNote') + '</p>';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;';
    MODULES_INFO.forEach((m) => {
      const card = document.createElement('a');
      card.href = '#/' + m.route;
      card.style.cssText = 'display:block;padding:14px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--page);text-decoration:none;color:inherit;';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:6px;">' +
        '<strong style="font-size:13.5px;">' + t(m.nameKey) + '</strong>' +
        '<span class="ql-badge ql-badge-good" style="flex:none;">' + t('common.available') + '</span></div>' +
        '<p style="font-size:12.5px;color:var(--ink-muted);margin:0;">' + t(m.descKey) + '</p>';
      grid.appendChild(card);
    });
    modsSection.appendChild(grid);
    stack.appendChild(modsSection);

    container.appendChild(stack);
  }
  paint();
  return subscribe(paint);
}
