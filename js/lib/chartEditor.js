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
//  - Persistencia en localStorage por módulo (qiimelab.chartStyle.<key>),
//    re-aplicada al recargar. Botón "Restablecer".
//  - "Descargar SVG": exporta la figura tal cual se ve, con los estilos
//    inline resueltos (sin depender de la hoja de estilos de la app).
//
// Sin dependencias, sin build step. No toca datos ni escalas.

const NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'ce-styles';

const FONTS = [
  ['var(--font-body)', 'Sans (IBM Plex)'],
  ['var(--font-display)', 'Serif (IBM Plex)'],
  ['var(--font-mono)', 'Mono (IBM Plex)'],
  ['system-ui, sans-serif', 'Sistema'],
  ['Georgia, "Times New Roman", serif', 'Serif del sistema'],
  ['ui-monospace, Menlo, monospace', 'Mono del sistema'],
];

const I18N = {
  es: { customize: 'Personalizar', done: 'Terminar', reset: 'Restablecer', download: 'Descargar SVG',
        hint: 'Arrastra los textos para recolocarlos. Haz clic en uno para cambiar su estilo.',
        text: 'Texto', color: 'Color', font: 'Fuente', size: 'Tamaño', bold: 'Negrita', italic: 'Cursiva', close: 'Cerrar' },
  en: { customize: 'Customise', done: 'Done', reset: 'Reset', download: 'Download SVG',
        hint: 'Drag the labels to reposition them. Click one to change its style.',
        text: 'Text', color: 'Colour', font: 'Font', size: 'Size', bold: 'Bold', italic: 'Italic', close: 'Close' },
};
function tr(lang) { return I18N[lang] || I18N.es; }

