// Árbol filogenético (#/arbol): a partir de secuencias FASTA (16S/ITS),
// alineamiento progresivo simplificado + Neighbor-Joining. Autónomo como
// #/primers/#/ufc: no lee ni escribe el estado global (no es una salida de
// QIIME2 en sí — el usuario pega sus propias secuencias), persiste en
// localStorage, no entra en la sesión guardable ni en el informe combinado.
//
// Pipeline (ver js/lib/phyloAlign.js, phyloDistance.js, neighborJoining.js):
//   1. distancias por pares (Needleman-Wunsch) entre las secuencias crudas
//   2. árbol guía RÁPIDO — reutiliza upgma()/leafOrder() de stats.js, el
//      mismo clustering que ordena el mapa de calor de diversidad beta
//   3. fusión progresiva de perfiles siguiendo ese árbol guía
//   4. matriz de distancias (p-distance / Jukes-Cantor) sobre el alineamiento
//   5. árbol por Neighbor-Joining sobre esa matriz
// El paso 1-3 (caro, O(n²) alineamientos) se cachea aparte del 4-5 (barato):
// cambiar el modelo de corrección no repite el alineamiento.

import { t, getLang } from '../lib/i18n.js';
import { parseFasta } from '../lib/primerTemplate.js';
import { needlemanWunsch, buildProgressiveAlignment } from '../lib/phyloAlign.js';
import { pDistance, buildDistanceMatrix } from '../lib/phyloDistance.js';
import { neighborJoining, toNewick, collectLeaves, computeDrawDepths } from '../lib/neighborJoining.js';
import { upgma } from '../lib/stats.js';
import { attachChartEditor } from '../lib/chartEditor.js';

const STORE_KEY = 'qiimelab.phylo';
const EXAMPLE_URL = 'datos-ejemplo/phylo/secuencias_ejemplo.fasta';
const MIN_SEQUENCES = 3;
const MIN_SEQ_LEN = 20;
const RECOMMENDED_MAX = 150;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PROGRESS_EVERY = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function defaultState() { return { fastaText: '', correction: 'p' }; }
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw.fastaText === 'string') {
      return { fastaText: raw.fastaText, correction: raw.correction === 'jc' ? 'jc' : 'p' };
    }
  } catch (e) { /* localStorage puede fallar */ }
  return defaultState();
}
function save(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
}

function parseAbundance(id) {
  const m = /(?:^|[;_\s])(?:size|abundance)=(\d+)/i.exec(id || '');
  return m ? parseInt(m[1], 10) : null;
}

/** FASTA cruda -> registros usables {name, seq, abundance}. Quita huecos
 *  preexistentes (este módulo espera secuencias SIN alinear), pasa a
 *  mayúsculas, normaliza U->T, y desambigua nombres repetidos. */
function recordsFromFasta(text) {
  const parsed = parseFasta(text);
  let strippedGaps = false;
  const seen = new Map();
  const out = [];
  parsed.forEach((r, i) => {
    let seq = r.seq;
    if (seq.includes('-')) { strippedGaps = true; seq = seq.replace(/-/g, ''); }
    seq = seq.toUpperCase().replace(/U/g, 'T');
    if (seq.length < MIN_SEQ_LEN) return;
    let name = r.id || ('seq' + (i + 1));
    const base = name;
    let k = 1;
    while (seen.has(name)) name = base + '_' + (++k);
    seen.set(name, true);
    out.push({ name, seq, abundance: parseAbundance(r.id || '') });
  });
  return { records: out, strippedGaps };
}

function serializeFasta(records) {
  return records.map((r) => '>' + r.name + '\n' + r.seq).join('\n');
}

function recordsKey(records) {
  return records.map((r) => r.name + ':' + r.seq).join('|');
}

function download(name, text, mime) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { /* entorno sin descargas */ }
}

function niceScaleValue(maxDepth) {
  if (!(maxDepth > 0)) return 0;
  const target = maxDepth / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const candidates = [1, 2, 5, 10].map((m) => m * magnitude);
  let best = candidates[0];
  for (const c of candidates) if (c <= target) best = c;
  return best;
}

/** Cladograma rectangular: x = distancia acumulada desde la raíz, y = orden
 *  de hojas (los internos, en el punto medio de sus hijos). */
