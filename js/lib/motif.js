// Motivo decorativo de fondo, dibujado a mano en SVG (sin imágenes ni
// librerías). Dos elementos del dominio: un dendrograma de clustering y una
// nube de puntos tipo ordenación (PCoA). Todo en `currentColor` y trazo
// fino: va DETRÁS de texto, con opacidad y máscara de desvanecido desde el
// CSS, así que se adapta solo a claro y a oscuro.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dendrograma horizontal (raíz a la izquierda, hojas a la derecha), como el
// que sale de un UPGMA. Recursivo: cada nodo parte su franja vertical en dos
// y se conecta con un codo ortogonal. Apila tramos de <path> en `seg` y los
// puntos-hoja en `leaves`. Devuelve la y del nodo.
function buildDendro(x0, x1, y0, y1, depth, rnd, seg, leaves) {
  if (depth <= 0 || (y1 - y0) < 16) {
    const y = (y0 + y1) / 2;
    leaves.push([x1, y]);
    return y;
  }
  const split = 0.5 + (rnd() - 0.5) * 0.5;
  const ym = y0 + (y1 - y0) * split;
  const branchX = x0 + (x1 - x0) * (0.22 + rnd() * 0.28);
  const yTop = buildDendro(branchX, x1, y0, ym, depth - 1, rnd, seg, leaves);
  const yBot = buildDendro(branchX, x1, ym, y1, depth - 1, rnd, seg, leaves);
  seg.push('M' + branchX.toFixed(1) + ' ' + yTop.toFixed(1) + 'V' + yBot.toFixed(1));
  const yc = (yTop + yBot) / 2;
  seg.push('M' + x0.toFixed(1) + ' ' + yc.toFixed(1) + 'H' + branchX.toFixed(1));
  return yc;
}

/**
 * @param {object} [opt]
 * @param {number} [opt.w] ancho del viewBox
 * @param {number} [opt.h] alto del viewBox
 * @param {number} [opt.seed] semilla (misma semilla = mismo dibujo)
 * @param {'hero'|'panel'} [opt.variant] densidad
 * @returns {string} `<svg class="ql-motif">…</svg>`
 */
export function domainMotif(opt = {}) {
  const w = opt.w || 1200;
  const h = opt.h || 300;
  const seed = opt.seed || 0xB10175;
  const dense = opt.variant !== 'panel';
  const rnd = mulberry32(seed);

  // --- dendrograma, mitad izquierda del motivo ---
  const seg = [];
  const dLeaves = [];
  buildDendro(w * 0.04, w * 0.46, h * 0.06, h * 0.94, dense ? 5 : 4, rnd, seg, dLeaves);
  let leafDots = '';
  dLeaves.forEach(([x, y]) => {
    leafDots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3"/>';
  });

  // --- nube de puntos tipo ordenación, mitad derecha ---
  const clusters = [
    { cx: w * 0.63, cy: h * 0.42, s: h * 0.30, n: dense ? 16 : 9 },
    { cx: w * 0.83, cy: h * 0.66, s: h * 0.26, n: dense ? 14 : 8 },
    { cx: w * 0.90, cy: h * 0.24, s: h * 0.20, n: dense ? 11 : 6 },
  ];
  let dots = '';
  clusters.forEach((c) => {
    for (let i = 0; i < c.n; i++) {
      const gx = (rnd() + rnd() + rnd() - 1.5) / 1.5;
      const gy = (rnd() + rnd() + rnd() - 1.5) / 1.5;
      const x = c.cx + gx * c.s;
      const y = c.cy + gy * c.s;
      if (x > w - 8 || x < w * 0.5 || y < 8 || y > h - 8) continue;
      const r = 3 + rnd() * 4.5;
      dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>';
    }
  });

  return (
    '<svg class="ql-motif" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
    '<path class="ql-motif-tree" pathLength="1" d="' + seg.join('') + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<g class="ql-motif-dots" fill="currentColor" stroke="none">' + leafDots + dots + '</g>' +
    '</svg>'
  );
}
