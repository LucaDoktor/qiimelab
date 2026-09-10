// Diseño y análisis de primers: entrada multi-primer (sin el límite de 2 de
// las herramientas de mercado), estadísticas por primer, matriz de
// dímeros/horquillas, posición en una plantilla, cobertura contra una
// referencia propia, y modo lote para comparar parejas candidatas.
//
// Autocontenido como #/ufc o #/recuentos: no lee ni escribe el estado global
// de la app (no es una salida de QIIME2), persiste en localStorage.

import { t } from '../lib/i18n.js';
import {
  cleanPrimerSeq, baseComposition, gcPercent, gcClamp,
  molecularWeight, extinctionCoefficient, meltingTemp,
} from '../lib/primerAnalysis.js';
import { buildDimerMatrix, getHetero, classifyDimer, classifyHairpin, scanDimer, scanHairpin } from '../lib/primerDimers.js';
import { parseFasta, findPrimerSites, findAmplicons, CRITICAL_3PRIME_ZONE } from '../lib/primerTemplate.js';
import { computeCoverage, groupCoverageByTaxon, buildTaxonomyMap } from '../lib/primerCoverage.js';
import { parseTable } from '../lib/csv.js';

const STORE_KEY = 'qiimelab.primers';
const MIN_PRIMER_LEN = 4;
const EXAMPLE_REF_FASTA_URL = 'datos-ejemplo/primers/referencia_ejemplo.fasta';
const EXAMPLE_TAX_URL = 'datos-ejemplo/primers/taxonomia_ejemplo.tsv';
const NONE = '__none__'; // "(ninguno)" explícito, distinto de '' (= "todavía sin elegir")
const RANK_DEPTHS = [null, 2, 3, 4, 5, 6, 7]; // null = completa; 2..7 = filo..especie (convención QIIME2)

