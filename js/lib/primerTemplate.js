// FASTA de plantilla/objetivo: posición de cada primer, tamaño de amplicón
// esperado, y mismatches resaltados — con foco en los últimos nucleótidos
// del extremo 3' (la zona crítica: si el 3' no encaja, la polimerasa no
// suele extender aunque el resto del primer sí lo haga).
//
// Búsqueda directa (con bases IUPAC en el primer) sobre la(s) secuencia(s)
// dadas; nada de alineamiento con huecos, ni BLAST, ni bases de datos
// externas — coherente con el resto de la app.

import { iupacMatches, iupacComplementary } from './primerAnalysis.js';

/** Zona 3' considerada crítica para el resaltado de mismatches (nt). */
export const CRITICAL_3PRIME_ZONE = 5;

/** Parser FASTA mínimo: mayúsculas, solo letras (y '-' de huecos). */
export function parseFasta(text) {
  const records = [];
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line[0] === '>') {
      if (current) records.push(current);
      const header = line.slice(1);
      const sp = header.indexOf(' ');
      current = {
        id: sp === -1 ? header : header.slice(0, sp),
        description: sp === -1 ? '' : header.slice(sp + 1).trim(),
        seq: '',
      };
    } else if (current) {
      current.seq += line.toUpperCase().replace(/[^A-Z-]/g, '');
    }
  }
  if (current) records.push(current);
  return records;
}

function scanStrand(template, primer, strand, maxMismatches) {
  const n = template.length, m = primer.length;
  const hits = [];
  for (let pos = 0; pos + m <= n; pos++) {
    const mismatches = [];
    for (let k = 0; k < m; k++) {
      let primerIdx, ok;
      const tBase = template[pos + k];
      if (strand === '+') {
        primerIdx = k;
        ok = iupacMatches(primer[primerIdx], tBase);
      } else {
        // primer[m-1-k] (leyendo desde el 3') empareja (complementario) con template[pos+k]
        primerIdx = m - 1 - k;
        ok = iupacComplementary(primer[primerIdx], tBase);
      }
      if (!ok) {
        mismatches.push({ primerIdx, templatePos: pos + k, templateBase: tBase, primerCode: primer[primerIdx] });
        if (mismatches.length > maxMismatches) break;
      }
    }
    if (mismatches.length <= maxMismatches) {
      const distFrom3 = mismatches.map((mm) => m - 1 - mm.primerIdx); // 0 = el propio extremo 3'
      hits.push({
        pos, end: pos + m, strand, mismatches, mismatchCount: mismatches.length,
        has3PrimeMismatch: distFrom3.some((d) => d < CRITICAL_3PRIME_ZONE),
      });
    }
  }
  return hits;
}

/** Busca un primer (con bases IUPAC) en una plantilla, en las dos hebras:
 *  '+' = el primer coincide literalmente con la plantilla (cebador directo
 *  sobre esta secuencia); '-' = el primer es complementario a la plantilla
 *  leída de izquierda a derecha (cebador inverso sobre esta secuencia). */
export function findPrimerSites(template, primer, { maxMismatches = 0 } = {}) {
  return [
    ...scanStrand(template, primer, '+', maxMismatches),
    ...scanStrand(template, primer, '-', maxMismatches),
  ].sort((a, b) => a.pos - b.pos);
}

/** Amplicones esperados de una pareja de primers sobre una plantilla: un
 *  sitio '+' de uno seguido (más adelante en la secuencia) de un sitio '-'
 *  del otro — se prueban las dos asignaciones posibles (A=directo/B=inverso
 *  y al revés), porque el usuario no siempre sabe cuál es cuál. */
export function findAmplicons(template, primerA, primerB, opts = {}) {
  const hitsA = findPrimerSites(template, primerA, opts);
  const hitsB = findPrimerSites(template, primerB, opts);
  const amplicons = [];
  const tryPair = (fHits, rHits, fLabel, rLabel) => {
    fHits.filter((h) => h.strand === '+').forEach((f) => {
      rHits.filter((h) => h.strand === '-' && h.pos > f.pos).forEach((r) => {
        amplicons.push({
          start: f.pos, end: r.end, size: r.end - f.pos,
          forward: { ...f, primer: fLabel }, reverse: { ...r, primer: rLabel },
        });
      });
    });
  };
  tryPair(hitsA, hitsB, 'A', 'B');
  tryPair(hitsB, hitsA, 'B', 'A');
  amplicons.sort((a, b) => a.size - b.size);
  return { hitsA, hitsB, amplicons };
}
