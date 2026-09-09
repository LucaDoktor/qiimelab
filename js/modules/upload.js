import { state, subscribe, registerFile, removeFile } from '../state.js';
import { t } from '../lib/i18n.js';
import { ingestFile } from '../lib/ingest.js';
import { routeResultToState } from '../lib/route.js';
import { exportSession, importSession, describeSession, sessionFilename } from '../lib/session.js';
import { openConfirm } from '../lib/modal.js';
import { checkDataHealth } from '../lib/dataHealth.js';
import {
  loadExampleCommunityData, loadExampleDifferentialAbundance,
  loadRealCommunityData, loadRealDifferentialAbundance, loadRealFunctional,
  exampleDownloadBlock, exampleFileLinks,
} from '../lib/exampleData.js';

function downloadFile(name, text, mime) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) { return false; }
}

// Tipos de archivo que el detector (ingest.js) reconoce, con las columnas
// mínimas y los alias de cabecera que acepta cada uno. Se usa para la ayuda
// "ver estructura esperada" del checklist. `key` = clave de i18n (slots.*,
// fmt.det.*) y `slotKey` = hueco del estado con el que se marca "hecho".
function fileTypes() {
  const T = (k) => t('fmt.' + k);
  return [
    { key: 'metadata', slotKey: 'metadata', exdl: ['metadata'], cols: [
      { role: T('role.sampleId'), names: ['sample-id', 'sampleid', '#SampleID', 'id', 'sample'], req: 'yes', note: T('firstColOnly') },
      { role: T('role.variables'), desc: T('anyName'), req: 'yes' },
    ] },
    { key: 'taxonomy', slotKey: 'taxonomy', exdl: ['taxonomy'], cols: [
      { role: T('role.featureId'), names: ['Feature ID', 'id'], req: 'yes' },
      { role: T('role.lineage'), names: ['Taxon', 'Taxonomy'], req: 'yes', note: 'd__…;p__…;c__…;o__…;f__…;g__…;s__…' },
      { role: T('role.confidence'), names: ['Confidence'], req: 'opt' },
    ] },
    { key: 'taxaBarplot', slotKey: 'taxaBarplot', exdl: ['barplot'], foot: T('levelHint'), cols: [
      { role: T('role.sampleId'), desc: T('anyFirst'), req: 'yes' },
      { role: T('role.taxonCols'), desc: T('taxonColsHint'), req: 'yes' },
      { role: T('role.othersCol'), names: ['Others', 'Otros', 'Other', 'resto'], req: 'form' },
    ] },
    { key: 'taxaCounts', slotKey: 'taxaCounts', exdl: ['counts'], cols: [
      { role: T('role.taxonLabel'), names: ['taxon', 'feature', 'OTU', 'ASV', 'id', '#OTU ID'], req: 'yes', note: T('firstColOnly') },
      { role: T('role.sampleCols'), desc: T('anyName'), req: 'yes' },
    ] },
    { key: 'alpha', slotKey: 'alphaDiversity', exdl: ['shannon', 'observed'], cols: [
      { role: T('role.sampleId'), desc: T('anyFirst'), req: 'yes' },
      { role: T('role.metricValue'), names: ['shannon_entropy', 'observed_features', 'faith_pd', 'pielou_evenness'], req: 'yes' },
    ] },
    { key: 'beta', slotKey: 'betaDiversity', exdl: ['betaqza'], cols: [
      { role: T('role.distRowId'), desc: T('anyName'), req: 'yes' },
      { role: T('role.sampleCols'), desc: T('distCellsHint'), req: 'yes' },
    ] },
    { key: 'ordination', slotKey: 'ordination', exdl: ['pcoa'], freeform: T('free.ordination') },
    { key: 'differential', slotKey: 'differentialAbundance', exdl: ['deseq2'], cols: [
      { role: T('role.taxonLabel'), names: ['taxon', 'genus', 'feature', 'name'], req: 'yes' },
      { role: T('role.lfc'), names: ['log2FoldChange', 'log2FC', 'lfc', 'logFC', 'foldChange'], req: 'yes' },
      { role: T('role.padj'), names: ['padj', 'pvalAdj', 'qvalue', 'FDR', 'adjPval'], req: 'yes' },
    ] },
    { key: 'functionalCategories', slotKey: 'functionalCategories', exdl: ['kolist'], cols: [
      { role: T('role.module'), names: ['Functional Module', 'module', 'moduloFuncional', 'pathway'], req: 'yes' },
      { role: T('role.ko'), names: ['KO', 'KO ID', 'orthology', 'keggKO'], req: 'yes' },
    ] },
    { key: 'functionalKO', slotKey: 'functionalKO', exdl: ['koabund'], cols: [
      { role: T('role.keggId'), names: ['K00001', 'K12345'], req: 'yes', note: T('keggIdNote') },
      { role: T('role.sampleCols'), desc: T('anyName'), req: 'yes' },
    ] },
    { key: 'fastq', slotKey: 'sequenceQC', exdl: ['fastq'], freeform: T('free.fastq') },
  ];
}

