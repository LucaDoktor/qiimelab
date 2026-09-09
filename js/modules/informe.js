// Informe combinado exportable (#/informe).
//
// NO reimplementa ningún gráfico ni ningún cálculo. Para cada módulo marcado
// hace `import()` (igual que app.js), monta su render() en un contenedor fuera
// de pantalla, deja que pinte de forma síncrona, CLONA del DOM resultante las
// figuras (.ql-svg) y las tablas (.ql-table), llama a la limpieza que devuelve
// render() y quita el contenedor. Así el informe usa exactamente el mismo
// pintado ya verificado del resto de la app.
//
// Salida sin dependencias externas:
//   · se pinta en la propia página → Ctrl+P / "Guardar como PDF" con saltos de
//     página entre secciones (ver @media print en components.css).
//   · botón "Descargar HTML" → .html autocontenido con los css/*.css inlineados.

import { state } from '../state.js';
import { t, getLang, LANGS } from '../lib/i18n.js';
import { getProfileName } from '../lib/profile.js';

const MAX_TABLE_ROWS = 25;   // tablas largas (abundancia diferencial, QC) se recortan

// orden FIJO de las secciones del informe
const REPORT_MODULES = [
  { id: 'barplots', file: 'taxaBarplot.js', navKey: 'nav.barplots', has: () => !!state.taxaBarplot },
  { id: 'alfa', file: 'alphaDiversity.js', navKey: 'nav.alpha', has: () => (!!state.alphaDiversity || !!state.taxaCounts) && !!state.metadata },
  { id: 'beta', file: 'betaDiversity.js', navKey: 'nav.beta', has: () => !!state.betaDiversity || !!state.ordination },
  { id: 'diferencial', file: 'differentialAbundance.js', navKey: 'nav.differential', has: () => !!state.differentialAbundance },
  { id: 'recuentos', file: 'microbialCounts.js', navKey: 'nav.recuentos', has: () => Array.isArray(state.microbialCounts) && state.microbialCounts.length > 0 },
  { id: 'venn', file: 'venn.js', navKey: 'nav.venn', has: () => !!state.taxaCounts && !!state.metadata },
  { id: 'correlograma', file: 'correlogram.js', navKey: 'nav.correlograma', has: () => !!state.metadata && (!!state.taxaBarplot || !!state.taxaCounts || !!state.alphaDiversity) },
  { id: 'funcional', file: 'functional.js', navKey: 'nav.funcional', has: () => !!state.functionalKO && !!state.functionalCategories && !!state.metadata },
  { id: 'qc', file: 'sequenceQC.js', navKey: 'nav.qc', has: () => Array.isArray(state.sequenceQC) && state.sequenceQC.some((e) => e.report) },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- monta un módulo fuera de pantalla y extrae figura + tablas + títulos ---
async function harvestModule(file) {
  const off = document.createElement('div');
  off.setAttribute('aria-hidden', 'true');
  off.style.cssText = 'position:absolute;left:-9999px;top:0;width:1080px;pointer-events:none;';
  document.body.appendChild(off);

  let cleanup = null;
  const result = { svg: null, tables: [], truncated: false, error: null };
  try {
    const mod = await import('./' + file);
    cleanup = mod.render(off) || null;
    await sleep(70); // deja asentar layout / getBBox del chartEditor

    const firstSvg = off.querySelector('.ql-svg');
    if (firstSvg) {
      const c = firstSvg.cloneNode(true);
      c.querySelectorAll('.ce-hit, .ce-outline').forEach((n) => n.remove());
      c.classList.remove('ce-editing');
      c.removeAttribute('style');
      c.style.width = '100%';
      c.style.height = 'auto';
      result.svg = c;
    }

    off.querySelectorAll('.ql-table').forEach((tbl, i) => {
      if (i >= 2) return; // como mucho 2 tablas por sección
      const c = tbl.cloneNode(true);
      // quita los botones de ordenar de las cabeceras (no funcionan en el informe)
      c.querySelectorAll('thead th button').forEach((b) => { b.replaceWith(document.createTextNode(b.textContent)); });
      const rows = c.querySelectorAll('tbody tr');
      if (rows.length > MAX_TABLE_ROWS) {
        for (let k = rows.length - 1; k >= MAX_TABLE_ROWS; k--) rows[k].remove();
        result.truncated = true;
      }
      result.tables.push(c);
    });
  } catch (e) {
    result.error = (e && e.message) ? e.message : String(e);
  } finally {
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { /* noop */ } }
    off.remove();
  }
  return result;
}

