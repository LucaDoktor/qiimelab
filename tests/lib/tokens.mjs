// Lee css/tokens.css y resuelve cada token de color a un RGB (0-255) en los
// dos temas, siguiendo var(), color-mix(in srgb, …) y rgba(). Así los tests de
// contraste y daltonismo se mantienen en sync con el archivo real.

import { readFileSync } from 'node:fs';
import { APP_ROOT } from './env.mjs';

const CSS = readFileSync(APP_ROOT + '/css/tokens.css', 'utf8');

function blockVars(re) {
  const m = CSS.match(re);
  if (!m) throw new Error('no se encontró el bloque ' + re);
  const out = {};
  for (const d of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
const RAW = {
  light: blockVars(/:root\s*\{([^}]*)\}/),
  dark: blockVars(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/),
};

const hex2rgb = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const mixRgb = (a, b, pa) => a.map((v, i) => Math.round(v * pa + b[i] * (1 - pa)));
const over = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

// resuelve `expr` (valor crudo de un token) a un RGB opaco, dado un fondo para
// componer transparencias. Devuelve null si no es un color.
function resolve(theme, expr, bg) {
  expr = expr.trim();
  let m;
  if ((m = expr.match(/^#[0-9a-fA-F]{3,8}$/))) return hex2rgb(m[0]);
  if ((m = expr.match(/^var\(--([\w-]+)\)$/))) {
    const raw = RAW[theme][m[1]] ?? RAW.light[m[1]];
    return raw ? resolve(theme, raw, bg) : null;
  }
  if ((m = expr.match(/^rgba?\(([^)]+)\)$/))) {
    const parts = m[1].split(',').map((s) => s.trim());
    const rgb = parts.slice(0, 3).map((s) => parseInt(s, 10));
    const a = parts[3] != null ? parseFloat(parts[3]) : 1;
    return a >= 1 ? rgb : over(rgb, a, bg || [255, 255, 255]);
  }
  if ((m = expr.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/))) {
    const pa = parseFloat(m[2]) / 100;
    const A = resolve(theme, m[1], bg);
    const bExpr = m[3].trim();
    if (bExpr === 'transparent') return A && bg ? over(A, pa, bg) : null; // sin fondo no se puede
    const B = resolve(theme, bExpr, bg);
    return A && B ? mixRgb(A, B, pa) : null;
  }
  return null;
}

/**
 * @param {'light'|'dark'} theme
 * @param {string} token   nombre sin `--`
 * @param {{over?: string}} [opt]  token de fondo para componer si hay transparencia
 * @returns {number[]|null} RGB 0-255
 */
export function tokenRgb(theme, token, opt = {}) {
  const raw = RAW[theme][token] ?? RAW.light[token];
  if (raw == null) return null;
  const bg = opt.over ? tokenRgb(theme, opt.over) : null;
  return resolve(theme, raw, bg);
}

export function hexOf(theme, token, opt) {
  const rgb = tokenRgb(theme, token, opt);
  return rgb ? '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') : null;
}

export const CAT = (theme) => Array.from({ length: 8 }, (_, i) => tokenRgb(theme, 'cat-' + (i + 1)));
