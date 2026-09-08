#!/usr/bin/env python3
# =============================================================================
# 07_estadisticas_taxonomia.py — audita la calidad de la asignación taxonómica
#
# Entrada:  taxonomy.tsv exportado de taxonomy.qza (o el que sale de
#           `qiime metadata tabulate`), con columnas "Taxon" y "Confidence" y
#           una fila de tipos "#q2:types" que se salta automáticamente.
# Salida:   por consola: % de ASVs asignados a cada nivel (filo/familia/género/
#           especie) descartando etiquetas basura (uncultured/unidentified/
#           metagenome), confianza media y los 5 filos más frecuentes.
# Para qué: saber si tu clasificador está resolviendo bien antes de sacar
#           conclusiones de composición.
#
# Requiere: pandas  (pip install pandas)
# Exportar la taxonomía:  qiime tools export --input-path taxonomy.qza \
#                            --output-path carpeta_salida
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
import pandas as pd

# --- AJUSTA ESTO ---------------------------------------------------------
RUTA_TAXONOMIA = "<<CAMBIA_ESTO_POR_TU_CARPETA>>/resultados/05_taxonomia/taxonomy.tsv"

# Cuántos filos mostrar en el ranking del final. Solo afecta a la impresión.
TOP_FILOS = 5

# Etiquetas que NO cuentan como una asignación real (basura de las bases de
# datos SILVA/UNITE). Un ASV con "g__uncultured" se considera SIN género.
ETIQUETAS_BASURA = ("uncultured", "unidentified", "metagenome")
# ---------------------------------------------------------------------

# skiprows=[1] salta la fila "#q2:types" de QIIME 2 (si tu archivo no la tiene,
# quita el argumento skiprows)
df = pd.read_csv(RUTA_TAXONOMIA, sep='\t', skiprows=[1])
total_asvs = len(df)

print("=" * 50)
print("  ESTADÍSTICAS DE ASIGNACIÓN TAXONÓMICA")
print("=" * 50)
print(f"Total de ASVs únicos: {total_asvs}")

confianza_media = df['Confidence'].astype(float).mean() * 100
print(f"Confianza media del clasificador: {confianza_media:.2f}%\n")


def assigned_to_level(taxon, prefix):
    """True si el ASV tiene una etiqueta REAL en ese nivel (no basura)."""
    for n in [x.strip() for x in taxon.split(';')]:
        if n.startswith(prefix):
            nombre = n.replace(prefix, '').lower()
            if nombre and not any(b in nombre for b in ETIQUETAS_BASURA):
                return True
    return False


filo = df['Taxon'].apply(lambda x: assigned_to_level(x, 'p__')).sum()
fam = df['Taxon'].apply(lambda x: assigned_to_level(x, 'f__')).sum()
gen = df['Taxon'].apply(lambda x: assigned_to_level(x, 'g__')).sum()
esp = df['Taxon'].apply(lambda x: assigned_to_level(x, 's__')).sum()

print(f"ASVs con Filo identificado:    {filo} ({filo / total_asvs * 100:.1f}%)")
print(f"ASVs con Familia identificada: {fam} ({fam / total_asvs * 100:.1f}%)")
print(f"ASVs con Género identificado:  {gen} ({gen / total_asvs * 100:.1f}%)")
print(f"ASVs con Especie identificada: {esp} ({esp / total_asvs * 100:.1f}%)\n")

print(f"--- Top {TOP_FILOS} Filos por número de ASVs ---")


def get_phylum(x):
    for n in x.split(';'):
        n = n.strip()
        if n.startswith('p__') and len(n) > 3:
            return n.replace('p__', '')
    return 'Sin asignar'


print(df['Taxon'].apply(get_phylum).value_counts().head(TOP_FILOS).to_string())
print("=" * 50)
