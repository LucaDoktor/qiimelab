import { state, subscribe } from '../state.js';
import { loadExampleCommunityData, loadRealCommunityData, mountExampleButtons } from '../lib/exampleData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CAT_VARS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7'];
const OTHER_VAR = '--cat-8';
const TOP_N = 7;

function shortTaxonName(fullTax) {
  const parts = fullTax.split(';').map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || fullTax;
  const cleaned = last.replace(/^[a-z]__/i, '');
  return cleaned || 'Sin clasificar';
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function emptyState(container, title, desc) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ql-empty';
  box.innerHTML =
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>' +
    '<h3>' + title + '</h3><p>' + desc + '</p>';
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';
  const goUpload = document.createElement('a');
  goUpload.href = '#/cargar';
  goUpload.className = 'ql-btn';
  goUpload.textContent = 'Ir a cargar datos';
  btnRow.appendChild(goUpload);
  box.appendChild(btnRow);
  mountExampleButtons(box, {
    real: loadRealCommunityData,
    synthetic: loadExampleCommunityData,
  });
  container.appendChild(box);
}

export function render(container) {
  let level = null;
  let sortByGroup = true;
  let groupCol = null;

  function paint() {
    container.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">Composición de la comunidad</p>' +
      '<h1 class="ql-page-title">Barplots taxonómicos</h1>' +
      '<p class="ql-page-sub">Abundancia relativa por muestra. Se muestran los ' + TOP_N + ' taxones más abundantes en promedio; el resto se agrupa en "Otros" — mostrar cada taxón individual (a menudo 30-40 colores) es el error más común en este tipo de gráfico.</p>';
    container.appendChild(header);

    if (!state.taxaBarplot) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      emptyState(
        card,
        'Todavía no hay una tabla de barplot cargada',
        'Sube el .qzv que genera "qiime taxa barplot" (se leen sus niveles automáticamente), o la tabla de un nivel exportada como .csv.'
      );
      container.appendChild(card);
      return;
    }

    const levels = Object.keys(state.taxaBarplot.levels).sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(b));
    if (level === null || !levels.includes(String(level))) level = levels[levels.length - 1];
    const table = state.taxaBarplot.levels[level];

    // detectar columna de grupo en metadatos, si hay
    let groupOptions = [];
    if (state.metadata) {
      groupOptions = state.metadata.headers.filter((h) => h !== state.metadata.sampleIdKey);
      if (!groupCol && groupOptions.length > 0) groupCol = groupOptions[0];
    }

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    // ---- panel principal: gráfico ----
    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<h2>Abundancia relativa por muestra</h2><p class="ql-panel-note">Pasa el cursor sobre un segmento para ver el detalle.</p>';

    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap scroll-x';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': 'Barplot taxonómico apilado' });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);

    const legend = document.createElement('div');
    legend.className = 'ql-legend';
    legend.style.marginTop = '14px';
    legend.style.paddingTop = '14px';
    legend.style.borderTop = '1px solid var(--border)';
    chartPanel.appendChild(legend);

    grid.appendChild(chartPanel);

    // ---- panel lateral: controles ----
    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>Controles</h2>';

    const levelField = document.createElement('div');
    levelField.className = 'ql-field';
    levelField.innerHTML = '<label>Nivel taxonómico</label>';
    const levelSelect = document.createElement('select');
    levels.forEach((lv) => {
      const opt = document.createElement('option');
      opt.value = lv;
      opt.textContent = 'Nivel ' + lv + (Number(lv) === 6 ? ' (género)' : Number(lv) === 2 ? ' (filo)' : '');
      if (String(level) === lv) opt.selected = true;
      levelSelect.appendChild(opt);
    });
    levelField.appendChild(levelSelect);
    controls.appendChild(levelField);

    if (groupOptions.length > 0) {
      const groupField = document.createElement('div');
      groupField.className = 'ql-field';
      groupField.innerHTML = '<label>Agrupar / ordenar por</label>';
      const groupSelect = document.createElement('select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = 'Sin agrupar (orden original)';
      groupSelect.appendChild(noneOpt);
      groupOptions.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        if (sortByGroup && groupCol === g) opt.selected = true;
        groupSelect.appendChild(opt);
      });
      if (!sortByGroup) noneOpt.selected = true;
      groupField.appendChild(groupSelect);
      controls.appendChild(groupField);
      groupSelect.addEventListener('change', () => {
        sortByGroup = groupSelect.value !== '';
        groupCol = groupSelect.value || groupCol;
        paint();
      });
    } else {
      const note = document.createElement('p');
      note.className = 'ql-field-help';
      note.textContent = 'Carga también los metadatos para poder agrupar las muestras por variable.';
      controls.appendChild(note);
    }

    const privacy = document.createElement('p');
    privacy.className = 'ql-privacy';
    privacy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg>Cálculo 100% local.';
    controls.appendChild(privacy);

    grid.appendChild(controls);
    container.appendChild(grid);

    levelSelect.addEventListener('change', () => { level = levelSelect.value; paint(); });

    // ---- tabla ----
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>Tabla de abundancia relativa</h2>';
    container.appendChild(tableCard);

    // ---- datos ----
    const sampleKey = table.headers[0];
    // una columna "Others"/"Otros"/"resto" que ya venga en el archivo (formato
    // TOP14 de QIIME2) se pliega SIEMPRE dentro de "Otros" — nunca se dibuja
    // como un taxón con su propio color.
    const OTHER_COL_RE = /^(others?|otros?|resto)$/i;
    const taxonHeaders = table.headers.filter((h, i) => i !== 0 && !OTHER_COL_RE.test(String(h).trim()));
    const preAggOtherHeaders = table.headers.filter((h, i) => i !== 0 && OTHER_COL_RE.test(String(h).trim()));

    // Cada fila se normaliza por su propia suma: así las barras suman 100%
    // tanto si el archivo trae conteos crudos, como porcentajes (0–100) o
    // fracciones (0–1). Es lo correcto para un barplot de abundancia RELATIVA.
    const rowSum = (row) =>
      taxonHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0) +
      preAggOtherHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0);
    const otherRaw = (row) =>
      otherTaxa.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0) +
      preAggOtherHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0);

    const means = taxonHeaders.map((h) => {
      const vals = table.rows.map((r) => { const t = rowSum(r); return t > 0 ? (parseFloat(r[h]) || 0) / t : 0; });
      return { header: h, mean: vals.reduce((a, b) => a + b, 0) / (vals.length || 1) };
    }).sort((a, b) => b.mean - a.mean);

    const topTaxa = means.slice(0, TOP_N).map((m) => m.header);
    const otherTaxa = means.slice(TOP_N).map((m) => m.header);

    let sampleOrder = table.rows.map((r) => r[sampleKey]);
    let groupBySample = {};
    if (state.metadata && groupCol) {
      const metaByKey = {};
      state.metadata.rows.forEach((r) => { metaByKey[r[state.metadata.sampleIdKey]] = r[groupCol]; });
      groupBySample = metaByKey;
      if (sortByGroup) {
        sampleOrder = sampleOrder.slice().sort((a, b) => {
          const ga = metaByKey[a] || '', gb = metaByKey[b] || '';
          return ga === gb ? String(a).localeCompare(String(b)) : String(ga).localeCompare(String(gb));
        });
      }
    }

    const rowsBySample = {};
    table.rows.forEach((r) => { rowsBySample[r[sampleKey]] = r; });

    const series = topTaxa.map((h, i) => ({ key: h, label: shortTaxonName(h), colorVar: CAT_VARS[i] }));
    const otherLabel = preAggOtherHeaders.length
      ? 'Otros (' + otherTaxa.length + ' taxones + resto ya agregado del archivo)'
      : 'Otros (' + otherTaxa.length + ' taxones)';
    series.push({ key: '__other__', label: otherLabel, colorVar: OTHER_VAR });

    // legend
    legend.innerHTML = series.map((s) =>
      '<span class="ql-legend-item"><span class="ql-legend-swatch ql-sq" style="background:var(' + s.colorVar + ')"></span>' + escapeHtml(s.label) + '</span>'
    ).join('');

    // chart
    const marginL = 46, marginR = 12, marginT = 12, marginB = 70;
    const slotW = Math.max(18, Math.min(46, 900 / Math.max(sampleOrder.length, 1)));
    const barW = Math.min(24, slotW * 0.7);
    const innerH = 380;
    const W = marginL + marginR + slotW * sampleOrder.length;
    const H = marginT + innerH + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = W + 'px'; // ancho real en px: si no caben todas las muestras, el contenedor hace scroll horizontal en vez de aplastar las barras
    svg.style.maxWidth = 'none';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // gridlines y-axis (0/25/50/75/100 %)
    [0, 0.25, 0.5, 0.75, 1].forEach((frac) => {
      const y = marginT + innerH - frac * innerH;
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
      const t = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      t.textContent = Math.round(frac * 100) + '%';
      svg.appendChild(t);
    });
    svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + innerH, class: 'ql-baseline-line' }));

    const gap = 2; // separador entre segmentos apilados
    sampleOrder.forEach((sampleId, si) => {
      const row = rowsBySample[sampleId];
      if (!row) return;
      const cx = marginL + si * slotW + slotW / 2;
      const total = rowSum(row) || 1;
      let cumulative = 0;
      series.forEach((s) => {
        let val;
        if (s.key === '__other__') {
          val = otherRaw(row) / total;
        } else {
          val = (parseFloat(row[s.key]) || 0) / total;
        }
        if (val <= 0) { return; }
        const yTop = marginT + innerH - (cumulative + val) * innerH;
        const yBot = marginT + innerH - cumulative * innerH;
        const h = Math.max(0, yBot - yTop - gap);
        const rect = svgEl('rect', {
          x: cx - barW / 2, y: yTop, width: barW, height: Math.max(h, 0),
          fill: 'var(' + s.colorVar + ')',
        });
        rect.addEventListener('mouseenter', () => showTooltip(sampleId, s.label, val, cx, yTop, chartWrap, svg, W, H, tooltip));
        rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
        svg.appendChild(rect);
        cumulative += val;
      });
    });

    // etiquetas eje X (rotadas si hay muchas muestras)
    const showEvery = sampleOrder.length > 24 ? Math.ceil(sampleOrder.length / 24) : 1;
    sampleOrder.forEach((sampleId, si) => {
      if (si % showEvery !== 0) return;
      const cx = marginL + si * slotW + slotW / 2;
      const t = svgEl('text', {
        x: cx, y: marginT + innerH + 16, class: 'ql-tick-label', 'text-anchor': 'end',
        transform: 'rotate(-55 ' + cx + ' ' + (marginT + innerH + 16) + ')',
      });
      t.textContent = sampleId;
      svg.appendChild(t);
    });

    const xTitle = svgEl('text', { x: marginL + (W - marginL - marginR) / 2, y: H - 4, class: 'ql-axis-label', 'text-anchor': 'middle' });
    xTitle.textContent = groupCol ? 'Muestras, agrupadas por ' + groupCol : 'Muestras';
    svg.appendChild(xTitle);

    // tabla
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th><button type="button">Muestra</button></th>' +
      (groupCol ? '<th><button type="button">' + escapeHtml(groupCol) + '</button></th>' : '') +
      series.map((s) => '<th><button type="button">' + escapeHtml(s.label) + '</button></th>').join('') + '</tr>';
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    sampleOrder.forEach((sampleId) => {
      const row = rowsBySample[sampleId];
      if (!row) return;
      const tr = document.createElement('tr');
      let cells = '<td>' + escapeHtml(sampleId) + '</td>';
      if (groupCol) cells += '<td>' + escapeHtml(groupBySample[sampleId] || '—') + '</td>';
      const total = rowSum(row) || 1;
      series.forEach((s) => {
        const val = (s.key === '__other__' ? otherRaw(row) : (parseFloat(row[s.key]) || 0)) / total;
        cells += '<td class="ql-num tabular">' + (val * 100).toFixed(1) + '%</td>';
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
  }

  function showTooltip(sampleId, taxonLabel, val, cx, cy, wrap, svgEl_, W, H, tooltipEl) {
    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = svgEl_.getBoundingClientRect();
    const scaleX = svgRect.width / W, scaleY = svgRect.height / H;
    const left = (svgRect.left - wrapRect.left) + cx * scaleX + wrap.scrollLeft;
    const top = (svgRect.top - wrapRect.top) + cy * scaleY;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.innerHTML = '<div class="ql-tt-name">' + escapeHtml(sampleId) + '</div>' +
      '<div class="ql-tt-row">' + escapeHtml(taxonLabel) + ' · ' + (val * 100).toFixed(2) + '%</div>';
    tooltipEl.classList.add('is-show');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  paint();
  return subscribe(paint);
}
