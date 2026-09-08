// Índices funcionales (PICRUSt2): puntúa cada módulo funcional por muestra a
// partir de la tabla de KOs unstrat, y compara los grupos de metadatos con el
// mismo boxplot + Kruskal-Wallis que diversidad alfa.
//
// Entrada: state.functionalKO (KO × muestra) + state.functionalCategories
//          (mapeo KO → módulo, el de ejemplo o el CSV del usuario) + metadata.
//
// Normalización (regla fija): cada muestra se relativiza primero por el total
// de TODOS sus KOs; luego se suman los KOs del módulo. Así la puntuación es el
// % del metagenoma total dedicado a ese módulo, no el % dentro del módulo.

import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { formatP } from '../lib/stats.js';
import { drawGroupBoxplot } from '../lib/groupBoxplot.js';
import { attachChartEditor } from '../lib/chartEditor.js';
import { loadRealFunctionalWithMeta, mountExampleButtons, exampleDownloadBlock } from '../lib/exampleData.js';
import { annotateKO, keggEntryUrl } from '../lib/koAnnotate.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// muestra → grupo, tolerante a sufijos en los IDs
function groupResolver(meta, groupCol) {
  const map = {};
  meta.rows.forEach((r) => {
    const id = String(r[meta.sampleIdKey] ?? '').trim();
    const g = String(r[groupCol] ?? '').trim();
    if (id && g) map[id] = g;
  });
  return (sid) => {
    if (map[sid] != null) return map[sid];
    const hit = Object.keys(map).find((k) => sid.startsWith(k) || k.startsWith(sid));
    return hit ? map[hit] : null;
  };
}

// { moduleNames, scoresByModule: { [mod]: { [sample]: pct } }, kosInTable: { [mod]: string[] }, moduleKOs: { [mod]: string[] } }
function computeModuleScores() {
  const ko = state.functionalKO;
  const cats = state.functionalCategories;
  const koKey = ko.koKey || ko.headers[0];
  const sampleCols = ko.headers.filter((h) => h !== koKey);

  // KO → { sample: valor }
  const koVals = new Map();
  ko.rows.forEach((r) => {
    const id = String(r[koKey]).trim();
    const row = {};
    sampleCols.forEach((s) => { row[s] = parseFloat(r[s]) || 0; });
    koVals.set(id, row);
  });

  // total de TODOS los KOs por muestra (para relativizar ANTES de sumar módulos)
  const totals = {};
  sampleCols.forEach((s) => { totals[s] = 0; });
  koVals.forEach((row) => { sampleCols.forEach((s) => { totals[s] += row[s]; }); });

  // mapeo módulo → KOs (mapping.module / mapping.ko son índices en cats.headers)
  const modCol = cats.headers[cats.mapping.module];
  const koCol = cats.headers[cats.mapping.ko];
  const moduleKOs = {};
  cats.rows.forEach((r) => {
    const mod = String(r[modCol] ?? '').trim();
    const k = String(r[koCol] ?? '').trim();
    if (!mod || !k) return;
    (moduleKOs[mod] = moduleKOs[mod] || []).push(k);
  });

  const moduleNames = Object.keys(moduleKOs).sort();
  const scoresByModule = {};
  const kosInTable = {};
  moduleNames.forEach((mod) => {
    const present = moduleKOs[mod].filter((k) => koVals.has(k));
    kosInTable[mod] = present;
    const scores = {};
    sampleCols.forEach((s) => {
      if (!(totals[s] > 0)) { scores[s] = 0; return; }
      let sum = 0;
      present.forEach((k) => { sum += koVals.get(k)[s]; });
      scores[s] = sum / totals[s] * 100;
    });
    scoresByModule[mod] = scores;
  });

  return { moduleNames, scoresByModule, kosInTable, moduleKOs };
}

