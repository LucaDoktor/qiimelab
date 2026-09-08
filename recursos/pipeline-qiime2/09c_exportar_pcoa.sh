#!/usr/bin/env bash
# =============================================================================
# 09c_exportar_pcoa.sh — saca las coordenadas del PCoA a texto plano
#
# Entrada:  *_pcoa.qza (paso 09 o 09b).
# Salida:   una carpeta por métrica con un archivo "ordination.txt" (formato
#           de scikit-bio: autovalores, % de varianza explicada y coordenadas
#           por muestra).
# Para qué: graficar el PCoA fuera de QIIME 2 (R con ggplot2, Python, o el
#           módulo de diversidad beta de esta misma app).
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
set -e

# --- AJUSTA ESTO -----------------------------------------------------------
RUTA_BASE="<<CAMBIA_ESTO_POR_TU_CARPETA>>"   # carpeta raíz de tu análisis
# PCoA a exportar (por nombre de archivo, sin _pcoa.qza). Deben existir en
# resultados/08_diversidad/pcoa/ (paso 09 o 09b).
METRICAS=(bray_curtis jaccard)
# -------------------------------------------------------------------------
PCOA_DIR="${RUTA_BASE}/resultados/08_diversidad/pcoa"
OUT_DIR="${RUTA_BASE}/resultados/08_diversidad/pcoa_exportado"

mkdir -p "${OUT_DIR}"

for metric in "${METRICAS[@]}"; do
  echo "-> Exportando ${metric}..."
  qiime tools export \
    --input-path "${PCOA_DIR}/${metric}_pcoa.qza" \
    --output-path "${OUT_DIR}/${metric}"
done

echo "Hecho: tienes 'ordination.txt' en ${OUT_DIR}/<metrica>/"
