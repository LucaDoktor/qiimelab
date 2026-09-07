// Taxones compartidos y exclusivos entre grupos de metadatos.
// Entrada: tabla de conteos taxón × muestra (slot `taxaCounts`) + metadatos
// con la columna de grupo. Presencia = conteo por encima de un umbral en al
// menos N muestras del grupo. Hasta 4 grupos → diagrama de Venn dibujado a
// mano; 5+ → vista tipo UpSet (barras de intersección).

import { state, subscribe } from '../state.js';
import { loadRealCounts, loadExampleCounts, mountExampleButtons } from '../lib/exampleData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CAT_VARS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7'];

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function popcount(n) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }

// ---- geometría fija de los diagramas de Venn (2, 3 y 4 conjuntos) ----
// Cada layout: viewBox, shapes (círculos/elipses con su color) y la posición
// de la etiqueta de cada región (clave = máscara de bits de los grupos).
const VENN_LAYOUTS = {
  2: {
    vb: [0, 0, 520, 340],
    shapes: [
      { type: 'circle', cx: 205, cy: 170, r: 120, ci: 0 },
      { type: 'circle', cx: 315, cy: 170, r: 120, ci: 1 },
    ],
    labels: { 1: [140, 175], 2: [380, 175], 3: [260, 175] },
    nameAt: { 0: [120, 45], 1: [400, 45] },
  },
  3: {
    vb: [0, 0, 520, 460],
    shapes: [
      { type: 'circle', cx: 200, cy: 175, r: 130, ci: 0 },
      { type: 'circle', cx: 320, cy: 175, r: 130, ci: 1 },
      { type: 'circle', cx: 260, cy: 285, r: 130, ci: 2 },
    ],
    labels: {
      1: [140, 135], 2: [380, 135], 4: [260, 370],
      3: [260, 120], 5: [180, 250], 6: [340, 250],
      7: [260, 215],
    },
    nameAt: { 0: [110, 40], 1: [410, 40], 2: [260, 440] },
  },
  4: {
    vb: [0, 0, 660, 470],
    shapes: [
      { type: 'ellipse', cx: 250, cy: 280, rx: 230, ry: 140, rot: -40, ci: 0 },
      { type: 'ellipse', cx: 315, cy: 245, rx: 230, ry: 140, rot: -40, ci: 1 },
      { type: 'ellipse', cx: 335, cy: 245, rx: 230, ry: 140, rot: 40, ci: 2 },
      { type: 'ellipse', cx: 400, cy: 280, rx: 230, ry: 140, rot: 40, ci: 3 },
    ],
    labels: {
      1: [95, 245], 2: [225, 90], 4: [430, 90], 8: [560, 245],
      3: [180, 180], 12: [475, 180], 6: [330, 140],
      5: [235, 385], 10: [420, 385], 9: [330, 410],
      7: [250, 300], 14: [405, 300], 11: [288, 362], 13: [370, 362],
      15: [330, 255],
    },
    nameAt: { 0: [70, 155], 1: [210, 45], 2: [450, 45], 3: [590, 155] },
  },
};

function emptyState(container) {
  const card = document.createElement('div');
  card.className = 'ql-card ql-panel';
  card.innerHTML =
    '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">' +
    '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>' +
    '<h3>Faltan datos para el diagrama de Venn</h3>' +
    '<p>Necesitas una <b>tabla de conteos</b> (taxones en filas, muestras en columnas — sin normalizar, sin "top N") ' +
    'y los <b>metadatos</b> con la columna de grupo. La abundancia relativa o el "top 14" <b>no sirven</b>: ' +
    'esconden en "Otros" justo los taxones raros que un Venn saca a la luz.</p>' +
    '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
    '<a href="#/cargar" class="ql-btn">Ir a cargar datos</a></div></div>';
  mountExampleButtons(card.querySelector('.ql-empty'), {
    real: loadRealCounts,
    synthetic: loadExampleCounts,
    syntheticLabel: 'Cargar ejemplo sintético (4 grupos)',
  });
  container.appendChild(card);
}

