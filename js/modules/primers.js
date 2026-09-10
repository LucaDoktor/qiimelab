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

const STORE_KEY = 'qiimelab.primers';
const MIN_PRIMER_LEN = 4;

// pestañas ya implementadas — se amplía en próximos commits (dímeros,
// plantilla, cobertura, lote). Con 1 sola pestaña no se muestra la barra.
const TABS = [
  { id: 'primers', labelKey: 'primers.tabPrimers' },
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

    renderPrimersTab();
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