// iconos propios, mismo estilo que la barra lateral (24×24, trazo 1.7, redondeado)
const CE_ICONS = {
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.4 3.6a2 2 0 0 1 2.9 2.9L7.5 18.3 3.5 19.5l1.2-4Z"/></svg>',
  download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10m0 0-3.5-3.5M12 14l3.5-3.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>',
  reset: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 8 0 1 1-1.5 4.5"/><path d="M3.5 4.5v4.8h4.8"/></svg>',
};

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.ce-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:14px; padding-top:14px; border-top:1px solid var(--border); }
.ce-toolbar .ce-hint { font-size:11.5px; color:var(--ink-muted); flex:1 1 100%; margin:2px 0 0; }
.ce-toolbar button { display:inline-flex; align-items:center; gap:6px; }
.ce-toolbar button svg { flex:none; }
svg.ce-editing { }
svg.ce-editing .ce-el { cursor: move; }
.ce-outline { fill:none; stroke:var(--accent); stroke-width:1; stroke-dasharray:4 3; pointer-events:none; opacity:0; transition:opacity .1s ease; }
svg.ce-editing .ce-el:hover .ce-outline, svg.ce-editing .ce-el.ce-selected .ce-outline { opacity:1; }
svg.ce-editing .ce-el.ce-selected .ce-outline { stroke-width:1.4; stroke-dasharray:none; }
.ce-hit { fill:transparent; pointer-events:none; }
svg.ce-editing .ce-hit { pointer-events:all; }
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
`;
  document.head.appendChild(s);
}

/**
 * @param {object} cfg
 * @param {string} cfg.key      clave de módulo (localStorage qiimelab.chartStyle.<key>)
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
  const lang = cfg.lang || 'es';
  const T = tr(lang);
  const LSKEY = 'qiimelab.chartStyle.' + key;

  let store = readStore();
  let editing = false;
  let selectedId = null;
  let panel = null;
  const wraps = new Map(); // id -> { wrap, inner, def }

  function readStore() {
    try { return JSON.parse(localStorage.getItem(LSKEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeStore() {
    try {
      if (Object.keys(store).length) localStorage.setItem(LSKEY, JSON.stringify(store));
      else localStorage.removeItem(LSKEY);
    } catch (e) { /* modo privado */ }
    if (cfg.onChange) try { cfg.onChange(); } catch (e) { /* noop */ }
    renderToolbar();
  }
  function st(id) { return (store[id] = store[id] || {}); }

  // ---- barra de herramientas ----
  const toolbar = document.createElement('div');
  toolbar.className = 'ce-toolbar';
  mount.appendChild(toolbar);

  function renderToolbar() {
    toolbar.innerHTML = '';
    const bCustom = mkBtn(CE_ICONS.edit, editing ? T.done : T.customize, () => { setEditing(!editing); });
    bCustom.className = 'ql-btn' + (editing ? ' ce-on' : '');
    toolbar.appendChild(bCustom);

    const bDl = mkBtn(CE_ICONS.download, T.download, downloadSvg);
    bDl.className = 'ql-btn';
    toolbar.appendChild(bDl);

    if (Object.keys(store).length) {
      const bReset = mkBtn(CE_ICONS.reset, T.reset, resetAll);
      bReset.className = 'ql-btn ql-btn-ghost';
      toolbar.appendChild(bReset);
    }
    if (editing) {
      const hint = document.createElement('p');
      hint.className = 'ce-hint';
      hint.textContent = T.hint;
      toolbar.appendChild(hint);
    }
  }
  function mkBtn(icon, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon + '<span>' + label + '</span>';
    b.addEventListener('click', onClick);
    return b;
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
    w.wrap.appendChild(outline);
    w.wrap.appendChild(hit);
    hit.addEventListener('pointerdown', (e) => startDrag(e, id, hit));
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
    inpColor.addEventListener('input', () => { s.fill = inpColor.value; applyState(id); writeStoreDebounced(); });
    rColor.appendChild(inpColor);
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
    const bI = document.createElement('button'); bI.type = 'button'; bI.textContent = 'I'; bI.style.fontStyle = 'italic';
    const isBold = s.bold ?? (parseInt(cs.fontWeight, 10) >= 600);
    const isItalic = s.italic ?? (cs.fontStyle === 'italic');
    bB.classList.toggle('on', !!isBold);
    bI.classList.toggle('on', !!isItalic);
    bB.addEventListener('click', () => { s.bold = !bB.classList.contains('on'); bB.classList.toggle('on'); applyState(id); decorate(id); writeStore(); });
    bI.addEventListener('click', () => { s.italic = !bI.classList.contains('on'); bI.classList.toggle('on'); applyState(id); decorate(id); writeStore(); });
    togWrap.appendChild(bB); togWrap.appendChild(bI);
    rTog.appendChild(togWrap);
    rows.appendChild(rTog);

    document.body.appendChild(panel);
    positionPanel(ev);
    panel.querySelector('h4 button').addEventListener('click', () => { closePanel(); selectedId = null; syncSelection(); });
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
  function onKey(e) { if (e.key === 'Escape') { closePanel(); selectedId = null; syncSelection(); } }
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey);

  // ---- reset ----
  function resetAll() {
    store = {};
    try { localStorage.removeItem(LSKEY); } catch (e) { /* noop */ }
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

  // ---- exportar SVG ----
  function inlineComputed(srcRoot, dstRoot) {
    const src = srcRoot.querySelectorAll('*');
    const dst = dstRoot.querySelectorAll('*');
    const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
      'stroke-linejoin', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight',
      'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'stop-color', 'stop-opacity'];
    const copy = (a, b) => {
      const cs = getComputedStyle(a);
      let decl = '';
      props.forEach((p) => {
        const v = cs.getPropertyValue(p);
        if (v && v !== 'normal' && v !== 'none' || (p === 'fill' && v)) {
          if (v) decl += p + ':' + v + ';';
        }
      });
      if (decl) b.setAttribute('style', decl + (b.getAttribute('style') || ''));
    };
    copy(srcRoot, dstRoot);
    for (let i = 0; i < src.length && i < dst.length; i++) {
      if (dst[i].classList && (dst[i].classList.contains('ce-hit') || dst[i].classList.contains('ce-outline'))) continue;
      copy(src[i], dst[i]);
    }
  }

  function serialize() {
    const clone = svg.cloneNode(true);
    clone.classList.remove('ce-editing');
    clone.querySelectorAll('.ce-hit, .ce-outline').forEach((n) => n.remove());
    clone.querySelectorAll('.ce-el').forEach((g) => g.classList.remove('ce-selected'));
    inlineComputed(svg, clone);

    const vb = svg.viewBox && svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
    const h = vb && vb.height ? vb.height : svg.getBoundingClientRect().height;
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', Math.round(w));
    clone.setAttribute('height', Math.round(h));
    clone.removeAttribute('style');

    // fondo sólido (las figuras se pegan en informes con fondo blanco/claro)
    const bg = document.createElementNS(NS, 'rect');
    const surf = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#ffffff';
    bg.setAttribute('x', vb ? vb.x : 0); bg.setAttribute('y', vb ? vb.y : 0);
    bg.setAttribute('width', w); bg.setAttribute('height', h);
    bg.setAttribute('fill', surf);
    clone.insertBefore(bg, clone.firstChild);

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }

  function downloadSvg() {
    const str = serialize();
    try {
      const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace(/[^a-z0-9_-]+/gi, '-') + '.svg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { /* sandbox sin descargas: al menos deja el string accesible */ }
    return str;
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
    isDirty: () => Object.keys(store).length > 0,
    destroy() {
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