export function render(container) {
  let taxonCol = null;
  let transposed = false;
  let groupCol = null;
  let minCount = 0;
  let minSamples = 1;
  let viewMode = 'auto'; // 'auto' | 'venn' | 'upset'
  let openMask = null;    // región seleccionada en la tabla

  function paint() {
    container.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">Taxones compartidos y exclusivos</p>' +
      '<h1 class="ql-page-title">Diagramas de Venn / UpSet</h1>' +
      '<p class="ql-page-sub">Qué taxones aparecen en cada grupo y cuáles son exclusivos. Un taxón "está" en un grupo si su conteo supera un umbral en al menos N muestras de ese grupo. Hasta 4 grupos se dibuja un Venn; con 5 o más se pasa a una vista UpSet (barras de intersección), que no se lía como un Venn de 5 círculos.</p>';
    container.appendChild(header);

    if (!state.taxaCounts || !state.metadata) { emptyState(container); return; }

    const tc = state.taxaCounts;
    const meta = state.metadata;

    // --- mapeo de columnas ---
    if (taxonCol === null) taxonCol = tc.taxonKey && tc.headers.includes(tc.taxonKey) ? tc.taxonKey : tc.headers[0];
    const groupOptions = meta.headers.filter((h) => h !== meta.sampleIdKey);
    if (!groupCol || !groupOptions.includes(groupCol)) {
      // por defecto: la primera columna con exactamente 2 valores distintos
      // (Venn de 2 círculos, lo que se entiende más rápido); si no hay, la de
      // menos valores distintos.
      const distinct = (h) => new Set(meta.rows.map((r) => String(r[h] ?? '').trim()).filter(Boolean)).size;
      const two = groupOptions.filter((h) => distinct(h) === 2);
      const multi = groupOptions.filter((h) => distinct(h) >= 2).sort((a, b) => distinct(a) - distinct(b));
      groupCol = two[0] || multi[0] || groupOptions[0];
    }

    const mapCard = document.createElement('section');
    mapCard.className = 'ql-card ql-panel';
    mapCard.style.marginBottom = '20px';
    mapCard.innerHTML = '<h2>Tabla de conteos</h2><p class="ql-panel-note">Confirma qué columna es el taxón. Si tu tabla tiene las muestras en filas y los taxones en columnas, marca "traspuesta".</p>';
    const mapGrid = document.createElement('div');
    mapGrid.className = 'ql-mapping-grid';

    const fTaxon = document.createElement('div');
    fTaxon.className = 'ql-field';
    fTaxon.innerHTML = '<label>Columna del taxón</label>';
    const selTaxon = document.createElement('select');
    tc.headers.forEach((h, i) => {
      const o = document.createElement('option');
      o.value = h; o.textContent = h || ('columna ' + (i + 1));
      if (h === taxonCol) o.selected = true;
      selTaxon.appendChild(o);
    });
    selTaxon.addEventListener('change', () => { taxonCol = selTaxon.value; openMask = null; paint(); });
    fTaxon.appendChild(selTaxon);
    mapGrid.appendChild(fTaxon);

    const fT = document.createElement('div');
    fT.className = 'ql-field';
    fT.innerHTML = '<label>Orientación</label>';
    const tWrap = document.createElement('label');
    tWrap.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:400;font-size:13px;';
    const tChk = document.createElement('input');
    tChk.type = 'checkbox'; tChk.checked = transposed; tChk.style.width = 'auto';
    tChk.addEventListener('change', () => { transposed = tChk.checked; openMask = null; paint(); });
    tWrap.appendChild(tChk);
    tWrap.appendChild(document.createTextNode(' la tabla está traspuesta (muestras en filas)'));
    fT.appendChild(tWrap);
    mapGrid.appendChild(fT);
    mapCard.appendChild(mapGrid);
    container.appendChild(mapCard);

    // --- matriz (respetando traspuesta) ---
    const matrix = buildMatrix(tc, taxonCol, transposed);
    if (!matrix || matrix.taxa.length === 0 || matrix.samples.length === 0) {
      const warn = document.createElement('div');
      warn.className = 'ql-card ql-panel';
      warn.innerHTML = '<p class="ql-field-help">No se ha podido leer la tabla como taxón × muestra. Revisa el mapeo de columnas / la orientación.</p>';
      container.appendChild(warn);
      return;
    }

    // --- muestra → grupo ---
    const sampleGroup = {};
    meta.rows.forEach((r) => {
      const id = String(r[meta.sampleIdKey] ?? '').trim();
      const g = String(r[groupCol] ?? '').trim();
      if (id && g) sampleGroup[id] = g;
    });
    // emparejado tolerante a sufijos (A-1 ↔ A-1-16S-…)
    const resolveGroup = (sampleId) => {
      if (sampleGroup[sampleId] != null) return sampleGroup[sampleId];
      const hit = Object.keys(sampleGroup).find((k) => sampleId.startsWith(k) || k.startsWith(sampleId));
      return hit ? sampleGroup[hit] : null;
    };

    const groupOf = {};
    let matched = 0;
    matrix.samples.forEach((s) => { const g = resolveGroup(s); if (g) { groupOf[s] = g; matched++; } });
    const groups = Array.from(new Set(matrix.samples.map((s) => groupOf[s]).filter(Boolean))).sort();

    // --- conjuntos de presencia por grupo ---
    const groupSamples = {};
    groups.forEach((g) => { groupSamples[g] = matrix.samples.filter((s) => groupOf[s] === g); });
    const presence = new Map(); // grupo -> Set(taxon)
    groups.forEach((g) => {
      const set = new Set();
      matrix.taxa.forEach((t, ti) => {
        let hits = 0;
        for (const s of groupSamples[g]) { if (matrix.value(ti, s) > minCount) hits++; }
        if (hits >= minSamples) set.add(t);
      });
      presence.set(g, set);
    });

    // --- partición: taxón → máscara de grupos en los que está ---
    const byMask = new Map(); // mask -> [taxa]
    matrix.taxa.forEach((t) => {
      let mask = 0;
      groups.forEach((g, gi) => { if (presence.get(g).has(t)) mask |= (1 << gi); });
      if (mask === 0) return;
      if (!byMask.has(mask)) byMask.set(mask, []);
      byMask.get(mask).push(t);
    });

    const useUpset = viewMode === 'upset' || (viewMode === 'auto' && groups.length >= 5);

    // ---- controles (tira horizontal, ancho completo) ----
    const controls = document.createElement('section');
    controls.className = 'ql-card ql-panel';
    controls.style.marginBottom = '20px';
    controls.innerHTML = '<h2>Controles</h2>';
    const cGrid = document.createElement('div');
    cGrid.className = 'ql-mapping-grid';

    const fGroup = document.createElement('div');
    fGroup.className = 'ql-field';
    fGroup.innerHTML = '<label>Agrupar por</label>';
    const selGroup = document.createElement('select');
    groupOptions.forEach((h) => {
      const n = new Set(meta.rows.map((r) => String(r[h] ?? '').trim()).filter(Boolean)).size;
      const o = document.createElement('option');
      o.value = h; o.textContent = h + ' (' + n + ' grupos)';
      if (h === groupCol) o.selected = true;
      selGroup.appendChild(o);
    });
    selGroup.addEventListener('change', () => { groupCol = selGroup.value; openMask = null; paint(); });
    fGroup.appendChild(selGroup);
    fGroup.insertAdjacentHTML('beforeend', '<p class="ql-field-help">La variable de los metadatos que define los conjuntos. 2 grupos → Venn de 2 círculos; a partir de 5, UpSet.</p>');
    cGrid.appendChild(fGroup);

    const fCount = document.createElement('div');
    fCount.className = 'ql-field';
    fCount.innerHTML = '<label>Presente si el conteo supera</label>' +
      '<input type="number" min="0" step="1" value="' + minCount + '" id="vnCount" />' +
      '<p class="ql-field-help">Un taxón está en una muestra si su conteo es mayor que este número. 0 = con que aparezca una vez.</p>';
    cGrid.appendChild(fCount);

    const fSamp = document.createElement('div');
    fSamp.className = 'ql-field';
    fSamp.innerHTML = '<label>…en al menos estas muestras del grupo</label>' +
      '<input type="number" min="1" step="1" value="' + minSamples + '" id="vnSamp" />' +
      '<p class="ql-field-help">Cuántas muestras del grupo lo tienen que tener. 1 = con una basta; súbelo para exigir consistencia (p. ej. 2 de 3 réplicas).</p>';
    cGrid.appendChild(fSamp);

    if (groups.length >= 3 && groups.length <= 4) {
      const fView = document.createElement('div');
      fView.className = 'ql-field';
      fView.innerHTML = '<label>Vista</label>';
      const selView = document.createElement('select');
      [['auto', 'Venn (automático)'], ['upset', 'UpSet (barras)']].forEach(([v, lbl]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = lbl;
        if ((viewMode === 'venn' ? 'auto' : viewMode) === v) o.selected = true;
        selView.appendChild(o);
      });
      selView.addEventListener('change', () => { viewMode = selView.value; paint(); });
      fView.appendChild(selView);
      cGrid.appendChild(fView);
    }
    controls.appendChild(cGrid);

    const totalPresent = new Set();
    byMask.forEach((arr) => arr.forEach((t) => totalPresent.add(t)));
    const coreMask = groups.length ? (1 << groups.length) - 1 : 0;
    const stats = document.createElement('div');
    stats.className = 'ql-stats';
    stats.style.marginTop = '16px';
    stats.innerHTML =
      '<div class="ql-stat"><div class="ql-stat-label">Grupos</div><div class="ql-stat-value" style="font-size:20px;">' + groups.length + '</div></div>' +
      '<div class="ql-stat"><div class="ql-stat-label">Taxones (total)</div><div class="ql-stat-value" style="font-size:20px;">' + totalPresent.size + '</div></div>' +
      '<div class="ql-stat"><div class="ql-stat-label">Núcleo (en todos)</div><div class="ql-stat-value" style="font-size:20px;">' + ((byMask.get(coreMask) || []).length) + '</div></div>' +
      '<div class="ql-stat"><div class="ql-stat-label">Exclusivos (algún grupo)</div><div class="ql-stat-value" style="font-size:20px;">' +
        groups.reduce((a, _, gi) => a + ((byMask.get(1 << gi) || []).length), 0) + '</div></div>';
    controls.appendChild(stats);

    if (matched < matrix.samples.length) {
      const w = document.createElement('p');
      w.className = 'ql-field-help';
      w.style.color = 'var(--warning)';
      w.textContent = (matrix.samples.length - matched) + ' de ' + matrix.samples.length + ' muestras de la tabla no encajan con ningún grupo de los metadatos (¿IDs distintos?).';
      controls.appendChild(w);
    }
    container.appendChild(controls);

    controls.querySelector('#vnCount').addEventListener('change', (e) => { minCount = Math.max(0, parseInt(e.target.value, 10) || 0); openMask = null; paint(); });
    controls.querySelector('#vnSamp').addEventListener('change', (e) => { minSamples = Math.max(1, parseInt(e.target.value, 10) || 1); openMask = null; paint(); });

    // ---- gráfico (ancho completo) ----
    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<h2>' + (useUpset ? 'Intersecciones (UpSet)' : 'Diagrama de Venn') + '</h2>' +
      '<p class="ql-panel-note">' + (useUpset
        ? 'Cada barra = nº de taxones presentes exactamente en esa combinación de grupos. La matriz de puntos de abajo dice qué grupos entran en cada barra.'
        : 'El número de cada región = nº de taxones presentes exactamente en esos grupos. Haz clic en una región para ver la lista.') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap scroll-x';
    if (!useUpset) { chartWrap.style.maxWidth = '620px'; chartWrap.style.margin = '0 auto'; }
    chartPanel.appendChild(chartWrap);
    container.appendChild(chartPanel);

    if (groups.length < 2) {
      chartWrap.innerHTML = '<p class="ql-field-help">Hacen falta al menos 2 grupos con muestras para comparar. Prueba con otra variable en "Agrupar por".</p>';
    } else if (useUpset) {
      drawUpset(chartWrap, groups, byMask, presence, (mask) => { openMask = mask; renderTable(); });
    } else {
      drawVenn(chartWrap, groups, byMask, (mask) => { openMask = mask; renderTable(); });
    }

    // ---- tabla de regiones ----
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>Taxones por región</h2><p class="ql-panel-note">Cada fila es una combinación de grupos. Haz clic para ver la lista de taxones de esa región (o pulsa una región del gráfico).</p>';
    const tableHost = document.createElement('div');
    tableCard.appendChild(tableHost);
    container.appendChild(tableCard);

    function renderTable() {
      // re-pinta solo la parte visual seleccionada + la tabla
      container.querySelectorAll('.vn-region').forEach((el) => {
        el.classList.toggle('is-active', String(el.dataset.mask) === String(openMask));
      });
      const entries = Array.from(byMask.entries())
        .sort((a, b) => (popcount(a[0]) - popcount(b[0])) || (b[1].length - a[1].length));
      tableHost.innerHTML = '';
      const scroll = document.createElement('div');
      scroll.className = 'ql-table-scroll';
      const tbl = document.createElement('table');
      tbl.className = 'ql-table';
      tbl.innerHTML = '<thead><tr><th>Grupos</th><th>Tipo</th><th>Nº taxones</th></tr></thead>';
      const tbody = document.createElement('tbody');
      entries.forEach(([mask, taxa]) => {
        const inGroups = groups.filter((_, gi) => (mask >> gi) & 1);
        const type = inGroups.length === 1 ? 'exclusivo' : inGroups.length === groups.length ? 'núcleo (todos)' : 'compartido (' + inGroups.length + ')';
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        if (String(mask) === String(openMask)) tr.style.background = 'color-mix(in srgb, var(--accent) 12%, transparent)';
        tr.innerHTML = '<td>' + inGroups.map(escapeHtml).join(' ∩ ') + '</td><td>' + type + '</td><td class="ql-num tabular">' + taxa.length + '</td>';
        tr.addEventListener('click', () => { openMask = (openMask === mask ? null : mask); renderTable(); });
        tbody.appendChild(tr);
        if (String(mask) === String(openMask)) {
          const tr2 = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 3;
          td.style.cssText = 'background:var(--page);font-size:12px;line-height:1.8;';
          td.innerHTML = taxa.slice().sort().map((t) => '<span class="mono" style="display:inline-block;margin:2px 8px 2px 0;">' + escapeHtml(t) + '</span>').join('');
          tr2.appendChild(td);
          tbody.appendChild(tr2);
        }
      });
      tbl.appendChild(tbody);
      scroll.appendChild(tbl);
      tableHost.appendChild(scroll);
    }
    renderTable();
  }

  paint();
  return subscribe(paint);
}

