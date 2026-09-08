// Motivo decorativo de fondo: un árbol filogenético RADIAL (ramas como radios
// y arcos desde un centro, hojas repartidas por el perímetro) — la forma más
// reconocible de dibujar filogenia en microbioma. SVG a mano, sin librerías,
// en `currentColor`: va DETRÁS de texto, con opacidad y máscara de desvanecido
// desde el CSS, así que se adapta solo a claro y a oscuro.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} [opt]
 * @param {number} [opt.w]      ancho del viewBox
 * @param {number} [opt.h]      alto del viewBox
 * @param {number} [opt.seed]   semilla (misma semilla = mismo árbol)
 * @param {'hero'|'panel'} [opt.variant]  densidad (profundidad del árbol)
 * @param {number} [opt.sweep]  ángulo total del abanico en grados (<360 = con hueco)
 * @param {number} [opt.start]  ángulo inicial en grados
 * @returns {string} `<svg class="ql-motif">…</svg>`
 */
export function domainMotif(opt = {}) {
  const w = opt.w || 1000;
  const h = opt.h || 380;
  const seed = opt.seed || 0xB10175;
  const depth = opt.variant === 'panel' ? 4 : 5;
  const sweep = opt.sweep || 330;      // < 360: el hueco cae a la izquierda, donde el CSS lo enmascara
  const start = opt.start || -165;
  const rnd = mulberry32(seed);

  // Lienzo ancho: la "circunferencia" es en realidad una elipse axis-aligned,
  // así el árbol radial llena una banda apaisada sin deformarse el trazo.
  const cx = w * 0.6, cy = h * 0.52;
  const RX = w * 0.42, RY = h * 0.46;
  const ROOT_R = 0.06;                 // radio (fracción) donde arranca la raíz

  // (fracción de radio, ángulo en grados) -> punto XY en la elipse
  const pt = (rf, ang) => {
    const a = (ang - 90) * Math.PI / 180;
    return [cx + rf * RX * Math.cos(a), cy + rf * RY * Math.sin(a)];
  };
  // arco a radio constante `rf` entre dos ángulos (arco de elipse, rotación 0)
  const arc = (rf, a0, a1) => {
    const [x0, y0] = pt(rf, a0);
    const [x1, y1] = pt(rf, a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const sw = a1 > a0 ? 1 : 0;
    return 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) +
      'A' + (rf * RX).toFixed(1) + ' ' + (rf * RY).toFixed(1) + ' 0 ' + large + ' ' + sw + ' ' +
      x1.toFixed(1) + ' ' + y1.toFixed(1);
  };

  // árbol binario: cada nodo ocupa la cuña [a0,a1] y su rama arranca en r0.
  // Los nodos internos se quedan dentro de ~0.7 de radio; así las ramas-hoja
  // (que llegan hasta 1.0) son largas y radiales, como las puntas de un árbol.
  function build(a0, a1, r0, d) {
    if (d <= 0 || a1 - a0 < 8) {
      return { leaf: true, ang: (a0 + a1) / 2, rad: 1 };
    }
    const split = 0.5 + (rnd() - 0.5) * 0.5;
    const am = a0 + (a1 - a0) * split;
    const rad = Math.min(0.7, r0 + 0.06 + rnd() * 0.13);   // "longitud de rama", pequeña e irregular
    const L = build(a0, am, rad, d - 1);
    const R = build(am, a1, rad, d - 1);
    return { leaf: false, ang: (L.ang + R.ang) / 2, rad, L, R };
  }

  const seg = [];
  const leaves = [];
  function emit(node, parentRad) {
    const [x0, y0] = pt(parentRad, node.ang);   // radio: del padre al nodo
    const [x1, y1] = pt(node.rad, node.ang);
    seg.push('M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'L' + x1.toFixed(1) + ' ' + y1.toFixed(1));
    if (node.leaf) { leaves.push([x1, y1]); return; }
    seg.push(arc(node.rad, node.L.ang, node.R.ang));       // arco que une los dos hijos
    emit(node.L, node.rad);
    emit(node.R, node.rad);
  }

  emit(build(start, start + sweep, ROOT_R, depth), ROOT_R);

  const [rootX, rootY] = pt(0, 0);
  let dots = '<circle cx="' + rootX.toFixed(1) + '" cy="' + rootY.toFixed(1) + '" r="3.6"/>';
  leaves.forEach(([x, y]) => { dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.1"/>'; });

  return (
    '<svg class="ql-motif" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
    '<path class="ql-motif-tree" pathLength="1" d="' + seg.join('') + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<g class="ql-motif-dots" fill="currentColor" stroke="none">' + dots + '</g>' +
    '</svg>'
  );
}
