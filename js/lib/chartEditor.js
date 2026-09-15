// chartEditor.js — motor de personalización de figuras, compartido por los
// módulos de gráficos.
//
// Qué hace:
//  - Modo "Personalizar" (botón). Con él apagado no interfiere en nada.
//  - Arrastra con el ratón SOLO elementos de texto/anotación (título de la
//    figura, títulos de eje, bloque de leyenda). Los marcadores de datos
//    (puntos, barras, líneas) NO se mueven nunca.
//  - Panel flotante por elemento: color de texto, familia de fuente (las 3
//    ya cargadas + genéricas del sistema), negrita/cursiva, tamaño.
//  - Persistencia en localStorage por módulo (smart-175.chartStyle.<key>),
//    re-aplicada al recargar. Botón "Restablecer".
//  - "Descargar SVG": exporta la figura tal cual se ve, con los estilos
//    inline resueltos (sin depender de la hoja de estilos de la app).
//
//  - Paleta de color para las SERIES de datos (no solo el texto): botones de
//    paleta completa (categórica/secuencial/divergente) + una fila por serie
//    con swatch nativo + campo de texto #RRGGBB, con aviso suave (no
//    bloqueante) si el color chocaría con otro de la misma figura. Dos
//    mecanismos según el tipo de gráfico (ver cfg.paletteSeries más abajo):
//    directo por atributo `data-ce-series-fill/-stroke="<id>"` en los nodos
//    ya dibujados (sin repintar — la mayoría de gráficos: barras, cajas,
//    puntos, dímeros…), o lectura de `getPaletteOverrides(key)` ANTES de
//    calcular colores, para las figuras con degradado continuo (mapas de
//    calor, matriz de correlación) que sí necesitan repintar al cambiar.
//
// Sin dependencias, sin build step. No toca datos ni escalas.

import { PALETTES, paletteColorAt } from './palettes.js';
import { checkAgainstPalette, isValidHex } from './paletteValidator.js';
import { openPanel as openModalPanel } from './modal.js';
import { escapeHtml } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'ce-styles';
const CHARTSTYLE_PREFIX = 'smart-175.chartStyle.';
const LEGACY_CHARTSTYLE_PREFIX = 'qiimelab.chartStyle.';

function readChartStyleRaw(key) {
  try {
    const raw = localStorage.getItem(CHARTSTYLE_PREFIX + key) || localStorage.getItem(LEGACY_CHARTSTYLE_PREFIX + key);
    return JSON.parse(raw) || {};
  }
  catch (e) { return {}; }
}

/** Los overrides de paleta persistidos para `key` — { seriesId: '#hex' }.
 *  Función pura, sin DOM: para que los módulos con degradado continuo
 *  (mapas de calor, matriz de correlación) puedan leerla ANTES de calcular
 *  sus colores, sin esperar a que exista el <svg>. */
export function getPaletteOverrides(key) {
  return readChartStyleRaw(key).__palette || {};
}

const FONTS = [
  ['var(--font-body)', 'Sans (IBM Plex)'],
  ['var(--font-display)', 'Serif (IBM Plex)'],
  ['var(--font-mono)', 'Mono (IBM Plex)'],
  ['system-ui, sans-serif', 'Sistema'],
  ['Georgia, "Times New Roman", serif', 'Serif del sistema'],
  ['ui-monospace, Menlo, monospace', 'Mono del sistema'],
];

const I18N = {
  es: { customize: 'Personalizar', done: 'Terminar', reset: 'Restablecer', download: 'Descargar SVG', downloadPng: 'Descargar PNG',
        hint: 'Arrastra los textos (o enfócalos con el tabulador y muévelos con las flechas). Haz clic o pulsa Intro para cambiar su estilo.',
        lead: 'Esta figura es editable:', leadRest: 'cambia textos, colores y posiciones, y descárgala en SVG o PNG.',
        text: 'Texto', color: 'Color', hex: 'Hex', font: 'Fuente', size: 'Tamaño', bold: 'Negrita', italic: 'Cursiva', close: 'Cerrar',
        handle: (name) => name + ', elemento arrastrable: muévelo con las flechas (Mayús = paso mayor), Intro para editar su estilo',
        paletteTitle: 'Paleta de la figura', paletteCategorical: 'Categórica', paletteSequential: 'Secuencial', paletteDivergent: 'Divergente',
        paletteWarnClash: (name) => 'parecido a "' + name + '" para algunos tipos de daltonismo',
        paletteWarnContrast: 'poco contraste sobre el fondo de la figura',
        paletteInvalidHex: 'no es un color hex válido (usa #RRGGBB)',
        fullscreen: 'Pantalla completa', fullscreenExit: 'Salir de pantalla completa', fullscreenTitle: 'Editor de la figura — vista ampliada',
        titlesTitle: 'Títulos de la figura', chartTitle: 'Título del Gráfico', xAxisTitle: 'Título Eje X', yAxisTitle: 'Título Eje Y' },
  en: { customize: 'Customise', done: 'Done', reset: 'Reset', download: 'Download SVG', downloadPng: 'Download PNG',
        hint: 'Drag the labels (or focus them with Tab and move them with the arrow keys). Click or press Enter to change the style.',
        lead: 'This figure is editable:', leadRest: 'change text, colours and positions, then download it as SVG or PNG.',
        text: 'Text', color: 'Colour', hex: 'Hex', font: 'Font', size: 'Size', bold: 'Bold', italic: 'Italic', close: 'Close',
        handle: (name) => name + ', draggable element: move it with the arrow keys (Shift = larger step), Enter to edit its style',
        paletteTitle: 'Figure palette', paletteCategorical: 'Categorical', paletteSequential: 'Sequential', paletteDivergent: 'Divergent',
        paletteWarnClash: (name) => 'similar to "' + name + '" for some kinds of colour blindness',
        paletteWarnContrast: 'low contrast against the figure background',
        paletteInvalidHex: 'not a valid hex colour (use #RRGGBB)',
        fullscreen: 'Full screen', fullscreenExit: 'Exit full screen', fullscreenTitle: 'Figure editor — enlarged view',
        titlesTitle: 'Figure titles', chartTitle: 'Chart Title', xAxisTitle: 'X Axis Title', yAxisTitle: 'Y Axis Title' },
};
function tr(lang) { return I18N[lang] || I18N.es; }

