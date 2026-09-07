// Lector mínimo de ZIP (sin dependencias) para abrir artefactos QIIME2
// (.qza / .qzv), que internamente son ficheros ZIP estándar.
//
// Solo implementa lo necesario: recorrer el directorio central y
// descomprimir una entrada (STORED o DEFLATE, usando la DecompressionStream
// nativa del navegador — no hace falta ninguna librería externa).
//
// Verificado contra un ZIP construido a mano (entradas STORED y DEFLATE)
// antes de integrarlo aquí; ver notas de desarrollo en el README.

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function findEOCD(view) {
  const maxCommentLen = 65535;
  const minPos = Math.max(0, view.byteLength - 22 - maxCommentLen);
  for (let i = view.byteLength - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error('No es un ZIP válido: no se encontró el End Of Central Directory. ¿Seguro que este archivo es un .qza/.qzv de QIIME2?');
}

/**
 * Lista las entradas del ZIP: [{ name, method, compSize, uncompSize, localHeaderOffset }]
 * No descomprime nada todavía — es barato de llamar sobre archivos grandes.
 */
export function listZipEntries(buffer) {
  const view = new DataView(buffer);
  const eocdPos = findEOCD(view);
  const entryCount = view.getUint16(eocdPos + 10, true);
  let cdOffset = view.getUint32(eocdPos + 16, true);
  const entries = [];
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cdOffset, true) !== CEN_SIG) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const uncompSize = view.getUint32(cdOffset + 24, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const nameBytes = new Uint8Array(buffer, cdOffset + 46, nameLen);
    const name = decoder.decode(nameBytes);
    entries.push({ name, method, compSize, uncompSize, localHeaderOffset });
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Descomprime una entrada y devuelve un Uint8Array con su contenido. */
export async function readZipEntry(buffer, entry) {
  const view = new DataView(buffer);
  const lh = entry.localHeaderOffset;
  if (view.getUint32(lh, true) !== LOC_SIG) {
    throw new Error('Cabecera local de ZIP inválida para "' + entry.name + '".');
  }
  const nameLen = view.getUint16(lh + 26, true);
  const extraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;
  const raw = new Uint8Array(buffer, dataStart, entry.compSize);

  if (entry.method === 0) return raw.slice();

  if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador no soporta descompresión ZIP en el cliente (falta DecompressionStream). Prueba con una versión reciente de Chrome, Edge o Firefox.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([raw]).stream().pipeThrough(ds);
    const outBuf = await new Response(stream).arrayBuffer();
    return new Uint8Array(outBuf);
  }

  throw new Error('Método de compresión ZIP no soportado (' + entry.method + ') para "' + entry.name + '".');
}

export async function readZipText(buffer, entry) {
  const bytes = await readZipEntry(buffer, entry);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Abre un artefacto .qza/.qzv y devuelve las entradas que viven bajo
 * cualquier carpeta "<uuid>/data/..." (así es como QIIME2 empaqueta el
 * contenido real, envuelto en una carpeta con el UUID del artefacto).
 */
export async function listQiimeDataFiles(buffer) {
  const entries = listZipEntries(buffer);
  return entries.filter((e) => /\/data\//.test(e.name) && !e.name.endsWith('/'));
}

// ---------- gzip suelto (.gz) ----------
//
// Los TSV de PICRUSt2 (p. ej. pred_metagenome_unstrat.tsv.gz) NO vienen en un
// ZIP: son gzip plano. Se descomprimen con la MISMA DecompressionStream nativa
// que usa el lector de ZIP, solo que con el formato 'gzip' en vez de
// 'deflate-raw' — no hace falta ninguna librería extra.

/** Descomprime un buffer gzip (.gz) y devuelve un Uint8Array con su contenido. */
export async function gunzipBytes(buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no soporta descompresión gzip en el cliente (falta DecompressionStream). Prueba con una versión reciente de Chrome, Edge o Firefox.');
  }
  const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([input]).stream().pipeThrough(ds);
  const outBuf = await new Response(stream).arrayBuffer();
  return new Uint8Array(outBuf);
}

/** Descomprime un .gz y lo decodifica como texto UTF-8. */
export async function gunzipText(buffer) {
  return new TextDecoder('utf-8').decode(await gunzipBytes(buffer));
}