export function render(container) {
  let moduleName = null;
  let groupCol = null;
  let editor = null;

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('functional.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('functional.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('functional.subtitle') + '</p>';
    container.appendChild(header);

    if (!state.functionalKO || !state.functionalCategories || !state.metadata) {
      const missing = [];
      if (!state.functionalKO) missing.push(t('functional.needKO'));
      if (!state.functionalCategories) missing.push(t('functional.needCats'));
      if (!state.metadata) missing.push(t('functional.needMeta'));
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 20V8M10 20V4M16 20v-9M22 20H2"/><circle cx="10" cy="4" r="1.4" fill="currentColor" stroke="none"/></svg>' +
        '<h3>' + t('functional.emptyTitle') + '</h3><p>' + t('functional.emptyNeed', { list: missing.join(t('ui.needAnd')) }) + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div></div>';
      container.appendChild(card);
      mountExampleButtons(card.querySelector('.ql-empty'), {
        real: loadRealFunctionalWithMeta,
        download: ['kolist', 'koabund', 'metadata'],
      });
      return;
    }

    const { moduleNames, scoresByModule, kosInTable, moduleKOs } = computeModuleScores();
    if (!moduleName || !moduleNames.includes(moduleName)) moduleName = moduleNames[0];

    const groupOptions = state.metadata.headers.filter((h) => h !== state.metadata.sampleIdKey);
    if (!groupCol || !groupOptions.includes(groupCol)) groupCol = groupOptions[0] || null;

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' + t('functional.chartNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('a11y.chartFunctional') });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg); chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    // módulo funcional
    const mf = document.createElement('div');
    mf.className = 'ql-field';
    mf.innerHTML = '<label>' + t('functional.moduleLabel') + '</label>';
    const mSel = document.createElement('select');
    moduleNames.forEach((m) => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m + ' (' + kosInTable[m].length + '/' + moduleKOs[m].length + ' KO)';
      if (m === moduleName) o.selected = true;
      mSel.appendChild(o);
    });
    mSel.addEventListener('change', () => { moduleName = mSel.value; paint(); });
    mf.appendChild(mSel);
    controls.appendChild(mf);

    // agrupar por
    if (groupOptions.length > 0) {
      const gf = document.createElement('div');
      gf.className = 'ql-field';
      gf.innerHTML = '<label>' + t('functional.groupLabel') + '</label>';
      const gSel = document.createElement('select');
      groupOptions.forEach((g) => {
        const o = document.createElement('option');
        o.value = g; o.textContent = g;
        if (g === groupCol) o.selected = true;
        gSel.appendChild(o);
      });
      gSel.addEventListener('change', () => { groupCol = gSel.value; paint(); });
      gf.appendChild(gSel);
      controls.appendChild(gf);
    }

    const statsBox = document.createElement('div');
    statsBox.style.marginTop = '18px';
    controls.appendChild(statsBox);

    // origen del mapeo + normalización
    const catFile = state.files.find((f) => f.id === state.functionalCategories.sourceFileId);
    const srcNote = document.createElement('p');
    srcNote.className = 'ql-field-help';
    srcNote.style.marginTop = '14px';
    srcNote.innerHTML =
      '<strong>' + t('functional.mappingTitle') + ':</strong> ' +
      escapeHtml(catFile ? catFile.name : '—') + ' · ' + moduleNames.length + ' ' + t('functional.statModules').toLowerCase() + '.<br>' +
      t('functional.mappingHelp');
    controls.appendChild(srcNote);
    const normNote = document.createElement('p');
    normNote.className = 'ql-field-help';
    normNote.textContent = t('functional.normNote');
    controls.appendChild(normNote);

    grid.appendChild(controls);
    container.appendChild(grid);

    // KOs del módulo — con la anotación de tu lista + enlace a la ficha en KEGG
    const koCard = document.createElement('section');
    koCard.className = 'ql-card ql-panel';
    koCard.style.marginTop = '20px';
    koCard.innerHTML = '<h2>' + t('functional.koListTitle', { module: escapeHtml(moduleName) }) + '</h2>' +
      '<p class="ql-panel-note">' + t('functional.koListNote') + '</p>';
    const present = new Set(kosInTable[moduleName]);
    let anyUnannotated = false;
    const koScroll = document.createElement('div');
    koScroll.className = 'ql-table-scroll';
    const koTbl = document.createElement('table');
    koTbl.className = 'ql-table';
    koTbl.innerHTML = '<thead><tr><th>KO</th><th>' + t('functional.colGene') + '</th><th>EC</th><th>' +
      t('functional.colRole') + '</th><th>' + t('functional.colInTable') + '</th><th></th></tr></thead>';
    const koBody = document.createElement('tbody');
    moduleKOs[moduleName].forEach((k) => {
      const inTable = present.has(k);
      const ann = annotateKO(k);
      const geneEnz = ann && ann.annotated ? [ann.gene, ann.enzyme].filter(Boolean).join(' · ') : '';
      if (!(ann && ann.annotated)) anyUnannotated = true;
      const tr = document.createElement('tr');
      if (!inTable) tr.style.opacity = '.5';
      tr.innerHTML =
        '<td><span class="mono">' + escapeHtml(k) + '</span></td>' +
        '<td>' + (geneEnz ? escapeHtml(geneEnz) : '<span class="ql-cell-muted">' + t('functional.koUnannotated') + '</span>') + '</td>' +
        '<td class="ql-cell-muted">' + (ann && ann.ec ? escapeHtml(ann.ec) : '—') + '</td>' +
        '<td class="ql-cell-muted">' + (ann && ann.role ? escapeHtml(ann.role) : '—') + '</td>' +
        '<td class="ql-num">' + (inTable ? '✓' : '–') + '</td>' +
        '<td><a class="ql-kegg-link" href="' + escapeHtml(keggEntryUrl(k)) + '" target="_blank" rel="noopener" title="' + t('functional.keggTitle') + '">KEGG&nbsp;↗</a></td>';
      koBody.appendChild(tr);
    });
    koTbl.appendChild(koBody);
    koScroll.appendChild(koTbl);
    koCard.appendChild(koScroll);
    if (anyUnannotated) {
      const un = document.createElement('p');
      un.className = 'ql-field-help';
      un.textContent = t('functional.koUnannotatedNote');
      koCard.appendChild(un);
    }
    container.appendChild(koCard);

    // tabla
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('functional.tableTitle') + '</h2>';
    container.appendChild(tableCard);

    if (!groupCol) return;

    // ---- construir grupos ----
    const scores = scoresByModule[moduleName];
    const resolve = groupResolver(state.metadata, groupCol);
    const groupNames = [];
    const groupData = {};
    const perSample = [];
    Object.keys(scores).forEach((sid) => {
      const g = resolve(sid);
      if (g == null || g === '') return;
      if (!groupData[g]) { groupData[g] = []; groupNames.push(g); }
      groupData[g].push(scores[sid]);
      perSample.push({ sid, group: g, score: scores[sid] });
    });
    groupNames.sort();

    if (groupNames.length === 0) {
      statsBox.innerHTML = '<p class="ql-field-help">' + t('functional.noMatch') + '</p>';
      return;
    }
    if (kosInTable[moduleName].length === 0) {
      statsBox.innerHTML = '<p class="ql-field-help">' + t('functional.noKOsInModule') + '</p>';
      return;
    }

    const { kw, ceElements } = drawGroupBoxplot({
      svg, chartWrap, tooltip, groupNames, groupData,
      title: moduleName, xTitle: groupCol, yTitle: t('functional.colScore'),
      valueLabel: moduleName, valueDecimals: 3,
      bracketKey: 'alpha.kwBracket',
    });

    statsBox.innerHTML =
      '<div class="ql-stats">' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('functional.statKOsUsed') + '</div><div class="ql-stat-value" style="font-size:20px;">' + kosInTable[moduleName].length + '</div></div>' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('functional.statSamples') + '</div><div class="ql-stat-value" style="font-size:20px;">' + perSample.length + '</div></div>' +
      '</div>' +
      (kw ? '<div style="margin-top:14px;padding:12px;border-radius:var(--radius-md);background:var(--page);border:1px solid var(--border);">' +
        '<div style="font-size:11px;color:var(--ink-muted);margin-bottom:4px;">Kruskal-Wallis</div>' +
        '<div class="mono tabular" style="font-size:13px;">H = ' + kw.H.toFixed(3) + ', df = ' + kw.df + '</div>' +
        '<div class="mono tabular" style="font-size:13px;">p = ' + formatP(kw.p) + (kw.p < 0.05 ? ' <span class="ql-badge ql-badge-good" style="margin-left:6px;">' + t('functional.kwSignificant') + '</span>' : '') + '</div>' +
        '</div>' +
        '<p class="ql-field-help">' + t('functional.kwHelp') + '</p>'
        : '<p class="ql-field-help">' + t('functional.kwOneGroup') + '</p>');

    editor = attachChartEditor({
      key: 'functional', svg, mount: chartPanel, filename: t('functional.title') + '-' + moduleName, lang: getLang(),
      elements: ceElements,
      onReset: () => paint(),
    });

    // tabla
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr><th>' + t('functional.colSample') + '</th><th>' + escapeHtml(groupCol) + '</th><th>' + t('functional.colScore') + '</th></tr></thead>';
    const tbody = document.createElement('tbody');
    perSample.sort((a, b) => a.group === b.group ? a.score - b.score : String(a.group).localeCompare(String(b.group)))
      .forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + escapeHtml(r.sid) + '</td><td>' + escapeHtml(String(r.group)) + '</td><td class="ql-num tabular">' + r.score.toFixed(4) + '</td>';
        tbody.appendChild(tr);
      });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);

    // bloque de descarga de datos de ejemplo (mismo patrón exdl)
    const dl = document.createElement('section');
    dl.className = 'ql-card ql-panel';
    dl.style.marginTop = '20px';
    dl.appendChild(exampleDownloadBlock(['kolist', 'koabund', 'metadata']));
    container.appendChild(dl);
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
