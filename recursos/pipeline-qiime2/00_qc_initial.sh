#!/usr/bin/env bash
# =============================================================================
# 00_qc_initial.sh — control de calidad de los FASTQ crudos (FastQC + MultiQC)
#
# Entrada:  carpeta con tus .fastq.gz (lecturas crudas del secuenciador).
# Salida:   un informe HTML por archivo + un informe MultiQC agregado en qc/.
# Para qué: ver dónde cae la calidad en los extremos de las lecturas; ese dato
#           decide luego los parámetros de truncado (--p-trunc-len) de DADA2.
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
set -e

# --- AJUSTA ESTO -----------------------------------------------------------
RUTA_BASE="<<CAMBIA_ESTO_POR_TU_CARPETA>>"   # carpeta raíz de tu análisis
NUM_HILOS=4                                  # ajusta según tu máquina
# -------------------------------------------------------------------------
DATA_DIR="${RUTA_BASE}/fastq"                # aquí van tus .fastq.gz
QC_DIR="${RUTA_BASE}/qc"
LOG_DIR="${RUTA_BASE}/logs"

mkdir -p "${QC_DIR}" "${LOG_DIR}"
exec > >(tee -i "${LOG_DIR}/00_qc_initial.log")
exec 2>&1

echo "Control de calidad inicial: $(date)"

if ! command -v fastqc &> /dev/null || ! command -v multiqc &> /dev/null; then
    echo "ERROR: falta fastqc o multiqc."
    echo "Instálalos en tu entorno conda: conda install -c bioconda fastqc multiqc"
    exit 1
fi

echo "-> FastQC sobre ${DATA_DIR}/*.fastq.gz ..."
fastqc -t "${NUM_HILOS}" -q "${DATA_DIR}"/*.fastq.gz -o "${QC_DIR}"

echo "-> Agrupando con MultiQC ..."
multiqc "${QC_DIR}" -o "${QC_DIR}"

echo "Hecho: abre ${QC_DIR}/multiqc_report.html"
