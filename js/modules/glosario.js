// Glosario central: cada término con una explicación en lenguaje llano,
// agrupado por bloque. Para los índices de diversidad reutiliza la frase que
// ya tiene cada módulo en i18n (alpha.ex* / beta.ex*) en vez de reescribirla.
//
// Sin estado ni datos que cargar — es una lista estática, como recursos.js.
// Deep-link: #/glosario?t=<id> pre-rellena el filtro con ese término y lo abre.

import { t } from '../lib/i18n.js';
import { domainMotif } from '../lib/motif.js';

// route = id de ruta (#/<route>); def = clave i18n de la definición (por
// defecto glosario.d.<id>). El nombre visible es siempre glosario.n.<id>.
const GLOSSARY = [
  {
    title: 'glosario.g1',
    terms: [
      { id: 'seq16S' },
      { id: 'taxon' },
      { id: 'metadata' },
      { id: 'relAbund', route: 'barplots' },
      { id: 'rarefaction', route: 'alfa' },
      { id: 'qc', route: 'qc' },
      { id: 'session', route: 'cargar' },
    ],
  },
  {
    title: 'glosario.g2',
    terms: [
      { id: 'alphaDiv', route: 'alfa' },
      { id: 'shannon', def: 'alpha.exShannon', route: 'alfa' },
      { id: 'observed', def: 'alpha.exObserved', route: 'alfa' },
      { id: 'simpson', def: 'alpha.exSimpson', route: 'alfa' },
      { id: 'pielou', def: 'alpha.exPielou', route: 'alfa' },
      { id: 'chao1', def: 'alpha.exChao1', route: 'alfa' },
      { id: 'faith', def: 'alpha.exFaith', route: 'alfa' },
      { id: 'groupRich', route: 'alfa' },
      { id: 'chao2', def: 'alpha.exChao2', route: 'alfa' },
      { id: 'jack1', def: 'alpha.exJack1', route: 'alfa' },
      { id: 'jack2', def: 'alpha.exJack2', route: 'alfa' },
      { id: 'boot', def: 'alpha.exBoot', route: 'alfa' },
      { id: 'betaDiv', route: 'beta' },
      { id: 'bray', def: 'beta.exBray', route: 'beta' },
      { id: 'jaccard', def: 'beta.exJaccard', route: 'beta' },
      { id: 'uwUnifrac', def: 'beta.exUwUnifrac', route: 'beta' },
      { id: 'wUnifrac', def: 'beta.exWUnifrac', route: 'beta' },
      { id: 'aitchison', def: 'beta.exAitchison', route: 'beta' },
      { id: 'pcoa', route: 'beta' },
      { id: 'upgma', route: 'beta' },
      { id: 'venn', route: 'venn' },
      { id: 'coocurrence', route: 'correlograma' },
    ],
  },
  {
    title: 'glosario.g3',
    terms: [
      { id: 'diffAbund', route: 'diferencial' },
      { id: 'log2fc', route: 'diferencial' },
      { id: 'fdr', route: 'diferencial' },
      { id: 'volcano', route: 'diferencial' },
      { id: 'biomarkers', route: 'barplots' },
      { id: 'correlation', route: 'correlograma' },
      { id: 'kegg', route: 'funcional' },
    ],
  },
  {
    title: 'glosario.g4',
    terms: [
      { id: 'kruskal', def: 'alpha.kwHelp' },
      { id: 'cliff', route: 'barplots' },
    ],
  },
];

const ROUTE_NAV = {
  barplots: 'nav.barplots', alfa: 'nav.alpha', beta: 'nav.beta',
  diferencial: 'nav.differential', venn: 'nav.venn', correlograma: 'nav.correlograma',
  funcional: 'nav.funcional', qc: 'nav.qc', cargar: 'nav.upload',
};

