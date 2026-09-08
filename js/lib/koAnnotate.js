// Anotación de códigos KO de KEGG SIN base de datos propia: solo se mira lo que
// haya en el `functionalCategories` cargado (el mapeo KO→módulo del módulo de
// índices funcionales, sea el de ejemplo o el CSV del usuario) y, en cualquier
// caso, se ofrece un enlace de salida a la ficha oficial en kegg.jp.
//
// Compartida por el módulo de índices funcionales y por abundancia diferencial
// cuando la tabla es de KOs.

import { state } from '../state.js';

// alias de cabecera reconocidos para cada campo de anotación
const FIELD_ALIASES = {
  gene:      ['gene', 'genesymbol', 'genename', 'gennombre', 'symbol', 'gen'],
  enzyme:    ['enzyme', 'enzima', 'enzymename', 'protein', 'proteinname', 'product', 'producto', 'nombre'],
  ec:        ['ecnumber', 'ec', 'eccode', 'ecnumbers', 'numeroec'],
  substrate: ['specificsubstrate', 'substrate', 'sustrato', 'sustratoespecifico', 'substratespecific'],
  category:  ['substratecategory', 'categoriasustrato', 'categoriadesustrato', 'category', 'categoria'],
  role:      ['functionalrole', 'role', 'rol', 'rolfuncional', 'function', 'funcion', 'funcionalrole'],
};

const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
const KO_RE = /^K\d{5}$/i;

/** ¿Es `s` un código KO de KEGG bien formado (K + 5 dígitos)? */
export function isKOCode(s) {
  return KO_RE.test(String(s == null ? '' : s).trim());
}

/** Ficha oficial del KO en KEGG. */
export function keggEntryUrl(koCode) {
  return 'https://www.kegg.jp/entry/' + encodeURIComponent(String(koCode || '').trim().toUpperCase());
}

/**
 * Anota un KO con lo que haya en el functionalCategories cargado.
 * @param {string} koCode  p. ej. "K01176"
 * @returns {null | {ko, module, gene, enzyme, ec, substrate, category, role, annotated}}
 *   - `null` si no hay functionalCategories cargado o el KO no aparece en él.
 *   - `annotated` = true si hay algún campo (gen/enzima/EC/sustrato/rol) más allá
 *     del módulo.
 */
export function annotateKO(koCode) {
  const fc = state.functionalCategories;
  if (!fc || !koCode) return null;
  const code = String(koCode).trim().toUpperCase();

  const koCol = (fc.mapping && fc.headers[fc.mapping.ko]) || 'KO';
  const moduleCol = (fc.mapping && fc.headers[fc.mapping.module]) || null;

  const colFor = {};
  fc.headers.forEach((h) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (!(field in colFor) && aliases.includes(n)) colFor[field] = h;
    }
  });

  const hits = fc.rows.filter((r) => String(r[koCol] ?? '').trim().toUpperCase() === code);
  if (hits.length === 0) return null;

  const pick = (field) => {
    const col = colFor[field];
    if (!col) return null;
    for (const r of hits) {
      const v = String(r[col] ?? '').trim();
      if (v && v !== '-' && v.toLowerCase() !== 'na') return v;
    }
    return null;
  };

  const modules = moduleCol
    ? [...new Set(hits.map((r) => String(r[moduleCol] ?? '').trim()).filter(Boolean))]
    : [];
  const gene = pick('gene'), enzyme = pick('enzyme'), ec = pick('ec');
  const substrate = pick('substrate'), category = pick('category'), role = pick('role');

  return {
    ko: code,
    module: modules.join(' · ') || null,
    gene, enzyme, ec, substrate, category, role,
    annotated: !!(gene || enzyme || ec || substrate || role),
  };
}

/**
 * Texto corto para un tooltip: "amyA · Alpha-amylase" / "Alpha-amylase" / "".
 * Toma directamente el código KO (llama a annotateKO por dentro).
 */
export function koAnnotationShort(koCode) {
  const a = annotateKO(koCode);
  if (!a || !a.annotated) return '';
  const bits = [];
  if (a.gene) bits.push(a.gene);
  if (a.enzyme) bits.push(a.enzyme);
  else if (a.role) bits.push(a.role);
  return bits.join(' · ');
}