export function render(container) {
  let lastWarnings = [];

  function paint() {
    container.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('upload.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('upload.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('upload.subtitle') + '</p>';
    container.appendChild(header);

    const stack = document.createElement('div');
    stack.className = 'ql-stack';

    // dropzone card
    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';

    const dz = document.createElement('div');
    dz.className = 'ql-dropzone';
    dz.tabIndex = 0;
    dz.setAttribute('role', 'button');
    dz.setAttribute('aria-label', t('ui.uploadFiles'));
    dz.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
      '<div><div class="ql-dz-text">' + t('upload.dropzone') + '</div>' +
      '<div class="ql-dz-sub">' + t('upload.dropSub') + '</div></div>';
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.qza,.qzv,.tsv,.csv,.txt,.fastq,.fq,.gz';
    dz.appendChild(input);
    card.appendChild(dz);

    const exampleWrap = document.createElement('div');
    exampleWrap.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid var(--border);';
    exampleWrap.innerHTML =
      '<p class="ql-field-help" style="margin:0 0 8px;">' + t('upload.exampleIntro') + '</p>';

    const realRow = document.createElement('div');
    realRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
    [
      [t('upload.exReal1'), loadRealCommunityData],
      [t('upload.exReal2'), () => loadRealDifferentialAbundance()],
      [t('upload.exReal3'), loadRealFunctional],
    ].forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.className = 'ql-btn ql-btn-primary';
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', async () => {
        b.disabled = true;
        const prev = b.textContent;
        b.textContent = t('common.loadingProcessing');
        try {
          const warnings = await fn();
          lastWarnings = Array.isArray(warnings) ? warnings : [];
        } catch (e) {
          lastWarnings = [(e && e.message) ? e.message : String(e)];
        }
        paint();
      });
      realRow.appendChild(b);
    });
    exampleWrap.appendChild(realRow);

    const synthRow = document.createElement('div');
    synthRow.style.cssText = 'display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;';
    const btnCommunity = document.createElement('button');
    btnCommunity.className = 'ql-btn';
    btnCommunity.type = 'button';
    btnCommunity.textContent = t('upload.exSynth1');
    const btnDiff = document.createElement('button');
    btnDiff.className = 'ql-btn';
    btnDiff.type = 'button';
    btnDiff.textContent = t('upload.exSynth2');
    synthRow.appendChild(btnCommunity);
    synthRow.appendChild(btnDiff);
    exampleWrap.appendChild(synthRow);

    const dl = document.createElement('details');
    dl.className = 'ql-exdl-details';
    dl.style.marginTop = '14px';
    const sm = document.createElement('summary');
    sm.textContent = t('exdl.title');
    dl.appendChild(sm);
    dl.appendChild(exampleDownloadBlock([
      'metadata', 'taxonomy', 'barplot', 'counts', 'shannon', 'observed',
      'betaqza', 'pcoa', 'deseq2', 'kolist', 'koabund', 'fastq',
    ]));
    exampleWrap.appendChild(dl);

    card.appendChild(exampleWrap);

    if (lastWarnings.length > 0) {
      const warnBox = document.createElement('div');
      warnBox.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:var(--radius-md);background:color-mix(in srgb, var(--warning) 14%, transparent);border:1px solid color-mix(in srgb, var(--warning) 40%, transparent);font-size:12.5px;color:var(--ink-2);';
      warnBox.innerHTML = '<strong style="display:block;margin-bottom:6px;color:var(--ink);">' + t('upload.warningsTitle') + '</strong>' +
        lastWarnings.map((w) => '<div style="margin-bottom:4px;">' + escapeHtml(w) + '</div>').join('');
      card.appendChild(warnBox);
    }

    const privacy = document.createElement('p');
    privacy.className = 'ql-privacy';
    privacy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg>' + t('upload.privacy');
    card.appendChild(privacy);

    stack.appendChild(card);

    // lista de archivos + lo detectado
    const listCard = document.createElement('section');
    listCard.className = 'ql-card ql-panel';
    listCard.innerHTML = '<h2>' + t('upload.filesTitle') + '</h2><p class="ql-panel-note">' +
      (state.files.length === 0 ? t('upload.filesNone') : t('upload.filesCount', { n: state.files.length })) + '</p>';

    // --- guardar / cargar sesión completa ---
    const sessionBar = document.createElement('div');
    sessionBar.className = 'ql-session-bar';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'ql-btn';
    saveBtn.textContent = t('session.save');
    const anyData = state.files.length > 0
      || ['metadata', 'taxonomy', 'taxaBarplot', 'alphaDiversity', 'betaDiversity', 'differentialAbundance', 'taxaCounts', 'functionalKO', 'functionalCategories', 'ordination'].some((k) => state[k])
      || (Array.isArray(state.sequenceQC) && state.sequenceQC.length > 0);
    saveBtn.disabled = !anyData;
    saveBtn.addEventListener('click', () => {
      const json = JSON.stringify(exportSession(), null, 2);
      const ok = downloadFile(sessionFilename(), json, 'application/json;charset=utf-8');
      saveBtn.textContent = ok ? t('session.saved') : t('session.save');
      if (ok) setTimeout(() => { saveBtn.textContent = t('session.save'); }, 1800);
    });
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'ql-btn';
    loadBtn.textContent = t('session.load');
    const sessionInput = document.createElement('input');
    sessionInput.type = 'file';
    sessionInput.accept = 'application/json,.json';
    sessionInput.style.display = 'none';
    loadBtn.addEventListener('click', () => sessionInput.click());
    sessionInput.addEventListener('change', async () => {
      const file = sessionInput.files && sessionInput.files[0];
      sessionInput.value = '';
      if (!file) return;
      let parsed;
      try { parsed = JSON.parse(await file.text()); }
      catch (e) { lastWarnings = [t('session.badFile')]; paint(); return; }
      const info = describeSession(parsed);
      const bodyHtml = '<p>' + t('session.confirmBody', { files: info.files, slots: info.slots }) + '</p>' +
        (info.formatMismatch ? '<p class="ql-field-help">' + t('session.confirmFormat', { fmt: escapeHtml(String(info.format)) }) + '</p>' : '');
      const go = await openConfirm({
        title: t('session.confirmTitle'),
        bodyHtml,
        confirmLabel: t('session.confirmYes'),
        cancelLabel: t('ui.cancel'),
        danger: true,
      });
      if (!go) return;
      const res = importSession(parsed);
      lastWarnings = res.ok ? res.warnings : res.warnings;
      // importSession hace notify() → paint() se dispara por el subscribe
    });
    sessionBar.append(saveBtn, loadBtn, sessionInput);
    listCard.appendChild(sessionBar);
    listCard.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('session.hint') + '</p>');

    if (state.files.length > 0) {
      const list = document.createElement('div');
      list.className = 'ql-filelist';
      state.files.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'ql-file-row';
        row.innerHTML = '<span class="ql-file-name">' + escapeHtml(f.name) + '</span>' +
          '<span class="ql-file-meta">' + (f.note ? escapeHtml(f.note) : '') + '</span>';
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.title = t('ui.remove');
        rm.textContent = '✕';
        rm.addEventListener('click', () => removeFile(f.id));
        row.appendChild(rm);
        list.appendChild(row);
      });
      listCard.appendChild(list);
    }
    stack.appendChild(listCard);

    // --- tarjeta "Salud de los datos" (solo cuando hay algo cargado) ---
    if (anyData) {
      const health = document.createElement('section');
      health.className = 'ql-card ql-panel ql-health-card';
      const findings = checkDataHealth();
      let hh = '<h2>' + t('health.title') + '</h2>';
      if (findings.length === 0) {
        hh += '<p class="ql-health-ok"><span class="ql-health-dot is-good" aria-hidden="true"></span>' +
          escapeHtml(t('health.allOk')) + '</p>';
      } else {
        hh += '<ul class="ql-health-list">';
        findings.forEach((f) => {
          const cls = f.level === 'error' ? 'is-error' : f.level === 'warning' ? 'is-warning' : 'is-info';
          let ids = '';
          if (f.sampleIds && f.sampleIds.length) {
            const shown = f.sampleIds.slice(0, 12).map(escapeHtml).join(', ');
            const more = f.sampleIds.length > 12 ? ' ' + t('health.andMore', { n: f.sampleIds.length - 12 }) : '';
            ids = '<span class="ql-health-ids">' + escapeHtml(t('health.samplesLabel')) + ': ' + shown + more + '</span>';
          }
          hh += '<li class="ql-health-item"><span class="ql-health-dot ' + cls + '" aria-hidden="true"></span>' +
            '<span><span class="ql-health-msg">' + escapeHtml(f.message) + '</span>' + ids + '</span></li>';
        });
        hh += '</ul>';
      }
      health.innerHTML = hh;
      stack.appendChild(health);
    }

    // guía: "qué pasa si mi archivo no se detecta"
    const guideCard = document.createElement('section');
    guideCard.className = 'ql-card ql-panel';
    guideCard.innerHTML = '<h2>' + t('fmt.guideTitle') + '</h2>' +
      '<p class="ql-panel-note">' + t('fmt.guideIntro') + '</p>';
    const guide = document.createElement('ul');
    guide.className = 'ql-fmt-guide';
    ['gRows0', 'gWrongType', 'gColumnMissing', 'gBiom', 'gArtifact', 'gGzip'].forEach((k) => {
      const li = document.createElement('li');
      li.innerHTML = t('fmt.' + k);
      guide.appendChild(li);
    });
    guideCard.appendChild(guide);
    const guideFoot = document.createElement('p');
    guideFoot.className = 'ql-fmt-guide-foot';
    guideFoot.innerHTML = t('fmt.gManual');
    guideCard.appendChild(guideFoot);
    stack.appendChild(guideCard);

    // checklist de slots — cada tipo se despliega para ver su estructura esperada
    const slotsCard = document.createElement('section');
    slotsCard.className = 'ql-card ql-panel';
    slotsCard.innerHTML = '<h2>' + t('upload.detectedTitle') + '</h2>' +
      '<p class="ql-panel-note">' + t('fmt.checklistNote') + '</p>';
    const checklist = document.createElement('div');
    checklist.className = 'ql-checklist';
    fileTypes().forEach((ft) => {
      const done = ft.slotKey === 'sequenceQC'
        ? (Array.isArray(state.sequenceQC) && state.sequenceQC.length > 0)
        : !!state[ft.slotKey];

      const dcard = document.createElement('details');
      dcard.className = 'ql-fmt-card' + (done ? ' is-done' : '');

      const sum = document.createElement('summary');
      sum.className = 'ql-check-row' + (done ? ' is-done' : '');
      sum.innerHTML = '<span class="ql-check-dot"></span>' +
        '<span class="ql-fmt-name">' + t('slots.' + ft.key) + '</span>' +
        '<span class="ql-fmt-see">' + t('fmt.seeStructure') + '</span>';
      dcard.appendChild(sum);

      const body = document.createElement('div');
      body.className = 'ql-fmt-body';
      body.innerHTML = '<p class="ql-fmt-detect"><b>' + t('fmt.howDetected') + ':</b> ' +
        escapeHtml(t('fmt.det.' + ft.key)) + '</p>';

      if (ft.freeform) {
        const p = document.createElement('p');
        p.className = 'ql-fmt-detect';
        p.innerHTML = '<b>' + t('fmt.notATable') + '</b> ' + escapeHtml(ft.freeform);
        body.appendChild(p);
      } else {
        const tbl = document.createElement('table');
        tbl.className = 'ql-fmt-table';
        tbl.innerHTML = '<thead><tr><th>' + t('fmt.thCol') + '</th><th>' +
          t('fmt.thNames') + '</th><th>' + t('fmt.thReq') + '</th></tr></thead>';
        const tbody = document.createElement('tbody');
        ft.cols.forEach((c) => {
          const chips = (c.names || []).map((n) => '<code>' + escapeHtml(n) + '</code>').join(' ');
          const desc = c.desc ? '<span class="ql-fmt-desc">' + escapeHtml(c.desc) + '</span>' : '';
          const note = c.note ? '<span class="ql-fmt-note">' + escapeHtml(c.note) + '</span>' : '';
          const req = c.req === 'opt' ? t('fmt.reqOpt')
            : c.req === 'form' ? t('fmt.reqForm') : t('fmt.reqYes');
          const tr = document.createElement('tr');
          tr.innerHTML = '<td>' + escapeHtml(c.role) + '</td>' +
            '<td>' + chips + desc + note + '</td>' +
            '<td>' + req + '</td>';
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        body.appendChild(tbl);
      }

      if (ft.foot) {
        const f = document.createElement('p');
        f.className = 'ql-fmt-note';
        f.textContent = ft.foot;
        body.appendChild(f);
      }

      const dlLine = document.createElement('div');
      dlLine.className = 'ql-fmt-dl';
      dlLine.appendChild(exampleFileLinks(ft.exdl));
      body.appendChild(dlLine);

      dcard.appendChild(body);
      checklist.appendChild(dcard);
    });
    slotsCard.appendChild(checklist);
    stack.appendChild(slotsCard);

    container.appendChild(stack);

    // ---- eventos ----
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', (e) => { if (e.target.files.length) handleFiles(e.target.files); });
    btnCommunity.addEventListener('click', () => loadExampleCommunityData());
    btnDiff.addEventListener('click', () => loadExampleDifferentialAbundance());
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    const warnings = [];
    for (const file of files) {
      const fileId = registerFile(file.name, file.size, t('upload.processing'));
      let outcome;
      try {
        outcome = await ingestFile(file);
      } catch (e) {
        warnings.push('"' + file.name + '": ' + (e && e.message ? e.message : t('upload.errorGeneric')));
        removeFile(fileId);
        continue;
      }
      warnings.push(...outcome.warnings);
      const fileEntry = state.files.find((f) => f.id === fileId);
      if (outcome.results.length === 0) {
        if (fileEntry) fileEntry.note = t('upload.unclassified');
      } else {
        const labels = outcome.results.map((r) => routeResultToState(fileId, r));
        if (fileEntry) fileEntry.note = labels.join(' · ');
      }
    }
    lastWarnings = warnings;
    paint();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  paint();
  return subscribe(paint);
}
