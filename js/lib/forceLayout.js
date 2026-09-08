// Layout de fuerzas escrito a mano (sin librería), DETERMINISTA:
//   · repulsión tipo Coulomb entre todos los pares de nodos
//   · atracción tipo Hooke por cada arista (reposo más corto si |r| es alto)
//   · fuerza de centrado suave
//   · integración con amortiguación + tope de paso, ~300 iteraciones
//
// Misma entrada (mismos nodos, mismas aristas, misma semilla) → MISMAS
// coordenadas exactas, siempre. Las posiciones iniciales salen del mismo
// mulberry32 de 4 líneas que usa groupBoxplot.js.

import { mulberry32 } from './groupBoxplot.js';

/**
 * @param {string[]} nodeIds
 * @param {Array<{source:string, target:string, weight:number}>} edges  weight = |r| en [0,1]
 * @param {object} [opt]
 * @param {number} [opt.width=600] @param {number} [opt.height=440]
 * @param {number} [opt.iterations=300] @param {number} [opt.seed=0x9E3779B9]
 * @returns {{ [id:string]: {x:number, y:number} }}
 */
export function forceLayout(nodeIds, edges, opt = {}) {
  const W = opt.width || 600;
  const H = opt.height || 440;
  const iters = opt.iterations || 300;
  const rnd = mulberry32(opt.seed || 0x9E3779B9);
  const n = nodeIds.length;
  if (n === 0) return {};

  const cx = W / 2, cy = H / 2;
  const idx = {};
  nodeIds.forEach((id, i) => { idx[id] = i; });

  const px = new Float64Array(n), py = new Float64Array(n);
  const vx = new Float64Array(n), vy = new Float64Array(n);
  const R0 = Math.min(W, H) * 0.32;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const rr = R0 * (0.6 + rnd() * 0.5);
    px[i] = cx + Math.cos(ang) * rr;
    py[i] = cy + Math.sin(ang) * rr;
  }

  const E = edges
    .filter((e) => idx[e.source] != null && idx[e.target] != null && idx[e.source] !== idx[e.target])
    .map((e) => ({ a: idx[e.source], b: idx[e.target], w: Math.max(0, Math.min(1, e.weight || 0)) }));

  const K_REPULSE = opt.repulsion != null ? opt.repulsion : 1400;
  const K_SPRING = opt.spring != null ? opt.spring : 0.11;
  const SPRING_LEN = opt.springLen != null ? opt.springLen : Math.min(W, H) * 0.13;
  const K_CENTER = opt.center != null ? opt.center : 0.008;
  const DAMPING = opt.damping != null ? opt.damping : 0.85;
  const MAX_STEP = opt.maxStep != null ? opt.maxStep : Math.min(W, H) * 0.06;

  const fx = new Float64Array(n), fy = new Float64Array(n);
  for (let it = 0; it < iters; it++) {
    fx.fill(0); fy.fill(0);

    // repulsión Coulomb (todos los pares)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j], dy = py[i] - py[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-4) {
          // desempate determinista (no consume el PRNG)
          dx = ((i % 7) - 3) * 0.01 + 0.001;
          dy = ((j % 5) - 2) * 0.01 + 0.001;
          d2 = dx * dx + dy * dy;
        }
        const inv = 1 / Math.sqrt(d2);
        const f = K_REPULSE / d2;
        const ux = dx * inv, uy = dy * inv;
        fx[i] += ux * f; fy[i] += uy * f;
        fx[j] -= ux * f; fy[j] -= uy * f;
      }
    }

    // atracción Hooke por arista (reposo más corto cuanto mayor |r|)
    for (let k = 0; k < E.length; k++) {
      const e = E[k];
      const dx = px[e.b] - px[e.a], dy = py[e.b] - py[e.a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
      const rest = SPRING_LEN * (1 - 0.45 * e.w);
      const f = K_SPRING * (d - rest) * (0.4 + e.w);
      const ux = dx / d, uy = dy / d;
      fx[e.a] += ux * f; fy[e.a] += uy * f;
      fx[e.b] -= ux * f; fy[e.b] -= uy * f;
    }

    // centrado
    for (let i = 0; i < n; i++) {
      fx[i] += (cx - px[i]) * K_CENTER;
      fy[i] += (cy - py[i]) * K_CENTER;
    }

    // integración
    for (let i = 0; i < n; i++) {
      vx[i] = (vx[i] + fx[i]) * DAMPING;
      vy[i] = (vy[i] + fy[i]) * DAMPING;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      if (sp > MAX_STEP) { const s = MAX_STEP / sp; vx[i] *= s; vy[i] *= s; }
      px[i] += vx[i]; py[i] += vy[i];
    }
  }

  // reescalar al viewBox con margen
  const M = 30;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (px[i] < minX) minX = px[i];
    if (px[i] > maxX) maxX = px[i];
    if (py[i] < minY) minY = py[i];
    if (py[i] > maxY) maxY = py[i];
  }
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const sc = Math.min((W - 2 * M) / spanX, (H - 2 * M) / spanY);
  const offX = (W - spanX * sc) / 2, offY = (H - spanY * sc) / 2;

  const out = {};
  nodeIds.forEach((id, i) => {
    out[id] = { x: offX + (px[i] - minX) * sc, y: offY + (py[i] - minY) * sc };
  });
  return out;
}
