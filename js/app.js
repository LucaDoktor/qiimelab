// Router mínimo basado en hash + arranque de la app. Sin build step: todo
// son módulos ES nativos que el navegador carga directamente.

import { renderShell, subscribeShell } from './modules/shell.js';
import { onLangChange, t } from './lib/i18n.js';

const sidebar = document.getElementById('sidebar');
const view = document.getElementById('app-view');

const moduleLoaders = {
  '': () => import('./modules/home.js'),
  cargar: () => import('./modules/upload.js'),
  barplots: () => import('./modules/taxaBarplot.js'),
  alfa: () => import('./modules/alphaDiversity.js'),
  beta: () => import('./modules/betaDiversity.js'),
  diferencial: () => import('./modules/differentialAbundance.js'),
  venn: () => import('./modules/venn.js'),
  qc: () => import('./modules/sequenceQC.js'),
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
  view.innerHTML = '<p class="ql-panel-note">' + t('app.loading') + '</p>';
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
// al cambiar de idioma se repinta toda la app (barra lateral + módulo activo)
onLangChange(renderRoute);
renderRoute();
