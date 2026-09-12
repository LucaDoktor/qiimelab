// Secuenciación Sanger: recorte por calidad + solapamiento forward/reverse +
// consenso, a partir de cromatogramas .ab1 (o FASTQ/FASTA ya extraídos).
//
// Autocontenido como #/primers o #/ufc: no lee ni escribe el estado global
// de la app. Persiste en localStorage solo la CONFIGURACIÓN (método de
// recorte, palabras clave de emparejamiento, longitud de amplicón…) y el
// ÚLTIMO LOTE DE RESULTADOS ya calculado (id, método, diagnóstico, consenso
// — texto pequeño). La traza y las calidades crudas de los .ab1 subidos
// viven solo en memoria de esta pestaña del navegador: si recargas la
// página, los resultados y el consenso siguen ahí, pero el visor de
// cromatograma necesita volver a subir el archivo (o recargar el ejemplo).

import { t, getLang } from '../lib/i18n.js';
import { parseAb1 } from '../lib/ab1Parser.js';
import { trimRead } from '../lib/sangerTrim.js';
import { mergeReads, reverseComplement } from '../lib/sangerOverlap.js';
import { CATEGORICAL } from '../lib/palettes.js';
import { attachChartEditor } from '../lib/chartEditor.js';

const STORE_KEY = 'qiimelab.sanger';
const PRIMERS_STORE_KEY = 'qiimelab.primers';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Sin asignación previa de color base A/C/G/T en el resto de la app — se usan
// los 4 primeros tonos de la paleta categórica, el subconjunto ya validado
// como "seguro para scatter" (cualquier par se distingue), apropiado aquí
// porque las 4 trazas se superponen y cualquier par puede quedar adyacente.
const BASE_COLOR = { A: CATEGORICAL[0], C: CATEGORICAL[1], G: CATEGORICAL[2], T: CATEGORICAL[3] };

const EXAMPLE_CLEAN = ['datos-ejemplo/sanger/B13-27F.ab1', 'datos-ejemplo/sanger/B13-1492R.ab1'];
const EXAMPLE_REVIEW = ['datos-ejemplo/sanger/B1-27F.ab1', 'datos-ejemplo/sanger/B1-1492R.ab1'];

const TABS = [
  { id: 'entrada', labelKey: 'sanger.tabEntrada' },
  { id: 'cromatograma', labelKey: 'sanger.tabCromatograma' },
  { id: 'resultados', labelKey: 'sanger.tabResultados' },
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function fmtPct(x) { return Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '—'; }

function defaultState() {
  return {
    tab: 'entrada',
    trimMethod: 'mott', mottThreshold: 0.05, windowSize: 15, windowMinQ: 20, minLength: 50,
    fwdKeywords: '27F,FWD,FORWARD', revKeywords: '1492R,REV,REVERSE',
    expectedAmplicon: '', ampliconTolerance: 150,
    selectedSampleId: '', selectedDirection: 'forward',
    manualTrim: {}, // { [sampleId]: { forward:{start,end}|null, reverse:{start,end}|null } }
    results: [], // último lote calculado: { id, method, needsReview, reason, overlapLen, matches, identity, nAmbiguous, fLen, rLen, consensus }
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const d = defaultState();
      return {
        tab: typeof raw.tab === 'string' ? raw.tab : d.tab,
        trimMethod: raw.trimMethod === 'window' ? 'window' : 'mott',
        mottThreshold: Number.isFinite(+raw.mottThreshold) && +raw.mottThreshold > 0 ? +raw.mottThreshold : d.mottThreshold,
        windowSize: Number.isFinite(+raw.windowSize) && +raw.windowSize > 1 ? +raw.windowSize : d.windowSize,
        windowMinQ: Number.isFinite(+raw.windowMinQ) ? +raw.windowMinQ : d.windowMinQ,
        minLength: Number.isFinite(+raw.minLength) && +raw.minLength >= 0 ? +raw.minLength : d.minLength,
        fwdKeywords: typeof raw.fwdKeywords === 'string' ? raw.fwdKeywords : d.fwdKeywords,
        revKeywords: typeof raw.revKeywords === 'string' ? raw.revKeywords : d.revKeywords,
        expectedAmplicon: typeof raw.expectedAmplicon === 'string' ? raw.expectedAmplicon : d.expectedAmplicon,
        ampliconTolerance: Number.isFinite(+raw.ampliconTolerance) && +raw.ampliconTolerance >= 0 ? +raw.ampliconTolerance : d.ampliconTolerance,
        selectedSampleId: typeof raw.selectedSampleId === 'string' ? raw.selectedSampleId : '',
        selectedDirection: raw.selectedDirection === 'reverse' ? 'reverse' : 'forward',
        manualTrim: raw.manualTrim && typeof raw.manualTrim === 'object' ? raw.manualTrim : {},
        results: Array.isArray(raw.results) ? raw.results : [],
      };
    }
  } catch (e) { /* localStorage puede fallar */ }
  return defaultState();
}
function save(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
}

// ---------- emparejamiento por nombre de archivo ----------

function baseName(filename) { return String(filename).replace(/\.[^./\\]+$/, ''); }
function guessSampleId(filename) {
  const b = baseName(filename);
  return (b.includes('-') ? b.split('-')[0] : b.split('_')[0]) || b;
}
function splitKeywords(s) { return String(s || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean); }
function guessDirection(filename, fwdKw, revKw) {
  const upper = String(filename).toUpperCase();
  const isF = fwdKw.some((k) => upper.includes(k));
  const isR = revKw.some((k) => upper.includes(k));
  if (isF && !isR) return 'forward';
  if (isR && !isF) return 'reverse';
  return null;
}

// ---------- lectura de archivos ----------

