#!/usr/bin/env bash
# =============================================================================
# 09_diversidad_core.sh — diversidad alfa y beta, paso a paso
#
# Entrada:  table_final_filtered.qza + rooted_tree.qza (paso 08) + metadatos.
# Salida:   tabla rarefizada, curva de rarefacción, vectores de diversidad alfa
#           (Shannon, Observed Features), matrices de distancia beta
#           (Bray-Curtis, Jaccard, UniFrac) y sus PCoA + gráficos Emperor.
# Para qué: hace lo mismo que `qiime diversity core-metrics-phylogenetic` pero
#           desglosado, para ver y controlar cada métrica por separado.
#
# La PROFUNDIDAD_RAREFACCION la eliges tú a partir de table_summary.qzv
# (paso 06/08): un valor que no descarte demasiadas muestras y donde la curva
# de rarefacción (alpha_rarefaction.qzv) ya esté aplanada.
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
set -e
set -o pipefail

# --- AJUSTA ESTO -----------------------------------------------------------
RUTA_BASE="<<CAMBIA_ESTO_POR_TU_CARPETA>>"          # carpeta raíz de tu análisis
PROFUNDIDAD_RAREFACCION="<<CAMBIA_ESTO>>"           # p. ej. 10000 (mira tu table_summary.qzv)
METADATOS="${RUTA_BASE}/sample-metadata.tsv"
# -------------------------------------------------------------------------
RES_DIR="${RUTA_BASE}/resultados"
LOG_DIR="${RUTA_BASE}/logs"

# UniFrac puede dar problemas de multihilo en algunos equipos; forzar 1 hilo
# es lo más seguro y solo cuesta algo de tiempo.
export OMP_NUM_THREADS=1
export UNIFRAC_THREADS=1

mkdir -p "${RES_DIR}/08_diversidad/alpha" "${RES_DIR}/08_diversidad/beta" \
         "${RES_DIR}/08_diversidad/pcoa" "${LOG_DIR}"
exec > >(tee -i "${LOG_DIR}/09_diversidad_core.log")
exec 2>&1

echo "Diversidad (alfa + beta): $(date)"

echo "-> 1. Rarefacción a ${PROFUNDIDAD_RAREFACCION} lecturas/muestra..."
qiime feature-table rarefy \
  --i-table "${RES_DIR}/06_filtrado/table_final_filtered.qza" \
  --p-sampling-depth "${PROFUNDIDAD_RAREFACCION}" \
  --o-rarefied-table "${RES_DIR}/08_diversidad/rarefied_table.qza"

echo "-> 2. Curva de rarefacción..."
qiime diversity alpha-rarefaction \
  --i-table "${RES_DIR}/06_filtrado/table_final_filtered.qza" \
  --i-phylogeny "${RES_DIR}/07_filogenia/rooted_tree.qza" \
  --p-max-depth "${PROFUNDIDAD_RAREFACCION}" \
  --m-metadata-file "${METADATOS}" \
  --o-visualization "${RES_DIR}/08_diversidad/alpha_rarefaction.qzv"

echo "-> 3. Diversidad alfa (Shannon = equitatividad, Observed = riqueza)..."
qiime diversity alpha \
  --i-table "${RES_DIR}/08_diversidad/rarefied_table.qza" \
  --p-metric shannon \
  --o-alpha-diversity "${RES_DIR}/08_diversidad/alpha/shannon.qza"
qiime diversity alpha \
  --i-table "${RES_DIR}/08_diversidad/rarefied_table.qza" \
  --p-metric observed_features \
  --o-alpha-diversity "${RES_DIR}/08_diversidad/alpha/observed_features.qza"

echo "-> 4. Diversidad beta no filogenética (Bray-Curtis, Jaccard)..."
qiime diversity beta \
  --i-table "${RES_DIR}/08_diversidad/rarefied_table.qza" \
  --p-metric braycurtis \
  --o-distance-matrix "${RES_DIR}/08_diversidad/beta/bray_curtis.qza"
qiime diversity beta \
  --i-table "${RES_DIR}/08_diversidad/rarefied_table.qza" \
  --p-metric jaccard \
  --o-distance-matrix "${RES_DIR}/08_diversidad/beta/jaccard.qza"

echo "-> 5. Diversidad beta filogenética (UniFrac, 1 hilo)..."
qiime diversity beta-phylogenetic \
  --i-table "${RES_DIR}/08_diversidad/rarefied_table.qza" \
  --i-phylogeny "${RES_DIR}/07_filogenia/rooted_tree.qza" \
  --p-metric unweighted_unifrac \
  --p-threads 1 \
  --o-distance-matrix "${RES_DIR}/08_diversidad/beta/unweighted_unifrac.qza"
qiime diversity beta-phylogenetic \
  --i-table "${RES_DIR}/08_diversidad/rarefied_table.qza" \
  --i-phylogeny "${RES_DIR}/07_filogenia/rooted_tree.qza" \
  --p-metric weighted_unifrac \
  --p-threads 1 \
  --o-distance-matrix "${RES_DIR}/08_diversidad/beta/weighted_unifrac.qza"

echo "-> 6. PCoA + gráficos Emperor..."
for metric in bray_curtis jaccard unweighted_unifrac weighted_unifrac; do
  qiime diversity pcoa \
    --i-distance-matrix "${RES_DIR}/08_diversidad/beta/${metric}.qza" \
    --o-pcoa "${RES_DIR}/08_diversidad/pcoa/${metric}_pcoa.qza"
  qiime emperor plot \
    --i-pcoa "${RES_DIR}/08_diversidad/pcoa/${metric}_pcoa.qza" \
    --m-metadata-file "${METADATOS}" \
    --o-visualization "${RES_DIR}/08_diversidad/pcoa/${metric}_emperor.qzv"
done

echo "Hecho: resultados en ${RES_DIR}/08_diversidad/"
