# Datos de ejemplo

Recorte pequeño y curado de resultados **reales** de un estudio de microbioma
**16S** con varios grupos de tratamiento (A–N) y una fase de validación, 3
réplicas por grupo (42 muestras). Los nombres de grupo, de muestra y de las
variables del diseño están **anonimizados** — se ve la estructura exacta
(grupos, réplicas, variables categóricas), no de qué va el estudio.

Todo sale de un pipeline QIIME2 + DESeq2 + PICRUSt2 **ya ejecutado**;
QiimeLab no procesa secuencias crudas. Sirve para dos cosas:

1. Probar cada módulo sin tener datos propios (botón **"Cargar ejemplo real"**).
2. Ver **la estructura exacta** que debe tener tu propio archivo antes de subirlo.

Puedes arrastrar cualquiera de estos archivos a la pantalla **Cargar datos**
igual que harías con los tuyos.

| Archivo | Qué es | De qué paso sale |
|---|---|---|
| `metadatos/sample-metadata.tsv` | Metadatos de las 42 muestras: `sample-id`, `fase`, `variable_1`…`variable_4` (factores del diseño), `tiempo_dias`, `replicate`, `grupo`. 1ª fila = cabecera; 2ª fila `#q2:types` la ignora QiimeLab automáticamente. | Archivo de metadatos de QIIME2, el que se pasa a `qiime diversity core-metrics`. |
| `taxonomia/taxonomy.tsv` | Asignación taxonómica por ASV: `Feature ID`, `Taxon` (`d__;p__;…;g__`), `Confidence`. Recortado a 2.500 ASVs y a nivel de género para que pese poco; tu archivo real tendrá todos los ASVs y puede llegar a especie. | `qiime feature-classifier classify-sklearn` → `taxonomy.qza`, exportado a TSV. Clasificador SILVA 138 V3–V4. |
| `barplot/genero_abundancia_relativa_TOP14.csv` | Abundancia relativa (%) por muestra a nivel de **género**: muestras en filas, los 14 géneros más abundantes como columnas (nombre corto: `Lactobacillus`, `Clostridium_sensu_stricto_1`…), columna `Others` con el resto agregado y `grupo` con el grupo. | Tabla `collapse` de QIIME2 a nivel 6, limpiada y reducida a top-14 en R. |
| `venn/genero_conteos_absolutos.csv` | Conteos **absolutos** por género: taxones en filas, muestras en columnas (`taxon`, `A-1`, `A-2`, …). Todos los géneros, sin top-N ni "Others" — es el formato correcto para presencia/ausencia (Venn, UpSet, PERMANOVA). | Tabla `collapse` de QIIME2 a nivel 6 sin normalizar, exportada a CSV. |
| `diversidad-alfa/shannon.tsv` | Índice de Shannon (equitatividad) por muestra. Dos columnas: id de muestra + `shannon_entropy`. | `qiime diversity core-metrics` → `shannon_vector.qza`, exportado a TSV. |
| `diversidad-alfa/observed_features.tsv` | Riqueza (nº de ASVs observados) por muestra. Mismo formato que Shannon. | `qiime diversity core-metrics` → `observed_features_vector.qza`, exportado. |
| `diversidad-beta/bray_curtis.qza` | Matriz de distancias Bray-Curtis entre las 42 muestras. **Se sube tal cual** — QiimeLab abre el `.qza` en el navegador; por dentro es un TSV plano (`distance-matrix.tsv`). | `qiime diversity core-metrics` → `bray_curtis_distance_matrix.qza`. |
| `abundancia-diferencial/DESeq2_D_vs_Control.csv` | Abundancia diferencial (DESeq2) del **Grupo D** frente al Control, a nivel de género. Columnas: `Genus, baseMean, log2FoldChange, lfcSE, stat, pvalue, padj, Significancia, neg_log10_padj`. | Script DESeq2 sobre la tabla de conteos por género. |
| `abundancia-diferencial/DESeq2_N_vs_Control.csv` | Igual, para el **Grupo N** vs Control. | idem. |
| `abundancia-diferencial/DESeq2_D_vs_N.csv` | **Grupo D vs Grupo N** (dos tratamientos entre sí, no contra el control). | idem. |
| `funcional-picrust2/KOlist.csv` | 53 KOs (ortólogos KEGG) agrupados en **módulos funcionales** (`Lactic acid fermentation`, `Urea metabolism`, `Proteolysis`…). Columnas: `Functional Module, KO, Gene, Enzyme, EC Number, …`. | Lista curada a mano (bioquímica estándar de KEGG). |
| `funcional-picrust2/KO_pred_metagenome_unstrat.tsv.gz` | Abundancia predicha de **cada KO en cada muestra** (metagenoma inferido). `function` (= KO) en filas, muestras en columnas. Viene en **gzip suelto** (`.tsv.gz`) — QiimeLab lo descomprime en el navegador. | PICRUSt2 → `KO_metagenome_out/pred_metagenome_unstrat.tsv.gz` (versión **unstrat**, resumen ya agregado). |
| `pcoa/bray_curtis_ordination.txt` | Coordenadas PCoA ya calculadas (formato "Ordination Results" de scikit-bio): secciones `Eigvals`, `Proportion explained`, `Site`. | `qiime diversity pcoa` → `bray_curtis_pcoa.qza`, exportado a `ordination.txt`. |

## Estructura de los grupos

42 muestras = 14 grupos × 3 réplicas. Los ids de muestra son `<letra>-<réplica>`
(`A-1`, `A-2`, `A-3`, `B-1`, …, `N-3`); la letra coincide con el grupo.

| Grupo | `fase` | Réplicas |
|---|---|---|
| `Control` | `basal` | A-1 … A-3 |
| `Grupo B` … `Grupo E` | `validacion` | B-1 … E-3 |
| `Grupo F` … `Grupo G` | `ensayo_1` | F-1 … G-3 |
| `Grupo H` … `Grupo J` | `ensayo_2` | H-1 … J-3 |
| `Grupo K` … `Grupo M` | `ensayo_3` | K-1 … M-3 |
| `Grupo N` | `ensayo_4` | N-1 … N-3 |

`variable_1`…`variable_4` son factores categóricos del diseño (`si`/`no` o
`nivel_0`/`nivel_1`/`nivel_2`) — sirven para probar el "agrupar por" de cada
módulo con distintos números de grupos.

---

*Los datos de ejemplo se generan con un script fuera de este repositorio a
partir de resultados reales, aplicando la anonimización de nombres. Lo único
que se publica es esta carpeta ya anonimizada.*
