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

# Deben COINCIDIR con lo que generaste en los pasos 09 y 10 (si allí cambiaste
# las métricas o la columna de grupo, cámbialas también aquí).
METRICAS_ALFA=(shannon observed_features)
METRICAS_PCOA=(bray_curtis jaccard)
METRICA_ESTADISTICA="bray_curtis"           # la del paso 10
# -------------------------------------------------------------------------
RES_DIR="${RUTA_BASE}/resultados"
OUT_DIR="${RES_DIR}/10_datos_exportados"

mkdir -p "${OUT_DIR}/alfa" "${OUT_DIR}/beta" "${OUT_DIR}/estadistica"

echo "-> Diversidad alfa..."
for m in "${METRICAS_ALFA[@]}"; do
  qiime tools export --input-path "${RES_DIR}/08_diversidad/alpha/${m}.qza" \
    --output-path "${OUT_DIR}/alfa/${m}"
done

echo "-> Coordenadas PCoA..."
for m in "${METRICAS_PCOA[@]}"; do
  qiime tools export --input-path "${RES_DIR}/08_diversidad/pcoa/${m}_pcoa.qza" \
    --output-path "${OUT_DIR}/beta/${m}"
done

echo "-> Informes estadísticos..."
qiime tools export --input-path "${RES_DIR}/09_estadistica/permanova_${METRICA_ESTADISTICA}.qzv" \
  --output-path "${OUT_DIR}/estadistica/permanova"
qiime tools export --input-path "${RES_DIR}/09_estadistica/permdisp_${METRICA_ESTADISTICA}.qzv" \
  --output-path "${OUT_DIR}/estadistica/permdisp"

echo "Hecho: todo en ${OUT_DIR}"