function drawCladogram(svg, tree) {
  const leaves = collectLeaves(tree);
  const nLeaves = leaves.length;
  const { depths, maxDepth } = computeDrawDepths(tree);
  const rowH = 20;
  const marginL = 16, marginR = 190, marginT = 26, marginB = 40;
  const plotW = 380;
  const H = marginT + nLeaves * rowH + marginB;
  const W = marginL + plotW + marginR;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const xScale = maxDepth > 0 ? plotW / maxDepth : 0;
  const xOf = (id) => marginL + (depths.get(id) || 0) * xScale;

  const yLeaf = new Map();
  leaves.forEach((leaf, i) => yLeaf.set(leaf.id, marginT + i * rowH + rowH / 2));
  const yMemo = new Map();
  function yOf(node) {
    if (yMemo.has(node.id)) return yMemo.get(node.id);
    const y = !node.children.length
      ? yLeaf.get(node.id)
      : node.children.reduce((sum, ch) => sum + yOf(ch.node), 0) / node.children.length;
    yMemo.set(node.id, y);
    return y;
  }
  yOf(tree);

  const linesG = svgEl('g', {});
  const labelsG = svgEl('g', { 'data-ce': 'leaflabels' });
  const rightX = marginL + plotW;

  function drawNode(node) {
    const px = xOf(node.id);
    if (node.children.length) {
      const childYs = node.children.map((ch) => yOf(ch.node));
      linesG.appendChild(svgEl('line', { x1: px, y1: Math.min(...childYs), x2: px, y2: Math.max(...childYs), class: 'ql-baseline-line' }));
      node.children.forEach((ch) => {
        const cy = yOf(ch.node);
        linesG.appendChild(svgEl('line', { x1: px, y1: cy, x2: xOf(ch.node.id), y2: cy, class: 'ql-baseline-line' }));
        drawNode(ch.node);
      });
    } else {
      const py = yOf(node);
      if (rightX - px > 2) linesG.appendChild(svgEl('line', { x1: px, y1: py, x2: rightX, y2: py, class: 'ql-threshold-line' }));
      const lab = svgEl('text', { x: rightX + 6, y: py + 4, class: 'ql-tick-label' });
      lab.textContent = node.label;
      labelsG.appendChild(lab);
    }
  }
  const rootY = yOf(tree);
  linesG.appendChild(svgEl('line', { x1: marginL - 10, y1: rootY, x2: marginL, y2: rootY, class: 'ql-baseline-line' }));
  drawNode(tree);
  svg.appendChild(linesG);
  svg.appendChild(labelsG);

  // barra de escala
  const scaleVal = niceScaleValue(maxDepth);
  if (scaleVal > 0) {
    const x0 = marginL, y0 = H - 14, w = scaleVal * xScale;
    const g = svgEl('g', {});
    g.appendChild(svgEl('line', { x1: x0, y1: y0, x2: x0 + w, y2: y0, class: 'ql-baseline-line' }));
    g.appendChild(svgEl('line', { x1: x0, y1: y0 - 4, x2: x0, y2: y0 + 4, class: 'ql-baseline-line' }));
    g.appendChild(svgEl('line', { x1: x0 + w, y1: y0 - 4, x2: x0 + w, y2: y0 + 4, class: 'ql-baseline-line' }));
    const lab = svgEl('text', { x: x0, y: y0 + 14, class: 'ql-tick-label' });
    lab.textContent = scaleVal + ' (' + t('phylo.scaleCaption') + ')';
    g.appendChild(lab);
    svg.appendChild(g);
  }
}

