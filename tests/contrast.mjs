// Contraste WCAG AA de los pares texto/fondo y componente/fondo de QiimeLab,
// en claro y oscuro. Sin dependencias. Los colores se resuelven desde
// css/tokens.css (tests/lib/tokens.mjs), así que el test sigue al archivo.
//
//   node tests/contrast.mjs
//
// exit 0 = ningún par de texto/UI incumple AA sin justificación
// Umbrales: 4.5:1 texto normal · 3:1 texto grande o componente de interfaz.

import { tokenRgb, CAT } from './lib/tokens.mjs';

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
const contrast = (a, b) => { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); };

function pairs(theme) {
  const T = (k, opt) => tokenRgb(theme, k, opt);
  const cat = CAT(theme);
  const P = [];
  const add = (label, fg, bg, min, kind, note) => P.push({ label, fg, bg, min, kind, note });

  // texto normal (4.5)
  add('ink / surface', T('ink'), T('surface'), 4.5, 'texto');
  add('ink / page', T('ink'), T('page'), 4.5, 'texto');
  add('ink-2 / surface', T('ink-2'), T('surface'), 4.5, 'texto');
  add('ink-2 / page', T('ink-2'), T('page'), 4.5, 'texto');
  add('ink-muted / surface', T('ink-muted'), T('surface'), 4.5, 'texto');
  add('ink-muted / page', T('ink-muted'), T('page'), 4.5, 'texto');
  add('accent (enlace) / surface', T('accent'), T('surface'), 4.5, 'texto');
  add('accent (enlace) / page', T('accent'), T('page'), 4.5, 'texto');
  add('accent-ink / accent (botón)', T('accent-ink'), T('accent'), 4.5, 'texto');

  // componentes de interfaz / gráfico esencial (3:1)
  add('accent (borde de foco) / surface', T('accent'), T('surface'), 3, 'ui');
  ['critical', 'enriched', 'depleted', 'good'].forEach((k) => add(k + ' / surface', T(k), T('surface'), 3, 'ui'));
  add('cat-1 / surface', cat[0], T('surface'), 3, 'ui');
  add('cat-6 / surface', cat[5], T('surface'), 3, 'ui');
  add('cat-7 / surface', cat[6], T('surface'), 3, 'ui');

  // desviaciones conocidas (se miden, no bloquean)
  add('baseline (eje) / surface', T('baseline'), T('surface'), 3, 'ui',
    'eje recesivo a propósito; el dato (barras/puntos) va en color pleno y sí cumple 3:1');
  add('border-strong / surface', T('border-strong', { over: 'surface' }), T('surface'), 3, 'ui',
    'borde de control; se refuerza con relleno, etiqueta y anillo de foco (accent ≥ 7:1)');
  add('corr-zero / surface', T('corr-zero'), T('surface'), 3, 'ui',
    'celda r≈0 del correlograma: debe fundirse con el fondo; las celdas con correlación real van saturadas');
  add('warning / surface', T('warning'), T('surface'), 3, 'ui',
    'token semántico (no se re-hex); siempre con icono + etiqueta de texto');
  ['cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-8'].forEach((name, k) => {
    const i = [1, 2, 3, 4, 7][k];
    add(name + ' / surface', cat[i], T('surface'), 3, 'ui',
      'relleno categórico; paleta optimizada para separación CVD. Codificación secundaria: leyenda + tabla + tooltip');
  });
  add('gridline / surface', T('gridline'), T('surface'), 3, 'deco', 'rejilla decorativa');
  return P;
}

let hardFails = 0, known = 0;
for (const theme of ['light', 'dark']) {
  console.log('\n===== ' + theme.toUpperCase() + ' =====');
  for (const p of pairs(theme)) {
    if (!p.fg || !p.bg) { console.log('  (?)   token sin resolver: ' + p.label); hardFails++; continue; }
    const r = contrast(p.fg, p.bg);
    const pass = r >= p.min;
    let mark;
    if (p.kind === 'deco') mark = 'deco ';
    else if (pass) mark = 'PASS ';
    else if (p.note) { mark = 'conoc'; known++; }
    else { mark = 'FALLA'; hardFails++; }
    console.log(`  ${mark}  ${r.toFixed(2).padStart(5)}:1  (min ${p.min})  ${p.label}` + (p.note && !pass ? `\n         └ ${p.note}` : ''));
  }
}
console.log('\n' + '─'.repeat(64));
console.log('Fallos AA sin justificar : ' + hardFails);
console.log('Desviaciones conocidas   : ' + known + ' (medidas y documentadas)');
console.log('RESULTADO: ' + (hardFails === 0 ? 'PASS' : 'REVISAR'));
process.exit(hardFails ? 1 : 0);