const TABS = [
  { id: 'primers', labelKey: 'primers.tabPrimers' },
  { id: 'dimers', labelKey: 'primers.tabDimers' },
  { id: 'template', labelKey: 'primers.tabTemplate' },
  { id: 'coverage', labelKey: 'primers.tabCoverage' },
  { id: 'batch', labelKey: 'primers.tabBatch' },
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// enteros grandes con separador de millares (mismo patrón que alphaDiversity.js)
function fmtN(n) {
  return Number.isFinite(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '—';
}
function fmt1(n, d = 1) { return Number.isFinite(n) ? n.toFixed(d) : '—'; }

function defaultState() {
  return {
    tab: 'primers',
    primers: [{ id: 'pr1', name: '', raw: '' }, { id: 'pr2', name: '', raw: '' }],
    salt: 50,     // mM Na+
    conc: 500,    // nM primer
    templateText: '',
    templateTol: 1,
    templateA: '', templateB: '',
    covRefText: '', covTaxText: '',
    covTol: 1, covA: '', covB: '', covRankIdx: 6, // índice en RANK_DEPTHS ("Género" por defecto)
    batchPairs: [],
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && Array.isArray(raw.primers)) {
      return {
        tab: typeof raw.tab === 'string' ? raw.tab : 'primers',
        primers: raw.primers.map((p) => ({ id: String(p.id || ''), name: String(p.name || ''), raw: String(p.raw || '') }))
          .filter((p) => p.id),
        salt: Number.isFinite(+raw.salt) && +raw.salt > 0 ? +raw.salt : 50,
        conc: Number.isFinite(+raw.conc) && +raw.conc > 0 ? +raw.conc : 500,
        templateText: typeof raw.templateText === 'string' ? raw.templateText : '',
        templateTol: Number.isFinite(+raw.templateTol) && +raw.templateTol >= 0 ? +raw.templateTol : 1,
        templateA: typeof raw.templateA === 'string' ? raw.templateA : '',
        templateB: typeof raw.templateB === 'string' ? raw.templateB : '',
        covRefText: typeof raw.covRefText === 'string' ? raw.covRefText : '',
        covTaxText: typeof raw.covTaxText === 'string' ? raw.covTaxText : '',
        covTol: Number.isFinite(+raw.covTol) && +raw.covTol >= 0 ? +raw.covTol : 1,
        covA: typeof raw.covA === 'string' ? raw.covA : '',
        covB: typeof raw.covB === 'string' ? raw.covB : '',
        covRankIdx: Number.isInteger(raw.covRankIdx) && raw.covRankIdx >= 0 && raw.covRankIdx < RANK_DEPTHS.length ? raw.covRankIdx : 6,
        batchPairs: Array.isArray(raw.batchPairs)
          ? raw.batchPairs.map((bp) => ({ id: String(bp.id || ''), label: String(bp.label || ''), a: String(bp.a || ''), b: String(bp.b || '') })).filter((bp) => bp.id)
          : [],
      };
    }
  } catch (e) { /* localStorage puede fallar */ }
  return defaultState();
}
function save(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
}

function highlightSeq(seq) {
  return [...seq].map((c) => (/[ACGT]/.test(c) ? c : '<span class="ql-primer-degenerate" title="' + t('primers.degenerateBase') + '">' + c + '</span>')).join('');
}

export function render(container) {
  const s = load();
  let nextIdNum = 1 + s.primers.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
  let nextBatchIdNum = 1 + s.batchPairs.reduce((m, bp) => Math.max(m, parseInt(String(bp.id).replace(/\D/g, ''), 10) || 0), 0);

  function derivePrimers() {
    return s.primers.map((p) => {
      const { seq, invalid } = cleanPrimerSeq(p.raw);
      return { ...p, seq, invalid, valid: seq.length >= MIN_PRIMER_LEN && invalid.length === 0 };
    });
  }

  function addPrimer(name = '', raw = '') {
    s.primers.push({ id: 'pr' + nextIdNum++, name, raw });
  }

  function paint() {
    container.innerHTML = '';
    save(s);

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('primers.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('primers.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('primers.subtitle') + '</p>';
    container.appendChild(header);

    if (TABS.length > 1) {
      const tabsEl = document.createElement('div');
      tabsEl.className = 'ql-tabs';
      tabsEl.setAttribute('role', 'tablist');
      TABS.forEach((tb) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ql-tab' + (s.tab === tb.id ? ' is-active' : '');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(s.tab === tb.id));
        b.textContent = t(tb.labelKey);
        b.addEventListener('click', () => { if (s.tab !== tb.id) { s.tab = tb.id; paint(); } });
        tabsEl.appendChild(b);
      });
      container.appendChild(tabsEl);
    }

    if (s.tab === 'dimers') renderDimersTab();
    else if (s.tab === 'template') renderTemplateTab();
    else if (s.tab === 'coverage') renderCoverageTab();
    else if (s.tab === 'batch') renderBatchTab();
    else renderPrimersTab();
  }

  function primerLabel(p, i) { return p.name || t('primers.namePh', { n: i + 1 }); }

  function riskBadge(level) {
    const cls = level === 'crit' ? 'ql-badge-crit' : level === 'warn' ? 'ql-badge-warn' : 'ql-badge-good';
    const key = level === 'crit' ? 'primers.riskCrit' : level === 'warn' ? 'primers.riskWarn' : 'primers.riskOk';
    return '<span class="ql-badge ' + cls + '">' + t(key) + '</span>';
  }

  function dimerCellHtml(cand, level) {
    if (!cand) return '<span class="ql-cell-muted">—</span>';
    return riskBadge(level) + '<div class="ql-field-help" style="margin-top:2px;">' +
      t('primers.dimerCellNote', { len: cand.len, dg: fmt1(cand.dG) }) + '</div>';
  }

  function dimerTooltip(cand, nameA, nameB) {
    if (!cand) return '';
    return t('primers.dimerTooltip', {
      a: nameA, aStart: cand.aStart + 1, aEnd: cand.aEnd,
      b: nameB, bStart: cand.bStart + 1, bEnd: cand.bEnd, dg: fmt1(cand.dG),
    });
  }

  function renderDimersTab() {
    const valid = derivePrimers().filter((p) => p.valid);
    const named = valid.map((p, i) => ({ ...p, label: primerLabel(p, i) }));

    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';
    card.innerHTML = '<h2>' + t('primers.dimersTitle') + '</h2><p class="ql-panel-note">' + t('primers.dimersNote') + '</p>';

    if (!named.length) {
      card.insertAdjacentHTML('beforeend', '<div class="ql-empty"><h3>' + t('primers.emptyTitle') + '</h3><p>' + t('primers.dimersEmpty') + '</p></div>');
      container.appendChild(card);
      return;
    }

    const matrix = buildDimerMatrix(named.map((p) => ({ id: p.id, seq: p.seq })));

    const scroll = document.createElement('div');
    scroll.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table ql-dimer-matrix';
    let thead = '<thead><tr><th></th>';
    named.forEach((p) => { thead += '<th scope="col">' + escapeHtml(p.label) + '</th>'; });
    thead += '</tr></thead>';
    let tbody = '<tbody>';
    named.forEach((pi) => {
      tbody += '<tr><th scope="row">' + escapeHtml(pi.label) + '</th>';
      named.forEach((pj) => {
        const cand = getHetero(matrix, pi.id, pj.id);
        const level = classifyDimer(cand);
        const title = dimerTooltip(cand, pi.label, pj.label);
        tbody += '<td class="' + (pi.id === pj.id ? 'is-diag' : '') + '"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' +
          dimerCellHtml(cand, level) + '</td>';
      });
      tbody += '</tr>';
    });
    tbody += '</tbody>';
    tbl.innerHTML = thead + tbody;
    scroll.appendChild(tbl);
    card.appendChild(scroll);
    card.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:10px;">' + t('primers.dimersLegend') + '</p>');
    container.appendChild(card);

    // ---- horquillas: una por primer, no es una matriz ----
    const hpCard = document.createElement('section');
    hpCard.className = 'ql-card ql-panel';
    hpCard.style.marginTop = '20px';
    hpCard.innerHTML = '<h2>' + t('primers.hairpinTitle') + '</h2><p class="ql-panel-note">' + t('primers.hairpinNote') + '</p>';
    const hScroll = document.createElement('div');
    hScroll.className = 'ql-table-scroll scroll-x';
    const hTbl = document.createElement('table');
    hTbl.className = 'ql-table';
    hTbl.innerHTML = '<thead><tr>' +
      ['primers.colName', 'primers.colStem', 'primers.colLoop', 'primers.colDG', 'primers.colRisk', 'primers.colPosition']
        .map((k) => '<th>' + t(k) + '</th>').join('') + '</tr></thead>';
    const hTb = document.createElement('tbody');
    named.forEach((p) => {
      const hp = matrix.hairpin[p.id];
      const level = classifyHairpin(hp);
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(p.label) + '</td>' +
        '<td class="ql-num tabular">' + (hp ? hp.stem : '—') + '</td>' +
        '<td class="ql-num tabular">' + (hp ? (hp.loopEnd - hp.loopStart) : '—') + '</td>' +
        '<td class="ql-num tabular">' + (hp ? fmt1(hp.dG) : '—') + '</td>' +
        '<td>' + riskBadge(level) + '</td>' +
        '<td class="mono" style="font-size:12px;">' + (hp
          ? escapeHtml((hp.armStart + 1) + '–' + hp.armEnd + ' · ' + t('primers.loopWord') + ' ' + (hp.loopStart + 1) + '–' + hp.loopEnd + ' · ' + (hp.stem2Start + 1) + '–' + hp.stem2End)
          : '<span class="ql-cell-muted">—</span>') + '</td>';
      hTb.appendChild(tr);
    });
    hTbl.appendChild(hTb);
    hScroll.appendChild(hTbl);
    hpCard.appendChild(hScroll);
    container.appendChild(hpCard);
  }

  // primer 5'→3' con las posiciones que no encajan en rojo (fuerte si además
  // caen en la zona 3' crítica) y la propia zona 3' subrayada aunque encaje.
  function renderPrimerColored(seq, mismatches) {
    const critStart = seq.length - CRITICAL_3PRIME_ZONE;
    const bad = new Map(mismatches.map((m) => [m.primerIdx, m]));
    return [...seq].map((c, idx) => {
      const isCrit = idx >= critStart;
      const isBad = bad.has(idx);
      const cls = isBad ? (isCrit ? 'ql-primer-mm-crit' : 'ql-primer-mm') : (isCrit ? 'ql-primer-3prime' : '');
      return cls ? '<span class="' + cls + '">' + escapeHtml(c) + '</span>' : escapeHtml(c);
    }).join('');
  }

  function renderHitsTable(primerSeq, hits) {
    if (!hits.length) return '<p class="ql-field-help">' + t('primers.noHits') + '</p>';
    const scroll = document.createElement('div');
    scroll.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr>' +
      ['primers.colStrandTemplate', 'primers.colPosRange', 'primers.colMismatchCount', 'primers.col3crit', 'primers.colSeq']
        .map((k) => '<th>' + t(k) + '</th>').join('') + '</tr></thead>';
    const tb = document.createElement('tbody');
    hits.forEach((h) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (h.strand === '+' ? t('primers.strandFwd') : t('primers.strandRev')) + '</td>' +
        '<td class="ql-num tabular">' + (h.pos + 1) + '–' + h.end + '</td>' +
        '<td class="ql-num tabular">' + h.mismatchCount + '</td>' +
        '<td>' + (h.has3PrimeMismatch ? '<span class="ql-badge ql-badge-crit">✓</span>' : '<span class="ql-cell-muted">—</span>') + '</td>' +
        '<td class="mono">' + renderPrimerColored(primerSeq, h.mismatches) + '</td>';
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    scroll.appendChild(tbl);
    return scroll.outerHTML;
  }

  function renderTemplateTab() {
    const valid = derivePrimers().filter((p) => p.valid).map((p, i) => ({ ...p, label: primerLabel(p, i) }));

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    // ---- carga de la plantilla ----
    const loadCard = document.createElement('section');
    loadCard.className = 'ql-card ql-panel';
    loadCard.innerHTML = '<h2>' + t('primers.templateTitle') + '</h2><p class="ql-panel-note">' +
      t('primers.templateNote', { n: CRITICAL_3PRIME_ZONE }) + '</p>';

    const dz = document.createElement('div');
    dz.className = 'ql-dropzone';
    dz.tabIndex = 0;
    dz.setAttribute('role', 'button');
    dz.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
      '<div><div class="ql-dz-text"><b>' + t('primers.templateDropLabel') + '</b></div><div class="ql-dz-sub">' + t('primers.templateDropSub') + '</div></div>';
    const fileIn = document.createElement('input');
    fileIn.type = 'file'; fileIn.accept = '.fasta,.fa,.fna,.txt';
    dz.appendChild(fileIn);
    loadCard.appendChild(dz);
    dz.addEventListener('click', () => fileIn.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
    const applyFile = async (file) => { if (file) { s.templateText = await file.text(); paint(); } };
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('is-drag'); applyFile(e.dataTransfer.files[0]); });
    fileIn.addEventListener('change', () => applyFile(fileIn.files[0]));

    const pasteField = document.createElement('div');
    pasteField.className = 'ql-field';
    pasteField.style.marginTop = '14px';
    pasteField.innerHTML = '<label for="primers-template-paste">' + t('primers.templateOr') + '</label>';
    const pasteTa = document.createElement('textarea');
    pasteTa.id = 'primers-template-paste';
    pasteTa.rows = 4; pasteTa.className = 'mono'; pasteTa.spellcheck = false;
    pasteTa.placeholder = t('primers.templatePastePh');
    pasteTa.value = s.templateText;
    pasteTa.addEventListener('change', () => { s.templateText = pasteTa.value; paint(); });
    pasteField.appendChild(pasteTa);
    loadCard.appendChild(pasteField);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;';
    const exBtn = document.createElement('button');
    exBtn.type = 'button'; exBtn.className = 'ql-btn';
    exBtn.textContent = t('primers.templateLoadExample');
    exBtn.addEventListener('click', async () => {
      exBtn.disabled = true;
      try {
        const res = await fetch(EXAMPLE_REF_FASTA_URL);
        s.templateText = await res.text();
      } catch (e) { /* si falla, no se cambia nada */ }
      exBtn.disabled = false;
      paint();
    });
    btnRow.appendChild(exBtn);
    if (s.templateText) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button'; clearBtn.className = 'ql-btn';
      clearBtn.textContent = t('primers.templateClear');
      clearBtn.addEventListener('click', () => { s.templateText = ''; paint(); });
      btnRow.appendChild(clearBtn);
    }
    loadCard.appendChild(btnRow);
    grid.appendChild(loadCard);

    // ---- controles: qué primers, qué tolerancia ----
    const ctrl = document.createElement('aside');
    ctrl.className = 'ql-card ql-panel';
    ctrl.innerHTML = '<h2>' + t('ui.controls') + '</h2>';
    if (!valid.length) {
      ctrl.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.dimersEmpty') + '</p>');
    } else {
      if (!s.templateA || !valid.some((p) => p.id === s.templateA)) s.templateA = valid[0].id;
      // '' = todavía no se ha elegido nada -> se autorrellena con el 2º primer si hay;
      // NONE es un valor explícito distinto de '' para que "(ninguno)" elegido a mano no
      // se vuelva a sobrescribir en el siguiente repintado.
      if (!s.templateB) s.templateB = valid.length > 1 && valid[1].id !== s.templateA ? valid[1].id : NONE;
      else if (s.templateB !== NONE && !valid.some((p) => p.id === s.templateB)) s.templateB = NONE;
      const mkSelect = (labelKey, value, onChange, allowNone) => {
        const f = document.createElement('div');
        f.className = 'ql-field';
        const selId = 'primers-tpl-' + labelKey.replace(/\W/g, '');
        f.innerHTML = '<label for="' + selId + '">' + t(labelKey) + '</label>';
        const sel = document.createElement('select');
        sel.id = selId;
        if (allowNone) sel.insertAdjacentHTML('beforeend', '<option value="' + NONE + '"' + (value === NONE ? ' selected' : '') + '>' + t('primers.noneOption') + '</option>');
        valid.forEach((p) => sel.insertAdjacentHTML('beforeend', '<option value="' + p.id + '"' + (p.id === value ? ' selected' : '') + '>' + escapeHtml(p.label) + '</option>'));
        sel.addEventListener('change', () => { onChange(sel.value); paint(); });
        f.appendChild(sel);
        return f;
      };
      ctrl.appendChild(mkSelect('primers.primerASelect', s.templateA, (v) => { s.templateA = v; }, false));
      ctrl.appendChild(mkSelect('primers.primerBSelect', s.templateB, (v) => { s.templateB = v; }, true));
    }
    const tolF = document.createElement('div');
    tolF.className = 'ql-field';
    tolF.innerHTML = '<label for="primers-tpl-tol">' + t('primers.toleranceLabel') + '</label>';
    const tolIn = document.createElement('input');
    tolIn.type = 'number'; tolIn.id = 'primers-tpl-tol'; tolIn.className = 'tabular';
    tolIn.min = '0'; tolIn.max = '10'; tolIn.step = '1'; tolIn.value = String(s.templateTol);
    tolIn.addEventListener('change', () => {
      const v = parseInt(tolIn.value, 10);
      if (Number.isFinite(v) && v >= 0) { s.templateTol = v; paint(); }
    });
    tolF.appendChild(tolIn);
    tolF.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.toleranceHelp') + '</p>');
    ctrl.appendChild(tolF);
    ctrl.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:6px;">' + t('primers.alignmentLegend', { n: CRITICAL_3PRIME_ZONE }) + '</p>');
    grid.appendChild(ctrl);
    container.appendChild(grid);

    // ---- resultados por secuencia de la plantilla ----
    const records = parseFasta(s.templateText);
    const resultsCard = document.createElement('section');
    resultsCard.className = 'ql-card ql-panel';
    resultsCard.style.marginTop = '20px';

    if (!s.templateText.trim()) {
      resultsCard.innerHTML = '<div class="ql-empty"><h3>' + t('primers.templateEmptyTitle') + '</h3><p>' + t('primers.templateEmptyNote') + '</p></div>';
      container.appendChild(resultsCard);
      return;
    }
    if (!records.length) {
      resultsCard.innerHTML = '<p class="ql-field-help">' + t('primers.templateNoRecords') + '</p>';
      container.appendChild(resultsCard);
      return;
    }
    if (!valid.length) {
      resultsCard.innerHTML = '<p class="ql-field-help">' + t('primers.dimersEmpty') + '</p>';
      container.appendChild(resultsCard);
      return;
    }

    resultsCard.innerHTML = '<h2>' + t('primers.resultsTitle') + '</h2>';
    const primerA = valid.find((p) => p.id === s.templateA);
    const primerB = (s.templateB && s.templateB !== NONE) ? valid.find((p) => p.id === s.templateB) : null;

    records.forEach((rec) => {
      const det = document.createElement('details');
      det.className = 'ql-fmt-card';
      det.style.marginTop = '10px';
      det.open = records.length <= 3;
      const summary = document.createElement('summary');
      summary.innerHTML = '<span class="ql-fmt-name mono">' + escapeHtml(t('primers.recordLabel', { id: rec.id, len: rec.seq.length })) + '</span>' +
        (rec.description ? '<span class="ql-fmt-see">' + escapeHtml(rec.description) + '</span>' : '');
      det.appendChild(summary);
      const body = document.createElement('div');
      body.className = 'ql-fmt-body';

      const hitsA = findPrimerSites(rec.seq, primerA.seq, { maxMismatches: s.templateTol });
      body.insertAdjacentHTML('beforeend', '<h3 style="margin-top:0;">' + t('primers.hitsTitle') + ' — ' + escapeHtml(primerA.label) + '</h3>');
      body.insertAdjacentHTML('beforeend', renderHitsTable(primerA.seq, hitsA));

      if (primerB) {
        const hitsB = findPrimerSites(rec.seq, primerB.seq, { maxMismatches: s.templateTol });
        body.insertAdjacentHTML('beforeend', '<h3>' + t('primers.hitsTitle') + ' — ' + escapeHtml(primerB.label) + '</h3>');
        body.insertAdjacentHTML('beforeend', renderHitsTable(primerB.seq, hitsB));

        const { amplicons } = findAmplicons(rec.seq, primerA.seq, primerB.seq, { maxMismatches: s.templateTol });
        body.insertAdjacentHTML('beforeend', '<h3>' + t('primers.ampliconTitle') + '</h3><p class="ql-field-help">' + t('primers.ampliconNote') + '</p>');
        if (!amplicons.length) {
          body.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.noAmplicon') + '</p>');
        } else {
          const list = document.createElement('ul');
          list.style.cssText = 'margin:0;padding-left:18px;';
          amplicons.forEach((am) => {
            const fLabel = am.forward.primer === 'A' ? primerA.label : primerB.label;
            const rLabel = am.reverse.primer === 'A' ? primerA.label : primerB.label;
            const li = document.createElement('li');
            li.innerHTML = t('primers.ampliconRow', { a: escapeHtml(fLabel), b: escapeHtml(rLabel), start: am.start + 1, end: am.end, size: am.size });
            list.appendChild(li);
          });
          body.appendChild(list);
        }
      }

      det.appendChild(body);
      resultsCard.appendChild(det);
    });
    container.appendChild(resultsCard);
  }

  function rankLabel(depth) {
    if (!depth) return t('primers.rankFull');
    return t('primers.rankDepth' + depth);
  }

  function renderCoverageTab() {
    const valid = derivePrimers().filter((p) => p.valid).map((p, i) => ({ ...p, label: primerLabel(p, i) }));

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    // ---- carga de la referencia + taxonomía opcional ----
    const loadCard = document.createElement('section');
    loadCard.className = 'ql-card ql-panel';
    loadCard.innerHTML = '<h2>' + t('primers.coverageTitle') + '</h2><p class="ql-panel-note">' + t('primers.coverageNote') + '</p>' +
      '<p class="ql-field-help" style="font-style:italic;">' + t('primers.coverageDisclaimer') + '</p>';

    const mkDropzone = (labelKey, subKey, onText) => {
      const dz = document.createElement('div');
      dz.className = 'ql-dropzone';
      dz.tabIndex = 0;
      dz.setAttribute('role', 'button');
      dz.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
        '<div><div class="ql-dz-text"><b>' + t(labelKey) + '</b></div><div class="ql-dz-sub">' + t(subKey) + '</div></div>';
      const input = document.createElement('input');
      input.type = 'file';
      dz.appendChild(input);
      const apply = async (file) => { if (file) { onText(await file.text()); paint(); } };
      dz.addEventListener('click', () => input.click());
      dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drag'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('is-drag'); apply(e.dataTransfer.files[0]); });
      input.addEventListener('change', () => apply(input.files[0]));
      return dz;
    };

    loadCard.appendChild(mkDropzone('primers.covRefDropLabel', 'primers.templateDropSub', (txt) => { s.covRefText = txt; }));

    const taxDz = mkDropzone('primers.covTaxDropLabel', 'primers.covTaxDropSub', (txt) => { s.covTaxText = txt; });
    taxDz.style.marginTop = '10px';
    loadCard.appendChild(taxDz);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;';
    const exBtn = document.createElement('button');
    exBtn.type = 'button'; exBtn.className = 'ql-btn';
    exBtn.textContent = t('primers.covLoadExample');
    exBtn.addEventListener('click', async () => {
      exBtn.disabled = true;
      try {
        const [refRes, taxRes] = await Promise.all([fetch(EXAMPLE_REF_FASTA_URL), fetch(EXAMPLE_TAX_URL)]);
        s.covRefText = await refRes.text();
        s.covTaxText = await taxRes.text();
      } catch (e) { /* si falla, no se cambia nada */ }
      exBtn.disabled = false;
      paint();
    });
    btnRow.appendChild(exBtn);
    if (s.covRefText || s.covTaxText) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button'; clearBtn.className = 'ql-btn';
      clearBtn.textContent = t('primers.templateClear');
      clearBtn.addEventListener('click', () => { s.covRefText = ''; s.covTaxText = ''; paint(); });
      btnRow.appendChild(clearBtn);
    }
    loadCard.appendChild(btnRow);
    grid.appendChild(loadCard);

    // ---- controles ----
    const ctrl = document.createElement('aside');
    ctrl.className = 'ql-card ql-panel';
    ctrl.innerHTML = '<h2>' + t('ui.controls') + '</h2>';
    if (!valid.length) {
      ctrl.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.dimersEmpty') + '</p>');
    } else {
      if (!s.covA || !valid.some((p) => p.id === s.covA)) s.covA = valid[0].id;
      if (!s.covB) s.covB = valid.length > 1 && valid[1].id !== s.covA ? valid[1].id : NONE;
      else if (s.covB !== NONE && !valid.some((p) => p.id === s.covB)) s.covB = NONE;
      const mkSelect = (labelKey, value, onChange, allowNone) => {
        const f = document.createElement('div');
        f.className = 'ql-field';
        const selId = 'primers-cov-' + labelKey.replace(/\W/g, '');
        f.innerHTML = '<label for="' + selId + '">' + t(labelKey) + '</label>';
        const sel = document.createElement('select');
        sel.id = selId;
        if (allowNone) sel.insertAdjacentHTML('beforeend', '<option value="' + NONE + '"' + (value === NONE ? ' selected' : '') + '>' + t('primers.noneOption') + '</option>');
        valid.forEach((p) => sel.insertAdjacentHTML('beforeend', '<option value="' + p.id + '"' + (p.id === value ? ' selected' : '') + '>' + escapeHtml(p.label) + '</option>'));
        sel.addEventListener('change', () => { onChange(sel.value); paint(); });
        f.appendChild(sel);
        return f;
      };
      ctrl.appendChild(mkSelect('primers.primerASelect', s.covA, (v) => { s.covA = v; }, false));
      ctrl.appendChild(mkSelect('primers.primerBSelect', s.covB, (v) => { s.covB = v; }, true));
    }
    const tolF = document.createElement('div');
    tolF.className = 'ql-field';
    tolF.innerHTML = '<label for="primers-cov-tol">' + t('primers.toleranceLabel') + '</label>';
    const tolIn = document.createElement('input');
    tolIn.type = 'number'; tolIn.id = 'primers-cov-tol'; tolIn.className = 'tabular';
    tolIn.min = '0'; tolIn.max = '10'; tolIn.step = '1'; tolIn.value = String(s.covTol);
    tolIn.addEventListener('change', () => {
      const v = parseInt(tolIn.value, 10);
      if (Number.isFinite(v) && v >= 0) { s.covTol = v; paint(); }
    });
    tolF.appendChild(tolIn);
    tolF.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.toleranceHelp') + '</p>');
    ctrl.appendChild(tolF);

    if (s.covTaxText.trim()) {
      const rankF = document.createElement('div');
      rankF.className = 'ql-field';
      rankF.innerHTML = '<label for="primers-cov-rank">' + t('primers.rankLabel') + '</label>';
      const rankSel = document.createElement('select');
      rankSel.id = 'primers-cov-rank';
      RANK_DEPTHS.forEach((d, i) => rankSel.insertAdjacentHTML('beforeend', '<option value="' + i + '"' + (i === s.covRankIdx ? ' selected' : '') + '>' + rankLabel(d) + '</option>'));
      rankSel.addEventListener('change', () => { s.covRankIdx = parseInt(rankSel.value, 10); paint(); });
      rankF.appendChild(rankSel);
      ctrl.appendChild(rankF);
    }
    grid.appendChild(ctrl);
    container.appendChild(grid);

    // ---- resultados ----
    const resultsCard = document.createElement('section');
    resultsCard.className = 'ql-card ql-panel';
    resultsCard.style.marginTop = '20px';

    if (!s.covRefText.trim()) {
      resultsCard.innerHTML = '<div class="ql-empty"><h3>' + t('primers.covEmptyTitle') + '</h3><p>' + t('primers.covEmptyNote') + '</p></div>';
      container.appendChild(resultsCard);
      return;
    }
    const refs = parseFasta(s.covRefText);
    if (!refs.length) {
      resultsCard.innerHTML = '<p class="ql-field-help">' + t('primers.templateNoRecords') + '</p>';
      container.appendChild(resultsCard);
      return;
    }
    if (!valid.length) {
      resultsCard.innerHTML = '<p class="ql-field-help">' + t('primers.dimersEmpty') + '</p>';
      container.appendChild(resultsCard);
      return;
    }

    const primerA = valid.find((p) => p.id === s.covA);
    const primerB = (s.covB && s.covB !== NONE) ? valid.find((p) => p.id === s.covB) : null;
    const query = primerB ? { forward: primerA.seq, reverse: primerB.seq } : primerA.seq;
    const cov = computeCoverage(refs, query, { maxMismatches: s.covTol });

    resultsCard.innerHTML = '<h2>' + t('primers.covResultsTitle', {
      label: primerB ? (primerA.label + ' + ' + primerB.label) : primerA.label,
    }) + '</h2>';

    const stats = document.createElement('div');
    stats.className = 'ql-stats';
    [
      [t('primers.covStatTotal'), String(cov.total)],
      [t('primers.covStatCovered'), String(cov.covered)],
      [t('primers.covStatPct'), fmt1(cov.pct) + '%'],
    ].forEach(([lbl, val]) => {
      const tile = document.createElement('div');
      tile.className = 'ql-stat';
      tile.innerHTML = '<div class="ql-stat-label">' + lbl + '</div><div class="ql-stat-value" style="font-size:20px;">' + val + '</div>';
      stats.appendChild(tile);
    });
    resultsCard.appendChild(stats);

    if (cov.uncovered.length) {
      resultsCard.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:10px;">' +
        t('primers.covUncoveredList', { n: cov.uncovered.length }) + ' ' +
        cov.uncovered.slice(0, 40).map((id) => '<span class="mono">' + escapeHtml(id) + '</span>').join(', ') +
        (cov.uncovered.length > 40 ? '…' : '') + '</p>');
    }

    // ---- agrupado por taxón, si hay taxonomía ----
    const taxText = s.covTaxText.trim();
    if (taxText) {
      const { headers, rows } = parseTable(taxText);
      const { map: taxMap, idCol, taxCol } = buildTaxonomyMap(headers, rows);
      if (!idCol || !taxCol) {
        resultsCard.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:12px;color:var(--warning);">' + t('primers.covTaxNotRecognised') + '</p>');
      } else {
        const grouped = groupCoverageByTaxon(cov, taxMap, RANK_DEPTHS[s.covRankIdx]);
        const scroll = document.createElement('div');
        scroll.className = 'ql-table-scroll scroll-x';
        scroll.style.marginTop = '14px';
        const tbl = document.createElement('table');
        tbl.className = 'ql-table';
        tbl.innerHTML = '<thead><tr>' +
          ['primers.covColTaxon', 'primers.covStatTotal', 'primers.covStatCovered', 'primers.covStatPct']
            .map((k) => '<th>' + t(k) + '</th>').join('') + '</tr></thead>';
        const tb = document.createElement('tbody');
        grouped.forEach((g) => {
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td class="mono" style="font-size:12px;">' + escapeHtml(g.label) + '</td>' +
            '<td class="ql-num tabular">' + g.total + '</td>' +
            '<td class="ql-num tabular">' + g.covered + '</td>' +
            '<td class="ql-num tabular">' + fmt1(g.pct) + '%</td>';
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        scroll.appendChild(tbl);
        const groupCard = document.createElement('div');
        groupCard.style.marginTop = '18px';
        groupCard.innerHTML = '<h3>' + t('primers.covByTaxonTitle') + '</h3>';
        groupCard.appendChild(scroll);
        resultsCard.appendChild(groupCard);
      }
    }

    container.appendChild(resultsCard);
  }

  function classifyDeltaTm(dTm) {
    if (!Number.isFinite(dTm)) return 'ok';
    if (dTm > 5) return 'crit';
    if (dTm > 3) return 'warn';
    return 'ok';
  }

  // peor caso entre auto-dímero de A, de B, hetero-dímero A×B y horquilla de
  // A o de B — un solo badge para la tabla de lote (el detalle completo está
  // en la pestaña "Dímeros / horquillas").
  function worstDimerFor(pA, pB) {
    const candidates = [
      { kind: 'primers.batchDimerSelfA', cand: scanDimer(pA.seq, pA.seq), classify: classifyDimer },
      { kind: 'primers.batchDimerSelfB', cand: scanDimer(pB.seq, pB.seq), classify: classifyDimer },
      { kind: 'primers.batchDimerHetero', cand: scanDimer(pA.seq, pB.seq), classify: classifyDimer },
      { kind: 'primers.batchHairpinA', cand: scanHairpin(pA.seq), classify: classifyHairpin },
      { kind: 'primers.batchHairpinB', cand: scanHairpin(pB.seq), classify: classifyHairpin },
    ];
    const order = { ok: 0, warn: 1, crit: 2 };
    let worst = null;
    candidates.forEach((c) => {
      const level = c.classify(c.cand);
      if (!worst || order[level] > order[worst.level]) worst = { ...c, level };
    });
    return worst;
  }

  function renderBatchTab() {
    const valid = derivePrimers().filter((p) => p.valid).map((p, i) => ({ ...p, label: primerLabel(p, i) }));

    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';
    card.innerHTML = '<h2>' + t('primers.batchTitle') + '</h2><p class="ql-panel-note">' + t('primers.batchNote') + '</p>';

    if (valid.length < 2) {
      card.insertAdjacentHTML('beforeend', '<div class="ql-empty"><h3>' + t('primers.emptyTitle') + '</h3><p>' + t('primers.batchEmpty') + '</p></div>');
      container.appendChild(card);
      return;
    }

    const scroll = document.createElement('div');
    scroll.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr>' +
      ['primers.colPairLabel', 'primers.colPairA', 'primers.colPairB', 'primers.colDeltaTm', 'primers.colDimers', 'primers.colCoverage', '']
        .map((k) => '<th>' + (k ? t(k) : '') + '</th>').join('') + '</tr></thead>';
    const tb = document.createElement('tbody');

    const refs = s.covRefText.trim() ? parseFasta(s.covRefText) : [];

    s.batchPairs.forEach((bp, i) => {
      if (!bp.a || !valid.some((p) => p.id === bp.a)) bp.a = valid[0].id;
      if (!bp.b || !valid.some((p) => p.id === bp.b)) bp.b = valid.find((p) => p.id !== bp.a)?.id || valid[0].id;
      const pA = valid.find((p) => p.id === bp.a);
      const pB = valid.find((p) => p.id === bp.b);
      const tmA = meltingTemp(pA.seq, { Na: s.salt, dnac1: s.conc, dnac2: 0 });
      const tmB = meltingTemp(pB.seq, { Na: s.salt, dnac1: s.conc, dnac2: 0 });
      const dTm = Math.abs(tmA.tm - tmB.tm);
      const dTmLevel = classifyDeltaTm(dTm);
      const worst = worstDimerFor(pA, pB);

      let cov = null;
      if (refs.length) cov = computeCoverage(refs, { forward: pA.seq, reverse: pB.seq }, { maxMismatches: s.covTol });

      const tr = document.createElement('tr');

      const tdLabel = document.createElement('td');
      const labelIn = document.createElement('input');
      labelIn.type = 'text'; labelIn.value = bp.label;
      labelIn.placeholder = t('primers.batchPairPh', { n: i + 1 });
      labelIn.setAttribute('aria-label', t('primers.colPairLabel') + ' — ' + t('primers.batchPairPh', { n: i + 1 }));
      labelIn.addEventListener('change', () => { bp.label = labelIn.value; save(s); });
      tdLabel.appendChild(labelIn);
      tr.appendChild(tdLabel);

      const mkPrimerSelect = (value, onChange) => {
        const sel = document.createElement('select');
        valid.forEach((p) => sel.insertAdjacentHTML('beforeend', '<option value="' + p.id + '"' + (p.id === value ? ' selected' : '') + '>' + escapeHtml(p.label) + '</option>'));
        sel.addEventListener('change', () => { onChange(sel.value); paint(); });
        return sel;
      };
      const tdA = document.createElement('td');
      tdA.appendChild(mkPrimerSelect(bp.a, (v) => { bp.a = v; }));
      tdA.insertAdjacentHTML('beforeend', '<div class="ql-field-help" style="margin-top:2px;">Tm ' + (tmA.isDegenerate ? fmt1(tmA.min) + '–' + fmt1(tmA.max) : fmt1(tmA.tm)) + ' °C</div>');
      tr.appendChild(tdA);

      const tdB = document.createElement('td');
      tdB.appendChild(mkPrimerSelect(bp.b, (v) => { bp.b = v; }));
      tdB.insertAdjacentHTML('beforeend', '<div class="ql-field-help" style="margin-top:2px;">Tm ' + (tmB.isDegenerate ? fmt1(tmB.min) + '–' + fmt1(tmB.max) : fmt1(tmB.tm)) + ' °C</div>');
      tr.appendChild(tdB);

      const tdDTm = document.createElement('td');
      tdDTm.className = 'ql-num tabular';
      tdDTm.innerHTML = fmt1(dTm) + ' °C ' + riskBadge(dTmLevel);
      tr.appendChild(tdDTm);

      const tdDimer = document.createElement('td');
      tdDimer.innerHTML = riskBadge(worst.level);
      tdDimer.title = t(worst.kind);
      tr.appendChild(tdDimer);

      const tdCov = document.createElement('td');
      tdCov.className = 'ql-num tabular';
      tdCov.innerHTML = cov ? fmt1(cov.pct) + '% (' + cov.covered + '/' + cov.total + ')' : '<span class="ql-cell-muted" title="' + escapeHtml(t('primers.batchNoRef')) + '">—</span>';
      tr.appendChild(tdCov);

      const tdRm = document.createElement('td');
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'ql-cmp-rm'; rm.textContent = '✕';
      rm.title = t('ui.remove');
      rm.setAttribute('aria-label', t('ui.remove') + ' — ' + (bp.label || t('primers.batchPairPh', { n: i + 1 })));
      rm.addEventListener('click', () => { s.batchPairs.splice(i, 1); paint(); });
      tdRm.appendChild(rm);
      tr.appendChild(tdRm);

      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    scroll.appendChild(tbl);
    card.appendChild(scroll);

    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'ql-btn'; addBtn.style.marginTop = '12px';
    addBtn.textContent = t('primers.batchAddPair');
    addBtn.addEventListener('click', () => {
      const a = valid[s.batchPairs.length % valid.length]?.id || valid[0].id;
      const b = valid[(s.batchPairs.length + 1) % valid.length]?.id || valid[0].id;
      s.batchPairs.push({ id: 'bp' + nextBatchIdNum++, label: '', a, b });
      paint();
    });
    card.appendChild(addBtn);

    card.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:12px;">' + t('primers.batchDeltaTmGuideline') + '</p>');
    if (!refs.length) card.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.batchNoRefGlobal') + '</p>');
    container.appendChild(card);
  }

  function renderPrimersTab() {
    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    // ---- entrada de primers ----
    const entryCard = document.createElement('section');
    entryCard.className = 'ql-card ql-panel';
    entryCard.innerHTML = '<h2>' + t('primers.entryTitle') + '</h2><p class="ql-panel-note">' + t('primers.entryNote') + '</p>';

    const scroll = document.createElement('div');
    scroll.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr><th>' + t('primers.colName') + '</th><th>' + t('primers.colSeq') + '</th><th></th></tr></thead>';
    const tb = document.createElement('tbody');
    s.primers.forEach((p, i) => {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      const nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.value = p.name;
      nameIn.placeholder = t('primers.namePh', { n: i + 1 });
      nameIn.setAttribute('aria-label', t('primers.colName') + ' — ' + t('primers.rowN', { n: i + 1 }));
      nameIn.addEventListener('change', () => { p.name = nameIn.value; save(s); });
      tdName.appendChild(nameIn);
      tr.appendChild(tdName);

      const tdSeq = document.createElement('td');
      const seqIn = document.createElement('input');
      seqIn.type = 'text';
      seqIn.className = 'mono';
      seqIn.value = p.raw;
      seqIn.placeholder = t('primers.seqPh');
      seqIn.spellcheck = false;
      seqIn.autocomplete = 'off';
      seqIn.setAttribute('aria-label', t('primers.colSeq') + ' — ' + t('primers.rowN', { n: i + 1 }));
      seqIn.addEventListener('change', () => { p.raw = seqIn.value; paint(); });
      tdSeq.appendChild(seqIn);
      const { invalid } = cleanPrimerSeq(p.raw);
      if (invalid.length) {
        tdSeq.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="color:var(--critical);margin-top:4px;">' +
          t('primers.invalidChars', { chars: escapeHtml(invalid.join(' ')) }) + '</p>');
      }
      tr.appendChild(tdSeq);

      const tdRm = document.createElement('td');
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'ql-cmp-rm'; rm.textContent = '✕';
      rm.title = t('ui.remove');
      rm.setAttribute('aria-label', t('ui.remove') + ' — ' + t('primers.rowN', { n: i + 1 }));
      rm.disabled = s.primers.length <= 1;
      rm.addEventListener('click', () => { s.primers.splice(i, 1); paint(); });
      tdRm.appendChild(rm);
      tr.appendChild(tdRm);

      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    scroll.appendChild(tbl);
    entryCard.appendChild(scroll);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;';
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'ql-btn';
    addBtn.textContent = t('primers.addPrimer');
    addBtn.addEventListener('click', () => { addPrimer(); paint(); });
    btnRow.appendChild(addBtn);

    const exBtn = document.createElement('button');
    exBtn.type = 'button'; exBtn.className = 'ql-btn';
    exBtn.textContent = t('primers.loadExample');
    exBtn.addEventListener('click', () => {
      s.primers = [
        { id: 'pr' + nextIdNum++, name: '515F', raw: 'GTGYCAGCMGCCGCGGTAA' },
        { id: 'pr' + nextIdNum++, name: '806R', raw: 'GGACTACNVGGGTWTCTAAT' },
      ];
      paint();
    });
    btnRow.appendChild(exBtn);
    entryCard.appendChild(btnRow);

    // pegado en lote: "nombre<TAB o coma o 2+ espacios>secuencia" por línea
    const bulkField = document.createElement('div');
    bulkField.className = 'ql-field';
    bulkField.style.marginTop = '16px';
    bulkField.innerHTML = '<label for="primers-bulk">' + t('primers.bulkLabel') + '</label>';
    const bulkTa = document.createElement('textarea');
    bulkTa.id = 'primers-bulk';
    bulkTa.rows = 3;
    bulkTa.className = 'mono';
    bulkTa.placeholder = t('primers.bulkPh');
    bulkField.appendChild(bulkTa);
    const bulkBtn = document.createElement('button');
    bulkBtn.type = 'button'; bulkBtn.className = 'ql-btn'; bulkBtn.style.marginTop = '8px';
    bulkBtn.textContent = t('primers.bulkAdd');
    bulkBtn.addEventListener('click', () => {
      const lines = bulkTa.value.split('\n').map((l) => l.trim()).filter(Boolean);
      lines.forEach((line) => {
        const parts = line.split(/\t|,|\s{2,}/).map((x) => x.trim()).filter(Boolean);
        if (parts.length >= 2) addPrimer(parts[0], parts.slice(1).join(''));
        else if (parts.length === 1) addPrimer(t('primers.namePh', { n: s.primers.length + 1 }), parts[0]);
      });
      if (lines.length) { bulkTa.value = ''; paint(); }
    });
    bulkField.appendChild(bulkBtn);
    entryCard.appendChild(bulkField);
    grid.appendChild(entryCard);

    // ---- controles: sal y concentración de primer (Tm) ----
    const ctrl = document.createElement('aside');
    ctrl.className = 'ql-card ql-panel';
    ctrl.innerHTML = '<h2>' + t('primers.controlsTitle') + '</h2>';

    const saltF = document.createElement('div');
    saltF.className = 'ql-field';
    saltF.innerHTML = '<label for="primers-salt">' + t('primers.saltLabel') + '</label>';
    const saltIn = document.createElement('input');
    saltIn.type = 'number'; saltIn.id = 'primers-salt'; saltIn.className = 'tabular';
    saltIn.min = '1'; saltIn.step = '1'; saltIn.value = String(s.salt);
    saltIn.addEventListener('change', () => {
      const v = parseFloat(saltIn.value);
      if (Number.isFinite(v) && v > 0) { s.salt = v; paint(); }
    });
    saltF.appendChild(saltIn);
    saltF.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.saltHelp') + '</p>');
    ctrl.appendChild(saltF);

    const concF = document.createElement('div');
    concF.className = 'ql-field';
    concF.innerHTML = '<label for="primers-conc">' + t('primers.concLabel') + '</label>';
    const concIn = document.createElement('input');
    concIn.type = 'number'; concIn.id = 'primers-conc'; concIn.className = 'tabular';
    concIn.min = '1'; concIn.step = '10'; concIn.value = String(s.conc);
    concIn.addEventListener('change', () => {
      const v = parseFloat(concIn.value);
      if (Number.isFinite(v) && v > 0) { s.conc = v; paint(); }
    });
    concF.appendChild(concIn);
    concF.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('primers.concHelp') + '</p>');
    ctrl.appendChild(concF);

    ctrl.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:6px;font-style:italic;">' + t('primers.tmMethodNote') + '</p>');
    grid.appendChild(ctrl);
    container.appendChild(grid);

    // ---- tabla de estadísticas por primer ----
    const derived = derivePrimers().filter((p) => p.raw.trim() !== '');
    const statsCard = document.createElement('section');
    statsCard.className = 'ql-card ql-panel';
    statsCard.style.marginTop = '20px';
    statsCard.innerHTML = '<h2>' + t('primers.statsTitle') + '</h2>';

    if (!derived.length) {
      statsCard.insertAdjacentHTML('beforeend', '<div class="ql-empty"><h3>' + t('primers.emptyTitle') + '</h3><p>' + t('primers.emptyNote') + '</p></div>');
      container.appendChild(statsCard);
      return;
    }

    const sScroll = document.createElement('div');
    sScroll.className = 'ql-table-scroll scroll-x';
    const sTbl = document.createElement('table');
    sTbl.className = 'ql-table';
    sTbl.innerHTML = '<thead><tr>' +
      ['primers.colName', 'primers.colSeq', 'primers.colLength', 'primers.colComposition', 'primers.colGC', 'primers.colClamp', 'primers.colTm', 'primers.colMW', 'primers.colExt']
        .map((k) => '<th>' + t(k) + '</th>').join('') + '</tr></thead>';
    const sTb = document.createElement('tbody');
    derived.forEach((p, i) => {
      const tr = document.createElement('tr');
      if (!p.valid) {
        tr.innerHTML = '<td>' + escapeHtml(p.name || t('primers.namePh', { n: i + 1 })) + '</td>' +
          '<td class="mono">' + escapeHtml(p.raw) + '</td>' +
          '<td colspan="7"><span class="ql-cell-muted">' +
          (p.invalid.length ? t('primers.invalidChars', { chars: escapeHtml(p.invalid.join(' ')) }) : t('primers.tooShort', { n: MIN_PRIMER_LEN })) +
          '</span></td>';
        sTb.appendChild(tr);
        return;
      }
      const comp = baseComposition(p.seq);
      const gc = gcPercent(p.seq);
      const clamp = gcClamp(p.seq);
      const tm = meltingTemp(p.seq, { Na: s.salt, dnac1: s.conc, dnac2: 0 });
      const mw = molecularWeight(p.seq);
      const ext = extinctionCoefficient(p.seq);

      const compStr = 'A' + comp.counts.A + ' T' + comp.counts.T + ' C' + comp.counts.C + ' G' + comp.counts.G +
        (Object.keys(comp.degenerate).length ? ' · ' + Object.entries(comp.degenerate).map(([k, v]) => k + v).join(' ') : '');

      const clampBadge = clamp.status === 'ok'
        ? '<span class="ql-badge ql-badge-good">' + t('primers.clampOk') + '</span>'
        : clamp.status === 'partial'
          ? '<span class="ql-badge ql-badge-warn">' + t('primers.clampPartial', { pct: Math.round(clamp.gcFraction * 100) }) + '</span>'
          : '<span class="ql-badge ql-badge-warn">' + t('primers.clampWarn') + '</span>';

      const tmStr = tm.isDegenerate
        ? '<span title="' + t('primers.tmRangeTitle', { n: tm.n, mean: fmt1(tm.mean) }) + '">' + fmt1(tm.min) + '–' + fmt1(tm.max) + ' °C</span>'
        : fmt1(tm.tm) + ' °C';

      tr.innerHTML =
        '<td>' + escapeHtml(p.name || t('primers.namePh', { n: i + 1 })) + '</td>' +
        '<td class="mono">' + highlightSeq(p.seq) + '</td>' +
        '<td class="ql-num tabular">' + p.seq.length + '</td>' +
        '<td class="mono" style="font-size:12px;">' + escapeHtml(compStr) + '</td>' +
        '<td class="ql-num tabular">' + fmt1(gc.pct) + '%' + (gc.isEstimate ? ' <span class="ql-cell-muted">≈</span>' : '') + '</td>' +
        '<td>' + clampBadge + '</td>' +
        '<td class="ql-num tabular">' + tmStr + '</td>' +
        '<td class="ql-num tabular">' + fmtN(mw.mw) + (mw.isEstimate ? ' <span class="ql-cell-muted">≈</span>' : '') + '</td>' +
        '<td class="ql-num tabular">' + fmtN(ext.ext260) + (ext.isEstimate ? ' <span class="ql-cell-muted">≈</span>' : '') + '</td>';
      sTb.appendChild(tr);
    });
    sTbl.appendChild(sTb);
    sScroll.appendChild(sTbl);
    statsCard.appendChild(sScroll);
    statsCard.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:10px;">' + t('primers.statsNote') + '</p>');
    container.appendChild(statsCard);
  }

  paint();
  return () => { save(s); };
}
