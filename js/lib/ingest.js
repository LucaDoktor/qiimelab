// Detección automática de tipo de archivo QIIME2 y enrutado a los "slots"
// del estado compartido. Acepta directamente .qza/.qzv (los desempaqueta
// con minizip.js) o .tsv/.csv/.txt ya exportados a mano.
//
// La heurística puede equivocarse — cada módulo de arriba debe mostrar
// siempre qué se detectó y dejar corregirlo a mano (ver upload.js).

import { parseTable, normalizeHeader } from './csv.js';
import { listZipEntries, readZipText, gunzipText } from './minizip.js';
import { parseOrdination, looksLikeOrdination } from './ordination.js';

const TAXON_KEYS = ['taxon', 'taxa', 'species', 'genus', 'feature', 'featureid', 'otu', 'asv', 'name', 'organism', 'id'];
const LFC_KEYS = ['log2foldchange', 'log2fc', 'lfc', 'logfc', 'log2foldchg', 'foldchange'];
const PADJ_KEYS = ['padj', 'pvaladj', 'qvalue', 'qval', 'fdr', 'adjpval', 'adjustedpvalue', 'padjusted', 'pvaladjusted'];
// cabeceras que marcan la columna "resto agregado" de una tabla de abundancia relativa
const OTHERS_HEADER_KEYS = ['others', 'otros', 'other', 'resto'];
// nombres de nivel taxonómico (QIIME2 numera: 1=reino … 7=especie)
const LEVEL_NAME_TO_NUMBER = [
  [/(^|[^a-z])(dominio|domain|reino|kingdom)([^a-z]|$)/, 1],
  [/(^|[^a-z])(filo|phylum)([^a-z]|$)/, 2],
  [/(^|[^a-z])(clase|class)([^a-z]|$)/, 3],
  [/(^|[^a-z])(orden|order)([^a-z]|$)/, 4],
  [/(^|[^a-z])(familia|family)([^a-z]|$)/, 5],
  [/(^|[^a-z])(genero|género|genus)([^a-z]|$)/, 6],
  [/(^|[^a-z])(especie|species)([^a-z]|$)/, 7],
];

function findBestColumn(headers, keys) {
  const norm = headers.map(normalizeHeader);
  for (const k of keys) {
    const idx = norm.indexOf(k);
    if (idx !== -1) return idx;
  }
  for (let i = 0; i < norm.length; i++) {
    for (const k of keys) if (norm[i].includes(k)) return i;
  }
  return -1;
}

function isNumeric(v) {
  if (v === '' || v === null || v === undefined) return false;
  return isFinite(parseFloat(v)) && /^-?[\d.eE+]+$/.test(String(v).trim());
}

// Más estricto que isNumeric: la cadena ENTERA tiene que ser un número
// (acepta notación científica "3.9e-137"). "S1-A", "Ctrl_0" → false.
function isNumericStrict(v) {
  const s = String(v == null ? '' : v).trim();
  return s !== '' && Number.isFinite(Number(s));
}

function stripQ2TypesRow(headers, rows) {
  if (rows.length === 0) return rows;
  const firstCol = headers[0];
  const firstVal = String(rows[0][firstCol] || '').trim().toLowerCase();
  if (firstVal.startsWith('#q2:types')) return rows.slice(1);
  return rows;
}

// Deduce el nivel taxonómico (1–7) del nombre del archivo: "level-6",
// "Nivel6", "…_Genero_…" → 6. Devuelve null si no hay pista.
export function guessLevelFromName(name) {
  const s = String(name || '').toLowerCase();
  const num = s.match(/level[-_ ]?(\d+)/) || s.match(/nivel[-_ ]?(\d+)/) || s.match(/\bl(\d)\b/);
  if (num) return parseInt(num[1], 10);
  for (const [re, n] of LEVEL_NAME_TO_NUMBER) if (re.test(s)) return n;
  return null;
}

/**
 * Clasifica una tabla ya parseada ({headers, rows}) y devuelve una
 * descripción de a qué slot pertenece, o null si no se reconoce.
 */
