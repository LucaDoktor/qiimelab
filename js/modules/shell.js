// Barra lateral: navegación entre módulos + resumen de qué datos hay cargados
// + selector de idioma.

import { state, subscribe } from '../state.js';
import { t, getLang, setLang, LANGS } from '../lib/i18n.js';

const ICONS = {
  home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  bars: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  alpha: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="9" width="4" height="11"/><rect x="10" y="4" width="4" height="16"/><rect x="16" y="12" width="4" height="8"/></svg>',
  beta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="17" r="2.4"/><circle cx="17" cy="17" r="2.4"/><circle cx="12" cy="7" r="2.4"/><path d="m9 15.5 1.7-6M15 15.5l-1.7-6"/></svg>',
  volcano: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20h18"/><circle cx="12" cy="9" r="3"/><circle cx="6" cy="14" r="1.4"/><circle cx="18" cy="16" r="1.6"/><circle cx="9.5" cy="6" r="1"/></svg>',
  venn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
  qc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17V7m4 10v-4m4 4V5m4 12v-7m4 7V9"/><path d="M2 20h20"/></svg>',
};

// id = fragmento de ruta (#/<id>); navKey = clave de traducción del rótulo.
export const ROUTES = [
  { id: '', navKey: 'nav.home', icon: 'home' },
  { id: 'cargar', navKey: 'nav.upload', icon: 'upload' },
  { id: 'barplots', navKey: 'nav.barplots', icon: 'bars' },
  { id: 'alfa', navKey: 'nav.alpha', icon: 'alpha' },
  { id: 'beta', navKey: 'nav.beta', icon: 'beta' },
  { id: 'diferencial', navKey: 'nav.differential', icon: 'volcano' },
  { id: 'venn', navKey: 'nav.venn', icon: 'venn' },
  { id: 'qc', navKey: 'nav.qc', icon: 'qc' },
];

function slotFilled(routeId) {
  switch (routeId) {
    case 'barplots': return !!state.taxaBarplot;
    case 'alfa': return !!state.alphaDiversity;
    case 'beta': return !!state.betaDiversity;
    case 'diferencial': return !!state.differentialAbundance;
    case 'venn': return !!state.taxaCounts && !!state.metadata;
    case 'qc': return Array.isArray(state.sequenceQC) && state.sequenceQC.length > 0;
    default: return true;
  }
}

export function renderShell(container, currentRoute) {
  container.innerHTML = '';

  const brand = document.createElement('div');
  brand.className = 'ql-brand';
  brand.innerHTML = '<span class="ql-brand-mark" aria-hidden="true"></span><span class="ql-brand-name">QiimeLab</span>';
  container.appendChild(brand);

  const nav = document.createElement('div');
  nav.className = 'ql-nav';
  const label = document.createElement('div');
  label.className = 'ql-nav-group-label';
  label.textContent = t('shell.groupModules');
  nav.appendChild(label);

  ROUTES.forEach((r) => {
    const a = document.createElement('a');
    a.href = '#/' + r.id;
    a.className = 'ql-nav-item' + (currentRoute === r.id ? ' is-active' : '');
    const filled = slotFilled(r.id);
    a.innerHTML = '<span class="ql-nav-icon">' + ICONS[r.icon] + '</span><span>' + t(r.navKey) + '</span>' +
      (r.id !== '' && r.id !== 'cargar' && !filled ? '<span class="ql-nav-soon">' + t('shell.noData') + '</span>' : '');
    nav.appendChild(a);
  });
  container.appendChild(nav);

  const statusWrap = document.createElement('div');
  statusWrap.className = 'ql-nav';
  statusWrap.style.marginTop = 'auto';
  const statusLabel = document.createElement('div');
  statusLabel.className = 'ql-nav-group-label';
  statusLabel.textContent = t('shell.sessionData');
  statusWrap.appendChild(statusLabel);

  const checklist = document.createElement('div');
  checklist.className = 'ql-checklist';
  checklist.style.padding = '0 12px';
  const items = [
    [t('slots.metadata'), !!state.metadata],
    [t('slots.taxonomy'), !!state.taxonomy],
    [t('slots.taxaBarplot'), !!state.taxaBarplot],
    [t('slots.taxaCounts'), !!state.taxaCounts],
    [t('slots.alpha'), !!state.alphaDiversity],
    [t('slots.beta'), !!state.betaDiversity],
    [t('slots.differential'), !!state.differentialAbundance],
    [t('slots.fastq'), Array.isArray(state.sequenceQC) && state.sequenceQC.length > 0],
  ];
  items.forEach(([lbl, done]) => {
    const row = document.createElement('div');
    row.className = 'ql-check-row' + (done ? ' is-done' : '');
    row.innerHTML = '<span class="ql-check-dot"></span>' + lbl;
    checklist.appendChild(row);
  });
  statusWrap.appendChild(checklist);
  container.appendChild(statusWrap);

  // ---- selector de idioma (autónimos, sin banderas) ----
  const langWrap = document.createElement('div');
  langWrap.className = 'ql-nav';
  const langLabel = document.createElement('label');
  langLabel.className = 'ql-nav-group-label';
  langLabel.setAttribute('for', 'ql-lang-select');
  langLabel.textContent = t('shell.language');
  langWrap.appendChild(langLabel);
  const langSel = document.createElement('select');
  langSel.id = 'ql-lang-select';
  langSel.style.cssText = 'margin:0 12px;width:calc(100% - 24px);';
  LANGS.forEach((l) => {
    const opt = document.createElement('option');
    opt.value = l.code;
    opt.textContent = l.label;
    if (l.code === getLang()) opt.selected = true;
    langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => setLang(langSel.value));
  langWrap.appendChild(langSel);
  container.appendChild(langWrap);

  const footer = document.createElement('p');
  footer.style.cssText = 'font-size:11px;color:var(--ink-muted);padding:0 12px;line-height:1.5;';
  footer.textContent = t('shell.footer');
  container.appendChild(footer);
}

/** Se suscribe UNA vez (llamar solo al arrancar la app) para repintar la barra lateral cuando cambie el estado. */
export function subscribeShell(container, getRoute) {
  return subscribe(() => renderShell(container, getRoute()));
}