function parseSingleFastq(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i][0] === '@' && lines[i + 2] && lines[i + 2][0] === '+') {
      const seq = lines[i + 1].trim().toUpperCase();
      const qualLine = (lines[i + 3] || '');
      const qual = new Uint8Array(seq.length);
      for (let k = 0; k < seq.length; k++) qual[k] = Math.max(0, (qualLine.charCodeAt(k) || 33) - 33);
      return { sequence: seq, quality: qual };
    }
  }
  throw new Error(t('sanger.errBadFastq'));
}
function parseSingleFasta(text) {
  let seq = '';
  for (const line of text.split(/\r?\n/)) { if (line && line[0] !== '>') seq += line.trim().toUpperCase(); }
  if (!seq) throw new Error(t('sanger.errBadFasta'));
  return { sequence: seq, quality: null };
}

async function readReadFile(file) {
  const name = file.name;
  if (/\.ab1$/i.test(name)) {
    const buf = await file.arrayBuffer();
    const r = parseAb1(buf);
    return { fileName: name, sequence: r.sequence, quality: r.quality, trace: r.trace, peakLocations: r.peakLocations, traceIsRaw: r.traceIsRaw };
  }
  if (/\.(fastq|fq)$/i.test(name)) {
    const rec = parseSingleFastq(await file.text());
    return { fileName: name, sequence: rec.sequence, quality: rec.quality, trace: null, peakLocations: null };
  }
  if (/\.(fasta|fa)$/i.test(name)) {
    const rec = parseSingleFasta(await file.text());
    return { fileName: name, sequence: rec.sequence, quality: rec.quality, trace: null, peakLocations: null };
  }
  throw new Error(t('sanger.errUnknownExt', { name }));
}

// ---------- recorte + solapamiento sobre las lecturas cargadas ----------

function autoTrimOf(read, s) {
  if (!read) return null;
  return s.trimMethod === 'window'
    ? trimRead(read.quality, { method: 'window', windowSize: s.windowSize, minQuality: s.windowMinQ, minLength: s.minLength })
    : trimRead(read.quality, { method: 'mott', errorProbThreshold: s.mottThreshold, minLength: s.minLength });
}
function effectiveTrim(sample, direction, read, s) {
  const auto = autoTrimOf(read, s);
  if (!auto) return null;
  const manual = s.manualTrim[sample.id] && s.manualTrim[sample.id][direction];
  if (manual && Number.isFinite(manual.start) && Number.isFinite(manual.end) && manual.end > manual.start) {
    return { start: manual.start, end: manual.end, length: manual.end - manual.start, discarded: (manual.end - manual.start) < s.minLength, manual: true };
  }
  return auto;
}
function slice(read, trim) {
  if (!read || !trim) return null;
  return { sequence: read.sequence.slice(trim.start, trim.end), quality: read.quality ? read.quality.slice(trim.start, trim.end) : null };
}

function computeResult(sample, s) {
  const fTrim = sample.forward ? effectiveTrim(sample, 'forward', sample.forward, s) : null;
  const rTrim = sample.reverse ? effectiveTrim(sample, 'reverse', sample.reverse, s) : null;
  const fOk = sample.forward && fTrim && !fTrim.discarded;
  const rOk = sample.reverse && rTrim && !rTrim.discarded;
  const base = { id: sample.id, fTrim, rTrim, fLen: fOk ? fTrim.length : 0, rLen: rOk ? rTrim.length : 0 };

  if (fOk && rOk) {
    const f = slice(sample.forward, fTrim);
    const r = slice(sample.reverse, rTrim);
    const expectedAmpliconLen = parseFloat(s.expectedAmplicon) > 0 ? parseFloat(s.expectedAmplicon) : null;
    const res = mergeReads(f, r, { expectedAmpliconLen, ampliconTolerance: s.ampliconTolerance });
    return { ...base, ...res };
  }
  if (fOk) {
    const f = slice(sample.forward, fTrim);
    return { ...base, method: 'forward-only', needsReview: false, reason: 'no_reverse', consensus: f.sequence, overlapLen: 0, matches: 0, identity: 0, nAmbiguous: 0, anchorSeedHits: 0 };
  }
  if (rOk) {
    const r = slice(sample.reverse, rTrim);
    return { ...base, method: 'reverse-only', needsReview: false, reason: 'no_forward', consensus: reverseComplement(r.sequence), overlapLen: 0, matches: 0, identity: 0, nAmbiguous: 0, anchorSeedHits: 0 };
  }
  return { ...base, method: 'none', needsReview: true, reason: (sample.forward || sample.reverse) ? 'discarded_short' : 'no_reads', consensus: '', overlapLen: 0, matches: 0, identity: 0, nAmbiguous: 0, anchorSeedHits: 0 };
}

const REASON_KEY = {
  ok: 'sanger.reasonOk', no_anchor: 'sanger.reasonNoAnchor', overlap_too_short: 'sanger.reasonOverlapShort',
  low_identity: 'sanger.reasonLowIdentity', implausible_length: 'sanger.reasonImplausible',
  no_reverse: 'sanger.reasonNoReverse', no_forward: 'sanger.reasonNoForward',
  discarded_short: 'sanger.reasonDiscarded', no_reads: 'sanger.reasonNoReads',
};
const METHOD_KEY = {
  merged: 'sanger.methodMerged', stitched: 'sanger.methodStitched',
  'forward-only': 'sanger.methodForwardOnly', 'reverse-only': 'sanger.methodReverseOnly', none: 'sanger.methodNone',
};

