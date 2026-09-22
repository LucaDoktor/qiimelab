// pFormat.js — formateador de p-valor al estilo GraphPad Prism 11: 3 presets
// documentados (GP/APA/NEJM, umbrales y nº de decimales exactos de
// Claude outputs/assets/pairwise_fixtures.json → pFormatSpec, generado a
// partir de la documentación oficial de Prism) + un 4º modo 'custom' con
// umbrales propios — Prism ofrece justamente eso: 3 preajustes + personalizar.
// Ver Paso 5 de qiimelab-prompt-editor-fase-0-fundamentos.md.
//
// DECISIÓN EXPLÍCITA (pedida por el propio prompt, no dejarla implícita):
// el umbral de asteriscos usa `≤` por defecto, igual que la documentación de
// GraphPad ("* P ≤ 0.05 …"); ggsignif/ggpubr en R usan `<` por defecto —
// pásese `strict: true` para ese criterio en vez del de GraphPad.

const PRESETS = {
  gp: { stars: [[0.0001, '****'], [0.001, '***'], [0.01, '**'], [0.05, '*']], decimals: 4, leadingZero: true },
  apa: { stars: [[0.001, '***'], [0.01, '**'], [0.05, '*']], decimals: 3, leadingZero: false },
  nejm: { stars: [[0.001, '***'], [0.01, '**'], [0.05, '*']], decimals: 3, leadingZero: true },
};

function starsFor(p, starsSpec, strict) {
  for (const [thresh, label] of starsSpec) {
    if (strict ? p < thresh : p <= thresh) return label;
  }
  return null;
}

function formatExact(p, decimals, leadingZero) {
  const thresh = Math.pow(10, -decimals);
  if (p < thresh) {
    const s = thresh.toFixed(decimals);
    return '<' + (leadingZero ? s : s.replace(/^0/, ''));
  }
  const s = p.toFixed(decimals);
  return leadingZero ? s : s.replace(/^0/, '');
}

/**
 * Formatea un p-valor al estilo Prism.
 * @param {number} p
 * @param {object} [o]
 * @param {'gp'|'apa'|'nejm'|'custom'} [o.style='gp']
 * @param {'stars'|'exact'|'stars+exact'} [o.mode='stars']
 * @param {Array<[number,string]>} [o.stars]  umbrales/etiquetas propios — solo con style:'custom',
 *        orden ASCENDENTE de umbral (p.ej. [[0.001,'***'],[0.01,'**'],[0.05,'*']])
 * @param {number} [o.decimals]     solo con style:'custom'
 * @param {boolean} [o.leadingZero] solo con style:'custom'
 * @param {string} [o.ns='ns']      etiqueta cuando no hay estrellas
 * @param {boolean} [o.strict=false]  true → umbral con `<` (ggsignif/ggpubr);
 *        por defecto `≤` (GraphPad) — ver la nota de arquitectura arriba.
 * @returns {string}
 */
export function formatPStyled(p, o = {}) {
  if (!isFinite(p)) return '—';
  const style = o.style || 'gp';
  const mode = o.mode || 'stars';
  const ns = o.ns || 'ns';
  const strict = !!o.strict;
  const preset = style === 'custom'
    ? { stars: o.stars || PRESETS.gp.stars, decimals: o.decimals ?? 4, leadingZero: o.leadingZero ?? true }
    : PRESETS[style];
  if (!preset) throw new Error('formatPStyled: estilo desconocido "' + style + '"');

  const stars = starsFor(p, preset.stars, strict);
  const starsOut = stars || ns;
  if (mode === 'stars') return starsOut;

  const exactOut = formatExact(p, preset.decimals, preset.leadingZero);
  if (mode === 'exact') return exactOut;
  return starsOut + ' (' + exactOut + ')'; // 'stars+exact'
}
