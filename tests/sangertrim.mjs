// Sensatez del recorte por calidad Sanger (js/lib/sangerTrim.js): sobre la
// traza de calidad REAL del caso B1 (datos-ejemplo/sanger/B1-27F.ab1, un
// forward cuyos últimos ~15 nt son una cola de homopolímero con Phred entre
// 4 y 12 diluida entre vecinas de Phred 40-60), el algoritmo de Mott debe
// dejar fuera esa cola mientras que la media de ventana deslizante (el
// método que usaba el pipeline de referencia) la deja pasar — es justo el
// fallo de recorte diagnosticado en esa muestra.
//
//   node tests/sangertrim.mjs

import { readFileSync } from 'node:fs';
import { APP_ROOT } from './lib/env.mjs';
const { parseAb1 } = await import(APP_ROOT + '/js/lib/ab1Parser.js');
const { mottTrim, windowTrim, trimRead } = await import(APP_ROOT + '/js/lib/sangerTrim.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

function loadAb1(path) {
  const buf = readFileSync(path);
  return parseAb1(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// --- caso real B1: la cola de homopolímero de baja calidad ---
{
  const { sequence, quality } = loadAb1(APP_ROOT + '/datos-ejemplo/sanger/B1-27F.ab1');
  check('B1-27F: 315 bases llamadas (fixture real sin recortar)', sequence.length === 315, 'len=' + sequence.length);

  const w = windowTrim(quality, { windowSize: 15, minQuality: 20 });
  const m = mottTrim(quality, { errorProbThreshold: 0.05 });
  check('Mott corta MÁS PRONTO por el 3\' que la ventana deslizante (deja fuera más cola mala)', m.end < w.end,
    'window.end=' + w.end + ' mott.end=' + m.end);

  // la cola que la ventana deslizante SÍ deja pasar es basura real: Phred muy bajo
  const windowTailQuals = Array.from(quality.slice(m.end, w.end));
  const meanWindowTail = windowTailQuals.reduce((a, b) => a + b, 0) / windowTailQuals.length;
  check('la región que Mott recorta y la ventana no tiene Phred medio muy bajo (<15)', meanWindowTail < 15,
    'media=' + meanWindowTail.toFixed(1) + ' sobre ' + windowTailQuals.length + ' bases [' + windowTailQuals.join(',') + ']');

  // ninguna base De Q<10 debe sobrevivir al recorte de Mott en el extremo 3'
  const lastFew = Array.from(quality.slice(Math.max(0, m.end - 3), m.end));
  check('justo antes del corte de Mott no hay bases con Phred < 10 (no corta a mitad de la caída)',
    lastFew.every((q) => q >= 10), 'últimas 3 Q=' + lastFew.join(','));

  const trimmed = trimRead(quality, { method: 'mott', minLength: 50 });
  check('trimRead con Mott no descarta B1-27F (longitud final >= 50)', !trimmed.discarded, 'len=' + trimmed.length);
}

// --- casos limpios B13: Mott da una longitud razonable, no degenerada ---
{
  for (const name of ['B13-27F.ab1', 'B13-1492R.ab1']) {
    const { quality } = loadAb1(APP_ROOT + '/datos-ejemplo/sanger/' + name);
    const m = mottTrim(quality, { errorProbThreshold: 0.05 });
    const len = m.end - m.start;
    check(name + ': Mott conserva la mayor parte de la lectura en una muestra limpia (>=900 nt de ' + quality.length + ')',
      len >= 900, 'len=' + len);
  }
}

// --- casos de juguete deterministas, para el comportamiento en el límite ---
{
  // una sola base pésima en medio de un tramo por lo demás perfecto (Q60):
  // la media de ventana (ventana >= la longitud total) la diluye y no
  // recorta nada; Mott debe recortar justo esa base.
  const q = new Uint8Array(20).fill(60);
  q[10] = 2; // Phred 2 = altísima probabilidad de error
  const m = mottTrim(q, { errorProbThreshold: 0.05 });
  check('Mott (caso de juguete): recorta justo antes de una base pésima aislada', m.end === 10, 'end=' + m.end + ' start=' + m.start);

  const w = windowTrim(q, { windowSize: 20, minQuality: 20 });
  check('ventana deslizante (caso de juguete): con ventana >= longitud, la base pésima se diluye y NO se recorta', w.start === 0 && w.end === 20);
}
{
  // calidad uniformemente mala: Mott debe recortar todo (subarray vacío = mejor opción)
  const q = new Uint8Array(30).fill(5); // Phred 5 -> error_prob ~0.316 >> umbral 0.05
  const m = mottTrim(q, { errorProbThreshold: 0.05 });
  check('Mott: calidad uniformemente mala -> recorta todo (start===end)', m.start === m.end, 'start=' + m.start + ' end=' + m.end);
  const trimmed = trimRead(q, { method: 'mott', minLength: 50 });
  check('trimRead descarta una lectura toda de baja calidad (discarded=true)', trimmed.discarded);
}
{
  // calidad uniformemente buena: se conserva todo
  const q = new Uint8Array(40).fill(45);
  const m = mottTrim(q, { errorProbThreshold: 0.05 });
  check('Mott: calidad uniformemente buena -> conserva toda la lectura', m.start === 0 && m.end === 40);
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
