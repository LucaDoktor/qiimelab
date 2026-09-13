// Test unitario y matemático del motor de alineamiento local Smith-Waterman
// con penalización afín por huecos (Gotoh 1982) y su Web Worker.
//
//   node tests/aligner.mjs

import { APP_ROOT } from './lib/env.mjs';

const {
  smithWaterman,
  align,
  formatAlignment,
  alignWithWorker,
  DEFAULT_ALIGN_OPTS,
} = await import(APP_ROOT + '/js/lib/aligner.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

console.log('--- 1. Emparejamientos exactos ---');
{
  const r = smithWaterman('ACGTACGT', 'ACGTACGT', { match: 2, mismatch: -1, gapOpen: 3, gapExtend: 1 });
  check('Identidad exacta: puntuación matemática = longitud × match (8 × 2 = 16)', r.score === 16, 'score=' + r.score);
  check('Identidad exacta: secuencias alineadas idénticas sin huecos', r.alignedA === 'ACGTACGT' && r.alignedB === 'ACGTACGT');
  check('Identidad exacta: coordenadas cubren toda la secuencia [0, 8)', r.startA === 0 && r.endA === 8 && r.startB === 0 && r.endB === 8);
  check('Identidad exacta: identidad 100%, 8 matches, 0 mismatches, 0 gaps', r.identity === 1 && r.matches === 8 && r.mismatches === 0 && r.gaps === 0);
  check('Identidad exacta: CIGAR 8M', r.cigar === '8M');
}

{
  // Carácter único
  const r = smithWaterman('A', 'A', { match: 5 });
  check('Carácter único coincidente: score = 5, CIGAR 1M', r.score === 5 && r.cigar === '1M' && r.startA === 0 && r.endA === 1);
}

{
  // Insensibilidad a mayúsculas por defecto
  const r = smithWaterman('acgtacgt', 'ACGTACGT', { match: 2 });
  check('Insensibilidad a mayúsculas por defecto: identidad 100%', r.score === 16 && r.matches === 8 && r.identity === 1);
}

console.log('\n--- 2. Propiedad de alineamiento local (Smith-Waterman) ---');
{
  // Motivo idéntico conservado rodeado de colas ruidosas/no homólogas
  const a = 'TTTTTACGTACGTGGGGG';
  const b = 'CCCCACGTACGAAAAA';
  const r = smithWaterman(a, b, { match: 2, mismatch: -2, gapOpen: 4, gapExtend: 2 });
  check('Alineamiento local: aísla el motivo común sin arrastrar flancos ruidosos', r.alignedA === 'ACGTACG' && r.alignedB === 'ACGTACG');
  check('Alineamiento local: coordenadas exactas en seqA [5, 12)', r.startA === 5 && r.endA === 12);
  check('Alineamiento local: coordenadas exactas en seqB [4, 11)', r.startB === 4 && r.endB === 11);
  check('Alineamiento local: score = 7 × 2 = 14', r.score === 14);
}

{
  // Secuencias asimétricas con motivo interno
  const query = 'GATTACA';
  const target = 'NNNNNNNNNNNNNNNNNNNNGATTACANNNNNNNNNNNNNNNNNNNN';
  const r = smithWaterman(query, target, { match: 3, mismatch: -2 });
  check('Asimetría: localiza motivo exacto dentro de secuencia larga', r.score === 21 && r.alignedA === 'GATTACA' && r.startA === 0 && r.endA === 7);
  check('Asimetría: inicio y fin en target coinciden con posición de GATTACA', r.startB === 20 && r.endB === 27);
}

console.log('\n--- 3. Inserciones (hueco en secuencia B / referencia) ---');
{
  // Query tiene 'T' insertada respecto a Target
  const a = 'ACGTTCG';
  const b = 'ACGTCG';
  const r = smithWaterman(a, b, { match: 3, mismatch: -1, gapOpen: 2, gapExtend: 1 });
  // 6 matches × 3 = 18. Penalización de hueco (longitud 1) = 2 + 1 = 3. Score = 18 - 3 = 15.
  check('Inserción simple: score esperado (18 - 3 = 15)', r.score === 15, 'score=' + r.score);
  check('Inserción simple: longitudes alineadas idénticas', r.alignedA.length === r.alignedB.length);
  check('Inserción simple: 1 hueco en B y 0 en A', r.alignedB.includes('-') && !r.alignedA.includes('-'));
  check('Inserción simple: CIGAR contiene operación I', r.cigar.includes('I'));
}

console.log('\n--- 4. Deleciones (hueco en secuencia A / query) ---');
{
  // Query tiene 'T' delecionada respecto a Target
  const a = 'ACGTCG';
  const b = 'ACGTTCG';
  const r = smithWaterman(a, b, { match: 3, mismatch: -1, gapOpen: 2, gapExtend: 1 });
  // 6 matches × 3 = 18. Penalización de hueco = 2 + 1 = 3. Score = 18 - 3 = 15.
  check('Deleción simple: score esperado (18 - 3 = 15)', r.score === 15, 'score=' + r.score);
  check('Deleción simple: longitudes alineadas idénticas', r.alignedA.length === r.alignedB.length);
  check('Deleción simple: 1 hueco en A y 0 en B', r.alignedA.includes('-') && !r.alignedB.includes('-'));
  check('Deleción simple: CIGAR contiene operación D', r.cigar.includes('D'));
}

console.log('\n--- 5. Penalizaciones afines por hueco (Gotoh 1982) ---');
{
  // Inserción contigua de 4 nucleótidos: CCCC
  // Bajo penalización afín (gapOpen=4, gapExtend=1):
  // 1 hueco de 4 bases cuesta: 4 + 4×1 = 8.
  // 4 huecos independientes de 1 base costarían: 4 × (4 + 1) = 20.
  // El alineador debe preferir agrupar las 4 bases en un único bloque contiguo.
  const a = 'ACGTACGTCCCCACGTACGT';
  const b = 'ACGTACGTACGTACGT';
  const r = smithWaterman(a, b, { match: 3, mismatch: -2, gapOpen: 4, gapExtend: 1 });
  check('Hueco afín: agrupa 4 bases en un único bloque contiguo (----)', r.alignedB.includes('----'), 'alignedB=' + r.alignedB);
  check('Hueco afín: exactamente 1 evento de apertura de hueco (gapOpens=1)', r.gapOpens === 1, 'gapOpens=' + r.gapOpens);
  check('Hueco afín: 3 eventos de extensión de hueco (gapExtensions=3)', r.gapExtensions === 3, 'gapExtensions=' + r.gapExtensions);
  // 16 matches × 3 = 48. Hueco afín = 4 + 4×1 = 8. Score = 48 - 8 = 40.
  check('Hueco afín: score matemático exacto (48 - 8 = 40)', r.score === 40, 'score=' + r.score);
  check('Hueco afín: CIGAR 8M4I8M', r.cigar === '8M4I8M');
}

{
  // Modo Biopython / openOnly (gapOpenIncludesExtend = false)
  // En Biopython: costo(k) = gapOpen + (k - 1) × gapExtend = 4 + 3×1 = 7.
  // Score = 48 - 7 = 41.
  const a = 'ACGTACGTCCCCACGTACGT';
  const b = 'ACGTACGTACGTACGT';
  const rBio = smithWaterman(a, b, { match: 3, mismatch: -2, gapOpen: 4, gapExtend: 1, gapOpenIncludesExtend: false });
  check('Modo Biopython (openOnly): score = 41 (costo hueco = 7)', rBio.score === 41, 'score=' + rBio.score);
}

{
  // Umbral mismatch vs gapOpen:
  // Si gapOpen es muy alto, prefiere desajustes puntuales en vez de abrir un hueco
  const a = 'ACGTACGT';
  const b = 'ACGAACGT'; // sustitución T->A
  const r = smithWaterman(a, b, { match: 2, mismatch: -1, gapOpen: 10, gapExtend: 2 });
  // 7 matches × 2 = 14, 1 mismatch × -1 = -1 -> score = 13
  check('Sustitución simple con gapOpen alto: prefiere mismatch antes que hueco', r.score === 13 && r.gaps === 0);
  check('Sustitución simple: 7 matches y 1 mismatch', r.matches === 7 && r.mismatches === 1);
}

console.log('\n--- 6. Casos límite y robustez ---');
{
  // Divergencia total: ninguna coincidencia con ganancia positiva
  const r = smithWaterman('AAAAAAAA', 'CCCCCCCC', { match: 2, mismatch: -1 });
  check('Divergencia total: score = 0', r.score === 0);
  check('Divergencia total: alineamiento vacío', r.alignedA === '' && r.alignedB === '');
  check('Divergencia total: identity = 0', r.identity === 0 && r.matches === 0);
}

{
  // Secuencias vacías
  const r1 = smithWaterman('', 'ACGT');
  const r2 = smithWaterman('ACGT', '');
  const r3 = smithWaterman('', '');
  check('Secuencia A vacía: devuelve score 0 sin lanzar excepción', r1.score === 0 && r1.alignedA === '');
  check('Secuencia B vacía: devuelve score 0 sin lanzar excepción', r2.score === 0 && r2.alignedB === '');
  check('Ambas vacías: devuelve score 0 sin lanzar excepción', r3.score === 0 && r3.alignedA === '');
}

{
  // Error de tipos en entradas no-string
  let threwA = false;
  let threwB = false;
  try { smithWaterman(null, 'ACGT'); } catch { threwA = true; }
  try { smithWaterman('ACGT', 12345); } catch { threwB = true; }
  check('Entrada null lanza TypeError', threwA);
  check('Entrada numérica lanza TypeError', threwB);
}

{
  // Matriz de sustitución personalizada
  const customMatrix = {
    A: { A: 4, G: 1, C: -3, T: -3 },
    G: { A: 1, G: 4, C: -3, T: -3 },
    C: { A: -3, G: -3, C: 4, T: 1 },
    T: { A: -3, G: -3, C: 1, T: 4 },
  };
  const r = smithWaterman('AG', 'AG', { scoreMatrix: customMatrix });
  check('Matriz personalizada: calcula score correcto (4 + 4 = 8)', r.score === 8, 'score=' + r.score);
}

{
  // Función formatAlignment
  const r = smithWaterman('ACGTACGT', 'ACGTACGT', { match: 2 });
  const formatted = formatAlignment(r);
  check('formatAlignment genera texto con cabecera y línea de coincidencia (|)', formatted.includes('Score: 16') && formatted.includes('||||||||'));
}

console.log('\n--- 7. Integración con Web Worker (alignWorker.js) ---');
{
  // Importamos alignWorker.js para probar el receptor de eventos onmessage
  const workerModule = await import(APP_ROOT + '/js/workers/alignWorker.js');
  check('alignWorker.js exporta o se inicializa como módulo sin errores', Boolean(workerModule));

  // Simulamos evento postMessage hacia el worker
  let lastMessage = null;
  const mockCtx = {
    postMessage: (msg) => { lastMessage = msg; },
  };

  // Verificamos que el listener procese un alineamiento válido
  const testEvent = {
    data: {
      id: 'req-sw-1',
      type: 'align',
      payload: {
        seqA: 'ACGTACGTCCCCACGTACGT',
        seqB: 'ACGTACGTACGTACGT',
        options: { match: 3, mismatch: -2, gapOpen: 4, gapExtend: 1 },
      },
    },
  };

  // En Node, ctx se mapeó a globalThis o self
  const handler = globalThis.onmessage;
  check('alignWorker registró onmessage en el contexto global', typeof handler === 'function');

  if (typeof handler === 'function') {
    // Redirigir temporalmente postMessage de globalThis para capturar la respuesta
    const origPost = globalThis.postMessage;
    globalThis.postMessage = mockCtx.postMessage;

    handler(testEvent);
    check('alignWorker responde con id correspondiente', lastMessage && lastMessage.id === 'req-sw-1');
    check('alignWorker responde con ok: true y type: "done"', lastMessage && lastMessage.ok === true && lastMessage.type === 'done');
    check('alignWorker devuelve score idéntico al motor síncrono (score = 40)', lastMessage && lastMessage.result && lastMessage.result.score === 40);

    // Prueba de tipo 'format'
    const formatEvent = {
      data: {
        id: 'req-sw-format',
        type: 'format',
        payload: {
          seqA: 'ACGT',
          seqB: 'ACGT',
          options: { match: 2 },
        },
      },
    };
    handler(formatEvent);
    check('alignWorker procesa petición tipo "format"', lastMessage && lastMessage.ok === true && typeof lastMessage.result === 'string');

    // Prueba de error en worker
    const errorEvent = {
      data: {
        id: 'req-sw-err',
        type: 'align',
        payload: {
          seqA: 12345,
          seqB: null,
        },
      },
    };
    handler(errorEvent);
    check('alignWorker maneja error y responde con ok: false', lastMessage && lastMessage.ok === false && lastMessage.type === 'error');

    globalThis.postMessage = origPost;
  }
}

{
  // alignWithWorker fallback en entorno sin Worker nativo
  const r = await alignWithWorker('ACGT', 'ACGT', { match: 2 });
  check('alignWithWorker resuelve con el resultado correcto', r && r.score === 8);
}

console.log('\n----------------------------------------');
if (failed) {
  console.log('RESULTADO: FAIL');
  process.exit(1);
} else {
  console.log('RESULTADO: PASS');
  process.exit(0);
}
