// Recuentos microbianos (placa: UFC/mL; NMP: NMP/mL). El laboratorio entrega
// el valor por réplica ya resuelto; este módulo solo agrupa las réplicas,
// promedia en log10 y pinta barras con barra de error (±SD por defecto, ±SE
// con un toggle — la etiqueta deja claro cuál se muestra).
//
// Entrada: state.microbialCounts — un array de "series", una por organismo.
// Cada serie trae la tabla ya parseada + un mapeo de columnas editable
// (agrupación / valor / dilución / ¿ya en log10?). Se pueden cargar varias
// series a la vez, de un archivo con varias columnas de valor o de varios
// archivos (botón "+ añadir"), igual que "Comparar varias" en diferencial.

import {
  state, subscribe, registerFile,
  addMicrobialCountSeries, updateMicrobialCountSeries, removeMicrobialCountSeries,
} from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { groupColor } from '../lib/groupBoxplot.js';
import { attachChartEditor } from '../lib/chartEditor.js';
import { ingestFile } from '../lib/ingest.js';
import { summariseCountSeries } from '../lib/countStats.js';
import {
  loadExampleMicrobialCountsPlate, loadExampleMicrobialCountsMPN, exampleDownloadBlock,
} from '../lib/exampleData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) : '—';
}

const NUM_RE = /^-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/;
function columnLooksNumeric(rows, header) {
  if (!rows.length) return false;
  const ok = rows.filter((r) => NUM_RE.test(String(r[header] ?? '').trim())).length;
  return ok >= Math.max(1, rows.length * 0.7);
}

