// Test unitario para el inspector visual de solapamiento Sanger (renderOverlapHTML).
// Valida el alineamiento apilado, bloques monoespaciados, coordenadas 1-indexadas,
// y resaltado de extremos no solapados (solo Forward / solo RevComp) y mismatches resueltos.
//
// Ejecución:
//   node tests/sangerinspector.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseAb1 } from '../js/lib/ab1Parser.js';
import { trimRead } from '../js/lib/sangerTrim.js';
import { mergeReads, reverseComplement } from '../js/lib/sangerOverlap.js';
import { renderOverlapHTML } from '../js/modules/sanger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_ROOT = resolve(__dirname, '..');

let failed = false;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (detail ? '  ' + detail : ''));
  if (!ok) failed = true;
}

function loadTrimmed(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const read = parseAb1(ab);
  const trim = trimRead(read.quality, { method: 'mott', errorProbThreshold: 0.05, minLength: 50 });
  return {
    sequence: read.sequence.slice(trim.start, trim.end),
    quality: read.quality ? read.quality.slice(trim.start, trim.end) : null,
  };
}

console.log('\n--- 1. Caso real: B13 (fusión merged con solapamiento amplio) ---');
{
  const f = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-27F.ab1');
  const r = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-1492R.ab1');
  const res = mergeReads(f, r, { expectedAmpliconLen: 1450 });
  const fSeq = f.sequence;
  const rcSeq = reverseComplement(r.sequence);

  const html = renderOverlapHTML(fSeq, rcSeq, res.consensus);

  check('genera bloque pre con clase ql-overlap-pre', html.includes('<pre class="ql-code ql-overlap-pre"><code>'));
  check('incluye etiquetas de filas apiladas (Forward, RevComp, Consenso)',
    html.includes('Forward') && html.includes('RevComp') && html.includes('Consenso'));
  check('resalta el extremo 5\' exclusivo de Forward', html.includes('class="ql-overlap-fwd"'));
  check('resalta el extremo 3\' exclusivo de RevComp', html.includes('class="ql-overlap-rev"'));
  check('incluye marcas de coincidencia | en la zona de solape', html.includes('|'));
  check('muestra la longitud de las secuencias en la cabecera',
    html.includes(`Forward: ${fSeq.length} pb`) && html.includes(`RevComp: ${rcSeq.length} pb`));
  check('muestra la longitud del consenso en la cabecera',
    html.includes(`${res.consensus.length} pb`));
}

console.log('\n--- 2. Caso sintético con mismatch en la zona de solapamiento ---');
{
  // Solape de 12 pb donde una base discrepa (T vs A -> R en consenso)
  const fwdSeq = 'AAAAAA' + 'TTTTTT' + 'GGGGGG';
  const rcSeq  = 'TTTATT' + 'GGGGGG' + 'CCCCCC';
  const consSeq = 'AAAAAATTTATTGGGGGGCCCCCC';

  const html = renderOverlapHTML(fwdSeq, rcSeq, consSeq);

  check('resalta el mismatch con ql-overlap-mismatch', html.includes('class="ql-overlap-mismatch"'));
  check('marca el mismatch en la línea intermedia con ql-overlap-mismatch-mark', html.includes('class="ql-overlap-mismatch-mark"'));
  check('resalta la base resuelta en consenso con ql-overlap-resolved', html.includes('class="ql-overlap-resolved"'));
  check('mantiene los flancos no solapados correspondientes',
    html.includes('class="ql-overlap-fwd"') && html.includes('class="ql-overlap-rev"'));
}

console.log('\n--- 3. Formato de entrada tipo objeto { fwdSeq, rcSeq, consensus } ---');
{
  const obj = {
    fwdSeq: 'AAAAAATTTTTT',
    rcSeq: 'TTTTTTCCCCCC',
    consensus: 'AAAAAATTTTTTCCCCCC',
  };
  const html = renderOverlapHTML(obj);
  check('acepta invocación con objeto único como primer argumento',
    html.includes('<pre class="ql-code ql-overlap-pre">') && html.includes('Forward') && html.includes('RevComp'));
}

console.log('\n--- 4. Caso stitched / sin solapamiento directo ---');
{
  const fwdSeq = 'AAAAAA';
  const rcSeq = 'CCCCCC';
  const consSeq = 'AAAAAANNNNNNNNNNCCCCCC';

  const html = renderOverlapHTML(fwdSeq, rcSeq, consSeq);
  check('maneja secuencias stitched sin error', html.includes('Forward') && html.includes('Consenso'));
  check('muestra ambos flancos en stitched', html.includes('class="ql-overlap-fwd"') && html.includes('class="ql-overlap-rev"'));
}

console.log('\n--- 5. Entradas vacías o nulas (modo seguro) ---');
{
  const htmlEmpty = renderOverlapHTML('', '', '');
  check('devuelve mensaje sin lanzar excepción cuando no hay datos', htmlEmpty.includes('ql-overlap-pre'));
}

console.log('\nRESULTADO INSPECTOR SANGER: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