function sendConsensusToPrimers(sampleId, consensus) {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(PRIMERS_STORE_KEY) || 'null'); } catch (e) { raw = null; }
  if (!raw || !Array.isArray(raw.primers)) {
    raw = {
      tab: 'template', primers: [{ id: 'pr1', name: '', raw: '' }, { id: 'pr2', name: '', raw: '' }],
      salt: 50, conc: 500, templateText: '', templateTol: 1, templateA: '', templateB: '',
      covRefText: '', covTaxText: '', covTol: 1, covA: '', covB: '', covRankIdx: 6, batchPairs: [],
      designText: '', designMode: 'qpcr', designOverrides: { standard: {}, qpcr: {} }, designTargetStart: '', designTargetEnd: '',
    };
  }
  raw.tab = 'template';
  raw.templateText = '>' + sampleId + '\n' + consensus + '\n';
  try { localStorage.setItem(PRIMERS_STORE_KEY, JSON.stringify(raw)); } catch (e) { /* noop */ }
  location.hash = '#/primers';
}

/**
 * URL de la "Common URL API" de NCBI BLAST (CMD=Put) que lanza una búsqueda
 * blastn contra `nt` con la secuencia ya cargada — verificado a mano (no
 * solo documentado) que una petición GET a esta URL con un consenso Sanger
 * real (~1400 nt) devuelve la página de espera con un RID asignado, no una
 * página en blanco. La identificación en sí (correr BLAST) queda fuera de
 * la app: esto es solo el puente hacia NCBI.
 */
function ncbiBlastUrl(sequence) {
  return 'https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Put&PROGRAM=blastn&DATABASE=nt&QUERY=' + encodeURIComponent(sequence);
}

// ---------- visor de cromatograma ----------

function clientXToSvgX(svg, clientX) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  if (!rect.width) return vb.x;
  return vb.x + (clientX - rect.left) * (vb.width / rect.width);
}
function baseIndexAtX(x, nBases, xOfBase) {
  let lo = 0, hi = Math.max(0, nBases - 1);
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xOfBase(mid) < x) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * Dibuja el cromatograma (4 trazas A/C/G/T + calidad por base) y los dos
 * marcadores de recorte arrastrables. Devuelve un manejador para engancharlo
 * al arrastre y a los inputs numéricos de respaldo (accesibles por teclado).
 */
function drawChromatogram(svg, read, trimRange) {
  svg.innerHTML = '';
  const nBases = read.sequence.length;
  const hasTrace = !!read.trace;
  const pxPerBase = hasTrace ? 7 : 5;
  const W = Math.max(600, nBases * pxPerBase);
  const marginL = 44, marginR = 16, marginT = 26, traceH = hasTrace ? 150 : 0, gap = hasTrace ? 14 : 0, qualH = 70;
  const H = marginT + traceH + gap + qualH + 34;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  // ancho en px FIJO, por encima del reset global `svg { max-width:100% }`
  // (css/base.css, pensado para que ninguna figura desborde en móvil): con
  // lecturas de cientos/miles de nt, encoger todo el viewBox al ancho del
  // contenedor aplastaría las 4 trazas en una sola banda ilegible. En su
  // lugar, el contenedor (chartWrap) hace scroll horizontal — el mismo
  // patrón ya permitido para tablas/código anchos, aquí para un cromatograma.
  svg.style.width = W + 'px';
  svg.style.maxWidth = 'none';
  svg.style.height = H + 'px';
  svg.style.display = 'block';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('sanger.chromatogramAlt'));

  const xOfBase = (bi) => {
    const clamped = Math.max(0, Math.min(nBases - 1, bi));
    if (hasTrace && read.peakLocations) {
      const traceMax = Math.max(1, read.trace.A.length - 1);
      return marginL + (Math.max(0, Math.min(traceMax, read.peakLocations[clamped])) / traceMax) * (W - marginL - marginR);
    }
    return marginL + (clamped / Math.max(1, nBases - 1)) * (W - marginL - marginR);
  };

  if (hasTrace) {
    const traceLen = read.trace.A.length;
    const maxIntensity = Math.max(1, ...['A', 'C', 'G', 'T'].flatMap((b) => [Math.max(...read.trace[b])]));
    const yOf = (v) => marginT + traceH - (v / maxIntensity) * traceH;
    const xOfTraceIdx = (ti) => marginL + (ti / Math.max(1, traceLen - 1)) * (W - marginL - marginR);
    const step = Math.max(1, Math.floor(traceLen / (W * 1.5)));
    ['A', 'C', 'G', 'T'].forEach((b) => {
      const pts = [];
      for (let ti = 0; ti < traceLen; ti += step) pts.push(xOfTraceIdx(ti).toFixed(1) + ',' + yOf(read.trace[b][ti]).toFixed(1));
      svg.appendChild(svgEl('polyline', {
        points: pts.join(' '), fill: 'none', stroke: BASE_COLOR[b], 'stroke-width': 1.1,
        'data-ce-series-stroke': 'base-' + b,
      }));
    });
  }

  // calidad por base (área)
  const qualBase = marginT + traceH + gap + qualH;
  const qualScale = 60; // techo visual (Phred 60 = tope de la barra, sube a más)
  if (read.quality) {
    let d = 'M' + xOfBase(0).toFixed(1) + ',' + qualBase;
    for (let bi = 0; bi < nBases; bi++) {
      const y = qualBase - (Math.min(qualScale, read.quality[bi]) / qualScale) * qualH;
      d += ' L' + xOfBase(bi).toFixed(1) + ',' + y.toFixed(1);
    }
    d += ' L' + xOfBase(nBases - 1).toFixed(1) + ',' + qualBase + ' Z';
    svg.appendChild(svgEl('path', { d, fill: 'var(--accent)', opacity: '0.28', stroke: 'var(--accent)', 'stroke-width': '1' }));
  }
  svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: qualBase, y2: qualBase, stroke: 'var(--border)', 'stroke-width': '1' }));

  const handles = {};
  ['start', 'end'].forEach((which) => {
    const bi = which === 'start' ? trimRange.start : Math.max(0, trimRange.end - 1);
    const x = xOfBase(bi);
    const g = svgEl('g', {
      'data-trim': which, style: 'cursor:ew-resize', tabindex: '0', role: 'slider',
      'aria-label': t('sanger.trimHandle' + (which === 'start' ? 'Start' : 'End')),
      'aria-valuemin': '0', 'aria-valuemax': String(nBases),
      'aria-valuenow': String(which === 'start' ? trimRange.start : trimRange.end),
    });
    g.appendChild(svgEl('line', { x1: x, x2: x, y1: marginT - 14, y2: qualBase + 12, stroke: which === 'start' ? 'var(--critical)' : 'var(--accent)', 'stroke-width': '2', 'stroke-dasharray': '5 3' }));
    g.appendChild(svgEl('circle', { cx: x, cy: marginT - 14, r: '8', fill: which === 'start' ? 'var(--critical)' : 'var(--accent)' }));
    svg.appendChild(g);
    handles[which] = g;
  });

  return { xOfBase, handles, W, H, nBases };
}

