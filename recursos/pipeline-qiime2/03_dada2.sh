#!/usr/bin/env bash
# =============================================================================
# 03_dada2.sh — denoising, filtrado, unión de pares y quimeras (DADA2)
#
# Entrada:  demux_trimmed.qza (salida del paso 02, sin primers).
# Salida:   table.qza (tabla de ASVs), rep_seqs.qza (secuencias representativas),
#           dada2_stats.qza/.qzv (cuántas lecturas sobreviven en cada etapa).
# Para qué: DADA2 modela el error del secuenciador para inferir variantes reales
#           (ASVs) a resolución de un nucleótido.
#
# Los valores --p-trunc-len-* dependen de TU perfil de calidad (míralo en
# demux_trimmed.qzv del paso 02). Regla práctica: corta donde la calidad
# empieza a desplomarse, pero deja >= 20 pb de solapamiento entre F y R.
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
set -e

# --- AJUSTA ESTO -----------------------------------------------------------
RUTA_BASE="<<CAMBIA_ESTO_POR_TU_CARPETA>>"   # carpeta raíz de tu análisis
NUM_HILOS=4                                  # ajusta según tu máquina
TRUNC_F=270                                  # truncado forward (según tu QC)
TRUNC_R=250                                  # truncado reverse (según tu QC)
# -------------------------------------------------------------------------
RES_DIR="${RUTA_BASE}/resultados"
LOG_DIR="${RUTA_BASE}/logs"

mkdir -p "${RES_DIR}/03_dada2" "${LOG_DIR}"
exec > >(tee -i "${LOG_DIR}/03_dada2.log")
exec 2>&1

echo "DADA2 (denoising): $(date)"

qiime dada2 denoise-paired \
  --i-demultiplexed-seqs "${RES_DIR}/demux_trimmed.qza" \
  --p-trunc-len-f "${TRUNC_F}" \
  --p-trunc-len-r "${TRUNC_R}" \
  --p-trim-left-f 0 \
  --p-trim-left-r 0 \
  --p-max-ee-f 2 \
  --p-max-ee-r 2 \
  --p-n-threads "${NUM_HILOS}" \
  --o-representative-sequences "${RES_DIR}/03_dada2/rep_seqs.qza" \
  --o-table "${RES_DIR}/03_dada2/table.qza" \
  --o-denoising-stats "${RES_DIR}/03_dada2/dada2_stats.qza"

qiime metadata tabulate \
  --m-input-file "${RES_DIR}/03_dada2/dada2_stats.qza" \
  --o-visualization "${RES_DIR}/03_dada2/dada2_stats.qzv"

echo "Hecho: revisa dada2_stats.qzv — necesitas retener suficientes lecturas por muestra"
