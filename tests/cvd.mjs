// Simulación de daltonismo (dicromacia) sobre la paleta de datos de QiimeLab.
// Sin dependencias. Colores desde css/tokens.css.
//
// Método: sRGB → RGB lineal → matriz de dicromacia de Machado et al. (2009),
// severidad 1.0 → sRGB → OKLab → ΔE euclídea ×100.
//
// GATE duro: el par divergente corr-pos × corr-neg (único canal solo-color, en
// el correlograma) debe quedar ≥ ΔE 8 bajo protanopía, deuteranopía y
// tritanopía. La paleta categórica se informa: adyacentes < ΔE 8 por
// protan./deuter. bloquean; solo por tritanopía se aceptan (rareza + leyenda).
//
//   node tests/cvd.mjs

import { tokenRgb, CAT } from './lib/tokens.mjs';

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const toUnit = (rgb) => rgb.map((v) => v / 255);
const mul = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];
const SIMS = {
  'protan.': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  'deuter.': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968609]],
  'tritan.': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const simulate = (rgb, M) => mul(M, toUnit(rgb).map(s2l)).map((c) => l2s(clamp01(c)));

function oklab(unit) {
  const [r, g, b] = unit;
  const R = s2l(r), G = s2l(g), B = s2l(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;

function profile(rgb1, rgb2) {
  const o = { normal: dE(oklab(toUnit(rgb1)), oklab(toUnit(rgb2))) };
  for (const [name, M] of Object.entries(SIMS)) o[name] = dE(oklab(simulate(rgb1, M)), oklab(simulate(rgb2, M)));
  let min = Infinity, worst = '';
  for (const k of Object.keys(o)) if (o[k] < min) { min = o[k]; worst = k; }
  return { ...o, min, worst };
}
const fmt = (n) => n.toFixed(1).padStart(5);
const line = (label, p) =>
  `  ${p.min < 8 ? 'FALLA' : p.min < 15 ? 'aviso' : 'PASS '}  ${label.padEnd(22)}` +
  `normal ${fmt(p.normal)} · protan ${fmt(p['protan.'])} · deuter ${fmt(p['deuter.'])} · tritan ${fmt(p['tritan.'])}  → mín ${fmt(p.min)} (${p.worst})`;

let divergentFails = 0, adjNonTritan = 0, adjTritanOnly = 0;
for (const theme of ['light', 'dark']) {
  console.log('\n════════ ' + theme.toUpperCase() + ' ════════');
  const cat = CAT(theme);

  console.log('\n  ── pares adyacentes de la paleta categórica ──');
  for (let i = 0; i < cat.length - 1; i++) {
    const p = profile(cat[i], cat[i + 1]);
    if (p.min < 8) (p.worst === 'tritan.' ? adjTritanOnly++ : adjNonTritan++);
    console.log(line(`cat-${i + 1} × cat-${i + 2}`, p));
  }

  console.log('\n  ── GATE · par divergente (signo de correlación, RdBu) ──');
  const p = profile(tokenRgb(theme, 'corr-pos'), tokenRgb(theme, 'corr-neg'));
  if (p.min < 8) divergentFails++;
  console.log(line('corr-pos × corr-neg', p));

  console.log('\n  ── informativo · 6 pares NO adyacentes más próximos ──');
  const rows = [];
  for (let i = 0; i < cat.length; i++) for (let j = i + 2; j < cat.length; j++) rows.push({ label: `cat-${i + 1} × cat-${j + 1}`, p: profile(cat[i], cat[j]) });
  rows.sort((a, b) => a.p.min - b.p.min);
  rows.slice(0, 6).forEach((r) => console.log(line(r.label, r.p)));
}

console.log('\n' + '─'.repeat(64));
console.log('GATE · par divergente corr-pos × corr-neg  : ' + (divergentFails === 0 ? 'PASS (≥ ΔE 8 en las 3 dicromacias, ambos temas)' : divergentFails + ' tema(s) por debajo de ΔE 8 ← BLOQUEA'));
console.log('Paleta categórica · adyacentes < ΔE 8 por protan./deuter. : ' + adjNonTritan + '  (0 = objetivo)');
console.log('Paleta categórica · adyacentes < ΔE 8 solo por tritanopía : ' + adjTritanOnly + '  (rareza ~0,01 % + leyenda → aceptado)');
console.log('RESULTADO: ' + (divergentFails === 0 && adjNonTritan === 0 ? 'PASS' : 'REVISAR'));
process.exit(divergentFails === 0 && adjNonTritan === 0 ? 0 : 1);
