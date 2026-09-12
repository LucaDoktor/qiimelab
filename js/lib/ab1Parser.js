// Parser de cromatogramas .ab1 (formato ABIF de Applied Biosystems) — a mano,
// sobre el ArrayBuffer, sin dependencias externas. Mismo espíritu que
// js/lib/minizip.js con ZIP: se lee justo lo que la app necesita, no todo
// el formato.
//
// ABIF: cabecera "ABIF" + versión, y un directorio de tags (TLV) de 28 bytes
// cada uno (nombre de 4 letras + número, tipo, tamaño de elemento, nº de
// elementos, tamaño total de datos, y o bien los datos inline —si caben en
// 4 bytes— o el offset en el archivo donde están). El propio directorio es
// el "tag" nº 1 ("tdir"), descrito en la primera entrada del archivo.
//
// Tags que se leen (los demás se ignoran a propósito — en particular NO se
// lee nada de metadatos de la muestra/operador/instrumento: eso puede
// contener nombres reales, ver datos-ejemplo/sanger/README):
//   PBAS2/PBAS1  secuencia llamada (bases, como texto)
//   PCON2/PCON1  calidad Phred por base (bytes crudos, NO texto ASCII+33)
//   FWO_1        orden de bases de los 4 canales de traza (p.ej. "GATC")
//   DATA9-12     traza normalizada/analizada (preferida)
//   DATA1-4      traza cruda (solo si faltan DATA9-12, .ab1 muy antiguos)
//   PLOC2/PLOC1  posición (índice en la traza) de cada base llamada
//   SPAC1/SPAC3  espaciado medio entre picos (float), como referencia

const DIR_ENTRY_SIZE = 28;

function tagName(view, off) {
  return String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
}

function readDirEntry(view, off) {
  return {
    name: tagName(view, off),
    number: view.getInt32(off + 4),
    elemType: view.getInt16(off + 8),
    elemSize: view.getInt16(off + 10),
    numElements: view.getInt32(off + 12),
    dataSize: view.getInt32(off + 16),
    dataField: off + 20, // 4 bytes: datos inline si dataSize<=4, si no offset en el archivo
  };
}

function dataOffset(view, entry) {
  return entry.dataSize <= 4 ? entry.dataField : view.getInt32(entry.dataField);
}

function decodeAscii(view, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i));
  return s;
}

/** Tipo 2 (char/byte) leído como texto ASCII — PBAS2, FWO_1. */
function decodeCharArray(view, entry) {
  return decodeAscii(view, dataOffset(view, entry), entry.dataSize);
}

/** Tipo 2 (char/byte) leído como bytes numéricos crudos — PCON2 (Phred directo). */
function decodeByteArray(view, entry) {
  const off = dataOffset(view, entry);
  const arr = new Uint8Array(entry.dataSize);
  for (let i = 0; i < entry.dataSize; i++) arr[i] = view.getUint8(off + i);
  return arr;
}

/** Tipo 4 (short, 2 bytes con signo, big-endian) — DATA*, PLOC*. */
function decodeShortArray(view, entry) {
  const off = dataOffset(view, entry);
  const n = entry.numElements;
  const arr = new Int16Array(n);
  for (let i = 0; i < n; i++) arr[i] = view.getInt16(off + i * 2);
  return arr;
}

function decodeFloat(view, entry) {
  return view.getFloat32(dataOffset(view, entry));
}

/**
 * Parsea un .ab1 (ABIF). Lanza si no es un ABIF válido o le falta la
 * secuencia llamada (PBAS) — sin eso no hay nada que hacer con el archivo.
 * @param {ArrayBuffer} buffer
 * @returns {{
 *   sequence: string, quality: Uint8Array|null, baseOrder: string,
 *   trace: ({A:Int16Array,C:Int16Array,G:Int16Array,T:Int16Array})|null,
 *   traceIsRaw: boolean, peakLocations: Int16Array|null, avgPeakSpacing: number|null,
 * }}
 */
export function parseAb1(buffer) {
  const view = new DataView(buffer);
  if (decodeAscii(view, 0, 4) !== 'ABIF') {
    throw new Error('No es un archivo .ab1 (ABIF) válido: falta la cabecera "ABIF".');
  }
  const root = readDirEntry(view, 6);
  const dirOff = view.getInt32(root.dataField);
  const numTags = root.numElements;
  const tags = new Map();
  for (let i = 0; i < numTags; i++) {
    const e = readDirEntry(view, dirOff + i * DIR_ENTRY_SIZE);
    tags.set(e.name + e.number, e);
  }
  const get = (key) => tags.get(key);

  const pbasEntry = get('PBAS2') || get('PBAS1');
  if (!pbasEntry) throw new Error('El .ab1 no contiene la secuencia llamada (tag PBAS).');
  const sequence = decodeCharArray(view, pbasEntry).toUpperCase();

  const pconEntry = get('PCON2') || get('PCON1');
  const quality = pconEntry ? decodeByteArray(view, pconEntry) : null;

  const fwoEntry = get('FWO_1');
  const baseOrder = fwoEntry ? decodeCharArray(view, fwoEntry).toUpperCase() : 'GATC';

  let traceKeys = ['DATA9', 'DATA10', 'DATA11', 'DATA12'];
  let traceIsRaw = false;
  if (traceKeys.some((k) => !get(k))) { traceKeys = ['DATA1', 'DATA2', 'DATA3', 'DATA4']; traceIsRaw = true; }
  let trace = null;
  if (traceKeys.every((k) => get(k)) && baseOrder.length === 4) {
    trace = {};
    for (let i = 0; i < 4; i++) trace[baseOrder[i]] = decodeShortArray(view, get(traceKeys[i]));
  }

  const plocEntry = get('PLOC2') || get('PLOC1');
  const peakLocations = plocEntry ? decodeShortArray(view, plocEntry) : null;

  const spacEntry = get('SPAC1') || get('SPAC3');
  const avgPeakSpacing = spacEntry ? decodeFloat(view, spacEntry) : null;

  return { sequence, quality, baseOrder, trace, traceIsRaw, peakLocations, avgPeakSpacing };
}