export function classifyTable(headers, rows, fileNameHint) {
  if (headers.length === 0 || rows.length === 0) return null;
  const norm = headers.map(normalizeHeader);

  // --- abundancia diferencial: log2FC + padj ---
  const lfcIdx = findBestColumn(headers, LFC_KEYS);
  const padjIdx = findBestColumn(headers, PADJ_KEYS);
  if (lfcIdx !== -1 && padjIdx !== -1) {
    let taxonIdx = findBestColumn(headers, TAXON_KEYS);
    if (taxonIdx === lfcIdx || taxonIdx === padjIdx || taxonIdx === -1) {
      taxonIdx = headers.findIndex((_, i) => i !== lfcIdx && i !== padjIdx);
    }
    return { kind: 'differentialAbundance', headers, rows, mapping: { taxon: taxonIdx, lfc: lfcIdx, padj: padjIdx } };
  }

  // --- taxonomía: Feature ID + Taxon (+ Confidence) ---
  const hasFeatureId = norm.some((h) => h === 'featureid' || h === 'id');
  const hasTaxonCol = norm.some((h) => h === 'taxon' || h === 'taxonomy');
  if (hasFeatureId && hasTaxonCol) {
    // muchos exports de QIIME2 traen una fila "#q2:types  categorical
    // categorical" justo bajo la cabecera — si no se quita se cuela como un
    // "feature" falso.
    return { kind: 'taxonomy', headers, rows: stripQ2TypesRow(headers, rows) };
  }

  // --- diversidad alfa: 2 columnas, primera vacía/id, segunda numérica ---
  if (headers.length === 2) {
    const vals = rows.map((r) => r[headers[1]]);
    const numericCount = vals.filter(isNumeric).length;
    if (numericCount >= Math.max(1, vals.length * 0.9)) {
      const metricName = headers[1].trim() || (fileNameHint || 'métrica').replace(/\.[^.]+$/, '');
      return { kind: 'alphaDiversity', metricName, values: rowsToMap(rows, headers[0], headers[1]) };
    }
  }

  // --- matriz de distancias (diversidad beta): cuadrada, primera col = ids que también son cabeceras ---
  if (headers.length - 1 === rows.length && headers.length > 2) {
    const sampleIds = headers.slice(1);
    let matches = 0;
    rows.forEach((r, i) => { if (String(r[headers[0]]).trim() === sampleIds[i]) matches++; });
    if (matches >= rows.length * 0.8) {
      const matrix = rows.map((r) => sampleIds.map((id) => parseFloat(r[id])));
      const metricName = (fileNameHint || 'distancia').replace(/\.[^.]+$/, '');
      return { kind: 'betaDiversity', metricName, sampleIds, matrix };
    }
  }

  // --- taxa barplot (formato nativo del taxa-barplot.qzv de QIIME2):
  //     muchas cabeceras con ';' (cadenas de linaje d__;p__;c__…) ---
  const taxHeaderCount = headers.filter((h) => (h.match(/;/g) || []).length >= 2).length;
  if (taxHeaderCount >= 3) {
    const levelMatch = (fileNameHint || '').match(/level-(\d+)/i);
    const level = levelMatch ? parseInt(levelMatch[1], 10) : guessTaxonomyLevel(headers);
    return { kind: 'taxaBarplotLevel', level, headers, rows };
  }

  // --- taxa barplot (formato "ancho, nombres cortos"): muestras en filas,
  //     taxones como columnas con nombre corto (p. ej. "Lactobacillus"),
  //     una columna "Others"/"Otros" y a veces una columna de grupo
  //     categórica al final. Es el de
  //     resultados/11_tablas_taxonomia_limpias/<Nivel>/02_*_TOP14.csv ---
  const othersIdx = norm.findIndex((h) => OTHERS_HEADER_KEYS.includes(h));
  if (othersIdx !== -1 && headers.length >= 4 && rows.length >= 2) {
    const numericHeaders = headers.filter((h, i) => {
      if (i === 0) return false;
      const vals = rows.map((r) => r[h]);
      return vals.filter(isNumericStrict).length >= Math.max(1, vals.length * 0.9);
    });
    if (numericHeaders.includes(headers[othersIdx]) && numericHeaders.length >= 3) {
      const sampleKey = headers[0];
      // primera columna no numérica (que no sea la de id) = columna de grupo
      const groupColumn = headers.find((h, i) => i !== 0 && !numericHeaders.includes(h)) || null;
      const outHeaders = [sampleKey, ...numericHeaders];
      const outRows = rows.map((r) => {
        const o = {};
        outHeaders.forEach((h) => { o[h] = r[h]; });
        if (groupColumn) o[groupColumn] = r[groupColumn];
        return o;
      });
      return {
        kind: 'taxaBarplotLevel',
        level: guessLevelFromName(fileNameHint),
        headers: outHeaders,
        rows: outRows,
        groupColumn,
      };
    }
  }

  // --- lista de KOs por módulo funcional (KOlistVW.csv y similares):
  //     columnas "Functional Module" + "KO" ---
  const moduleIdx = norm.findIndex((h) => h === 'functionalmodule' || h === 'module' || h === 'modulofuncional' || h === 'pathway');
  const koIdx = norm.findIndex((h) => h === 'ko' || h === 'koid' || h === 'orthology' || h === 'keggko');
  if (moduleIdx !== -1 && koIdx !== -1) {
    return { kind: 'functionalCategories', headers, rows, mapping: { module: moduleIdx, ko: koIdx } };
  }

  // --- abundancia de KOs por muestra (PICRUSt2 pred_metagenome_unstrat):
  //     primera columna = ids KEGG (K#####), el resto columnas numéricas ---
  if (headers.length >= 3 && rows.length >= 5) {
    const k0 = headers[0];
    const koLike = rows.filter((r) => /^K\d{4,6}$/.test(String(r[k0]).trim())).length;
    if (koLike >= rows.length * 0.8) {
      return { kind: 'functionalKO', headers, rows, koKey: k0 };
    }
  }

  // --- conteos taxón × muestra: primera columna = etiquetas de texto
  //     (taxones / features), el RESTO son columnas numéricas (una por
  //     muestra). Es lo que sale de `qiime tools export` + `biom convert`
  //     de una feature-table, o de un collapse a un nivel sin normalizar.
  //     Sirve para presencia/ausencia (Venn/UpSet) y PERMANOVA. ---
  if (headers.length >= 3 && rows.length >= 4) {
    const label = headers[0];
    const labelNumeric = rows.filter((r) => isNumericStrict(r[label])).length;
    const valHeaders = headers.slice(1);
    let cells = 0, numCells = 0;
    valHeaders.forEach((h) => rows.forEach((r) => {
      cells++;
      if (isNumericStrict(r[h])) numCells++;
    }));
    const labelIsText = labelNumeric <= rows.length * 0.1;
    const restIsNumeric = numCells >= cells * 0.9;
    if (labelIsText && restIsNumeric) {
      const cleanRows = stripQ2TypesRow(headers, rows);
      return { kind: 'taxaCounts', headers, rows: cleanRows, taxonKey: label };
    }
  }

  // --- metadatos: primera columna tipo "sample-id" / "#SampleID" ---
  const firstNorm = norm[0];
  if (['sampleid', 'sampleid', 'id', 'sample'].includes(firstNorm) && headers.length >= 2) {
    const cleanRows = stripQ2TypesRow(headers, rows);
    return { kind: 'metadata', headers, rows: cleanRows, sampleIdKey: headers[0] };
  }

  return null;
}