// ---------- render ----------

export function render(container) {
  const s = load();
  const samples = new Map(); // id -> { id, forward: ReadData|null, reverse: ReadData|null }
  const pending = []; // archivos sin dirección detectable: { fileKey, read, fileName, id, direction }
  let nextPendingKey = 1;
  let stopActiveDrag = null; // si el usuario navega fuera a mitad de un arrastre, lo suelta el cleanup final

  function sampleList() { return [...samples.values()].sort((a, b) => a.id.localeCompare(b.id)); }

  function recomputeResults() {
    s.results = sampleList().map((sample) => {
      const r = computeResult(sample, s);
      return {
        id: r.id, method: r.method, needsReview: r.needsReview, reason: r.reason,
        overlapLen: r.overlapLen, matches: r.matches, identity: r.identity, nAmbiguous: r.nAmbiguous,
        fLen: r.fLen, rLen: r.rLen, consensus: r.consensus,
      };
    });
  }

  function upsertRead(id, direction, read) {
    if (!samples.has(id)) samples.set(id, { id, forward: null, reverse: null });
    samples.get(id)[direction] = read;
  }

  async function handleFiles(fileList) {
    const fwdKw = splitKeywords(s.fwdKeywords), revKw = splitKeywords(s.revKeywords);
    for (const file of fileList) {
      let read;
      try { read = await readReadFile(file); } catch (err) { pending.push({ fileKey: 'err' + (nextPendingKey++), error: (err && err.message) || String(err), fileName: file.name }); continue; }
      const id = guessSampleId(file.name);
      const direction = guessDirection(file.name, fwdKw, revKw);
      if (direction) upsertRead(id, direction, read);
      else pending.push({ fileKey: 'p' + (nextPendingKey++), read, fileName: file.name, id, direction: 'forward' });
    }
    recomputeResults();
    save(s);
    paint();
  }

  async function loadExample(urls) {
    const files = await Promise.all(urls.map(async (u) => {
      const resp = await fetch(u);
      const buf = await resp.arrayBuffer();
      return { name: u.split('/').pop(), arrayBuffer: async () => buf };
    }));
    await handleFiles(files);
  }

  function paint() {
    container.innerHTML = '';
    save(s);

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('sanger.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('sanger.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('sanger.subtitle') + '</p>';
    container.appendChild(header);

    const tabsEl = document.createElement('div');
    tabsEl.className = 'ql-tabs';
    tabsEl.setAttribute('role', 'tablist');
    TABS.forEach((tabDef) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-tab' + (s.tab === tabDef.id ? ' is-active' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(s.tab === tabDef.id));
      b.textContent = t(tabDef.labelKey);
      b.addEventListener('click', () => { s.tab = tabDef.id; paint(); });
      tabsEl.appendChild(b);
    });
    container.appendChild(tabsEl);

    if (s.tab === 'entrada') paintEntrada(container);
    else if (s.tab === 'cromatograma') paintCromatograma(container);
    else paintResultados(container);
  }

  // ---------------- pestaña: entrada ----------------
  function paintEntrada(container) {
    const stack = document.createElement('div');
    stack.className = 'ql-stack';

    const scopeCard = document.createElement('section');
    scopeCard.className = 'ql-card ql-panel';
    scopeCard.innerHTML = '<h2>' + t('sanger.scopeTitle') + '</h2><p class="ql-panel-note">' + t('sanger.scopeNote') + '</p>';
    stack.appendChild(scopeCard);

    // --- dropzone ---
    const upCard = document.createElement('section');
    upCard.className = 'ql-card ql-panel';
    upCard.innerHTML = '<h2>' + t('sanger.uploadTitle') + '</h2><p class="ql-panel-note">' + t('sanger.uploadNote') + '</p>';
    const dz = document.createElement('div');
    dz.className = 'ql-dropzone';
    dz.tabIndex = 0;
    dz.setAttribute('role', 'button');
    dz.setAttribute('aria-label', t('sanger.uploadTitle'));
    dz.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
      '<div><div class="ql-dz-text">' + t('sanger.dropzone') + '</div><div class="ql-dz-sub">' + t('sanger.dropSub') + '</div></div>';
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.ab1,.fastq,.fq,.fasta,.fa';
    dz.appendChild(input);
    input.addEventListener('change', () => { if (input.files.length) handleFiles([...input.files]); input.value = ''; });
    dz.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('is-drag');
      if (e.dataTransfer && e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]);
    });
    upCard.appendChild(dz);

    const exRow = document.createElement('div');
    exRow.style.cssText = 'margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;';
    const mkExBtn = (label, urls) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ql-btn ql-btn-primary'; b.textContent = label;
      b.addEventListener('click', async () => {
        b.disabled = true; const prev = b.textContent; b.textContent = t('common.loadingProcessing');
        try { await loadExample(urls); } catch (err) { console.error(err); } finally { b.disabled = false; b.textContent = prev; }
      });
      return b;
    };
    exRow.appendChild(mkExBtn(t('sanger.exampleClean'), EXAMPLE_CLEAN));
    exRow.appendChild(mkExBtn(t('sanger.exampleReview'), EXAMPLE_REVIEW));
    upCard.appendChild(exRow);
    stack.appendChild(upCard);

    // --- archivos sin dirección detectada ---
    if (pending.length) {
      const pendCard = document.createElement('section');
      pendCard.className = 'ql-card ql-panel';
      pendCard.innerHTML = '<h2>' + t('sanger.pendingTitle') + '</h2><p class="ql-panel-note">' + t('sanger.pendingNote') + '</p>';
      pending.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'ql-field';
        row.style.cssText = 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:10px;';
        if (p.error) {
          row.innerHTML = '<span class="ql-badge ql-badge-crit">' + escapeHtml(p.fileName) + '</span><span class="ql-field-help" style="margin:0;">' + escapeHtml(p.error) + '</span>';
          pendCard.appendChild(row);
          return;
        }
        row.innerHTML =
          '<span style="font-size:12.5px;color:var(--ink-2);min-width:160px;" title="' + escapeHtml(p.fileName) + '">' + escapeHtml(p.fileName) + '</span>';
        const idInput = document.createElement('input');
        idInput.type = 'text'; idInput.value = p.id; idInput.style.maxWidth = '140px';
        idInput.setAttribute('aria-label', t('sanger.pendingSampleId'));
        idInput.addEventListener('input', () => { p.id = idInput.value; });
        const dirSel = document.createElement('select');
        dirSel.setAttribute('aria-label', t('sanger.pendingDirection'));
        [['forward', t('sanger.forward')], ['reverse', t('sanger.reverse')]].forEach(([v, lbl]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = lbl; if (v === p.direction) o.selected = true; dirSel.appendChild(o);
        });
        dirSel.addEventListener('change', () => { p.direction = dirSel.value; });
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'ql-btn'; addBtn.textContent = t('sanger.pendingAdd');
        addBtn.addEventListener('click', () => {
          upsertRead(p.id.trim() || p.fileName, p.direction, p.read);
          pending.splice(pending.indexOf(p), 1);
          recomputeResults(); save(s); paint();
        });
        row.appendChild(idInput); row.appendChild(dirSel); row.appendChild(addBtn);
        pendCard.appendChild(row);
      });
      stack.appendChild(pendCard);
    }

    // --- muestras emparejadas ---
    const list = sampleList();
    if (list.length) {
      const table = document.createElement('section');
      table.className = 'ql-card ql-panel';
      table.innerHTML = '<h2>' + t('sanger.samplesTitle') + '</h2>';
      const scroll = document.createElement('div');
      scroll.className = 'ql-table-scroll';
      const tbl = document.createElement('table');
      tbl.className = 'ql-table';
      tbl.innerHTML = '<thead><tr><th>' + t('sanger.colSample') + '</th><th>' + t('sanger.colForward') + '</th><th>' + t('sanger.colReverse') + '</th><th></th></tr></thead>';
      const tbody = document.createElement('tbody');
      list.forEach((sample) => {
        const tr = document.createElement('tr');
        const fLabel = sample.forward ? escapeHtml(sample.forward.fileName) + (sample.forward.trace ? '' : ' <span class="ql-badge ql-badge-muted">' + t('sanger.noTrace') + '</span>') : '—';
        const rLabel = sample.reverse ? escapeHtml(sample.reverse.fileName) + (sample.reverse.trace ? '' : ' <span class="ql-badge ql-badge-muted">' + t('sanger.noTrace') + '</span>') : '—';
        tr.innerHTML = '<td><strong>' + escapeHtml(sample.id) + '</strong></td><td>' + fLabel + '</td><td>' + rLabel + '</td><td></td>';
        const rmBtn = document.createElement('button');
        rmBtn.type = 'button'; rmBtn.className = 'ql-btn'; rmBtn.textContent = t('sanger.remove');
        rmBtn.addEventListener('click', () => { samples.delete(sample.id); recomputeResults(); save(s); paint(); });
        tr.lastElementChild.appendChild(rmBtn);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      scroll.appendChild(tbl);
      table.appendChild(scroll);
      stack.appendChild(table);
    }

    // --- configuración ---
    const cfg = document.createElement('section');
    cfg.className = 'ql-card ql-panel';
    cfg.innerHTML = '<h2>' + t('sanger.configTitle') + '</h2>';

    const trimField = document.createElement('div');
    trimField.className = 'ql-field';
    trimField.innerHTML = '<label>' + t('sanger.trimMethodLabel') + '</label>';
    const segWrap = document.createElement('div');
    segWrap.style.cssText = 'display:flex;gap:8px;';
    [['mott', t('sanger.trimMethodMott')], ['window', t('sanger.trimMethodWindow')]].forEach(([v, lbl]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ql-seg-btn' + (s.trimMethod === v ? ' is-on' : ''); b.textContent = lbl;
      b.addEventListener('click', () => { s.trimMethod = v; recomputeResults(); save(s); paint(); });
      segWrap.appendChild(b);
    });
    trimField.appendChild(segWrap);
    trimField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('sanger.trimMethodHelp') + '</p>');
    cfg.appendChild(trimField);

    function numField(labelKey, value, onChange, { step = 1, min = 0, helpKey = null } = {}) {
      const f = document.createElement('div');
      f.className = 'ql-field';
      const id = 'sg' + Math.random().toString(36).slice(2, 8);
      f.innerHTML = '<label for="' + id + '">' + t(labelKey) + '</label>';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.id = id; inp.value = value; inp.step = String(step); inp.min = String(min);
      inp.addEventListener('change', () => { onChange(+inp.value); recomputeResults(); save(s); paint(); });
      f.appendChild(inp);
      if (helpKey) f.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t(helpKey) + '</p>');
      return f;
    }

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px;';
    if (s.trimMethod === 'mott') {
      grid.appendChild(numField('sanger.mottThresholdLabel', s.mottThreshold, (v) => { s.mottThreshold = v; }, { step: 0.01, min: 0.001, helpKey: 'sanger.mottThresholdHelp' }));
    } else {
      grid.appendChild(numField('sanger.windowSizeLabel', s.windowSize, (v) => { s.windowSize = v; }, { step: 1, min: 2 }));
      grid.appendChild(numField('sanger.windowMinQLabel', s.windowMinQ, (v) => { s.windowMinQ = v; }, { step: 1, min: 0 }));
    }
    grid.appendChild(numField('sanger.minLengthLabel', s.minLength, (v) => { s.minLength = v; }, { step: 1, min: 0 }));
    cfg.appendChild(grid);

    const kwGrid = document.createElement('div');
    kwGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 16px;margin-top:6px;';
    function textField(labelKey, value, onChange, helpKey) {
      const f = document.createElement('div');
      f.className = 'ql-field';
      const id = 'sg' + Math.random().toString(36).slice(2, 8);
      f.innerHTML = '<label for="' + id + '">' + t(labelKey) + '</label>';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = id; inp.value = value;
      inp.addEventListener('change', () => { onChange(inp.value); recomputeResults(); save(s); paint(); });
      f.appendChild(inp);
      if (helpKey) f.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t(helpKey) + '</p>');
      return f;
    }
    kwGrid.appendChild(textField('sanger.fwdKeywordsLabel', s.fwdKeywords, (v) => { s.fwdKeywords = v; }, 'sanger.keywordsHelp'));
    kwGrid.appendChild(textField('sanger.revKeywordsLabel', s.revKeywords, (v) => { s.revKeywords = v; }));
    cfg.appendChild(kwGrid);

    const ampGrid = document.createElement('div');
    ampGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px;margin-top:6px;';
    ampGrid.appendChild(numField('sanger.ampliconLenLabel', s.expectedAmplicon || '', (v) => { s.expectedAmplicon = v ? String(v) : ''; }, { step: 1, min: 0, helpKey: 'sanger.ampliconLenHelp' }));
    ampGrid.appendChild(numField('sanger.ampliconTolLabel', s.ampliconTolerance, (v) => { s.ampliconTolerance = v; }, { step: 10, min: 0 }));
    cfg.appendChild(ampGrid);

    stack.appendChild(cfg);
    container.appendChild(stack);
  }

  // ---------------- pestaña: cromatograma ----------------
  function paintCromatograma(container) {
    const stack = document.createElement('div');
    stack.className = 'ql-stack';
    const list = sampleList();

    if (!list.length) {
      const empty = document.createElement('section');
      empty.className = 'ql-card ql-panel';
      empty.innerHTML = '<h2>' + t('sanger.noSamplesTitle') + '</h2><p class="ql-panel-note">' + t('sanger.noSamplesNote') + '</p>';
      stack.appendChild(empty); container.appendChild(stack); return;
    }
    if (!list.some((sm) => sm.id === s.selectedSampleId)) s.selectedSampleId = list[0].id;
    const sample = list.find((sm) => sm.id === s.selectedSampleId);

    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';
    const ctrlRow = document.createElement('div');
    ctrlRow.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;';

    const sampSel = document.createElement('select');
    sampSel.setAttribute('aria-label', t('sanger.selectSample'));
    list.forEach((sm) => { const o = document.createElement('option'); o.value = sm.id; o.textContent = sm.id; if (sm.id === s.selectedSampleId) o.selected = true; sampSel.appendChild(o); });
    sampSel.addEventListener('change', () => { s.selectedSampleId = sampSel.value; save(s); paint(); });
    ctrlRow.appendChild(sampSel);

    const dirWrap = document.createElement('div');
    dirWrap.style.cssText = 'display:flex;gap:8px;';
    [['forward', t('sanger.forward')], ['reverse', t('sanger.reverse')]].forEach(([v, lbl]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ql-seg-btn' + (s.selectedDirection === v ? ' is-on' : '');
      b.textContent = lbl; b.disabled = !sample[v];
      b.addEventListener('click', () => { s.selectedDirection = v; save(s); paint(); });
      dirWrap.appendChild(b);
    });
    ctrlRow.appendChild(dirWrap);
    card.appendChild(ctrlRow);

    const read = sample[s.selectedDirection];
    if (!read) {
      card.insertAdjacentHTML('beforeend', '<p class="ql-panel-note">' + t('sanger.noReadForDirection') + '</p>');
      stack.appendChild(card); container.appendChild(stack); return;
    }

    const manual = s.manualTrim[sample.id] && s.manualTrim[sample.id][s.selectedDirection];
    const trimRange = effectiveTrim(sample, s.selectedDirection, read, s);

    if (!read.trace) card.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('sanger.noTraceNote') + '</p>');

    const chartWrap = document.createElement('div');
    chartWrap.style.cssText = 'overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px;';
    const svg = svgEl('svg', {});
    chartWrap.appendChild(svg);
    card.appendChild(chartWrap);

    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;';
    if (read.trace) {
      ['A', 'C', 'G', 'T'].forEach((b) => {
        legend.insertAdjacentHTML('beforeend', '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:12px;height:3px;background:' + BASE_COLOR[b] + ';display:inline-block;"></span>' + b + '</span>');
      });
    }
    legend.insertAdjacentHTML('beforeend', '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;background:var(--critical);border-radius:50%;display:inline-block;"></span>' + t('sanger.legendStart') + '</span>');
    legend.insertAdjacentHTML('beforeend', '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;background:var(--accent);border-radius:50%;display:inline-block;"></span>' + t('sanger.legendEnd') + '</span>');
    card.appendChild(legend);

    const chart = drawChromatogram(svg, read, trimRange);

    function commitManual(start, end) {
      start = Math.max(0, Math.min(read.sequence.length - 1, Math.round(start)));
      end = Math.max(start + 1, Math.min(read.sequence.length, Math.round(end)));
      s.manualTrim[sample.id] = s.manualTrim[sample.id] || {};
      s.manualTrim[sample.id][s.selectedDirection] = { start, end };
      recomputeResults(); save(s); paint();
    }

    const numRow = document.createElement('div');
    numRow.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;';
    const startField = document.createElement('div');
    startField.className = 'ql-field'; startField.style.maxWidth = '160px';
    const startId = 'sgTrimStart', endId = 'sgTrimEnd';
    startField.innerHTML = '<label for="' + startId + '">' + t('sanger.trimStartLabel') + '</label>';
    const startInp = document.createElement('input');
    startInp.type = 'number'; startInp.id = startId; startInp.min = '0'; startInp.max = String(read.sequence.length); startInp.value = trimRange.start;
    startInp.addEventListener('change', () => commitManual(+startInp.value, trimRange.end));
    startField.appendChild(startInp);
    const endField = document.createElement('div');
    endField.className = 'ql-field'; endField.style.maxWidth = '160px';
    endField.innerHTML = '<label for="' + endId + '">' + t('sanger.trimEndLabel') + '</label>';
    const endInp = document.createElement('input');
    endInp.type = 'number'; endInp.id = endId; endInp.min = '0'; endInp.max = String(read.sequence.length); endInp.value = trimRange.end;
    endInp.addEventListener('change', () => commitManual(trimRange.start, +endInp.value));
    endField.appendChild(endInp);
    numRow.appendChild(startField); numRow.appendChild(endField);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button'; resetBtn.className = 'ql-btn'; resetBtn.textContent = t('sanger.resetTrim');
    resetBtn.disabled = !manual;
    resetBtn.style.alignSelf = 'flex-end';
    resetBtn.addEventListener('click', () => {
      if (s.manualTrim[sample.id]) delete s.manualTrim[sample.id][s.selectedDirection];
      recomputeResults(); save(s); paint();
    });
    numRow.appendChild(resetBtn);
    card.appendChild(numRow);

    // Arrastre: repintar TODO el módulo en cada pointermove (como hace
    // commitManual) dejaría listeners "zombis" en `window` apuntando a un
    // <svg> ya destruido, en cuanto el primer movimiento disparase el
    // primer repintado. En su lugar, el arrastre solo mueve el marcador y
    // los inputs numéricos EN VIVO sobre el propio SVG; el estado (y el
    // único repintado) se confirma una vez, al soltar.
    let dragging = null, liveStart = trimRange.start, liveEnd = trimRange.end;
    function moveHandleTo(which, bi) {
      const g = chart.handles[which];
      const x = chart.xOfBase(which === 'start' ? bi : Math.max(0, bi - 1));
      g.querySelectorAll('line').forEach((l) => { l.setAttribute('x1', x); l.setAttribute('x2', x); });
      const circle = g.querySelector('circle');
      if (circle) circle.setAttribute('cx', x);
      g.setAttribute('aria-valuenow', String(bi));
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const x = clientXToSvgX(svg, e.clientX);
      const bi = baseIndexAtX(x, chart.nBases, chart.xOfBase);
      if (dragging === 'start') { liveStart = Math.min(bi, liveEnd - 1); moveHandleTo('start', liveStart); startInp.value = liveStart; }
      else { liveEnd = Math.max(bi + 1, liveStart + 1); moveHandleTo('end', liveEnd); endInp.value = liveEnd; }
    }
    function onPointerUp() {
      const wasDragging = dragging;
      dragging = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      stopActiveDrag = null;
      if (wasDragging) commitManual(liveStart, liveEnd);
    }
    ['start', 'end'].forEach((which) => {
      chart.handles[which].addEventListener('pointerdown', (e) => {
        e.preventDefault(); dragging = which; liveStart = trimRange.start; liveEnd = trimRange.end;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        stopActiveDrag = onPointerUp;
      });
      chart.handles[which].addEventListener('keydown', (e) => {
        const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0;
        if (!delta) return;
        e.preventDefault();
        if (which === 'start') commitManual(trimRange.start + delta, trimRange.end);
        else commitManual(trimRange.start, trimRange.end + delta);
      });
    });

    card.insertAdjacentHTML('beforeend',
      '<p class="ql-field-help" style="margin-top:10px;">' + t('sanger.trimInfo', { start: trimRange.start, end: trimRange.end, len: trimRange.length, total: read.sequence.length }) +
      (manual ? ' · ' + t('sanger.trimIsManual') : ' · ' + t('sanger.trimIsAuto')) + '</p>');

    stack.appendChild(card);
    container.appendChild(stack);

    attachChartEditor({
      key: 'sanger-chromatogram', svg, mount: card, lang: getLang(),
      filename: t('sanger.title') + '-' + sample.id + '-' + s.selectedDirection,
      elements: [], paletteType: 'categorical', paletteMax: 4,
      paletteSeries: read.trace ? ['A', 'C', 'G', 'T'].map((b) => ({ id: 'base-' + b, label: b })) : [],
    });
  }

  // ---------------- pestaña: resultados ----------------
  function paintResultados(container) {
    const stack = document.createElement('div');
    stack.className = 'ql-stack';
    recomputeResults();
    save(s);
    const results = s.results;

    if (!results.length) {
      const empty = document.createElement('section');
      empty.className = 'ql-card ql-panel';
      empty.innerHTML = '<h2>' + t('sanger.noSamplesTitle') + '</h2><p class="ql-panel-note">' + t('sanger.noSamplesNote') + '</p>';
      stack.appendChild(empty); container.appendChild(stack); return;
    }

    const summary = document.createElement('section');
    summary.className = 'ql-card ql-panel';
    summary.innerHTML = '<h2>' + t('sanger.resultsTitle') + '</h2><p class="ql-panel-note">' + t('sanger.resultsNote') + '</p>';
    const scroll = document.createElement('div');
    scroll.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr><th>' + t('sanger.colSample') + '</th><th>' + t('sanger.colMethod') + '</th>' +
      '<th>' + t('sanger.colOverlap') + '</th><th>' + t('sanger.colIdentity') + '</th><th>' + t('sanger.colLen') + '</th><th>' + t('sanger.colReview') + '</th></tr></thead>';
    const tbody = document.createElement('tbody');
    results.forEach((r) => {
      const tr = document.createElement('tr');
      if (r.needsReview) tr.style.background = 'color-mix(in srgb, var(--warning) 10%, transparent)';
      const badgeClass = r.needsReview ? 'ql-badge-warn' : (r.method === 'merged' ? 'ql-badge-good' : 'ql-badge-muted');
      tr.innerHTML =
        '<td><strong>' + escapeHtml(r.id) + '</strong></td>' +
        '<td><span class="ql-badge ' + badgeClass + '">' + t(METHOD_KEY[r.method] || r.method) + '</span></td>' +
        '<td>' + (r.overlapLen || '—') + '</td>' +
        '<td>' + (r.overlapLen ? fmtPct(r.identity) : '—') + '</td>' +
        '<td>' + (r.consensus.length || '—') + '</td>' +
        '<td>' + (r.needsReview ? '<span class="ql-badge ql-badge-warn">' + t('sanger.reviewNeeded') + '</span>' : t('sanger.reviewOk')) + '</td>';
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => { s.selectedSampleId = r.id; save(s); paintDetail(r); });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scroll.appendChild(tbl);
    summary.appendChild(scroll);

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button'; exportBtn.className = 'ql-btn ql-btn-primary'; exportBtn.style.marginTop = '14px';
    exportBtn.textContent = t('sanger.exportFasta');
    exportBtn.addEventListener('click', () => {
      const fasta = results.filter((r) => r.consensus).map((r) => '>' + r.id + ' method=' + r.method + (r.needsReview ? ' NEEDS_REVIEW' : '') + '\n' + r.consensus).join('\n') + '\n';
      const blob = new Blob([fasta], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'sanger-consenso.fasta'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    summary.appendChild(exportBtn);
    stack.appendChild(summary);

    const detailWrap = document.createElement('section');
    detailWrap.className = 'ql-card ql-panel';
    detailWrap.id = 'sangerDetail';
    stack.appendChild(detailWrap);
    container.appendChild(stack);

    function paintDetail(r) {
      detailWrap.innerHTML = '';
      detailWrap.innerHTML = '<h2>' + escapeHtml(r.id) + '</h2>';
      if (r.needsReview) {
        detailWrap.insertAdjacentHTML('beforeend',
          '<p class="ql-panel-note" style="color:var(--warning);"><strong>' + t('sanger.reviewNeeded') + '</strong> — ' + t(REASON_KEY[r.reason] || r.reason) + '</p>');
      }
      const stats = document.createElement('div');
      stats.className = 'ql-stats';
      [
        [t('sanger.colMethod'), t(METHOD_KEY[r.method] || r.method)],
        [t('sanger.colOverlap'), r.overlapLen || '—'],
        [t('sanger.colIdentity'), r.overlapLen ? fmtPct(r.identity) : '—'],
        [t('sanger.statAmbiguous'), r.nAmbiguous],
        [t('sanger.statConsensusLen'), r.consensus.length],
      ].forEach(([lbl, val]) => {
        const tile = document.createElement('div'); tile.className = 'ql-stat';
        tile.innerHTML = '<div class="ql-stat-label">' + lbl + '</div><div class="ql-stat-value" style="font-size:18px;">' + val + '</div>';
        stats.appendChild(tile);
      });
      detailWrap.appendChild(stats);

      const pre = document.createElement('pre');
      pre.className = 'ql-code';
      pre.style.cssText = 'max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin-top:14px;';
      pre.textContent = r.consensus || t('sanger.noConsensus');
      detailWrap.appendChild(pre);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button'; copyBtn.className = 'ql-btn'; copyBtn.textContent = t('sanger.copyFasta');
      copyBtn.addEventListener('click', () => {
        try {
          navigator.clipboard.writeText('>' + r.id + '\n' + r.consensus);
          copyBtn.textContent = t('sanger.copiedFasta');
          setTimeout(() => { copyBtn.textContent = t('sanger.copyFasta'); }, 1600);
        } catch (e) { /* clipboard puede fallar */ }
      });
      const sendBtn = document.createElement('button');
      sendBtn.type = 'button'; sendBtn.className = 'ql-btn'; sendBtn.textContent = t('sanger.sendToPrimers');
      sendBtn.disabled = !r.consensus;
      sendBtn.addEventListener('click', () => sendConsensusToPrimers(r.id, r.consensus));
      btnRow.appendChild(copyBtn); btnRow.appendChild(sendBtn);
      if (r.consensus) {
        const blastLink = document.createElement('a');
        blastLink.className = 'ql-btn';
        blastLink.href = ncbiBlastUrl(r.consensus);
        blastLink.target = '_blank';
        blastLink.rel = 'noopener';
        blastLink.title = t('sanger.blastTitle');
        blastLink.textContent = t('sanger.blastLink') + ' ↗';
        btnRow.appendChild(blastLink);
      }
      detailWrap.appendChild(btnRow);
      detailWrap.insertAdjacentHTML('beforeend', '<p class="ql-field-help" style="margin-top:8px;">' + t('sanger.blastNote') + '</p>');
    }

    const initial = results.find((r) => r.id === s.selectedSampleId) || results[0];
    paintDetail(initial);
  }

  paint();
  return () => { if (stopActiveDrag) stopActiveDrag(); };
}