// ---- construir la matriz taxón × muestra ----
function buildMatrix(tc, taxonCol, transposed) {
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  if (!transposed) {
    const sampleCols = tc.headers.filter((h) => h !== taxonCol);
    const taxa = tc.rows.map((r) => String(r[taxonCol] ?? '').trim()).filter(Boolean);
    const rowByTaxon = new Map();
    tc.rows.forEach((r) => rowByTaxon.set(String(r[taxonCol] ?? '').trim(), r));
    return {
      taxa, samples: sampleCols,
      value: (ti, sample) => num((rowByTaxon.get(taxa[ti]) || {})[sample]),
    };
  }
  // traspuesta: filas = muestras, columnas (menos taxonCol) = taxones
  const taxa = tc.headers.filter((h) => h !== taxonCol);
  const samples = tc.rows.map((r) => String(r[taxonCol] ?? '').trim()).filter(Boolean);
  const rowBySample = new Map();
  tc.rows.forEach((r) => rowBySample.set(String(r[taxonCol] ?? '').trim(), r));
  return {
    taxa, samples,
    value: (ti, sample) => num((rowBySample.get(sample) || {})[taxa[ti]]),
  };
}

// ---- Venn (2/3/4 conjuntos) ----
function drawVenn(host, groups, byMask, onRegion) {
  const layout = VENN_LAYOUTS[groups.length];
  host.innerHTML = '';
  const svg = svgEl('svg', { class: 'ql-svg', viewBox: layout.vb.join(' '), role: 'img', 'aria-label': 'Diagrama de Venn de taxones por grupo' });

  layout.shapes.forEach((sh) => {
    const col = 'var(' + CAT_VARS[sh.ci % CAT_VARS.length] + ')';
    const common = { fill: col, 'fill-opacity': 0.14, stroke: col, 'stroke-width': 2 };
    if (sh.type === 'circle') svg.appendChild(svgEl('circle', { cx: sh.cx, cy: sh.cy, r: sh.r, ...common }));
    else svg.appendChild(svgEl('ellipse', { cx: sh.cx, cy: sh.cy, rx: sh.rx, ry: sh.ry, transform: 'rotate(' + sh.rot + ' ' + sh.cx + ' ' + sh.cy + ')', ...common }));
  });

  // nombres de grupo
  groups.forEach((g, gi) => {
    const at = layout.nameAt[gi];
    if (!at) return;
    const t = svgEl('text', { x: at[0], y: at[1], class: 'ql-axis-label', 'text-anchor': 'middle', 'font-weight': 700 });
    t.textContent = g.length > 16 ? g.slice(0, 15) + '…' : g;
    t.setAttribute('fill', 'var(' + CAT_VARS[gi % CAT_VARS.length] + ')');
    svg.appendChild(t);
  });

  // etiquetas de región (recorremos TODAS las máscaras posibles del layout)
  Object.keys(layout.labels).forEach((maskStr) => {
    const mask = parseInt(maskStr, 10);
    const [x, y] = layout.labels[mask];
    const n = (byMask.get(mask) || []).length;
    const g = svgEl('g', { class: 'vn-region', 'data-mask': mask, style: 'cursor:pointer;' });
    const hit = svgEl('circle', { cx: x, cy: y, r: 20, fill: 'transparent' });
    const t = svgEl('text', { x, y: y + 6, 'text-anchor': 'middle', 'font-family': 'var(--font-display)', 'font-size': 19, 'font-weight': 600, fill: n ? 'var(--ink)' : 'var(--ink-muted)' });
    t.textContent = n;
    g.appendChild(hit); g.appendChild(t);
    g.addEventListener('click', () => onRegion(mask));
    svg.appendChild(g);
  });

  host.appendChild(svg);
}