// normaliza para el filtro: minúsculas y sin diacríticos
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function render(container) {
  container.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'ql-hero';
  header.innerHTML =
    '<div class="ql-hero-motif">' + domainMotif() + '</div>' +
    '<div class="ql-hero-body">' +
    '<p class="ql-eyebrow">' + t('glosario.eyebrow') + '</p>' +
    '<h1 class="ql-hero-title">' + t('glosario.title') + '</h1>' +
    '<p class="ql-hero-sub">' + t('glosario.subtitle') + '</p>' +
    '</div>';
  container.appendChild(header);

  const stack = document.createElement('div');
  stack.className = 'ql-stack';

  // --- filtro de texto ---
  const total = GLOSSARY.reduce((n, g) => n + g.terms.length, 0);
  const filterCard = document.createElement('section');
  filterCard.className = 'ql-card ql-panel ql-glossary-filter';
  filterCard.innerHTML =
    '<div class="ql-field">' +
    '<label for="glosFilter">' + t('glosario.filterLabel') + '</label>' +
    '<input type="search" id="glosFilter" placeholder="' + t('glosario.filterPlaceholder') + '" autocomplete="off" />' +
    '</div>' +
    '<p class="ql-field-help" id="glosCount"></p>';
  stack.appendChild(filterCard);
  const input = filterCard.querySelector('#glosFilter');
  const countEl = filterCard.querySelector('#glosCount');

  // --- entradas ---
  const entries = []; // { el, section, text }
  GLOSSARY.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'ql-card ql-panel ql-glossary-group';
    section.innerHTML = '<h2>' + t(group.title) + '</h2>';
    const list = document.createElement('div');
    list.className = 'ql-glossary-list';

    group.terms.forEach((term) => {
      const name = t('glosario.n.' + term.id);
      const def = t(term.def || ('glosario.d.' + term.id));
      const d = document.createElement('details');
      d.className = 'ql-fmt-card ql-glossary-entry';
      d.id = 'glos-' + term.id;
      let inner =
        '<summary><span class="ql-fmt-name">' + name + '</span>' +
        '<span class="ql-fmt-see">' + t('glosario.expand') + '</span></summary>' +
        '<div class="ql-fmt-body"><p>' + def + '</p>';
      if (term.route && ROUTE_NAV[term.route]) {
        inner += '<a class="ql-glossary-link" href="#/' + term.route + '">' +
          t('glosario.seeIn', { module: t(ROUTE_NAV[term.route]) }) + '</a>';
      }
      inner += '</div>';
      d.innerHTML = inner;
      list.appendChild(d);
      entries.push({ el: d, section, text: norm(name + ' ' + def) });
    });

    section.appendChild(list);
    stack.appendChild(section);
  });

  container.appendChild(stack);

  function applyFilter(q) {
    const nq = norm(q.trim());
    let shown = 0;
    entries.forEach((e) => {
      const match = !nq || e.text.includes(nq);
      e.el.hidden = !match;
      if (match) shown++;
    });
    stack.querySelectorAll('.ql-glossary-group').forEach((sec) => {
      const anyVisible = [...sec.querySelectorAll('.ql-glossary-entry')].some((d) => !d.hidden);
      sec.hidden = !anyVisible;
    });
    countEl.textContent = nq ? t('glosario.count', { n: shown, total }) : t('glosario.countAll', { total });
  }

  input.addEventListener('input', () => applyFilter(input.value));

  // deep-link ?t=<id>: pre-rellena el filtro con el nombre del término y lo abre
  const q = new URLSearchParams(location.hash.split('?')[1] || '').get('t');
  const target = q && entries.find((e) => e.el.id === 'glos-' + q);
  if (target) {
    const rawName = target.el.querySelector('.ql-fmt-name').textContent;
    input.value = rawName;
    applyFilter(rawName);
    target.el.open = true;
    requestAnimationFrame(() => target.el.scrollIntoView({ block: 'center' }));
  } else {
    applyFilter('');
  }
}
