#!/usr/bin/env bash
# =============================================================================
# 02_cutadapt.sh — recorta los primers de amplificación (región 16S V3-V4)
#
# Entrada:  demux_seqs.qza (salida del paso 01).
# Salida:   demux_trimmed.qza sin primers + demux_trimmed.qzv (cuántas lecturas
#           pasaron el filtro).
# Para qué: los primers no son diversidad biológica real; si no se quitan, DADA2
#           los toma como secuencia y mete ruido en la inferencia de ASVs.
#
# Ajusta FORWARD_PRIMER / REVERSE_PRIMER a los primers de TU librería.
# Los de ejemplo son 341F / 805R (16S V3-V4), en notación IUPAC.
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
set -e

# --- AJUSTA ESTO -----------------------------------------------------------
RUTA_BASE="<<CAMBIA_ESTO_POR_TU_CARPETA>>"   # carpeta raíz de tu análisis
NUM_HILOS=4                                  # ajusta según tu máquina
FORWARD_PRIMER="CCTACGGGNGGCWGCAG"           # 341F (16S V3-V4)
REVERSE_PRIMER="GACTACHVGGGTATCTAATCC"       # 805R (16S V3-V4)
# -------------------------------------------------------------------------
RES_DIR="${RUTA_BASE}/resultados"
LOG_DIR="${RUTA_BASE}/logs"

mkdir -p "${RES_DIR}" "${LOG_DIR}"
exec > >(tee -i "${LOG_DIR}/02_cutadapt.log")
exec 2>&1

echo "Cutadapt (recorte de primers): $(date)"

qiime cutadapt trim-paired \
  --i-demultiplexed-sequences "${RES_DIR}/demux_seqs.qza" \
  --p-front-f "${FORWARD_PRIMER}" \
  --p-front-r "${REVERSE_PRIMER}" \
  --p-match-adapter-wildcards \
  --p-match-read-wildcards \
  --p-cores "${NUM_HILOS}" \
  --o-trimmed-sequences "${RES_DIR}/demux_trimmed.qza"

qiime demux summarize \
  --i-data "${RES_DIR}/demux_trimmed.qza" \
  --o-visualization "${RES_DIR}/demux_trimmed.qzv"

echo "Hecho: ${RES_DIR}/demux_trimmed.qza"
