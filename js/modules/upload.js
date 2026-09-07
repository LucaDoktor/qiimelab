import { state, subscribe, registerFile, removeFile } from '../state.js';
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
      '<p class="ql-eyebrow">Paso 1</p>' +
      '<h1 class="ql-page-title">Cargar datos de QIIME2</h1>' +
      '<p class="ql-page-sub">Sube directamente artefactos <span class="mono">.qza</span>/<span class="mono">.qzv</span> — se desempaquetan en tu navegador — o archivos ya exportados a <span class="mono">.tsv</span>/<span class="mono">.csv</span>. Puedes subir varios a la vez; cada uno se clasifica automáticamente.</p>';
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
    dz.setAttribute('aria-label', 'Subir archivos');
    dz.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>' +
      '<div><div class="ql-dz-text"><b>Arrastra tus archivos aquí</b> o haz clic para elegirlos</div>' +
      '<div class="ql-dz-sub">.qza · .qzv · .tsv · .csv — puedes seleccionar varios a la vez</div></div>';
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.qza,.qzv,.tsv,.csv,.txt,.fastq,.fq,.gz';
    dz.appendChild(input);
    card.appendChild(dz);

    const exampleWrap = document.createElement('div');
    exampleWrap.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid var(--border);';
    exampleWrap.innerHTML =
      '<p class="ql-field-help" style="margin:0 0 8px;">¿No tienes datos a mano? Prueba con el <strong>ejemplo real</strong> ' +
      '(recorte anonimizado de un estudio de microbioma 16S con varios grupos — ver <span class="mono">datos-ejemplo/</span>) ' +
      'o con un <strong>dataset sintético</strong> rápido generado en el navegador.</p>';

    const realRow = document.createElement('div');
    realRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
    [
      ['Comunidad real (metadatos + taxonomía + barplot + alfa + beta)', loadRealCommunityData],
      ['Abundancia diferencial real (DESeq2 Grupo D vs Control)', () => loadRealDifferentialAbundance()],
      ['Funcional real (KOs PICRUSt2 + módulos funcionales)', loadRealFunctional],
    ].forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.className = 'ql-btn ql-btn-primary';
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', async () => {
        b.disabled = true;
        const prev = b.textContent;
        b.textContent = 'Descargando y procesando…';
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
    btnCommunity.textContent = 'Ejemplo sintético: comunidad';
    const btnDiff = document.createElement('button');
    btnDiff.className = 'ql-btn';
    btnDiff.type = 'button';
    btnDiff.textContent = 'Ejemplo sintético: abundancia diferencial';
    synthRow.appendChild(btnCommunity);
    synthRow.appendChild(btnDiff);
    exampleWrap.appendChild(synthRow);
    card.appendChild(exampleWrap);

    if (lastWarnings.length > 0) {
      const warnBox = document.createElement('div');
      warnBox.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:var(--radius-md);background:color-mix(in srgb, var(--warning) 14%, transparent);border:1px solid color-mix(in srgb, var(--warning) 40%, transparent);font-size:12.5px;color:var(--ink-2);';
      warnBox.innerHTML = '<strong style="display:block;margin-bottom:6px;color:var(--ink);">Avisos de la última carga</strong>' +
        lastWarnings.map((w) => '<div style="margin-bottom:4px;">' + escapeHtml(w) + '</div>').join('');
      card.appendChild(warnBox);
    }

    const privacy = document.createElement('p');
    privacy.className = 'ql-privacy';
    privacy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg>Tus archivos no salen de este navegador — todo el parseo ocurre localmente.';
    card.appendChild(privacy);

    stack.appendChild(card);

    // lista de archivos + lo detectado
    const listCard = document.createElement('section');
    listCard.className = 'ql-card ql-panel';
    listCard.innerHTML = '<h2>Archivos en esta sesión</h2><p class="ql-panel-note">' +
      (state.files.length === 0 ? 'Todavía no has cargado nada.' : state.files.length + ' archivo(s) cargado(s).') + '</p>';
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
        rm.title = 'Quitar';
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
    slotsCard.innerHTML = '<h2>Qué se ha detectado</h2>';
    const checklist = document.createElement('div');
    checklist.className = 'ql-checklist';
    const rows = [
      ['Metadatos', !!state.metadata, '#/cargar'],
      ['Taxonomía', !!state.taxonomy, '#/cargar'],
      ['Barplot taxonómico', !!state.taxaBarplot, '#/barplots'],
      ['Conteos taxón × muestra', !!state.taxaCounts, '#/venn'],
      ['Diversidad alfa', !!state.alphaDiversity, '#/alfa'],
      ['Diversidad beta', !!state.betaDiversity, '#/beta'],
      ['Abundancia diferencial', !!state.differentialAbundance, '#/diferencial'],
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
      const fileId = registerFile(file.name, file.size, 'procesando…');
      let outcome;
      try {
        outcome = await ingestFile(file);
      } catch (e) {
        warnings.push('"' + file.name + '": ' + (e && e.message ? e.message : 'error al procesar el archivo.'));
        removeFile(fileId);
        continue;
      }
      warnings.push(...outcome.warnings);
      const fileEntry = state.files.find((f) => f.id === fileId);
      if (outcome.results.length === 0) {
        if (fileEntry) fileEntry.note = 'no se pudo clasificar automáticamente';
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
