#!/usr/bin/env python3
# =============================================================================
# 13_normalizar_taxonomia.py — limpia y normaliza los CSV de taxonomía de QIIME 2
#
# Entrada:  los CSV "Abundancia_<Nivel>_Nivel<n>.csv" que produce el paso 12
#           (filas = muestra, columnas = taxón + columnas de metadatos) y tu
#           archivo de metadatos (TSV con la primera columna de IDs de muestra).
# Salida:   por cada nivel taxonómico, 3 CSV en tablas_taxonomia_limpias/:
#             01_..._conteos_absolutos.csv       (conteos crudos, nombre limpio)
#             02_..._abundancia_relativa_muestras_TOPn.csv   (% por muestra)
#             03_..._abundancia_relativa_tratamientos_TOPn.csv (media por grupo)
#           Los taxones menos abundantes se agrupan en "Others".
# Para qué: dejar las tablas listas para barras / aluviales / heatmaps.
#
# Requiere: pandas  (pip install pandas)
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================
import os
import warnings

import pandas as pd

warnings.filterwarnings('ignore')

# --- AJUSTA ESTO ---------------------------------------------------------
RUTA_BASE = "<<CAMBIA_ESTO_POR_TU_CARPETA>>"
INPUT_DIR = os.path.join(RUTA_BASE, "resultados", "10_datos_exportados", "taxonomia_csv")
OUTPUT_DIR = os.path.join(RUTA_BASE, "resultados", "11_tablas_taxonomia_limpias")
METADATOS = os.path.join(RUTA_BASE, "sample-metadata.tsv")
# Columna de tus metadatos con el factor de agrupación (tratamiento, sitio…).
# La versión "03_..._tratamientos" promedia la abundancia dentro de cada grupo.
COLUMNA_GRUPO = "grupo"    # EJEMPLO — cámbialo por el nombre real de tu columna

# Nº de taxones más abundantes que se muestran por separado; el resto se suma
# en "Others". 14 va bien para una figura de género legible (más colores se
# vuelven indistinguibles); baja a 8-10 para filo, sube para especie.
TOP_N = 14                # EJEMPLO
# ---------------------------------------------------------------------

os.makedirs(OUTPUT_DIR, exist_ok=True)

NIVELES = {
    "Filo": "Abundancia_Filo_Nivel2.csv",
    "Clase": "Abundancia_Clase_Nivel3.csv",
    "Orden": "Abundancia_Orden_Nivel4.csv",
    "Familia": "Abundancia_Familia_Nivel5.csv",
    "Genero": "Abundancia_Genero_Nivel6.csv",
    "Especie": "Abundancia_Especie_Nivel7.csv",
}

print(f"Metadatos: {METADATOS}")
metadata_df = pd.read_csv(METADATOS, sep='\t')
id_col = metadata_df.columns[0]                       # p. ej. "sample-id"
metadata_df = metadata_df[~metadata_df[id_col].astype(str).str.startswith('#')]
metadata_df = metadata_df.set_index(id_col)


def clean_taxon_name(tax_string):
    """d__Bacteria;p__Firmicutes;...;g__Blautia  ->  'Blautia'."""
    if tax_string.strip() == 'Unassigned' or '__' not in tax_string:
        return 'Unassigned'
    ultimo = tax_string.split(';')[-1].strip()
    nombre = ultimo.split('__')[-1]
    return nombre if nombre else 'Unidentified'


for nivel_nombre, archivo in NIVELES.items():
    ruta = os.path.join(INPUT_DIR, archivo)
    if not os.path.exists(ruta):
        print(f"-> [aviso] no está {archivo}, lo salto.")
        continue

    print(f"\nProcesando {nivel_nombre} (Top {TOP_N} + Others)...")
    nivel_out = os.path.join(OUTPUT_DIR, nivel_nombre)
    os.makedirs(nivel_out, exist_ok=True)

    # 1. cargar, forzar numérico, transponer a taxón x muestra
    df = pd.read_csv(ruta, index_col=0)
    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df = df.fillna(0).T
    df.index = [clean_taxon_name(idx) for idx in df.index]
    df = df.groupby(level=0).sum()
    df.to_csv(os.path.join(nivel_out, f'01_{nivel_nombre}_conteos_absolutos.csv'))

    # 2. normalizar a % por muestra
    df_samples = df.T
    sums = df_samples.sum(axis=1)
    sums[sums == 0] = pd.NA
    df_rel = (df_samples.div(sums, axis=0) * 100).fillna(0)

    # 3. Top-N + "Others"
    ranking = df_rel.mean(axis=0).sort_values(ascending=False)
    top_taxa = ranking.head(TOP_N).index.tolist()
    otros = ranking.iloc[TOP_N:].index.tolist()
    df_top = df_rel[top_taxa].copy()
    if otros:
        df_top['Others'] = df_rel[otros].sum(axis=1)

    df_top_meta = df_top.merge(metadata_df[[COLUMNA_GRUPO]], left_index=True,
                               right_index=True, how='inner')
    df_top_meta.to_csv(os.path.join(
        nivel_out, f'02_{nivel_nombre}_abundancia_relativa_muestras_TOP{TOP_N}.csv'))

    # 4. media por grupo
    taxon_cols = [c for c in df_top_meta.columns if c != COLUMNA_GRUPO]
    df_group = df_top_meta.groupby(COLUMNA_GRUPO)[taxon_cols].mean()
    cols_finales = top_taxa + (['Others'] if 'Others' in df_group.columns else [])
    df_group[cols_finales].to_csv(os.path.join(
        nivel_out, f'03_{nivel_nombre}_abundancia_relativa_tratamientos_TOP{TOP_N}.csv'))

    print(f"   OK ({len(top_taxa)} taxones + Others)")

print("\nListo. Tablas en", OUTPUT_DIR)