// Inlinea css/fonts.css con cada woff2 como data URI, para que el HTML
// autocontenido no dependa de ninguna petición de red (ni de Google Fonts, que
// era lo único externo que quedaba).
async function inlineFontsCss() {
  let css;
  try { css = await (await fetch('css/fonts.css')).text(); }
  catch (e) { return ''; }
  const urls = [...new Set([...css.matchAll(/url\((\.\.\/fonts\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
  for (const rel of urls) {
    try {
      const buf = await (await fetch(rel.replace('../', ''))).arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const dataUri = 'data:font/woff2;base64,' + btoa(bin);
      css = css.split('url(' + rel + ')').join('url(' + dataUri + ')');
    } catch (e) { /* deja la url relativa; degradará a la fuente del sistema */ }
  }
  return css;
}

async function buildStandaloneHtml(reportEl, lang) {
  const cssFiles = ['css/tokens.css', 'css/base.css', 'css/components.css'];
  const [styles, fontsCss] = await Promise.all([
    Promise.all(cssFiles.map(async (f) => {
      try { return await (await fetch(f)).text(); } catch (e) { return ''; }
    })),
    inlineFontsCss(),
  ]);
  const clone = reportEl.cloneNode(true);
  clone.querySelectorAll('.ql-report-actions, button').forEach((n) => n.remove());
  const extra = 'body.ql-standalone{margin:0;background:var(--surface);color:var(--ink);'
    + 'font-family:var(--font-body);padding:32px 20px;}'
    + '.ql-standalone .ql-report{margin:0 auto;}'
    + '@media print{body.ql-standalone{padding:0;}}';
  return '<!doctype html><html lang="' + escapeHtml(lang) + '"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + escapeHtml(t('informe.docTitle')) + '</title>'
    + '<style>' + fontsCss + '</style>'
    + styles.map((s) => '<style>' + s + '</style>').join('')
    + '<style>' + extra + '</style>'
    + '</head><body class="ql-standalone">' + clone.outerHTML + '</body></html>';
}

function download(name, text, mime) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { /* entorno sin descargas */ }
}

export function render(container) {
  // por defecto: todos los módulos con datos, marcados
  let selected = null; // Set de ids

  function paint() {
    container.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('informe.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('informe.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('informe.subtitle') + '</p>';
    container.appendChild(header);

    const avail = REPORT_MODULES.filter((m) => { try { return m.has(); } catch (e) { return false; } });
    if (selected === null) selected = new Set(avail.map((m) => m.id));

    if (avail.length === 0) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.innerHTML = '<div class="ql-empty">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>' +
        '<h3>' + t('informe.emptyTitle') + '</h3><p>' + t('informe.emptyDesc') + '</p>' +
        '<a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div>';
      container.appendChild(card);
      return;
    }

    // ---- panel de selección ----
    const controls = document.createElement('section');
    controls.className = 'ql-card ql-panel ql-report-controls';
    controls.innerHTML = '<h2>' + t('informe.pickTitle') + '</h2><p class="ql-panel-note">' + t('informe.pickNote') + '</p>';
    const list = document.createElement('div');
    list.className = 'ql-checklist';
    list.style.marginBottom = '16px';
    avail.forEach((m) => {
      const row = document.createElement('label');
      row.className = 'ql-checkrow';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(m.id);
      cb.addEventListener('change', () => { cb.checked ? selected.add(m.id) : selected.delete(m.id); genBtn.disabled = selected.size === 0; });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(' ' + t(m.navKey)));
      list.appendChild(row);
    });
    controls.appendChild(list);

    const genBtn = document.createElement('button');
    genBtn.type = 'button';
    genBtn.className = 'ql-btn ql-btn-primary';
    genBtn.textContent = t('informe.generate');
    genBtn.disabled = selected.size === 0;
    controls.appendChild(genBtn);
    container.appendChild(controls);

    const host = document.createElement('div');
    container.appendChild(host);

    genBtn.addEventListener('click', async () => {
      genBtn.disabled = true;
      const prev = genBtn.textContent;
      genBtn.textContent = t('informe.generating');
      host.innerHTML = '<p class="ql-field-help" style="margin-top:16px;">' + t('informe.generating') + '</p>';

      const chosen = REPORT_MODULES.filter((m) => selected.has(m.id));
      const sections = [];
      for (const m of chosen) {
        const h = await harvestModule(m.file);
        if (!h.svg && h.tables.length === 0) continue; // el módulo no produjo nada útil
        sections.push({ title: t(m.navKey), ...h });
      }

      const report = document.createElement('div');
      report.className = 'ql-report';

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const langLabel = (LANGS.find((l) => l.code === getLang()) || {}).label || getLang();
      const who = getProfileName();
      const repHead = document.createElement('div');
      repHead.className = 'ql-report-header';
      repHead.innerHTML =
        '<h2>' + t('informe.docTitle') + '</h2>' +
        '<p class="ql-report-meta">' +
        (who ? escapeHtml(who) + ' · ' : '') +
        t('informe.metaDate', { date: dateStr }) + ' · ' +
        t('informe.metaLang', { lang: langLabel }) +
        '</p>';
      report.appendChild(repHead);

      if (sections.length === 0) {
        report.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('informe.nothing') + '</p>');
      }

      sections.forEach((s) => {
        const sec = document.createElement('section');
        sec.className = 'ql-report-section';
        const h2 = document.createElement('h2');
        h2.textContent = s.title;
        sec.appendChild(h2);
        if (s.error) {
          sec.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + escapeHtml(s.error) + '</p>');
        }
        if (s.svg) {
          const fig = document.createElement('div');
          fig.className = 'ql-report-fig';
          fig.appendChild(s.svg);
          sec.appendChild(fig);
        }
        s.tables.forEach((tbl) => {
          const wrap = document.createElement('div');
          wrap.className = 'ql-table-scroll ql-report-table';
          wrap.appendChild(tbl);
          sec.appendChild(wrap);
        });
        if (s.truncated) {
          sec.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('informe.tableTrunc', { n: MAX_TABLE_ROWS }) + '</p>');
        }
        report.appendChild(sec);
      });

      const actions = document.createElement('div');
      actions.className = 'ql-report-actions';
      const printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'ql-btn';
      printBtn.textContent = t('informe.print');
      printBtn.addEventListener('click', () => window.print());
      const htmlBtn = document.createElement('button');
      htmlBtn.type = 'button';
      htmlBtn.className = 'ql-btn';
      htmlBtn.textContent = t('informe.downloadHtml');
      htmlBtn.addEventListener('click', async () => {
        htmlBtn.disabled = true;
        const html = await buildStandaloneHtml(report, getLang());
        download('informe-qiimelab-' + dateStr + '.html', html, 'text/html;charset=utf-8');
        htmlBtn.disabled = false;
      });
      actions.appendChild(printBtn);
      actions.appendChild(htmlBtn);
      report.insertBefore(actions, repHead.nextSibling);

      host.innerHTML = '';
      host.appendChild(report);
      genBtn.textContent = prev;
      genBtn.disabled = false;
      const smooth = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      report.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    });
  }

  // sin subscribe: el informe es una instantánea; si cambian los datos, el
  // usuario vuelve a entrar y se regenera la lista.
  paint();
}
