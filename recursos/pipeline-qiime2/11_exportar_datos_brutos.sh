#!/usr/bin/env bash
# =============================================================================
# 11_exportar_datos_brutos.sh — extrae los números de los artefactos a texto
#
# Entrada:  artefactos .qza / .qzv de diversidad y estadística (pasos 09-10).
# Salida:   .tsv / .txt legibles con los vectores de diversidad alfa, las
#           coordenadas PCoA y los informes PERMANOVA / PERMDISP.
# Para qué: hacer figuras propias en R o Python y citar los valores exactos
#           (p-valor, R2, pseudo-F) en el texto.
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
set -e

# --- AJUSTA ESTO -----------------------------------------------------------
RUTA_BASE="<<CAMBIA_ESTO_POR_TU_CARPETA>>"   # carpeta raíz de tu análisis
# -------------------------------------------------------------------------
RES_DIR="${RUTA_BASE}/resultados"
OUT_DIR="${RES_DIR}/10_datos_exportados"

mkdir -p "${OUT_DIR}/alfa" "${OUT_DIR}/beta" "${OUT_DIR}/estadistica"

echo "-> Diversidad alfa..."
qiime tools export --input-path "${RES_DIR}/08_diversidad/alpha/shannon.qza" \
  --output-path "${OUT_DIR}/alfa/shannon"
qiime tools export --input-path "${RES_DIR}/08_diversidad/alpha/observed_features.qza" \
  --output-path "${OUT_DIR}/alfa/observed_features"

echo "-> Coordenadas PCoA..."
qiime tools export --input-path "${RES_DIR}/08_diversidad/pcoa/bray_curtis_pcoa.qza" \
  --output-path "${OUT_DIR}/beta/bray_curtis"
qiime tools export --input-path "${RES_DIR}/08_diversidad/pcoa/jaccard_pcoa.qza" \
  --output-path "${OUT_DIR}/beta/jaccard"

echo "-> Informes estadísticos..."
qiime tools export --input-path "${RES_DIR}/09_estadistica/permanova_bray_curtis.qzv" \
  --output-path "${OUT_DIR}/estadistica/permanova"
qiime tools export --input-path "${RES_DIR}/09_estadistica/permdisp_bray_curtis.qzv" \
  --output-path "${OUT_DIR}/estadistica/permdisp"

echo "Hecho: todo en ${OUT_DIR}"
