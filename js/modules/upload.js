import { state, subscribe, registerFile, removeFile } from '../state.js';
import { t } from '../lib/i18n.js';
import { ingestFile } from '../lib/ingest.js';
import { routeResultToState } from '../lib/route.js';
import {
  loadExampleCommunityData, loadExampleDifferentialAbundance,
  loadRealCommunityData, loadRealDifferentialAbundance, loadRealFunctional,
} from '../lib/exampleData.js';

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

    // checklist de slots
    const slotsCard = document.createElement('section');
    slotsCard.className = 'ql-card ql-panel';
    slotsCard.innerHTML = '<h2>' + t('upload.detectedTitle') + '</h2>';
    const checklist = document.createElement('div');
    checklist.className = 'ql-checklist';
    const rows = [
      [t('slots.metadata'), !!state.metadata],
      [t('slots.taxonomy'), !!state.taxonomy],
      [t('slots.taxaBarplot'), !!state.taxaBarplot],
      [t('slots.taxaCounts'), !!state.taxaCounts],
      [t('slots.alpha'), !!state.alphaDiversity],
      [t('slots.beta'), !!state.betaDiversity],
      [t('slots.differential'), !!state.differentialAbundance],
      [t('slots.fastq'), Array.isArray(state.sequenceQC) && state.sequenceQC.length > 0],
    ];
    rows.forEach(([lbl, done]) => {
      const row = document.createElement('div');
      row.className = 'ql-check-row' + (done ? ' is-done' : '');
      row.innerHTML = '<span class="ql-check-dot"></span>' + lbl;
      checklist.appendChild(row);
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