function guessTaxonomyLevel(headers) {
  let maxSegments = 0;
  headers.forEach((h) => {
    const segs = (h.match(/;/g) || []).length + 1;
    if (h.includes(';') && segs > maxSegments) maxSegments = segs;
  });
  return maxSegments || null;
}

function rowsToMap(rows, keyCol, valCol) {
  const map = {};
  rows.forEach((r) => {
    const k = String(r[keyCol]).trim();
    const v = parseFloat(r[valCol]);
    if (k && isFinite(v)) map[k] = v;
  });
  return map;
}

/**
 * Procesa un File del navegador (drag&drop o <input type=file>).
 * Devuelve { results: [...], warnings: [...] } — un mismo archivo .qza/.qzv
 * puede producir varios resultados (p. ej. un taxa-barplot.qzv trae 7 niveles).
 */
export async function ingestFile(file) {
  const name = file.name;
  const lower = name.toLowerCase();
  const results = [];
  const warnings = [];

  // --- FASTQ (.fastq/.fq, con o sin .gz) ---
  // No se parsea aquí: el módulo de control de calidad lo lee en streaming.
  // Detección: extensión + (si no está comprimido) la primera línea empieza por '@'.
  if (/\.(fastq|fq)(\.gz)?$/i.test(lower)) {
    if (!lower.endsWith('.gz')) {
      let head = '';
      try { head = await file.slice(0, 400).text(); } catch (e) { /* noop */ }
      if (head && head.replace(/^\s+/, '')[0] !== '@') {
        warnings.push('"' + name + '": no parece un FASTQ (la primera línea no empieza por "@").');
        return { results, warnings };
      }
    }
    results.push({ kind: 'sequenceQC', file, name });
    return { results, warnings };
  }

  if (lower.endsWith('.qza') || lower.endsWith('.qzv')) {
    const buffer = await file.arrayBuffer();
    let entries;
    try {
      entries = listZipEntries(buffer);
    } catch (e) {
      warnings.push('"' + name + '": ' + e.message);
      return { results, warnings };
    }
    const dataEntries = entries.filter((e) => /\/data\//.test(e.name) && !e.name.endsWith('/'));
    if (dataEntries.length === 0) {
      warnings.push('"' + name + '": no se encontró contenido reconocible dentro del artefacto QIIME2.');
      return { results, warnings };
    }
    const hasBiomOnly = dataEntries.some((e) => /\.biom$/i.test(e.name))
      && !dataEntries.some((e) => /\.(tsv|csv)$/i.test(e.name));
    if (hasBiomOnly) {
      warnings.push('"' + name + '" contiene una tabla en formato BIOM (binario). Esta versión aún no lee BIOM en el navegador — expórtala con `biom convert -i feature-table.biom -o feature-table.tsv --to-tsv` y sube el .tsv resultante.');
    }
    // los nombres internos genéricos (distance-matrix.tsv, alpha-diversity.tsv…)
    // no dicen qué métrica es — para esos usamos el nombre del .qza de fuera
    // (bray_curtis.qza → "bray_curtis").
    const GENERIC_INNER = /^(distance-matrix|alpha-diversity|ordination|data|feature-table|taxonomy|metadata)\.[a-z0-9]+$/i;
    const outerBase = name.replace(/\.[^.]+$/, '');
    for (const entry of dataEntries) {
      if (!/\.(tsv|csv|txt)$/i.test(entry.name)) continue;
      let text;
      try {
        text = await readZipText(buffer, entry);
      } catch (e) {
        warnings.push('"' + entry.name + '": ' + e.message);
        continue;
      }
      const shortName = entry.name.split('/').pop();
      const hint = GENERIC_INNER.test(shortName) ? outerBase : shortName;
      // ordination.txt (PCoA.qza) — coordenadas ya calculadas
      if (/\.txt$/i.test(shortName)) {
        if (looksLikeOrdination(text)) {
          const ord = parseOrdination(text, hint);
          if (ord) { results.push({ kind: 'ordination', ...ord }); }
          else warnings.push('"' + shortName + '" (dentro de ' + name + '): ordination.txt ilegible.');
        }
        continue;
      }
      const { headers, rows } = parseTable(text);
      const classified = classifyTable(headers, rows, hint);
      if (classified) results.push(classified);
      else warnings.push('"' + shortName + '" (dentro de ' + name + '): no se reconoce el formato — puedes mapearlo a mano si es necesario.');
    }
    return { results, warnings };
  }

  // --- .gz suelto (gzip plano, NO un zip): los TSV de PICRUSt2 vienen así ---
  if (lower.endsWith('.gz')) {
    const innerName = name.replace(/\.gz$/i, '');
    if (!/\.(tsv|csv|txt)$/i.test(innerName)) {
      warnings.push('"' + name + '": solo se descomprimen .tsv.gz / .csv.gz / .txt.gz. Los .biom.gz u otros binarios comprimidos no se leen aquí.');
      return { results, warnings };
    }
    let text;
    try {
      text = await gunzipText(await file.arrayBuffer());
    } catch (e) {
      warnings.push('"' + name + '": no se ha podido descomprimir — ' + (e && e.message ? e.message : 'gzip inválido') + '.');
      return { results, warnings };
    }
    const { headers, rows } = parseTable(text);
    const classified = classifyTable(headers, rows, innerName);
    if (classified) results.push(classified);
    else warnings.push('"' + innerName + '" (descomprimido de ' + name + '): no se ha reconocido el formato automáticamente.');
    return { results, warnings };
  }

  if (lower.endsWith('.tsv') || lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = await file.text();
    // skbio "Ordination Results" (PCoA/PCA): coordenadas ya calculadas
    if (looksLikeOrdination(text)) {
      const ord = parseOrdination(text, name);
      if (ord) { results.push({ kind: 'ordination', ...ord }); return { results, warnings }; }
      warnings.push('"' + name + '": parece un ordination.txt pero no se han podido leer las coordenadas.');
      return { results, warnings };
    }
    const { headers, rows } = parseTable(text);
    const classified = classifyTable(headers, rows, name);
    if (classified) results.push(classified);
    else warnings.push('"' + name + '": no se ha podido determinar automáticamente qué tipo de dato es. Revisa que la primera fila tenga cabeceras.');
    return { results, warnings };
  }

  warnings.push('"' + name + '": formato no soportado (se aceptan .qza, .qzv, .tsv, .csv, .txt y .tsv.gz/.csv.gz).');
  return { results, warnings };
}