// ---- UpSet ----
function drawUpset(host, groups, byMask, presence, onRegion) {
  host.innerHTML = '';
  const MAX_COMBOS = 26;
  const allCombos = Array.from(byMask.entries()).map(([mask, taxa]) => ({ mask, n: taxa.length }));
  const combos = allCombos.sort((a, b) => b.n - a.n || popcount(a.mask) - popcount(b.mask)).slice(0, MAX_COMBOS);
  const hidden = allCombos.length - combos.length;

  const setSizes = groups.map((g) => presence.get(g).size);
  const maxSet = Math.max(1, ...setSizes);
  const maxCombo = Math.max(1, ...combos.map((c) => c.n));

  const leftW = 170, barMaxW = 130, colW = 30, rowH = 26;
  const topH = 190, dotR = 7;
  const matrixX0 = leftW + barMaxW + 14;
  const matrixY0 = topH + 28;
  const W = matrixX0 + combos.length * colW + 16;
  const H = matrixY0 + groups.length * rowH + 14;
  const svg = svgEl('svg', { class: 'ql-svg', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Gráfico UpSet de intersecciones' });
  svg.style.width = Math.max(W, 680) + 'px';
  svg.style.maxWidth = 'none';

  // filas de fondo alternas (toda la anchura de la matriz)
  groups.forEach((_, gi) => {
    if (gi % 2 === 0) svg.appendChild(svgEl('rect', { x: matrixX0 - 6, y: matrixY0 + gi * rowH, width: combos.length * colW + 6, height: rowH, fill: 'var(--page)' }));
  });

  // barras verticales (tamaño de cada intersección)
  combos.forEach((c, ci) => {
    const x = matrixX0 + ci * colW;
    const h = (c.n / maxCombo) * (topH - 24);
    const g = svgEl('g', { class: 'vn-region', 'data-mask': c.mask, style: 'cursor:pointer;' });
    g.appendChild(svgEl('rect', { x, y: 0, width: colW, height: H, fill: 'transparent' }));
    g.appendChild(svgEl('rect', { x: x + 4, y: topH - h, width: colW - 8, height: Math.max(h, 1), fill: 'var(--accent)', rx: 2 }));
    const t = svgEl('text', { x: x + colW / 2, y: topH - h - 6, 'text-anchor': 'middle', class: 'ql-tick-label' });
    t.textContent = c.n;
    g.appendChild(t);
    g.addEventListener('click', () => onRegion(c.mask));
    svg.appendChild(g);
  });

  // barras horizontales (tamaño de cada grupo) + etiquetas
  groups.forEach((g, gi) => {
    const y = matrixY0 + gi * rowH;
    const w = (setSizes[gi] / maxSet) * barMaxW;
    svg.appendChild(svgEl('rect', { x: leftW + (barMaxW - w), y: y + 4, width: Math.max(w, 1), height: rowH - 9, fill: 'var(' + CAT_VARS[gi % CAT_VARS.length] + ')', rx: 2 }));
    const lbl = svgEl('text', { x: leftW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'ql-tick-label' });
    lbl.textContent = (g.length > 20 ? g.slice(0, 19) + '…' : g) + ' · ' + setSizes[gi];
    svg.appendChild(lbl);
  });

  // matriz de puntos
  combos.forEach((c, ci) => {
    const cx = matrixX0 + ci * colW + colW / 2;
    const rowsIn = [];
    groups.forEach((_, gi) => {
      const cy = matrixY0 + gi * rowH + rowH / 2;
      const on = (c.mask >> gi) & 1;
      svg.appendChild(svgEl('circle', { cx, cy, r: dotR, fill: on ? 'var(--ink)' : 'var(--gridline)' }));
      if (on) rowsIn.push(cy);
    });
    if (rowsIn.length > 1) svg.appendChild(svgEl('line', { x1: cx, x2: cx, y1: Math.min(...rowsIn), y2: Math.max(...rowsIn), stroke: 'var(--ink)', 'stroke-width': 2.5 }));
  });

  host.appendChild(svg);
  if (hidden > 0) {
    const note = document.createElement('p');
    note.className = 'ql-field-help';
    note.textContent = 'Se muestran las ' + MAX_COMBOS + ' intersecciones mayores; hay ' + hidden + ' más (todas en la tabla de abajo).';
    host.appendChild(note);
  }
}