// iconos propios, mismo estilo que la barra lateral (24×24, trazo 1.7, redondeado)
// aria-hidden/focusable="false": son decorativos, el <span> del botón lleva el texto.
const CE_ICONS = {
  edit: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.4 3.6a2 2 0 0 1 2.9 2.9L7.5 18.3 3.5 19.5l1.2-4Z"/></svg>',
  download: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10m0 0-3.5-3.5M12 14l3.5-3.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>',
  reset: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 8 0 1 1-1.5 4.5"/><path d="M3.5 4.5v4.8h4.8"/></svg>',
  fullscreen: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"/></svg>',
};

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.ce-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:14px; padding-top:14px; border-top:1px solid var(--border-strong); }
.ce-toolbar .ce-lead { font-size:12px; color:var(--ink-2); flex:1 1 100%; margin:0 0 4px; }
.ce-toolbar .ce-lead strong { color:var(--ink); font-weight:600; }
.ce-toolbar .ce-hint { font-size:11.5px; color:var(--ink-muted); flex:1 1 100%; margin:2px 0 0; }
.ce-toolbar button { display:inline-flex; align-items:center; gap:6px; }
.ce-toolbar button svg { flex:none; }
.ce-toolbar .ce-cta { border-color:var(--accent); color:var(--accent); background:var(--accent-soft); }
.ce-toolbar .ce-cta:hover { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 18%, var(--surface)); }
svg.ce-editing { }
svg.ce-editing .ce-el { cursor: move; }
.ce-outline { fill:none; stroke:var(--accent); stroke-width:1; stroke-dasharray:4 3; pointer-events:none; opacity:0; transition:opacity .1s ease; }
svg.ce-editing .ce-el:hover .ce-outline, svg.ce-editing .ce-el.ce-selected .ce-outline { opacity:1; }
svg.ce-editing .ce-el.ce-selected .ce-outline { stroke-width:1.4; stroke-dasharray:none; }
.ce-hit { fill:transparent; pointer-events:none; }
svg.ce-editing .ce-hit { pointer-events:all; cursor:move; }
svg.ce-editing .ce-hit:focus { outline:none; }
svg.ce-editing .ce-hit:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.ce-panel {
  position:fixed; z-index:60; width:230px; background:var(--surface); color:var(--ink);
  border:1px solid var(--border-strong); border-radius:var(--radius-md); box-shadow:var(--shadow);
  padding:12px; font-family:var(--font-body); font-size:12.5px;
}
.ce-panel h4 { margin:0 0 8px; font-family:var(--font-body); font-size:12px; font-weight:600; color:var(--ink-2); display:flex; justify-content:space-between; align-items:center; }
.ce-panel h4 button { border:none; background:none; cursor:pointer; color:var(--ink-muted); font-size:15px; line-height:1; padding:0 2px; }
.ce-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.ce-row:last-child { margin-bottom:0; }
.ce-row label { flex:0 0 52px; color:var(--ink-muted); font-size:11.5px; }
.ce-row input[type=color] { width:34px; height:26px; padding:0; border:1px solid var(--border); border-radius:5px; background:none; cursor:pointer; }
.ce-row input[type=number] { width:64px; }
.ce-row select { flex:1; }
.ce-toggles { display:flex; gap:6px; }
.ce-toggles button {
  flex:1; border:1px solid var(--border-strong); background:var(--surface); color:var(--ink-2);
  border-radius:6px; padding:5px 0; cursor:pointer; font-size:12px;
}
.ce-toggles button.on { background:var(--accent); border-color:var(--accent); color:var(--accent-ink); }
.ce-toolbar .ce-on { background:var(--accent); border-color:var(--accent); color:var(--accent-ink); }
text.ce-title { font-family:var(--font-display); font-size:15px; font-weight:600; fill:var(--ink); }
.ce-hexfield { width:76px; font-family:var(--font-mono); text-transform:uppercase; }
.ce-titles-section { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-titles-section h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-titles-rows { display:flex; flex-direction:column; gap:6px; max-width:480px; }
.ce-title-row { display:flex; align-items:center; gap:8px; }
.ce-title-row label { flex:0 0 130px; font-size:12px; font-weight:500; color:var(--ink-2); }
.ce-title-row input[type=text] { flex:1; min-width:180px; height:26px; padding:2px 8px; font-size:12px; border:1px solid var(--border-strong); border-radius:4px; background:var(--surface); color:var(--ink); }
.ce-palette { flex:1 1 100%; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.ce-palette h5 { margin:0 0 8px; font-size:11.5px; font-weight:600; color:var(--ink-2); }
.ce-pal-btns { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
.ce-pal-btns button { border:1px solid var(--border-strong); background:var(--surface); color:var(--ink-2); border-radius:6px; padding:5px 10px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:6px; }
.ce-pal-btns button:hover { border-color:var(--accent); color:var(--ink); }
.ce-pal-swatchbar { display:flex; }
.ce-pal-swatchbar span { display:block; width:8px; height:14px; }
.ce-pal-rows { display:flex; flex-direction:column; gap:6px; max-width:420px; }
.ce-pal-row { display:flex; align-items:center; gap:8px; }
.ce-pal-row label { flex:0 0 auto; min-width:90px; font-size:12px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ce-pal-row input[type=color] { width:28px; height:24px; padding:0; border:1px solid var(--border); border-radius:5px; background:none; cursor:pointer; flex:none; }
.ce-pal-row input[type=text] { flex:0 0 84px; }
.ce-pal-warn { font-size:11px; color:#8a5a00; flex:1 1 100%; margin:0; }
.ce-fs-stage { display:flex; flex-direction:column; gap:14px; }
.ce-fs-svgwrap { flex:1 1 auto; min-height:0; display:flex; align-items:center; justify-content:center; overflow:auto; background:var(--page); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; }
.ce-fs-svgwrap svg.ce-fs-svg { width:100% !important; height:auto !important; max-height:calc(100vh - 260px); }
.ce-fs-stage .ce-toolbar { flex:none; margin-top:0; padding-top:14px; }
`;
  document.head.appendChild(s);
}

/**
 * @param {object} cfg
 * @param {string} cfg.key      clave de módulo (localStorage smart-175.chartStyle.<key>)
 * @param {SVGSVGElement} cfg.svg
 * @param {HTMLElement} cfg.mount   dónde se cuelga la barra de herramientas
 * @param {string} cfg.filename     nombre del .svg exportado
 * @param {Array}  cfg.elements     [{ id, selector?, create?, kind? }]
 *        - selector: CSS para encontrar el nodo dentro del svg (se re-busca en cada sync)
 *        - create:   { text, x, y, anchor, cls } para crear un <text> si no existe
 *        - kind:     'text' (def.) | 'group' (aplica estilo a los <text> descendientes)
 * @param {string} [cfg.lang]
 * @param {Function} [cfg.onChange]  se llama tras cualquier cambio persistido
 */
export function attachChartEditor(cfg) {
  injectStyles();
  const { key, svg, mount, filename = 'figura', elements = [] } = cfg;
  const paletteSeries = cfg.paletteSeries || []; // [{ id, label }] — series de datos recoloreables
  const paletteType = cfg.paletteType || 'categorical'; // qué botones de paleta ofrecer
  const paletteMax = cfg.paletteMax; // tope de tonos simultáneos (scatter/red: 3-4, no los 8)
  const lang = cfg.lang || 'es';
  const T = tr(lang);
  const LSKEY = 'smart-175.chartStyle.' + key;
  const LEGACY_LSKEY = 'qiimelab.chartStyle.' + key;

  let store = readStore();
  let editing = false;
  let selectedId = null;
  let panel = null;
  let cePanelUid = 0; // ids para enlazar <label for> ↔ control dentro del panel
  const wraps = new Map(); // id -> { wrap, inner, def }
  let fsHandle = null; // { close } del modal de pantalla completa, si está abierto

  function readStore() {
    try {
      const raw = localStorage.getItem(LSKEY) || localStorage.getItem(LEGACY_LSKEY);
      return JSON.parse(raw) || {};
    }
    catch (e) { return {}; }
  }
  function writeStore() {
    try {
      if (Object.keys(store).length) {
        localStorage.setItem(LSKEY, JSON.stringify(store));
        localStorage.removeItem(LEGACY_LSKEY);
      } else {
        localStorage.removeItem(LSKEY);
        localStorage.removeItem(LEGACY_LSKEY);
      }
    } catch (e) { /* modo privado */ }
    if (cfg.onChange) try { cfg.onChange(); } catch (e) { /* noop */ }
    renderToolbar();
  }
  function st(id) { return (store[id] = store[id] || {}); }

  // ---- paleta de series de datos ----
  // store.__palette = { seriesId: '#hex' } — solo las series con un color
  // elegido a mano o por un botón de paleta; las demás siguen el var() por
  // defecto del propio módulo (fill/stroke tal como lo dibujó).
  function paletteOverrides() { return store.__palette || {}; }

  /** Color efectivo actual de una serie: el override si existe, si no el
   *  que ya está dibujado en el propio SVG (resuelto por el navegador, así
   *  que respeta el tema claro/oscuro), y si no hay ningún nodo (gráficos de
   *  degradado continuo, que no taggean nodos) el que le tocaría por orden
   *  dentro de la paleta activa — solo como referencia para el aviso de choque. */
  function effectiveSeriesColor(id, idx) {
    const ov = paletteOverrides()[id];
    if (ov) return ov;
    const node = svg.querySelector('[data-ce-series-fill="' + id + '"], [data-ce-series-stroke="' + id + '"]');
    if (node) {
      const prop = node.hasAttribute('data-ce-series-fill') ? 'fill' : 'stroke';
      return toHex(getComputedStyle(node)[prop]);
    }
    return paletteColorAt(paletteType, idx, { max: paletteMax }) || '#888888';
  }

  /** Aplica (o revierte, si no hay override) el color de cada serie
   *  configurada a los nodos ya dibujados — sin repintar el gráfico. */
  function applyPalette() {
    const ov = paletteOverrides();
    paletteSeries.forEach((s) => {
      const hex = ov[s.id] || '';
      svg.querySelectorAll('[data-ce-series-fill="' + s.id + '"]').forEach((n) => { n.style.fill = hex; });
      svg.querySelectorAll('[data-ce-series-stroke="' + s.id + '"]').forEach((n) => { n.style.stroke = hex; });
    });
  }

  function setSeriesColor(id, hex) {
    const pal = (store.__palette = store.__palette || {});
    if (hex) pal[id] = hex; else delete pal[id];
    if (!Object.keys(pal).length) delete store.__palette;
    applyPalette();
    writeStore();
  }

  function applyPresetPalette(name) {
    const pal = (store.__palette = store.__palette || {});
    paletteSeries.forEach((s, i) => { pal[s.id] = paletteColorAt(name, i, { max: paletteMax }); });
    applyPalette();
    writeStore();
  }

  // ---- barra de herramientas ----
  const toolbar = document.createElement('div');
  toolbar.className = 'ce-toolbar';
  mount.appendChild(toolbar);

  function renderToolbar() {
    toolbar.innerHTML = '';

    const lead = document.createElement('p');
    lead.className = 'ce-lead';
    if (editing) {
      lead.className = 'ce-hint';
      lead.textContent = T.hint;
    } else {
      lead.innerHTML = '<strong>' + T.lead + '</strong> ' + T.leadRest;
    }
    toolbar.appendChild(lead);

    const bCustom = mkBtn(CE_ICONS.edit, editing ? T.done : T.customize, () => { setEditing(!editing); });
    bCustom.className = 'ql-btn' + (editing ? ' ce-on' : ' ce-cta');
    toolbar.appendChild(bCustom);

    const bFull = mkBtn(CE_ICONS.fullscreen, fsHandle ? T.fullscreenExit : T.fullscreen, openFullscreen);
    bFull.className = 'ql-btn' + (fsHandle ? ' ce-on' : '');
    toolbar.appendChild(bFull);

    const bDl = mkBtn(CE_ICONS.download, T.download, downloadSvg);
    bDl.className = 'ql-btn';
    toolbar.appendChild(bDl);

    const bPng = mkBtn(CE_ICONS.download, T.downloadPng, downloadPng);
    bPng.className = 'ql-btn';
    toolbar.appendChild(bPng);

    if (Object.keys(store).length) {
      const bReset = mkBtn(CE_ICONS.reset, T.reset, resetAll);
      bReset.className = 'ql-btn ql-btn-ghost';
      toolbar.appendChild(bReset);
    }

    if (editing) {
      toolbar.appendChild(renderTitlesSection());
    }

    if (editing && paletteSeries.length) toolbar.appendChild(renderPaletteSection());
  }

  function renderTitlesSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-titles ce-titles-section';
    wrap.innerHTML = '<h5>' + (T.titlesTitle || 'Títulos de la figura') + '</h5>';

    const rows = document.createElement('div');
    rows.className = 'ce-titles-rows';

    const titleDefs = [
      {
        id: 'title',
        label: T.chartTitle || 'Título del Gráfico',
        selector: '.ql-chart-main-title, .ce-title, [data-ce="title"]',
        cls: 'ql-ce-title-input',
      },
      {
        id: 'xtitle',
        label: T.xAxisTitle || 'Título Eje X',
        selector: '.ql-chart-x-title, [data-ce="xtitle"]',
        cls: 'ql-ce-xtitle-input',
      },
      {
        id: 'ytitle',
        label: T.yAxisTitle || 'Título Eje Y',
        selector: '.ql-chart-y-title, [data-ce="ytitle"]',
        cls: 'ql-ce-ytitle-input',
      },
    ];

    titleDefs.forEach((td) => {
      const row = document.createElement('div');
      row.className = 'ce-title-row';

      const lab = document.createElement('label');
      lab.textContent = td.label;
      row.appendChild(lab);

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'ql-input ce-textfield ' + td.cls;
      inp.placeholder = td.label;

      const stVal = store[td.id] && typeof store[td.id].text === 'string' ? store[td.id].text : null;
      if (stVal !== null) {
        inp.value = stVal;
      } else {
        const matching = svg.querySelector(td.selector);
        if (matching && matching.textContent) {
          inp.value = matching.textContent.trim();
        }
      }

      inp.addEventListener('input', () => {
        const val = inp.value;
        const targets = svg.querySelectorAll(td.selector);
        targets.forEach((target) => {
          target.textContent = val;
        });
        const w = wraps.get(td.id);
        if (w && w.inner) {
          w.inner.textContent = val;
        }
        const s = st(td.id);
        s.text = val;
        decorate(td.id);
        writeStoreDebounced();
        if (cfg.onChange) try { cfg.onChange(); } catch (e) {}
      });

      row.appendChild(inp);
      rows.appendChild(row);
    });

    wrap.appendChild(rows);
    return wrap;
  }

  const PALETTE_LABEL = {
    categorical: T.paletteCategorical, sequential: T.paletteSequential,
    sequentialPoles: T.paletteSequential, divergent: T.paletteDivergent,
    divergentPoles: T.paletteDivergent,
  };

  function swatchBar(name) {
    const bar = document.createElement('span');
    bar.className = 'ce-pal-swatchbar';
    const colors = (PALETTES[name] && PALETTES[name].colors) || [];
    colors.slice(0, paletteMax || colors.length).forEach((hex) => {
      const sw = document.createElement('span');
      sw.style.background = hex;
      bar.appendChild(sw);
    });
    return bar;
  }

  function renderPaletteSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-palette';
    wrap.innerHTML = '<h5>' + T.paletteTitle + '</h5>';

    const btnRow = document.createElement('div');
    btnRow.className = 'ce-pal-btns';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.appendChild(swatchBar(paletteType));
    applyBtn.insertAdjacentHTML('beforeend', '<span>' + (PALETTE_LABEL[paletteType] || paletteType) + '</span>');
    applyBtn.addEventListener('click', () => applyPresetPalette(paletteType));
    btnRow.appendChild(applyBtn);
    wrap.appendChild(btnRow);

    const rows = document.createElement('div');
    rows.className = 'ce-pal-rows';
    const currentHexes = paletteSeries.map((s, i) => effectiveSeriesColor(s.id, i));
    paletteSeries.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'ce-pal-row';
      const lab = document.createElement('label');
      lab.textContent = s.label;
      row.appendChild(lab);

      const hex = currentHexes[i];
      const colorId = 'ce-pal-c-' + (++cePanelUid);
      const inpColor = document.createElement('input');
      inpColor.type = 'color'; inpColor.id = colorId;
      inpColor.value = isValidHex(hex) ? hex : '#888888';
      lab.setAttribute('for', colorId);

      const inpHex = document.createElement('input');
      inpHex.type = 'text'; inpHex.className = 'ce-hexfield';
      inpHex.value = (isValidHex(hex) ? hex : '').toUpperCase();
      inpHex.setAttribute('aria-label', s.label + ' — ' + T.hex);
      inpHex.placeholder = '#RRGGBB';

      const warn = document.createElement('p');
      warn.className = 'ce-pal-warn';

      const showWarning = (h) => {
        warn.textContent = '';
        if (!h) return;
        if (!isValidHex(h)) { warn.textContent = '⚠ ' + T.paletteInvalidHex; return; }
        const others = paletteSeries.map((s2, j) => (j === i ? null : currentHexes[j])).filter(Boolean);
        const res = checkAgainstPalette(h, others);
        if (res.verdict === 'PASS') return;
        if (res.reason === 'clash') {
          const otherLabel = (paletteSeries.find((s2, j) => currentHexes[j] === res.other) || {}).label || res.other;
          warn.textContent = '⚠ ' + T.paletteWarnClash(otherLabel);
        } else if (res.reason === 'contrast') {
          warn.textContent = '⚠ ' + T.paletteWarnContrast;
        }
      };
      showWarning(hex);

      // vista previa en vivo (solo DOM, sin persistir ni repintar la barra —
      // así no se pierde el foco del campo de texto mientras se teclea);
      // se persiste solo al confirmar (blur / Intro / soltar el selector nativo).
      const preview = (h) => {
        const ok = h === '' || isValidHex(h);
        svg.querySelectorAll('[data-ce-series-fill="' + s.id + '"]').forEach((n) => { n.style.fill = ok ? h : ''; });
        svg.querySelectorAll('[data-ce-series-stroke="' + s.id + '"]').forEach((n) => { n.style.stroke = ok ? h : ''; });
      };
      const commit = (h) => { if (!h || isValidHex(h)) setSeriesColor(s.id, h || null); };

      inpColor.addEventListener('input', () => { inpHex.value = inpColor.value.toUpperCase(); showWarning(inpColor.value); preview(inpColor.value); });
      inpColor.addEventListener('change', () => commit(inpColor.value));
      inpHex.addEventListener('input', () => {
        let v = inpHex.value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        showWarning(v);
        if (isValidHex(v)) { inpColor.value = v; preview(v); }
      });
      inpHex.addEventListener('change', () => {
        let v = inpHex.value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        if (!v || isValidHex(v)) commit(v);
      });
      inpHex.addEventListener('keydown', (e) => { if (e.key === 'Enter') inpHex.blur(); });

      row.appendChild(inpColor);
      row.appendChild(inpHex);
      rows.appendChild(row);
      rows.appendChild(warn);
    });
    wrap.appendChild(rows);
    return wrap;
  }
  function mkBtn(icon, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon + '<span>' + label + '</span>';
    b.addEventListener('click', onClick);
    return b;
  }

  // ---- pantalla completa: mueve el <svg> real y la barra de herramientas
  // (no una copia) a un modal ancho; al cerrar, vuelven exactamente a su
  // sitio original. sync()/writeStore() no distinguen dónde vive el <svg>
  // en el DOM, así que editar, arrastrar y exportar funcionan igual dentro.
  function openFullscreen() {
    if (fsHandle) { fsHandle.close(); return; }
    const svgHome = { parent: svg.parentNode, next: svg.nextSibling };
    const toolbarHome = { parent: toolbar.parentNode, next: toolbar.nextSibling };
    if (!svgHome.parent || !toolbarHome.parent) return;
    fsHandle = openModalPanel({
      title: T.fullscreenTitle,
      extraClass: 'ql-modal-wide',
      closeLabel: T.close,
      render(bodyEl) {
        const stage = document.createElement('div');
        stage.className = 'ce-fs-stage';
        const svgWrap = document.createElement('div');
        svgWrap.className = 'ce-fs-svgwrap';
        svgWrap.appendChild(svg);
        stage.appendChild(svgWrap);
        stage.appendChild(toolbar);
        bodyEl.appendChild(stage);
        svg.classList.add('ce-fs-svg');
        return () => {
          fsHandle = null;
          svg.classList.remove('ce-fs-svg');
          try { svgHome.parent.insertBefore(svg, svgHome.next); } catch (e) { /* noop */ }
          try { toolbarHome.parent.insertBefore(toolbar, toolbarHome.next); } catch (e) { /* noop */ }
          renderToolbar();
        };
      },
    });
    renderToolbar();
  }

  function setEditing(on) {
    editing = on;
    svg.classList.toggle('ce-editing', on);
    if (!on) { closePanel(); selectedId = null; syncSelection(); }
    renderToolbar();
    sync();
  }

  // ---- crear / envolver elementos y aplicar estado ----
  function ensureEl(spec) {
    let inner = null;
    if (spec.selector) inner = svg.querySelector(spec.selector);
    if (!inner) inner = svg.querySelector('[data-ce="' + spec.id + '"]');
    if (!inner && spec.create) {
      inner = document.createElementNS(NS, 'text');
      inner.textContent = spec.create.text || '';
      inner.setAttribute('x', spec.create.x);
      inner.setAttribute('y', spec.create.y);
      inner.setAttribute('text-anchor', spec.create.anchor || 'middle');
      inner.setAttribute('data-ce', spec.id);
      if (spec.create.cls) inner.setAttribute('class', spec.create.cls);
      svg.appendChild(inner);
    }
    if (!inner) return null;

    // envolver en <g class="ce-el"> si no lo está ya
    let wrap = inner.parentNode;
    if (!(wrap && wrap.classList && wrap.classList.contains('ce-el'))) {
      wrap = document.createElementNS(NS, 'g');
      wrap.setAttribute('class', 'ce-el');
      wrap.setAttribute('data-ce-id', spec.id);
      inner.parentNode.insertBefore(wrap, inner);
      wrap.appendChild(inner);
    }
    wraps.set(spec.id, { wrap, inner, kind: spec.kind || 'text', create: spec.create });
    return wraps.get(spec.id);
  }

  function applyState(id) {
    const w = wraps.get(id);
    if (!w) return;
    const s = store[id] || {};
    w.wrap.setAttribute('transform', 'translate(' + (s.dx || 0) + ',' + (s.dy || 0) + ')');
    const targets = w.kind === 'group' ? w.wrap.querySelectorAll('text, tspan') : [w.inner];
    targets.forEach((el) => {
      el.style.fill = s.fill || '';
      el.style.fontFamily = s.font || '';
      el.style.fontWeight = s.bold ? '700' : (s.bold === false ? '400' : '');
      el.style.fontStyle = s.italic ? 'italic' : (s.italic === false ? 'normal' : '');
      el.style.fontSize = s.size ? s.size + 'px' : '';
    });
    if (w.kind === 'text' && typeof s.text === 'string') w.inner.textContent = s.text;
  }

  function decorate(id) {
    const w = wraps.get(id);
    if (!w) return;
    // quitar hit/outline previos
    w.wrap.querySelectorAll(':scope > .ce-hit, :scope > .ce-outline').forEach((n) => n.remove());
    if (!editing) return;
    let bb;
    try { bb = w.wrap.getBBox(); } catch (e) { return; }
    if (!bb || (bb.width === 0 && bb.height === 0)) return;
    const pad = 5;
    const mk = (cls) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', cls);
      r.setAttribute('x', bb.x - pad); r.setAttribute('y', bb.y - pad);
      r.setAttribute('width', bb.width + pad * 2); r.setAttribute('height', bb.height + pad * 2);
      r.setAttribute('rx', 3);
      return r;
    };
    const outline = mk('ce-outline');
    const hit = mk('ce-hit');
    // accesible por teclado: foco + rol + descripción; flechas mueven, Intro edita
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', T.handle(elLabel(id)));
    w.wrap.appendChild(outline);
    w.wrap.appendChild(hit);
    hit.addEventListener('pointerdown', (e) => startDrag(e, id, hit));
    hit.addEventListener('focus', () => { selectedId = id; syncSelection(); });
    hit.addEventListener('keydown', (e) => onHitKey(e, id, hit));
  }

  // teclado sobre un "tirador": flechas mueven, Mayús multiplica el paso,
  // Intro / Espacio abren el panel de estilo, Escape lo cierra.
  function onHitKey(e, id, hit) {
    if (!editing) return;
    const STEP = e.shiftKey ? 12 : 2;
    let dx = 0, dy = 0;
    switch (e.key) {
      case 'ArrowLeft': dx = -STEP; break;
      case 'ArrowRight': dx = STEP; break;
      case 'ArrowUp': dy = -STEP; break;
      case 'ArrowDown': dy = STEP; break;
      case 'Enter': case ' ': case 'Spacebar':
        e.preventDefault();
        openPanelForHit(id, hit);
        return;
      default:
        return;
    }
    e.preventDefault();
    const s = st(id);
    s.dx = (s.dx || 0) + dx;
    s.dy = (s.dy || 0) + dy;
    const w = wraps.get(id);
    if (w) w.wrap.setAttribute('transform', 'translate(' + s.dx + ',' + s.dy + ')');
    writeStoreDebounced();
  }

  // abre el panel anclado al centro del tirador (no hay puntero en teclado)
  function openPanelForHit(id, hit) {
    let r;
    try { r = hit.getBoundingClientRect(); } catch (err) { r = null; }
    const ev = r
      ? { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
      : null;
    selectAndOpen(id, ev);
    // llevar el foco al primer control editable del panel (no al botón de cerrar)
    if (panel) {
      const first = panel.querySelector('.ce-row input, .ce-row select') || panel.querySelector('button');
      if (first) first.focus();
    }
  }

  function syncSelection() {
    wraps.forEach((w, id) => w.wrap.classList.toggle('ce-selected', id === selectedId && editing));
  }

  /** Re-encuentra, re-envuelve y re-aplica todo. Llamar tras cada re-render del gráfico. */
  function sync() {
    wraps.clear();
    elements.forEach((spec) => ensureEl(spec));
    wraps.forEach((_, id) => applyState(id));
    wraps.forEach((_, id) => decorate(id));
    syncSelection();
    // último paso a propósito: en algún gráfico (p. ej. las etiquetas de
    // grupo del Venn) el mismo <text> es a la vez un elemento de texto
    // arrastrable Y una serie de datos — si hay override de paleta, gana él.
    applyPalette();
  }

  // ---- arrastre ----
  function svgScale() {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
      ? svg.viewBox.baseVal.width : r.width;
    return r.width && vb ? r.width / vb : 1;
  }
  function startDrag(e, id, hit) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const s = st(id);
    const scale = svgScale();
    const startX = e.clientX, startY = e.clientY;
    const ox = s.dx || 0, oy = s.dy || 0;
    let moved = 0;
    try { hit.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    const onMove = (ev) => {
      const ddx = (ev.clientX - startX) / scale;
      const ddy = (ev.clientY - startY) / scale;
      moved = Math.max(moved, Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY));
      s.dx = ox + ddx; s.dy = oy + ddy;
      const w = wraps.get(id);
      if (w) w.wrap.setAttribute('transform', 'translate(' + s.dx + ',' + s.dy + ')');
    };
    const onUp = (ev) => {
      hit.removeEventListener('pointermove', onMove);
      hit.removeEventListener('pointerup', onUp);
      hit.removeEventListener('pointercancel', onUp);
      try { hit.releasePointerCapture(ev.pointerId); } catch (err) { /* noop */ }
      if (moved < 3) {
        // clic sin arrastre: si no cambió, no persistas el dx/dy=0 espurio
        if (!s.dx && !s.dy && Object.keys(s).length <= 2) { /* keep */ }
        selectAndOpen(id, ev);
      } else {
        writeStore();
      }
    };
    hit.addEventListener('pointermove', onMove);
    hit.addEventListener('pointerup', onUp);
    hit.addEventListener('pointercancel', onUp);
    selectAndOpen(id, e, true);
  }

  // ---- panel de estilo ----
  function selectAndOpen(id, ev, quiet) {
    selectedId = id;
    syncSelection();
    if (!quiet) openPanel(id, ev);
    else openPanel(id, ev);
  }
  function closePanel() {
    if (panel) { panel.remove(); panel = null; }
  }
  function openPanel(id, ev) {
    closePanel();
    const w = wraps.get(id);
    if (!w) return;
    const s = st(id);
    const cs = getComputedStyle(w.inner);
    panel = document.createElement('div');
    panel.className = 'ce-panel';
    panel.innerHTML = '<h4><span>' + elLabel(id) + '</span><button type="button" aria-label="' + T.close + '">×</button></h4>';

    const rows = document.createElement('div');
    panel.appendChild(rows);

    if (w.kind === 'text') {
      const rText = row(T.text);
      const inpText = document.createElement('input');
      inpText.type = 'text';
      inpText.value = (typeof s.text === 'string') ? s.text : w.inner.textContent;
      inpText.addEventListener('input', () => { s.text = inpText.value; w.inner.textContent = inpText.value; decorate(id); writeStoreDebounced(); });
      rText.appendChild(inpText);
      rows.appendChild(rText);
    }

    const rColor = row(T.color);
    const inpColor = document.createElement('input');
    inpColor.type = 'color';
    inpColor.value = toHex(s.fill || cs.fill);
    const inpColorHex = document.createElement('input');
    inpColorHex.type = 'text';
    inpColorHex.className = 'ce-hexfield';
    inpColorHex.setAttribute('aria-label', T.color + ' — ' + T.hex);
    inpColorHex.placeholder = '#RRGGBB';
    inpColorHex.value = inpColor.value.toUpperCase();
    inpColor.addEventListener('input', () => { s.fill = inpColor.value; inpColorHex.value = inpColor.value.toUpperCase(); applyState(id); writeStoreDebounced(); });
    inpColorHex.addEventListener('input', () => {
      let v = inpColorHex.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (!isValidHex(v)) return;
      inpColor.value = v; s.fill = v; applyState(id); writeStoreDebounced();
    });
    rColor.appendChild(inpColor);
    rColor.appendChild(inpColorHex);
    rows.appendChild(rColor);

    const rFont = row(T.font);
    const sel = document.createElement('select');
    FONTS.forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (s.font === val) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { s.font = sel.value; applyState(id); decorate(id); writeStore(); });
    rFont.appendChild(sel);
    rows.appendChild(rFont);

    const rSize = row(T.size);
    const inpSize = document.createElement('input');
    inpSize.type = 'number'; inpSize.min = '8'; inpSize.max = '36'; inpSize.step = '1';
    inpSize.value = Math.round(parseFloat(s.size || cs.fontSize) || 12);
    inpSize.addEventListener('input', () => {
      let v = parseInt(inpSize.value, 10);
      if (!isFinite(v)) return;
      v = Math.max(8, Math.min(36, v));
      s.size = v; applyState(id); decorate(id); writeStoreDebounced();
    });
    rSize.appendChild(inpSize);
    rows.appendChild(rSize);

    const rTog = row('');
    const togWrap = document.createElement('div');
    togWrap.className = 'ce-toggles';
    const bB = document.createElement('button'); bB.type = 'button'; bB.textContent = 'B'; bB.style.fontWeight = '700';
    bB.setAttribute('aria-label', T.bold);
    const bI = document.createElement('button'); bI.type = 'button'; bI.textContent = 'I'; bI.style.fontStyle = 'italic';
    bI.setAttribute('aria-label', T.italic);
    const isBold = s.bold ?? (parseInt(cs.fontWeight, 10) >= 600);
    const isItalic = s.italic ?? (cs.fontStyle === 'italic');
    bB.classList.toggle('on', !!isBold); bB.setAttribute('aria-pressed', String(!!isBold));
    bI.classList.toggle('on', !!isItalic); bI.setAttribute('aria-pressed', String(!!isItalic));
    bB.addEventListener('click', () => { const on = !bB.classList.contains('on'); s.bold = on; bB.classList.toggle('on', on); bB.setAttribute('aria-pressed', String(on)); applyState(id); decorate(id); writeStore(); });
    bI.addEventListener('click', () => { const on = !bI.classList.contains('on'); s.italic = on; bI.classList.toggle('on', on); bI.setAttribute('aria-pressed', String(on)); applyState(id); decorate(id); writeStore(); });
    togWrap.appendChild(bB); togWrap.appendChild(bI);
    rTog.appendChild(togWrap);
    rows.appendChild(rTog);

    // enlazar cada <label> de fila con su control (accesibilidad del panel)
    panel.querySelectorAll('.ce-row').forEach((r) => {
      const lab = r.querySelector(':scope > label');
      const ctl = r.querySelector('input, select');
      if (lab && ctl && lab.textContent.trim()) {
        if (!ctl.id) ctl.id = 'ce-f-' + (++cePanelUid);
        lab.setAttribute('for', ctl.id);
      }
    });

    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', elLabel(id));
    document.body.appendChild(panel);
    positionPanel(ev);
    panel.querySelector('h4 button').addEventListener('click', () => {
      closePanel(); selectedId = null; syncSelection();
      const w = wraps.get(id);
      const hit = w && w.wrap.querySelector(':scope > .ce-hit');
      if (hit) try { hit.focus(); } catch (e) { /* noop */ }
    });
  }
  function elLabel(id) {
    const es = lang === 'es';
    const map = { title: es ? 'Título de la figura' : 'Figure title',
                  xtitle: es ? 'Título eje X' : 'X axis title',
                  ytitle: es ? 'Título eje Y' : 'Y axis title',
                  legend: es ? 'Leyenda' : 'Legend' };
    if (map[id]) return map[id];
    if (/^grp\d+$/.test(id) || /^set\d+$/.test(id)) return es ? 'Etiqueta de grupo' : 'Group label';
    return id;
  }
  function row(label) {
    const r = document.createElement('div');
    r.className = 'ce-row';
    if (label) { const l = document.createElement('label'); l.textContent = label; r.appendChild(l); }
    else { const l = document.createElement('label'); l.textContent = ''; r.appendChild(l); }
    return r;
  }
  function positionPanel(ev) {
    if (!panel) return;
    const pr = panel.getBoundingClientRect();
    let x = (ev && ev.clientX ? ev.clientX + 16 : window.innerWidth / 2);
    let y = (ev && ev.clientY ? ev.clientY - 10 : 120);
    x = Math.min(x, window.innerWidth - pr.width - 12);
    y = Math.min(Math.max(12, y), window.innerHeight - pr.height - 12);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  let debTimer = null;
  function writeStoreDebounced() {
    clearTimeout(debTimer);
    debTimer = setTimeout(writeStore, 300);
  }

  // clic fuera → cerrar panel
  function onDocDown(e) {
    if (!editing) return;
    if (panel && (panel.contains(e.target))) return;
    if (svg.contains(e.target)) return; // clics dentro del svg los gestiona el hit
    closePanel(); selectedId = null; syncSelection();
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const back = selectedId;
    closePanel(); selectedId = null; syncSelection();
    // devolver el foco al tirador que abrió el panel (navegación solo-teclado)
    if (back && editing) {
      const w = wraps.get(back);
      const hit = w && w.wrap.querySelector(':scope > .ce-hit');
      if (hit) try { hit.focus(); } catch (err) { /* noop */ }
    }
  }
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey);

  // ---- reset ----
  function resetAll() {
    store = {};
    try {
      localStorage.removeItem(LSKEY);
      localStorage.removeItem(LEGACY_LSKEY);
    } catch (e) { /* noop */ }
    closePanel();
    selectedId = null;
    if (cfg.onReset) { cfg.onReset(); return; } // el módulo re-renderiza
    // fallback: limpiar in situ
    wraps.forEach((w, id) => {
      w.wrap.setAttribute('transform', 'translate(0,0)');
      const targets = w.kind === 'group' ? w.wrap.querySelectorAll('text, tspan') : [w.inner];
      targets.forEach((el) => { el.style.cssText = ''; });
      if (w.create && typeof w.create.text === 'string') w.inner.textContent = w.create.text;
    });
    sync();
    if (cfg.onChange) try { cfg.onChange(); } catch (e) {}
    renderToolbar();
  }

  // ---- exportar SVG y PNG de alta resolución ----
  function serialize() {
    return serializeSvg(svg);
  }

  function downloadSvg() {
    const res = exportSvg(svg, filename);
    return res.str;
  }

  function downloadPng() {
    return exportPng(svg, filename, 4);
  }

  function toHex(color) {
    if (!color) return '#000000';
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    const m = color.match(/rgba?\(([^)]+)\)/i);
    if (!m) return '#000000';
    const [r, g, b] = m[1].split(',').map((x) => parseInt(x, 10));
    return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x || 0)).toString(16).padStart(2, '0')).join('');
  }

  // ---- init ----
  renderToolbar();
  sync();

  return {
    sync,
    serialize,
    download: downloadSvg,
    downloadPng,
    isDirty: () => Object.keys(store).length > 0,
    destroy() {
      if (fsHandle) fsHandle.close(); // devuelve el <svg>/toolbar a casa antes de que el módulo limpie su contenedor
      clearTimeout(debTimer);
      closePanel();
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey);
      svg.classList.remove('ce-editing');
      toolbar.remove();
      svg.querySelectorAll('.ce-hit, .ce-outline').forEach((n) => n.remove());
    },
  };
}

/**
 * Sanitiza nombres de archivo para descargas de figuras científicas.
 */
export function sanitizeFilename(filename, defaultName = 'smart175_figura') {
  if (!filename || typeof filename !== 'string') return defaultName;
  let name = filename.trim().replace(/\.(svg|png)$/i, '');
  const clean = name.replace(/[^a-z0-9_\u00C0-\u024F-]+/gi, '_').replace(/^_+|_+$/g, '');
  return clean || defaultName;
}

/**
 * Copia estilos calculados (fills, strokes, tipografías) a atributos inline del clon
 * para garantizar que el SVG conserve su aspecto exacto fuera de la aplicación.
 */
export function inlineComputedStyles(srcRoot, dstRoot) {
  if (!srcRoot || !dstRoot) return;
  const getCS = (typeof getComputedStyle === 'function')
    ? getComputedStyle
    : ((typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') ? window.getComputedStyle : null);
  if (!getCS) return;

  const src = srcRoot.querySelectorAll ? srcRoot.querySelectorAll('*') : [];
  const dst = dstRoot.querySelectorAll ? dstRoot.querySelectorAll('*') : [];
  const props = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
    'stroke-linejoin', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight',
    'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'stop-color', 'stop-opacity'
  ];
  const copy = (a, b) => {
    try {
      const cs = getCS(a);
      if (!cs) return;
      let decl = '';
      props.forEach((p) => {
        const v = cs.getPropertyValue ? cs.getPropertyValue(p) : cs[p];
        if (v && v !== 'normal' && v !== 'none' || (p === 'fill' && v)) {
          if (v) decl += p + ':' + v + ';';
        }
      });
      if (decl && b.setAttribute) {
        const prev = b.getAttribute('style') || '';
        b.setAttribute('style', decl + prev);
      }
    } catch (e) {}
  };
  copy(srcRoot, dstRoot);
  for (let i = 0; i < src.length && i < dst.length; i++) {
    if (dst[i].classList && (dst[i].classList.contains('ce-hit') || dst[i].classList.contains('ce-outline'))) continue;
    copy(src[i], dst[i]);
  }
}

/**
 * Serializa un nodo SVG a XML estándar, incrustando estilos calculados y
 * añadiendo un fondo blanco sólido (#ffffff) permanente para revistas científicas.
 */
export function serializeSvg(svgEl) {
  if (!svgEl) return '';
  const clone = svgEl.cloneNode(true);
  if (clone.classList && clone.classList.remove) {
    clone.classList.remove('ce-editing');
  }
  if (clone.querySelectorAll) {
    clone.querySelectorAll('.ce-hit, .ce-outline').forEach((n) => n.remove());
    clone.querySelectorAll('.ce-el').forEach((g) => {
      if (g.classList && g.classList.remove) g.classList.remove('ce-selected');
    });
  }
  inlineComputedStyles(svgEl, clone);

  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  let w = vb && vb.width ? vb.width : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().width : 0);
  let h = vb && vb.height ? vb.height : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().height : 0);
  if (!w || !h) {
    w = parseFloat(svgEl.getAttribute('width')) || 800;
    h = parseFloat(svgEl.getAttribute('height')) || 600;
  }
  w = Math.round(w);
  h = Math.round(h);

  clone.setAttribute('xmlns', NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  if (!clone.getAttribute('viewBox')) {
    const vx = vb && vb.x !== undefined ? vb.x : 0;
    const vy = vb && vb.y !== undefined ? vb.y : 0;
    clone.setAttribute('viewBox', `${vx} ${vy} ${w} ${h}`);
  }
  clone.removeAttribute('style');

  // Fondo blanco sólido (#ffffff) permanente para publicación científica
  if (clone.querySelectorAll) {
    clone.querySelectorAll('.ce-export-bg').forEach((n) => n.remove());
  }
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('class', 'ce-export-bg');
  const vx = vb && vb.x !== undefined ? vb.x : 0;
  const vy = vb && vb.y !== undefined ? vb.y : 0;
  bg.setAttribute('x', String(vx));
  bg.setAttribute('y', String(vy));
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  let serializer;
  if (typeof XMLSerializer !== 'undefined') {
    serializer = new XMLSerializer();
  } else if (typeof globalThis !== 'undefined' && globalThis.XMLSerializer) {
    serializer = new globalThis.XMLSerializer();
  }
  let str = serializer ? serializer.serializeToString(clone) : (clone.outerHTML || '');
  if (!str.startsWith('<?xml')) {
    str = '<?xml version="1.0" encoding="UTF-8"?>\n' + str;
  }
  return str;
}

/**
 * Exporta un elemento SVG a archivo vectorial .svg con descarga automática en el navegador.
 *
 * @param {SVGElement} svgEl - Elemento SVG a exportar
 * @param {string} [filename='smart175_figura'] - Nombre de archivo
 * @returns {{ str: string, filename: string, blob: Blob|null }}
 */
export function exportSvg(svgEl, filename = 'smart175_figura') {
  if (!svgEl) {
    throw new Error('No SVG element provided for exportSvg');
  }
  const str = serializeSvg(svgEl);
  const downloadName = sanitizeFilename(filename, 'smart175_figura') + '.svg';
  let blob = null;

  try {
    blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.style.display = 'none';
      if (document.body) {
        document.body.appendChild(a);
      }
      a.click();
      a.remove();
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }, 4000);
    }
  } catch (e) {
    // Entorno restringido / headless
  }

  return { str, filename: downloadName, blob };
}

/**
 * Exporta un elemento SVG a imagen rasterizada PNG en alta resolución (300+ dpi)
 * renderizando en un <canvas> escalado en memoria con fondo blanco sólido (#ffffff).
 *
 * @param {SVGElement} svgEl - Elemento SVG a exportar
 * @param {string} [filename='smart175_figura'] - Nombre de archivo
 * @param {number} [scale=4] - Factor de escala para 300+ dpi (por defecto 4x)
 * @returns {Promise<{ canvas: HTMLCanvasElement, dataUrl: string, filename: string, width: number, height: number, scale: number }>}
 */
export function exportPng(svgEl, filename = 'smart175_figura', scale = 4) {
  return new Promise((resolve, reject) => {
    try {
      if (!svgEl) {
        throw new Error('No SVG element provided for exportPng');
      }

      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      let w = vb && vb.width ? vb.width : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().width : 0);
      let h = vb && vb.height ? vb.height : (svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect().height : 0);
      if (!w || !h) {
        w = parseFloat(svgEl.getAttribute('width')) || 800;
        h = parseFloat(svgEl.getAttribute('height')) || 600;
      }
      w = Math.round(w);
      h = Math.round(h);

      const targetScale = Math.max(1, Number(scale) || 4);
      const str = serializeSvg(svgEl);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * targetScale);
      canvas.height = Math.round(h * targetScale);

      const ctx = canvas.getContext ? canvas.getContext('2d') : null;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const downloadName = sanitizeFilename(filename, 'smart175_figura') + '.png';
      const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
      const url = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
        ? URL.createObjectURL(blob)
        : ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str));

      const img = (typeof Image !== 'undefined') ? new Image() : (globalThis.Image ? new globalThis.Image() : null);
      if (!img) {
        throw new Error('Image constructor is not available');
      }

      img.onload = () => {
        try {
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          if (url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(url);
          }

          let dataUrl = '';
          if (typeof canvas.toDataURL === 'function') {
            dataUrl = canvas.toDataURL('image/png');
          }

          if (dataUrl && typeof document !== 'undefined') {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = downloadName;
            a.style.display = 'none';
            if (document.body) {
              document.body.appendChild(a);
            }
            a.click();
            a.remove();
          }

          resolve({
            canvas,
            dataUrl,
            filename: downloadName,
            width: canvas.width,
            height: canvas.height,
            scale: targetScale,
          });
        } catch (err) {
          if (url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            try { URL.revokeObjectURL(url); } catch (e) {}
          }
          reject(err);
        }
      };

      img.onerror = (err) => {
        if (url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try { URL.revokeObjectURL(url); } catch (e) {}
        }
        reject(err || new Error('Error decodificando imagen SVG para exportar a PNG'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

// =========================================================================
//  INFRAESTRUCTURA DEL EDITOR GRÁFICO GLOBAL (<dialog> MODAL)
// =========================================================================

/**
 * Abre un diálogo modal <dialog> amplio para editar en tiempo real los
 * parámetros de tipografía, colores y geometría de una gráfica.
 *
 * @param {Element|string} chartRef - Referencia al SVG, contenedor o clave del gráfico
 * @param {Object} [configOptions] - Parámetros de configuración iniciales
 * @param {Function} [onUpdate] - Callback en tiempo real (currentConfig, changedKey, changedValue)
 * @returns {{ dialog: HTMLDialogElement, close: () => void }}
 */
export function openChartEditor(chartRef, configOptions = {}, onUpdate = () => {}) {
  // 1. Cerrar cualquier diálogo de edición previo para evitar duplicados
  const prevDialog = document.querySelector('dialog.ql-chart-editor-dialog');
  if (prevDialog) {
    try { prevDialog.close(); } catch (e) {}
    prevDialog.remove();
  }

  let svgEl = null;
  if (chartRef) {
    if (typeof chartRef === 'object' && chartRef.tagName) {
      svgEl = chartRef.tagName.toLowerCase() === 'svg' ? chartRef : (chartRef.querySelector ? chartRef.querySelector('svg') : null);
    } else if (typeof chartRef === 'string') {
      const found = document.querySelector(chartRef);
      if (found) svgEl = found.tagName.toLowerCase() === 'svg' ? found : found.querySelector('svg');
    }
  }

  // 2. Clon de configuración y valores por defecto
  const typography = Object.assign({
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    isBold: false,
    isItalic: false,
  }, configOptions.typography || {});

  const colors = Object.assign({
    palette: 'categorical',
    series: [],
    linkOpacity: 0.4,
  }, configOptions.colors || {});

  const geometry = Object.assign({
    nodeWidth: 20,
    nodeGap: 2,
    linkOpacity: 0.4,
    sliders: [],
  }, configOptions.geometry || {});

  // Sliders por defecto para diagrama aluvial si no se especificaron
  if (geometry.sliders.length === 0 && (configOptions.chartType === 'alluvial' || geometry.nodeWidth !== undefined)) {
    geometry.sliders = [
      { id: 'nodeWidth', key: 'nodeWidth', label: 'Ancho de los nodos/barras', min: 6, max: 60, step: 2, value: geometry.nodeWidth || 20, unit: 'px' },
      { id: 'nodeGap', key: 'nodeGap', label: 'Separación entre nodos', min: 0, max: 14, step: 1, value: geometry.nodeGap ?? 2, unit: 'px' },
      { id: 'linkOpacity', key: 'linkOpacity', label: 'Opacidad de los flujos', min: 0.1, max: 0.95, step: 0.05, value: geometry.linkOpacity ?? colors.linkOpacity ?? 0.4, isPercent: true },
    ];
  }

  const currentConfig = {
    title: configOptions.title || 'Ajustes de la gráfica',
    subtitle: configOptions.subtitle || 'Modifica tipografía, colores y geometría con previsualización en tiempo real.',
    chartType: configOptions.chartType || 'generic',
    typography,
    colors,
    geometry,
  };

  const initialConfig = JSON.parse(JSON.stringify(currentConfig));

  function notify(key, val) {
    if (typeof onUpdate === 'function') {
      try {
        onUpdate(key, val, currentConfig);
      } catch (err) {
        console.warn('onUpdate callback error:', err);
      }
    }
  }

  // 3. Crear el elemento nativo <dialog>
  const dialog = document.createElement('dialog');
  dialog.className = 'ql-chart-editor-dialog';
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('role', 'dialog');

  // Cabecera
  const header = document.createElement('header');
  header.className = 'ql-ce-dialog-header';
  header.innerHTML = `
    <div>
      <h2 class="ql-ce-dialog-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>${escapeHtml(currentConfig.title)}</span>
      </h2>
      <p class="ql-ce-dialog-subtitle">${escapeHtml(currentConfig.subtitle)}</p>
    </div>
    <button type="button" class="ql-ce-dialog-close" title="Cerrar" aria-label="Cerrar">✕</button>
  `;
  dialog.appendChild(header);

  // Navegación de pestañas (Tipografía | Colores | Geometría)
  const nav = document.createElement('nav');
  nav.className = 'ql-ce-dialog-nav';
  const tabs = [
    { id: 'geometry', label: 'Geometría' },
    { id: 'typography', label: 'Tipografía' },
    { id: 'colors', label: 'Colores' },
  ];
  let activeTab = 'geometry';

  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ql-ce-tab-btn' + (t.id === activeTab ? ' is-active' : '');
    btn.textContent = t.label;
    btn.setAttribute('data-tab', t.id);
    btn.addEventListener('click', () => {
      activeTab = t.id;
      dialog.querySelectorAll('.ql-ce-tab-btn').forEach((b) => {
        b.classList.toggle('is-active', b.getAttribute('data-tab') === activeTab);
      });
      dialog.querySelectorAll('.ql-ce-tab-panel').forEach((p) => {
        p.classList.toggle('is-active', p.getAttribute('data-panel') === activeTab);
      });
    });
    nav.appendChild(btn);
  });
  dialog.appendChild(nav);

  // Cuerpo con paneles
  const body = document.createElement('div');
  body.className = 'ql-ce-dialog-body';

  // --- PANEL 1: GEOMETRÍA ---
  const panelGeom = document.createElement('div');
  panelGeom.className = 'ql-ce-tab-panel' + (activeTab === 'geometry' ? ' is-active' : '');
  panelGeom.setAttribute('data-panel', 'geometry');

  if (currentConfig.geometry.sliders && currentConfig.geometry.sliders.length > 0) {
    currentConfig.geometry.sliders.forEach((sl) => {
      const sliderField = document.createElement('div');
      sliderField.className = 'ql-field';
      const val = sl.isPercent ? Math.round(sl.value * 100) : sl.value;
      const min = sl.isPercent ? Math.round(sl.min * 100) : sl.min;
      const max = sl.isPercent ? Math.round(sl.max * 100) : sl.max;
      const step = sl.isPercent ? Math.round(sl.step * 100) : sl.step;
      const unit = sl.isPercent ? '%' : (sl.unit || '');

      sliderField.innerHTML = `<label for="ql-ce-sl-${sl.id}">${escapeHtml(sl.label)}${unit ? ' (' + unit + ')' : ''}</label>` +
        `<div class="ql-inputrow">` +
        `<input type="range" id="ql-ce-sl-${sl.id}-r" min="${min}" max="${max}" step="${step}" value="${val}">` +
        `<input type="number" id="ql-ce-sl-${sl.id}" class="ql-num-small tabular" min="${min}" max="${max}" step="${step}" value="${val}">` +
        `</div>`;

      const rInput = sliderField.querySelector(`#ql-ce-sl-${sl.id}-r`);
      const nInput = sliderField.querySelector(`#ql-ce-sl-${sl.id}`);

      const onSliderChange = (rawVal) => {
        const num = parseFloat(rawVal);
        const actualVal = sl.isPercent ? num / 100 : num;
        sl.value = actualVal;
        currentConfig.geometry[sl.key || sl.id] = actualVal;
        rInput.value = num;
        nInput.value = num;
        notify(sl.key || sl.id, actualVal);
      };

      rInput.addEventListener('input', () => onSliderChange(rInput.value));
      nInput.addEventListener('change', () => onSliderChange(nInput.value));

      panelGeom.appendChild(sliderField);
    });
  }
  body.appendChild(panelGeom);

  // --- PANEL 2: TIPOGRAFÍA Y TÍTULOS ---
  const panelTypo = document.createElement('div');
  panelTypo.className = 'ql-ce-tab-panel' + (activeTab === 'typography' ? ' is-active' : '');
  panelTypo.setAttribute('data-panel', 'typography');

  // Sección de Títulos globales del gráfico y ejes
  const modalTitleDefs = [
    { id: 'title', label: 'Título del Gráfico', inputId: 'ql-ce-title-input', selector: '.ql-chart-main-title, .ce-title, [data-ce="title"]' },
    { id: 'xtitle', label: 'Título Eje X', inputId: 'ql-ce-xtitle-input', selector: '.ql-chart-x-title, [data-ce="xtitle"]' },
    { id: 'ytitle', label: 'Título Eje Y', inputId: 'ql-ce-ytitle-input', selector: '.ql-chart-y-title, [data-ce="ytitle"]' },
  ];

  const titlesSection = document.createElement('div');
  titlesSection.className = 'ql-field ql-ce-titles-container';
  titlesSection.innerHTML = '<label style="font-weight:600;">Títulos de la figura</label>' +
    '<p class="ql-field-help" style="margin-bottom:8px;">Edición reactiva de títulos en tiempo real.</p>';

  const titleRows = document.createElement('div');
  titleRows.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:6px;margin-bottom:14px;';

  modalTitleDefs.forEach((td) => {
    const subField = document.createElement('div');
    subField.className = 'ql-field';
    subField.style.marginBottom = '6px';

    const lab = document.createElement('label');
    lab.setAttribute('for', td.inputId);
    lab.textContent = td.label;
    subField.appendChild(lab);

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = td.inputId;
    inp.className = 'ql-input ' + td.inputId;
    inp.placeholder = td.label;

    if (svgEl) {
      const match = svgEl.querySelector(td.selector);
      if (match && match.textContent) inp.value = match.textContent.trim();
    }
    if (!inp.value && configOptions[td.id]) {
      inp.value = configOptions[td.id];
    }

    inp.addEventListener('input', () => {
      const val = inp.value;
      if (svgEl) {
        const matches = svgEl.querySelectorAll(td.selector);
        matches.forEach((el) => { el.textContent = val; });
      }
      currentConfig[td.id] = val;
      notify(td.id, val);
    });

    subField.appendChild(inp);
    titleRows.appendChild(subField);
  });

  titlesSection.appendChild(titleRows);
  panelTypo.appendChild(titlesSection);

  const fontField = document.createElement('div');
  fontField.className = 'ql-field';
  fontField.innerHTML = '<label for="ql-ce-font-select">Familia tipográfica</label>';
  const fontSelect = document.createElement('select');
  fontSelect.id = 'ql-ce-font-select';
  fontSelect.className = 'ql-select';
  FONTS.forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (currentConfig.typography.fontFamily === val) opt.selected = true;
    fontSelect.appendChild(opt);
  });
  fontSelect.addEventListener('change', () => {
    currentConfig.typography.fontFamily = fontSelect.value;
    notify('fontFamily', fontSelect.value);
  });
  fontField.appendChild(fontSelect);
  panelTypo.appendChild(fontField);

  const fontStylesField = document.createElement('div');
  fontStylesField.className = 'ql-field';
  fontStylesField.innerHTML = '<label>Estilos de texto</label>';

  const checkRow = document.createElement('div');
  checkRow.style.cssText = 'display:flex;gap:20px;margin-top:4px;flex-wrap:wrap;';

  const boldLabel = document.createElement('label');
  boldLabel.className = 'ql-ce-checkbox-label';
  const boldChk = document.createElement('input');
  boldChk.type = 'checkbox';
  boldChk.checked = Boolean(currentConfig.typography.isBold);
  boldChk.addEventListener('change', () => {
    currentConfig.typography.isBold = boldChk.checked;
    notify('isBold', boldChk.checked);
  });
  boldLabel.appendChild(boldChk);
  boldLabel.appendChild(document.createTextNode(' Texto en negrita (600)'));
  checkRow.appendChild(boldLabel);

  const italicLabel = document.createElement('label');
  italicLabel.className = 'ql-ce-checkbox-label';
  const italicChk = document.createElement('input');
  italicChk.type = 'checkbox';
  italicChk.checked = Boolean(currentConfig.typography.isItalic);
  italicChk.addEventListener('change', () => {
    currentConfig.typography.isItalic = italicChk.checked;
    notify('isItalic', italicChk.checked);
  });
  italicLabel.appendChild(italicChk);
  italicLabel.appendChild(document.createTextNode(' Texto en cursiva'));
  checkRow.appendChild(italicLabel);

  fontStylesField.appendChild(checkRow);
  panelTypo.appendChild(fontStylesField);

  const sizeField = document.createElement('div');
  sizeField.className = 'ql-field';
  sizeField.innerHTML = '<label for="ql-ce-font-size">Tamaño de fuente (px)</label>' +
    '<div class="ql-inputrow">' +
    '<input type="range" id="ql-ce-font-size-r" min="9" max="22" step="1" value="' + (currentConfig.typography.fontSize || 13) + '">' +
    '<input type="number" id="ql-ce-font-size" class="ql-num-small tabular" min="9" max="22" step="1" value="' + (currentConfig.typography.fontSize || 13) + '">' +
    '</div>';
  {
    const rInput = sizeField.querySelector('#ql-ce-font-size-r');
    const nInput = sizeField.querySelector('#ql-ce-font-size');
    const onSizeChange = (v) => {
      const nv = Math.max(9, Math.min(22, parseInt(v, 10) || 13));
      rInput.value = nv;
      nInput.value = nv;
      currentConfig.typography.fontSize = nv;
      notify('fontSize', nv);
    };
    rInput.addEventListener('input', () => onSizeChange(rInput.value));
    nInput.addEventListener('change', () => onSizeChange(nInput.value));
  }
  panelTypo.appendChild(sizeField);
  body.appendChild(panelTypo);

  // --- PANEL 3: COLORES ---
  const panelColors = document.createElement('div');
  panelColors.className = 'ql-ce-tab-panel' + (activeTab === 'colors' ? ' is-active' : '');
  panelColors.setAttribute('data-panel', 'colors');

  if (currentConfig.colors.series && currentConfig.colors.series.length > 0) {
    const seriesSec = document.createElement('div');
    seriesSec.className = 'ql-field';
    seriesSec.innerHTML = '<label>Colores asignados por serie o taxón</label>' +
      '<p class="ql-field-help" style="margin-bottom:8px;">Ajusta los colores principales de los elementos.</p>';
    const colorList = document.createElement('div');
    colorList.style.cssText = 'max-height:220px;overflow-y:auto;padding-right:4px;display:flex;flex-direction:column;gap:6px;';

    currentConfig.colors.series.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'ql-ce-color-row';
      const name = document.createElement('span');
      name.style.cssText = 'font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;';
      name.textContent = s.label || s.id;
      row.appendChild(name);

      const colorInp = document.createElement('input');
      colorInp.type = 'color';
      colorInp.style.cssText = 'width:36px;height:26px;border:none;border-radius:4px;cursor:pointer;padding:0;background:none;';
      let initialColor = s.color || '#3b82f6';
      if (!initialColor.startsWith('#')) initialColor = '#3b82f6';
      colorInp.value = initialColor;

      colorInp.addEventListener('input', () => {
        s.color = colorInp.value;
        notify('seriesColor', { id: s.id, color: colorInp.value });
      });
      row.appendChild(colorInp);
      colorList.appendChild(row);
    });
    seriesSec.appendChild(colorList);
    panelColors.appendChild(seriesSec);
  }

  const opField = document.createElement('div');
  opField.className = 'ql-field';
  const currOp = currentConfig.colors.linkOpacity ?? currentConfig.geometry.linkOpacity ?? 0.4;
  opField.innerHTML = '<label for="ql-ce-op-r">Opacidad de los flujos (%)</label>' +
    '<div class="ql-inputrow">' +
    '<input type="range" id="ql-ce-op-r" min="10" max="95" step="5" value="' + Math.round(currOp * 100) + '">' +
    '<input type="number" id="ql-ce-op" class="ql-num-small tabular" min="10" max="95" step="5" value="' + Math.round(currOp * 100) + '">' +
    '</div>';
  {
    const rInput = opField.querySelector('#ql-ce-op-r');
    const nInput = opField.querySelector('#ql-ce-op');
    const onOpChange = (v) => {
      const nv = Math.max(10, Math.min(95, parseInt(v, 10) || 40));
      rInput.value = nv;
      nInput.value = nv;
      const frac = nv / 100;
      currentConfig.colors.linkOpacity = frac;
      currentConfig.geometry.linkOpacity = frac;
      notify('linkOpacity', frac);
    };
    rInput.addEventListener('input', () => onOpChange(rInput.value));
    nInput.addEventListener('change', () => onOpChange(nInput.value));
  }
  panelColors.appendChild(opField);
  body.appendChild(panelColors);

  dialog.appendChild(body);

  // Pie del modal
  const footer = document.createElement('footer');
  footer.className = 'ql-ce-dialog-footer';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'ql-btn ql-btn-ghost';
  resetBtn.textContent = 'Restablecer valores';
  resetBtn.addEventListener('click', () => {
    Object.assign(currentConfig.typography, initialConfig.typography);
    Object.assign(currentConfig.colors, initialConfig.colors);
    Object.assign(currentConfig.geometry, initialConfig.geometry);

    fontSelect.value = currentConfig.typography.fontFamily;
    boldChk.checked = currentConfig.typography.isBold;
    italicChk.checked = currentConfig.typography.isItalic;

    if (currentConfig.geometry.sliders) {
      currentConfig.geometry.sliders.forEach((sl) => {
        const orig = initialConfig.geometry.sliders.find((s) => s.id === sl.id);
        if (orig) {
          sl.value = orig.value;
          const r = dialog.querySelector(`#ql-ce-sl-${sl.id}-r`);
          const n = dialog.querySelector(`#ql-ce-sl-${sl.id}`);
          const displayVal = sl.isPercent ? Math.round(sl.value * 100) : sl.value;
          if (r) r.value = displayVal;
          if (n) n.value = displayVal;
        }
      });
    }

    modalTitleDefs.forEach((td) => {
      const orig = initialConfig[td.id] !== undefined ? initialConfig[td.id] : '';
      currentConfig[td.id] = orig;
      const inp = dialog.querySelector('#' + td.inputId);
      if (inp) inp.value = orig;
      if (svgEl && orig) {
        const matches = svgEl.querySelectorAll(td.selector);
        matches.forEach((el) => { el.textContent = orig; });
      }
    });

    notify('reset', currentConfig);
  });
  footer.appendChild(resetBtn);

  const actionsRight = document.createElement('div');
  actionsRight.className = 'ql-ce-dialog-footer-actions';
  actionsRight.style.display = 'flex';
  actionsRight.style.gap = '8px';
  actionsRight.style.alignItems = 'center';

  if (svgEl) {
    const dlSvgBtn = document.createElement('button');
    dlSvgBtn.type = 'button';
    dlSvgBtn.className = 'ql-btn';
    dlSvgBtn.innerHTML = `${CE_ICONS.download} <span>Descargar SVG</span>`;
    dlSvgBtn.title = 'Descargar SVG vectorial';
    dlSvgBtn.addEventListener('click', () => {
      exportSvg(svgEl, currentConfig.filename || configOptions.filename || 'smart175_figura');
    });
    actionsRight.appendChild(dlSvgBtn);

    const dlPngBtn = document.createElement('button');
    dlPngBtn.type = 'button';
    dlPngBtn.className = 'ql-btn';
    dlPngBtn.innerHTML = `${CE_ICONS.download} <span>Descargar PNG</span>`;
    dlPngBtn.title = 'Descargar PNG en alta resolución (300 dpi)';
    dlPngBtn.addEventListener('click', () => {
      exportPng(svgEl, currentConfig.filename || configOptions.filename || 'smart175_figura', 4);
    });
    actionsRight.appendChild(dlPngBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ql-btn ql-btn-primary';
  closeBtn.textContent = 'Cerrar';
  closeBtn.addEventListener('click', () => dialog.close());
  actionsRight.appendChild(closeBtn);

  footer.appendChild(actionsRight);

  dialog.appendChild(footer);

  // Eventos de cierre y clic fuera
  header.querySelector('.ql-ce-dialog-close').addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (ev) => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= ev.clientY && ev.clientY <= rect.top + rect.height &&
      rect.left <= ev.clientX && ev.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      dialog.close();
    }
  });

  dialog.addEventListener('close', () => {
    dialog.remove();
  });

  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }

  return {
    dialog,
    close: () => {
      try { dialog.close(); } catch (e) { dialog.remove(); }
    },
  };
}

