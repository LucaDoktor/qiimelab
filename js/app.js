// Router mínimo basado en hash + arranque de la app. Sin build step: todo
// son módulos ES nativos que el navegador carga directamente.

import { renderShell, subscribeShell } from './modules/shell.js';
import { renderFooter } from './modules/footer.js';
import { onLangChange, t } from './lib/i18n.js';
import { onProfileChange } from './lib/profile.js';

const sidebar = document.getElementById('sidebar');
const view = document.getElementById('app-view');
const footer = document.getElementById('app-footer');

const moduleLoaders = {
  '': () => import('./modules/home.js'),
  cargar: () => import('./modules/upload.js'),
  barplots: () => import('./modules/taxaBarplot.js'),
  alfa: () => import('./modules/alphaDiversity.js'),
  beta: () => import('./modules/betaDiversity.js'),
  diferencial: () => import('./modules/differentialAbundance.js'),
  venn: () => import('./modules/venn.js'),
  correlograma: () => import('./modules/correlogram.js'),
  funcional: () => import('./modules/functional.js'),
  qc: () => import('./modules/sequenceQC.js'),
  informe: () => import('./modules/informe.js'),
  recursos: () => import('./modules/recursos.js'),
};

let routeId = '';
let cleanupCurrentModule = null;

function currentRouteId() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash in moduleLoaders ? hash : '';
}

async function renderRoute() {
  if (typeof cleanupCurrentModule === 'function') {
    try { cleanupCurrentModule(); } catch (e) { /* noop */ }
  }
  cleanupCurrentModule = null;

  routeId = currentRouteId();
  renderShell(sidebar, routeId);
  renderFooter(footer);
  view.innerHTML =
    '<div class="ql-skel" role="status" aria-live="polite">' +
    '<span class="ql-skel-sr">' + t('app.loading') + '</span>' +
    '<div class="ql-skel-line ql-skel-eyebrow"></div>' +
    '<div class="ql-skel-line ql-skel-title"></div>' +
    '<div class="ql-skel-line ql-skel-sub"></div>' +
    '<div class="ql-skel-card"></div>' +
    '<div class="ql-skel-card ql-skel-card-sm"></div>' +
    '</div>';
  try {
    const mod = await moduleLoaders[routeId]();
    if (routeId !== currentRouteId()) return; // el usuario ya navegó a otro sitio mientras cargaba
    view.innerHTML = '';
    cleanupCurrentModule = mod.render(view) || null;
  } catch (err) {
    console.error(err);
    view.innerHTML = '<div class="ql-card ql-panel"><h2>' + t('app.moduleLoadError') + '</h2>' +
      '<p class="ql-panel-note">' + (err && err.message ? err.message : t('app.unknownError')) + '</p></div>';
  }
}

subscribeShell(sidebar, () => routeId);
window.addEventListener('hashchange', renderRoute);
// al cambiar de idioma o de nombre local se repinta toda la app
onLangChange(renderRoute);
onProfileChange(renderRoute);
renderRoute();