export function render(container) {
  const s = load();
  let alignCache = null;   // { key, alignedOrdered }
  let alignProgress = null; // { key, done, total }
  let editor = null;
  let keepN = null;

  function recordsNow() { return recordsFromFasta(s.fastaText); }

  function removeAt(records, idx) {
    const next = records.slice();
    next.splice(idx, 1);
    s.fastaText = serializeFasta(next);
    paint();
  }

  function applyKeepTop(records, n) {
    const withAb = records.filter((r) => r.abundance != null);
    const sorted = withAb.length === records.length ? records.slice().sort((a, b) => b.abundance - a.abundance) : records;
    s.fastaText = serializeFasta(sorted.slice(0, n));
    paint();
  }

  async function runAlignment(records, key) {
    const seqs = records.map((r) => r.seq);
    const n = seqs.length;
    const gd = Array.from({ length: n }, () => new Array(n).fill(0));
    let done = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const { alignedA, alignedB } = needlemanWunsch(seqs[i], seqs[j], {});
        const p = pDistance(alignedA, alignedB);
        const d = Number.isFinite(p) ? p : 1;
        gd[i][j] = d; gd[j][i] = d;
        done++;
        if (done % PROGRESS_EVERY === 0) {
          if (!alignProgress || alignProgress.key !== key) return;
          alignProgress.done = done;
          paint();
          await sleep(0);
        }
      }
    }
    if (!alignProgress || alignProgress.key !== key) return;
    const guideTree = n > 1 ? upgma(gd, seqs.map((_, i) => String(i))) : null;
    const alignedMap = buildProgressiveAlignment(seqs, guideTree, {});
    const alignedOrdered = seqs.map((_, i) => alignedMap.get(i));
    if (!alignProgress || alignProgress.key !== key) return;
    alignCache = { key, alignedOrdered };
    alignProgress = null;
    paint();
  }

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';
    save(s);

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('phylo.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('phylo.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('phylo.subtitle') + '</p>';
    container.appendChild(header);

    const honestyCard = document.createElement('section');
    honestyCard.className = 'ql-card ql-panel';
    honestyCard.innerHTML =
      '<h2>' + t('phylo.honestyTitle') + '</h2><p class="ql-panel-note">' + t('phylo.honestyNote') + '</p>' +
      '<p class="ql-field-help" style="margin-top:10px;"><strong>' + t('phylo.scopeTitle') + '</strong> — ' + t('phylo.scopeNote') + '</p>';
    container.appendChild(honestyCard);

    // ---- entrada ----
    const inputCard = document.createElement('section');
    inputCard.className = 'ql-card ql-panel';
    inputCard.innerHTML = '<h2>' + t('phylo.inputTitle') + '</h2><p class="ql-panel-note">' + t('phylo.inputNote') + '</p>';

    const dz = document.createElement('div');
    dz.className = 'ql-dropzone';
    dz.tabIndex = 0;
    dz.setAttribute('role', 'button');
    dz.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
      '<div><div class="ql-dz-text"><b>' + t('phylo.dropLabel') + '</b></div><div class="ql-dz-sub">' + t('phylo.dropSub') + '</div></div>';
    const fileIn = document.createElement('input');
    fileIn.type = 'file'; fileIn.accept = '.fasta,.fa,.fna,.txt';
    dz.appendChild(fileIn);
    inputCard.appendChild(dz);
    const applyFile = async (file) => { if (file) { s.fastaText = await file.text(); paint(); } };
    dz.addEventListener('click', () => fileIn.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('is-drag'); applyFile(e.dataTransfer.files[0]); });
    fileIn.addEventListener('change', () => applyFile(fileIn.files[0]));

    const pasteField = document.createElement('div');
    pasteField.className = 'ql-field';
    pasteField.style.marginTop = '14px';
    pasteField.innerHTML = '<label for="phylo-paste">' + t('phylo.pasteLabel') + '</label>';
    const pasteTa = document.createElement('textarea');
    pasteTa.id = 'phylo-paste'; pasteTa.rows = 5; pasteTa.className = 'mono'; pasteTa.spellcheck = false;
    pasteTa.placeholder = t('phylo.pastePh');
    pasteTa.value = s.fastaText;
    pasteTa.addEventListener('change', () => { s.fastaText = pasteTa.value; paint(); });
    pasteField.appendChild(pasteTa);
    inputCard.appendChild(pasteField);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;';
    const exBtn = document.createElement('button');
    exBtn.type = 'button'; exBtn.className = 'ql-btn';
    exBtn.textContent = t('phylo.loadExample');
    exBtn.addEventListener('click', async () => {
      exBtn.disabled = true;
      try { s.fastaText = await (await fetch(EXAMPLE_URL)).text(); } catch (e) { /* si falla, no cambia nada */ }
      exBtn.disabled = false;
      paint();
    });
    btnRow.appendChild(exBtn);
    if (s.fastaText) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button'; clearBtn.className = 'ql-btn';
      clearBtn.textContent = t('phylo.clear');
      clearBtn.addEventListener('click', () => { s.fastaText = ''; alignCache = null; alignProgress = null; paint(); });
      btnRow.appendChild(clearBtn);
    }
    inputCard.appendChild(btnRow);
    container.appendChild(inputCard);

    const { records, strippedGaps } = recordsNow();

    if (!s.fastaText.trim()) {
      const empty = document.createElement('div');
      empty.className = 'ql-card ql-panel';
      empty.innerHTML = '<div class="ql-empty"><h3>' + t('phylo.emptyTitle') + '</h3><p>' + t('phylo.emptyNote') + '</p></div>';
      container.appendChild(empty);
      return;
    }
    if (records.length < MIN_SEQUENCES) {
      const few = document.createElement('div');
      few.className = 'ql-card ql-panel';
      few.innerHTML = '<div class="ql-empty"><h3>' + t('phylo.tooFewTitle', { n: MIN_SEQUENCES }) + '</h3><p>' + t('phylo.tooFewNote') + '</p></div>';
      container.appendChild(few);
      return;
    }

    if (strippedGaps) {
      const note = document.createElement('p');
      note.className = 'ql-field-help';
      note.textContent = t('phylo.gapsStrippedNote');
      container.appendChild(note);
    }

    if (records.length > RECOMMENDED_MAX) {
      const warn = document.createElement('section');
      warn.className = 'ql-card ql-panel';
      warn.innerHTML = '<h2>' + t('phylo.limitWarnTitle', { n: records.length }) + '</h2><p class="ql-panel-note">' + t('phylo.limitWarn') + '</p>';
      const withAb = records.filter((r) => r.abundance != null);
      if (withAb.length >= records.length * 0.5) {
        warn.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('phylo.keepTopHelp') + '</p>');
        const row = document.createElement('div');
        row.className = 'ql-field';
        row.style.cssText = 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px;';
        if (keepN == null) keepN = Math.min(100, records.length);
        row.innerHTML = '<label for="phylo-keepn">' + t('phylo.keepTopLabel') + '</label>';
        const nIn = document.createElement('input');
        nIn.type = 'number'; nIn.id = 'phylo-keepn'; nIn.className = 'tabular';
        nIn.min = String(MIN_SEQUENCES); nIn.max = String(records.length); nIn.value = String(keepN);
        nIn.addEventListener('change', () => { const v = parseInt(nIn.value, 10); if (Number.isFinite(v)) keepN = v; });
        row.appendChild(nIn);
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button'; applyBtn.className = 'ql-btn';
        applyBtn.textContent = t('phylo.keepTopBtn');
        applyBtn.addEventListener('click', () => applyKeepTop(records, Math.max(MIN_SEQUENCES, Math.min(records.length, keepN))));
        row.appendChild(applyBtn);
        warn.appendChild(row);
      } else {
        warn.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('phylo.noAbundanceNote') + '</p>');
      }
      container.appendChild(warn);
    }

    // ---- lista de secuencias ----
    const listCard = document.createElement('section');
    listCard.className = 'ql-card ql-panel';
    const hasAbundanceCol = records.some((r) => r.abundance != null);
    listCard.innerHTML = '<h2>' + t('phylo.listTitle', { n: records.length }) + '</h2>';
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr><th>' + t('phylo.colName') + '</th><th>' + t('phylo.colLength') + '</th>' +
      (hasAbundanceCol ? '<th>' + t('phylo.colAbundance') + '</th>' : '') + '<th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    records.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="mono">' + escapeHtml(r.name) + '</td><td class="tabular">' + r.seq.length + '</td>' +
        (hasAbundanceCol ? '<td class="tabular">' + (r.abundance != null ? r.abundance : '—') + '</td>' : '');
      const td = document.createElement('td');
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button'; rmBtn.className = 'ql-cmp-rm'; rmBtn.textContent = '✕';
      rmBtn.title = t('ui.remove');
      rmBtn.setAttribute('aria-label', t('phylo.removeAria', { name: r.name }));
      rmBtn.disabled = records.length <= MIN_SEQUENCES;
      rmBtn.addEventListener('click', () => removeAt(records, i));
      td.appendChild(rmBtn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    listCard.appendChild(scrollDiv);
    container.appendChild(listCard);

    // ---- árbol: figura + controles ----
    const key = recordsKey(records);
    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note">' + t('phylo.treeNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('a11y.chartPhylo') });
    chartWrap.appendChild(svg);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    const ctrl = document.createElement('aside');
    ctrl.className = 'ql-card ql-panel';
    ctrl.innerHTML = '<h2>' + t('phylo.modelTitle') + '</h2>';
    const corrField = document.createElement('div');
    corrField.className = 'ql-field';
    corrField.innerHTML = '<label for="phylo-correction">' + t('phylo.correctionLabel') + '</label>';
    const corrSel = document.createElement('select');
    corrSel.id = 'phylo-correction';
    [['p', t('phylo.correctionP')], ['jc', t('phylo.correctionJC')]].forEach(([v, lbl]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = lbl;
      if (v === s.correction) o.selected = true;
      corrSel.appendChild(o);
    });
    corrSel.addEventListener('change', () => { s.correction = corrSel.value; paint(); });
    corrField.appendChild(corrSel);
    corrField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('phylo.correctionHelp') + '</p>');
    ctrl.appendChild(corrField);

    const statsBox = document.createElement('div');
    statsBox.className = 'ql-stats';
    statsBox.innerHTML = '<div class="ql-stat"><div class="ql-stat-label">' + t('phylo.statSeqs') + '</div><div class="ql-stat-value" style="font-size:20px;">' + records.length + '</div></div>';
    ctrl.appendChild(statsBox);

    const privacy = document.createElement('p');
    privacy.className = 'ql-privacy';
    privacy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg>' + t('phylo.localNote');
    ctrl.appendChild(privacy);
    grid.appendChild(ctrl);
    container.appendChild(grid);

    if (alignCache && alignCache.key === key) {
      const alignedOrdered = alignCache.alignedOrdered;
      const { matrix, saturated } = buildDistanceMatrix(alignedOrdered, { correction: s.correction });
      const tree = neighborJoining(matrix, records.map((r) => r.name));

      statsBox.insertAdjacentHTML('beforeend',
        '<div class="ql-stat"><div class="ql-stat-label">' + t('phylo.statWidth') + '</div><div class="ql-stat-value" style="font-size:20px;">' + alignedOrdered[0].length + '</div></div>');
      if (s.correction === 'jc' && saturated.length > 0) {
        statsBox.insertAdjacentHTML('beforeend',
          '<div class="ql-stat"><div class="ql-stat-label">' + t('phylo.statSaturated') + '</div><div class="ql-stat-value" style="font-size:20px;color:var(--warning);">' + saturated.length + '</div></div>');
      }

      drawCladogram(svg, tree);
      editor = attachChartEditor({
        key: 'phylo', svg, mount: chartPanel, lang: getLang(),
        filename: t('phylo.figTitle'),
        elements: [
          { id: 'title', create: { text: t('phylo.figTitle'), x: 8, y: 14, anchor: 'start', cls: 'ce-title' } },
          { id: 'leaflabels', selector: '[data-ce="leaflabels"]', kind: 'group' },
        ],
      });

      const newickCard = document.createElement('section');
      newickCard.className = 'ql-card ql-panel';
      newickCard.style.marginTop = '20px';
      newickCard.innerHTML = '<h2>' + t('phylo.newickTitle') + '</h2><p class="ql-panel-note">' + t('phylo.newickNote') + '</p>';
      const nwk = toNewick(tree);
      const code = document.createElement('pre');
      code.className = 'ql-code';
      code.textContent = nwk;
      newickCard.appendChild(code);
      const nwkBtnRow = document.createElement('div');
      nwkBtnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button'; copyBtn.className = 'ql-btn';
      copyBtn.textContent = t('phylo.copyBtn');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(nwk);
          copyBtn.textContent = t('phylo.copiedBtn');
          setTimeout(() => { copyBtn.textContent = t('phylo.copyBtn'); }, 1800);
        } catch (e) { /* portapapeles puede fallar; el texto ya está visible para seleccionar */ }
      });
      nwkBtnRow.appendChild(copyBtn);
      const dlBtn = document.createElement('button');
      dlBtn.type = 'button'; dlBtn.className = 'ql-btn';
      dlBtn.textContent = t('phylo.downloadBtn');
      dlBtn.addEventListener('click', () => download('arbol-qiimelab.nwk', nwk, 'text/plain;charset=utf-8'));
      nwkBtnRow.appendChild(dlBtn);
      newickCard.appendChild(nwkBtnRow);
      container.appendChild(newickCard);
    } else if (alignProgress && alignProgress.key === key) {
      const wait = document.createElement('p');
      wait.className = 'ql-panel-note';
      wait.textContent = t('phylo.computing', { done: alignProgress.done, total: alignProgress.total });
      chartWrap.appendChild(wait);
    } else {
      alignProgress = { key, done: 0, total: (records.length * (records.length - 1)) / 2 };
      const wait = document.createElement('p');
      wait.className = 'ql-panel-note';
      wait.textContent = t('phylo.computing', { done: 0, total: alignProgress.total });
      chartWrap.appendChild(wait);
      runAlignment(records, key);
    }
  }

  paint();
  return () => { alignProgress = null; if (editor) editor.destroy(); };
}
