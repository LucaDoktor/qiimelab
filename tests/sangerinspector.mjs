// Test unitario para el rediseño horizontal de doble cadena Sanger (renderOverlapHTML).
// Valida el contenedor scrollable (ql-ds-container), el carril continuo (ql-ds-track),
// las columnas con bloques apilados (Forward arriba y RevComp abajo), las etiquetas
// direccionales 5' y 3', los bloques vacíos en extremos no solapados y los colores de fondo.
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

console.log('\n--- 1. Caso real: B13 (doble cadena con solapamiento amplio) ---');
{
  const f = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-27F.ab1');
  const r = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-1492R.ab1');
  const res = mergeReads(f, r, { expectedAmpliconLen: 1450 });
  const fSeq = f.sequence;
  const rcSeq = reverseComplement(r.sequence);

  const html = renderOverlapHTML(fSeq, rcSeq, res.consensus);

  check('genera contenedor con clase ql-ds-container', html.includes('class="ql-ds-container"'));
  check('genera carril con clase ql-ds-track', html.includes('class="ql-ds-track"'));
  check('incluye etiquetas fijas Forward y RevComp', html.includes('Forward') && html.includes('RevComp'));
  check('contiene columnas de nucleótidos ql-ds-col', html.includes('class="ql-ds-col"'));
  check('bloques con clase fwd-only (flanco 5\' Forward)',
    html.includes('fwd-only') || html.includes('ql-overlap-fwd'));
  check('bloques con clase rev-only (flanco 3\' RevComp)',
    html.includes('rev-only') || html.includes('ql-overlap-rev'));
  check('bloques con clase overlap-match en zona de solape',
    html.includes('overlap-match') || html.includes('ql-overlap-match'));
  check('incluye bloques vacíos ql-ds-empty en extremos opuestos', html.includes('ql-ds-empty'));
  check('incluye etiquetas 5\' y 3\' de direccionalidad de ADN',
    html.includes(">5'<") && html.includes(">3'<"));
  check('muestra la longitud de las secuencias en la cabecera',
    html.includes(`Forward: <strong>${fSeq.length} pb</strong>`) && html.includes(`RevComp: <strong>${rcSeq.length} pb</strong>`));
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

  check('resalta el mismatch con overlap-mismatch',
    html.includes('overlap-mismatch') || html.includes('ql-overlap-mismatch'));
  check('contiene bloques fwd-only y rev-only en los flancos',
    (html.includes('fwd-only') || html.includes('ql-overlap-fwd')) &&
    (html.includes('rev-only') || html.includes('ql-overlap-rev')));
  check('contiene etiquetas 5\' y 3\' en posiciones de arranque y final',
    html.includes(">5'<") && html.includes(">3'<"));
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
    html.includes('class="ql-ds-container"') && html.includes('ql-ds-track'));
}

console.log('\n--- 4. Caso stitched / sin solapamiento directo ---');
{
  const fwdSeq = 'AAAAAA';
  const rcSeq = 'CCCCCC';
  const consSeq = 'AAAAAANNNNNNNNNNCCCCCC';

  const html = renderOverlapHTML(fwdSeq, rcSeq, consSeq);
  check('maneja secuencias stitched en doble cadena sin error',
    html.includes('class="ql-ds-container"') && html.includes('ql-ds-track'));
  check('muestra ambos flancos y etiquetas en stitched',
    html.includes('fwd-only') && html.includes('rev-only') && html.includes(">5'<") && html.includes(">3'<"));
}

console.log('\n--- 5. Entradas vacías o nulas (modo seguro) ---');
{
  const htmlEmpty = renderOverlapHTML('', '', '');
  check('devuelve contenedor con mensaje sin lanzar excepción cuando no hay datos',
    htmlEmpty.includes('ql-ds-container'));
}

console.log('\nRESULTADO INSPECTOR SANGER: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