export function render(container) {
  let activeId = null;
  let errBar = 'sd';               // 'sd' | 'se'
  let sort = { key: 'group', dir: 'asc' };
  let editor = null;

  async function addFromFile(file, msgEl) {
    let ing;
    try { ing = await ingestFile(file); }
    catch (e) { if (msgEl) msgEl.textContent = (e && e.message) || String(e); return; }
    const mc = ing.results.find((r) => r.kind === 'microbialCounts');
    if (!mc) {
      if (msgEl) msgEl.textContent = t('recuentos.notRecognised', { name: file.name }) +
        (ing.warnings && ing.warnings.length ? ' — ' + ing.warnings.join(' · ') : '');
      return;
    }
    const fileId = registerFile(file.name, file.size, t('recuentos.fileNote') + ' — ' + file.name);
    const base = file.name.replace(/\.[^.]+$/, '');
    const generic = /^(valor|value|count|counts|recuento|log|log10|dato|resultado)$/i;
    const cols = (mc.valueCols && mc.valueCols.length) ? mc.valueCols : [mc.valueCol];
    cols.forEach((vc, k) => {
      const raw = String(mc.headers[vc] || '').trim();
      const label = (!raw || generic.test(raw.replace(/[^a-z0-9]/gi, '')))
        ? (cols.length > 1 ? base + ' — ' + (raw || ('serie ' + (k + 1))) : base)
        : raw;
      addMicrobialCountSeries({
        label,
        sourceFileId: fileId,
        headers: mc.headers,
        rows: mc.rows,
        mapping: {
          groupCols: (mc.groupCols || []).slice(),
          valueCol: vc,
          dilutionCol: mc.dilutionCol != null ? mc.dilutionCol : null,
          alreadyLog: !!mc.alreadyLog,
        },
      });
    });
  }

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('recuentos.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('recuentos.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('recuentos.subtitle') + '</p>';
    container.appendChild(header);

    const series = Array.isArray(state.microbialCounts) ? state.microbialCounts : [];

    if (series.length === 0) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 20h16"/><rect x="5.5" y="11" width="3.6" height="9" rx="0.8"/><rect x="10.2" y="6" width="3.6" height="14" rx="0.8"/><rect x="14.9" y="9" width="3.6" height="11" rx="0.8"/><path d="M7.3 11V9M12 6V3.5M16.7 9V6.5"/></svg>' +
        '<h3>' + t('recuentos.emptyTitle') + '</h3><p>' + t('recuentos.emptyDesc') + '</p></div>';
      const host = card.querySelector('.ql-empty');
      const row = document.createElement('div');
      row.className = 'ql-example-btns';
      row.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:4px;';
      const msg = document.createElement('p');
      msg.className = 'ql-field-help';
      msg.style.cssText = 'width:100%;text-align:center;';
      [[t('recuentos.exPlate'), loadExampleMicrobialCountsPlate, 'ql-btn ql-btn-primary'],
        [t('recuentos.exMPN'), loadExampleMicrobialCountsMPN, 'ql-btn']].forEach(([label, fn, cls]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.textContent = label;
        b.addEventListener('click', async () => {
          b.disabled = true; msg.textContent = '';
          try {
            const w = await fn();
            if (Array.isArray(w) && w.length) msg.textContent = w.join(' · ');
          } catch (e) { b.disabled = false; msg.textContent = String((e && e.message) || e); }
        });
        row.appendChild(b);
      });
      const load = document.createElement('a');
      load.href = '#/cargar'; load.className = 'ql-btn'; load.textContent = t('ui.goLoadData');
      row.appendChild(load);
      host.appendChild(row);
      host.appendChild(msg);
      host.appendChild(exampleDownloadBlock(['recuentosPlaca', 'recuentosNMP']));
      container.appendChild(card);
      return;
    }

    if (!activeId || !series.some((s) => s.id === activeId)) activeId = series[0].id;

    // ---- lista de series: etiqueta editable + mapeo de columnas + quitar + añadir ----
    renderSeriesManager(series);

    // ---- pestañas de organismo (una por serie) ----
    if (series.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'ql-tabs';
      series.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ql-tab' + (s.id === activeId ? ' is-active' : '');
        b.textContent = s.label || t('recuentos.unnamed');
        b.addEventListener('click', () => { if (activeId !== s.id) { activeId = s.id; paint(); } });
        tabs.appendChild(b);
      });
      container.appendChild(tabs);
    }

    const active = series.find((s) => s.id === activeId);
    renderChartAndTable(active);
  }

  // =========================================================================
  //  Gestor de series (mapeo de columnas)
  // =========================================================================
  function renderSeriesManager(series) {
    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';
    card.style.marginBottom = '20px';
    card.innerHTML = '<h2>' + t('recuentos.seriesTitle', { n: series.length }) + '</h2>' +
      '<p class="ql-panel-note">' + t('recuentos.seriesNote') + '</p>';

    series.forEach((s) => {
      const box = document.createElement('div');
      box.className = 'ql-mc-series';

      const top = document.createElement('div');
      top.className = 'ql-cmp-row';
      const lbl = document.createElement('input');
      lbl.type = 'text'; lbl.value = s.label || ''; lbl.className = 'ql-cmp-label';
      lbl.setAttribute('aria-label', t('recuentos.labelAria'));
      lbl.addEventListener('change', () => updateMicrobialCountSeries(s.id, { label: lbl.value.trim() || s.label }));
      top.appendChild(lbl);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'ql-cmp-rm'; rm.title = t('ui.remove');
      rm.setAttribute('aria-label', t('ui.remove')); rm.textContent = '✕';
      rm.addEventListener('click', () => { if (activeId === s.id) activeId = null; removeMicrobialCountSeries(s.id); });
      top.appendChild(rm);
      box.appendChild(top);

      // ---- mapeo: columna de valor / dilución / ¿ya en log10? ----
      const map = document.createElement('div');
      map.className = 'ql-mapping-grid';

      const valField = document.createElement('div');
      valField.className = 'ql-field';
      valField.innerHTML = '<label>' + t('recuentos.mapValue') + '</label>';
      const valSel = document.createElement('select');
      s.headers.forEach((h, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = (h || t('ui.columnN', { n: i + 1 })) + (columnLooksNumeric(s.rows, h) ? '' : ' ⚠');
        if (s.mapping.valueCol === i) o.selected = true;
        valSel.appendChild(o);
      });
      valSel.addEventListener('change', () => {
        const vc = parseInt(valSel.value, 10);
        const gc = (s.mapping.groupCols || []).filter((i) => i !== vc);
        updateMicrobialCountSeries(s.id, { mapping: { ...s.mapping, valueCol: vc, groupCols: gc } });
      });
      valField.appendChild(valSel);
      map.appendChild(valField);

      const dilField = document.createElement('div');
      dilField.className = 'ql-field';
      dilField.innerHTML = '<label>' + t('recuentos.mapDilution') + '</label>';
      const dilSel = document.createElement('select');
      const none = document.createElement('option');
      none.value = '-1'; none.textContent = t('recuentos.dilNone');
      if (s.mapping.dilutionCol == null) none.selected = true;
      dilSel.appendChild(none);
      s.headers.forEach((h, i) => {
        const o = document.createElement('option');
        o.value = String(i); o.textContent = h || t('ui.columnN', { n: i + 1 });
        if (s.mapping.dilutionCol === i) o.selected = true;
        dilSel.appendChild(o);
      });
      dilSel.addEventListener('change', () => {
        const dc = parseInt(dilSel.value, 10);
        updateMicrobialCountSeries(s.id, { mapping: { ...s.mapping, dilutionCol: dc < 0 ? null : dc } });
      });
      dilField.appendChild(dilSel);
      dilField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('recuentos.dilHelp') + '</p>');
      map.appendChild(dilField);

      const logField = document.createElement('div');
      logField.className = 'ql-field';
      logField.innerHTML = '<label>' + t('recuentos.mapScale') + '</label>';
      const logRow = document.createElement('label');
      logRow.className = 'ql-checkrow';
      const logCb = document.createElement('input');
      logCb.type = 'checkbox'; logCb.checked = !!s.mapping.alreadyLog;
      logCb.addEventListener('change', () => updateMicrobialCountSeries(s.id, { mapping: { ...s.mapping, alreadyLog: logCb.checked } }));
      logRow.appendChild(logCb);
      logRow.appendChild(document.createTextNode(' ' + t('recuentos.alreadyLog')));
      logField.appendChild(logRow);
      logField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('recuentos.scaleHelp') + '</p>');
      map.appendChild(logField);

      box.appendChild(map);

      // ---- columnas de agrupación (varias) ----
      const gWrap = document.createElement('div');
      gWrap.className = 'ql-field';
      gWrap.innerHTML = '<label>' + t('recuentos.mapGroups') + '</label>' +
        '<p class="ql-field-help" style="margin-top:0;">' + t('recuentos.groupsHelp') + '</p>';
      const gcSet = new Set(s.mapping.groupCols || []);
      s.headers.forEach((h, i) => {
        if (i === s.mapping.valueCol || i === s.mapping.dilutionCol) return;
        const row = document.createElement('label');
        row.className = 'ql-checkrow';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = gcSet.has(i);
        cb.addEventListener('change', () => {
          const next = new Set(s.mapping.groupCols || []);
          if (cb.checked) next.add(i); else next.delete(i);
          updateMicrobialCountSeries(s.id, { mapping: { ...s.mapping, groupCols: [...next].sort((a, b) => a - b) } });
        });
        row.appendChild(cb);
        row.appendChild(document.createTextNode(' ' + (h || t('ui.columnN', { n: i + 1 }))));
        gWrap.appendChild(row);
      });
      box.appendChild(gWrap);

      card.appendChild(box);
    });

    // ---- barra de acciones: añadir archivo / cargar ejemplo ----
    const bar = document.createElement('div');
    bar.className = 'ql-session-bar';
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'ql-btn'; addBtn.textContent = t('recuentos.add');
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.csv,.tsv,.txt'; fileInput.style.display = 'none';
    fileInput.setAttribute('aria-hidden', 'true'); fileInput.tabIndex = -1;
    const msg = document.createElement('p');
    msg.className = 'ql-field-help';
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      addBtn.disabled = true; msg.textContent = '';
      await addFromFile(f, msg);
      addBtn.disabled = false;
    });
    bar.append(addBtn, fileInput);
    card.appendChild(bar);
    card.appendChild(msg);

    container.appendChild(card);
  }

  // =========================================================================
  //  Gráfico + tabla de una serie
  // =========================================================================
  function renderChartAndTable(s) {
    const summary = summariseCountSeries(s);
    const usable = summary.groups.filter((g) => g.n > 0);

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' +
      t('recuentos.chartNote', { bar: errBar === 'sd' ? t('recuentos.sd') : t('recuentos.se') }) + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap scroll-x';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('recuentos.a11yChart', { organism: s.label || '' }) });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg); chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    // toggle ±SD / ±SE
    const ebField = document.createElement('div');
    ebField.className = 'ql-field';
    ebField.innerHTML = '<label>' + t('recuentos.errBarLabel') + '</label>';
    const seg = document.createElement('div');
    seg.className = 'ql-segmented';
    [['sd', t('recuentos.sdFull')], ['se', t('recuentos.seFull')]].forEach(([v, lbl]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-seg-btn' + (errBar === v ? ' is-on' : '');
      b.textContent = lbl;
      b.addEventListener('click', () => { if (errBar !== v) { errBar = v; paint(); } });
      seg.appendChild(b);
    });
    ebField.appendChild(seg);
    ebField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('recuentos.errBarHelp') + '</p>');
    controls.appendChild(ebField);

    // resumen
    const statsBox = document.createElement('div');
    statsBox.style.marginTop = '16px';
    statsBox.innerHTML = '<div class="ql-stats">' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('recuentos.statGroups') + '</div><div class="ql-stat-value" style="font-size:20px;">' + usable.length + '</div></div>' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('recuentos.statReplicates') + '</div><div class="ql-stat-value" style="font-size:20px;">' + (summary.modeN || '—') + '</div></div>' +
      '</div>';
    controls.appendChild(statsBox);

    // aviso de réplicas desiguales
    if (summary.unevenN) {
      const w = document.createElement('p');
      w.className = 'ql-privacy';
      w.style.cssText = 'border-color:color-mix(in srgb, var(--warning) 45%, var(--border-strong));';
      w.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>' +
        t('recuentos.unevenWarn', {
          list: usable.filter((g) => g.n !== summary.modeN).map((g) => g.key + ' (n=' + g.n + ')').join(', '),
          mode: summary.modeN,
        });
      controls.appendChild(w);
    }
    // aviso de valores excluidos
    if (summary.excluded > 0) {
      const w = document.createElement('p');
      w.className = 'ql-field-help';
      w.textContent = t('recuentos.excludedWarn', { n: summary.excluded });
      controls.appendChild(w);
    }

    grid.appendChild(controls);
    container.appendChild(grid);

    // ---- tabla ----
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('recuentos.tableTitle') + '</h2>' +
      '<p class="ql-panel-note">' + t('recuentos.tableNote', { col: escapeHtml(summary.valueName || '') }) + '</p>';
    container.appendChild(tableCard);

    if (usable.length === 0) {
      chartPanel.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('recuentos.noGroups') + '</p>');
      return;
    }

    drawBars(svg, chartWrap, tooltip, chartPanel, s, summary, usable);
    renderTable(tableCard, summary, usable);
  }

  // ---- barras verticales + barra de error ----
  function drawBars(svg, chartWrap, tooltip, chartPanel, s, summary, groups) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const err = (g) => (errBar === 'sd' ? g.sd : g.se);
    const tops = groups.map((g) => g.meanLog + err(g));
    const bots = groups.map((g) => g.meanLog - err(g));
    let yMax = Math.max(...tops);
    let yMin = Math.min(...bots, ...groups.map((g) => g.meanLog));
    // eje truncado (práctica habitual con datos en log): margen y redondeo
    const span = (yMax - yMin) || 1;
    yMax = Math.ceil((yMax + span * 0.12) * 2) / 2;
    yMin = Math.max(0, Math.floor((yMin - span * 0.12) * 2) / 2);
    if (yMax - yMin < 0.5) yMax = yMin + 0.5;

    const n = groups.length;
    const slotW = Math.max(70, Math.min(150, 620 / n));
    const marginL = 60, marginR = 20, marginT = 40;
    const longestLabel = Math.max(...groups.map((g) => g.key.length));
    const rotate = n > 4 || longestLabel > 12;
    const marginB = rotate ? 60 + Math.min(120, longestLabel * 5.2) : 70;
    const innerH = 340;
    const W = Math.max(marginL + marginR + slotW * n, 380);
    const H = marginT + innerH + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = W > 640 ? W + 'px' : '';
    svg.style.maxWidth = W > 640 ? 'none' : '';

    const yScale = (v) => marginT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    // gridlines + ticks
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = yMin + (i / ticks) * (yMax - yMin);
      const y = yScale(v);
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
      const tk = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      tk.textContent = v.toFixed(2);
      svg.appendChild(tk);
    }
    svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + innerH, class: 'ql-baseline-line' }));
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: marginT + innerH, y2: marginT + innerH, class: 'ql-baseline-line' }));

    const barW = Math.min(54, slotW * 0.56);
    groups.forEach((g, gi) => {
      const cx = marginL + slotW * gi + slotW / 2;
      const col = groupColor(gi);
      const yTop = yScale(g.meanLog);
      const yBase = yScale(yMin);
      const rect = svgEl('rect', {
        x: cx - barW / 2, y: yTop, width: barW, height: Math.max(1, yBase - yTop),
        fill: col, 'fill-opacity': 0.22, stroke: col, 'stroke-width': 1.5, rx: 3,
      });
      rect.addEventListener('mouseenter', () => {
        const wr = chartWrap.getBoundingClientRect(), sr = svg.getBoundingClientRect();
        tooltip.style.left = ((sr.left - wr.left) + cx * (sr.width / W) + (chartWrap.scrollLeft || 0)) + 'px';
        tooltip.style.top = ((sr.top - wr.top) + yTop * (sr.height / H)) + 'px';
        tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(g.key) + '</div>' +
          '<div class="ql-tt-row">' + t('recuentos.ttMean') + ' = ' + fmt(g.meanLog, 3) + ' · n = ' + g.n + '</div>' +
          '<div class="ql-tt-row">SD = ' + fmt(g.sd, 3) + ' · SE = ' + fmt(g.se, 3) + '</div>';
        tooltip.classList.add('is-show');
      });
      rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
      svg.appendChild(rect);

      // barra de error (solo si n >= 2 → SD/SE definidos)
      const e = err(g);
      if (g.n >= 2 && e > 0) {
        const yHi = yScale(g.meanLog + e), yLo = yScale(Math.max(yMin, g.meanLog - e));
        svg.appendChild(svgEl('line', { x1: cx, x2: cx, y1: yHi, y2: yLo, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
        svg.appendChild(svgEl('line', { x1: cx - 7, x2: cx + 7, y1: yHi, y2: yHi, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
        svg.appendChild(svgEl('line', { x1: cx - 7, x2: cx + 7, y1: yLo, y2: yLo, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      }

      // etiqueta de grupo
      const ly = marginT + innerH + (rotate ? 14 : 20);
      const tx = svgEl('text', {
        x: cx, y: ly, class: 'ql-tick-label',
        'text-anchor': rotate ? 'end' : 'middle',
        transform: rotate ? 'rotate(-40 ' + cx + ' ' + ly + ')' : '',
      });
      tx.textContent = g.key.length > 28 ? g.key.slice(0, 27) + '…' : g.key;
      svg.appendChild(tx);
    });

    // título de eje Y
    const yT = svgEl('text', {
      x: 15, y: marginT + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle',
      transform: 'rotate(-90 15 ' + (marginT + innerH / 2) + ')', 'data-ce': 'ytitle',
    });
    yT.textContent = t('recuentos.yAxis', { unit: s.mapping.alreadyLog ? (summary.valueName || t('recuentos.value')) : ('log₁₀ ' + (summary.valueName || t('recuentos.value'))) });
    svg.appendChild(yT);

    const xLabelBase = marginT + innerH + marginB - 30;
    const xT = svgEl('text', { x: marginL + (W - marginL - marginR) / 2, y: xLabelBase, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
    xT.textContent = summary.groupColNames.join(' × ') || t('recuentos.group');
    svg.appendChild(xT);

    // leyenda: qué es la barra de error
    const legG = svgEl('g', { 'data-ce': 'legend' });
    legG.appendChild(svgEl('line', { x1: 0, x2: 0, y1: -6, y2: 6, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    legG.appendChild(svgEl('line', { x1: -5, x2: 5, y1: -6, y2: -6, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    legG.appendChild(svgEl('line', { x1: -5, x2: 5, y1: 6, y2: 6, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
    const lt = svgEl('text', { x: 12, y: 4, class: 'ql-tick-label' });
    lt.textContent = errBar === 'sd' ? t('recuentos.legendSd') : t('recuentos.legendSe');
    legG.appendChild(lt);
    legG.setAttribute('transform', 'translate(' + (marginL + 8) + ',' + (marginT - 20) + ')');
    svg.appendChild(legG);

    editor = attachChartEditor({
      key: 'microbialCounts', svg, mount: chartPanel,
      filename: t('recuentos.title') + '-' + (s.label || 'serie'), lang: getLang(),
      elements: [
        { id: 'title', create: { text: s.label || t('recuentos.title'), x: W / 2, y: 22, anchor: 'middle', cls: 'ce-title' } },
        { id: 'xtitle', selector: '[data-ce="xtitle"]' },
        { id: 'ytitle', selector: '[data-ce="ytitle"]' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      onReset: () => paint(),
    });
  }

  // ---- tabla alternativa (grupo, n, media log10, SD, SE) con aria-sort ----
  function renderTable(tableCard, summary, groups) {
    const cols = [
      ['group', t('recuentos.colGroup')],
      ['n', 'n'],
      ['mean', t('recuentos.colMean')],
      ['sd', 'SD'],
      ['se', 'SE'],
    ];
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    let thead = '<thead><tr>';
    cols.forEach(([key, lbl]) => {
      const on = sort.key === key;
      thead += '<th aria-sort="' + (on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" data-sort="' + key + '">' + escapeHtml(lbl) +
        (on ? ' <span aria-hidden="true">' + (sort.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</button></th>';
    });
    tbl.innerHTML = thead + '</tr></thead>';

    const rows = groups.map((g) => ({ group: g.key, n: g.n, mean: g.meanLog, sd: g.sd, se: g.se }));
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return ((x || 0) - (y || 0)) * dir;
    });
    const tb = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(r.group) + '</td>' +
        '<td class="ql-num tabular">' + r.n + '</td>' +
        '<td class="ql-num tabular">' + fmt(r.mean, 3) + '</td>' +
        '<td class="ql-num tabular">' + (r.n >= 2 ? fmt(r.sd, 3) : '—') + '</td>' +
        '<td class="ql-num tabular">' + (r.n >= 2 ? fmt(r.se, 3) : '—') + '</td>';
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);

    tbl.querySelectorAll('th button[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sort');
        if (sort.key === key) sort = { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
        else sort = { key, dir: key === 'group' ? 'asc' : 'desc' };
        paint();
      });
    });

    // descarga de ejemplos
    const dl = document.createElement('div');
    dl.style.marginTop = '16px';
    dl.appendChild(exampleDownloadBlock(['recuentosPlaca', 'recuentosNMP']));
    tableCard.appendChild(dl);
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
