# Análisis de herramientas similares — ideas para QiimeLab

Búsqueda hecha en sesión cowork, 15 sep 2026. Comparado contra las herramientas web de análisis de microbioma más usadas/citadas: **MicrobiomeAnalyst** (McGill, la más completa y citada), **q2view** (visor oficial de QIIME2, arquitectura "serverless" — el comparable más directo a QiimeLab), **Qiita** (Knight Lab, meta-análisis a gran escala) y una revisión comparativa de herramientas web para 16S (VAMPS, Mian, Microbiome Toolbox, gcMeta). Fuentes al final.

No repito aquí lo que QiimeLab ya tiene (alfa/beta diversidad, barplots taxonómicos, abundancia diferencial con consenso LEfSe-style + Cliff's delta + LDA bootstrapeado, Venn/UpSet, correlograma con red, PERMANOVA, generador de métodos, árbol filogenético, calculadoras de laboratorio, Sanger, control de calidad FASTQ...) — solo lo que falta o se puede mejorar, con una valoración de viabilidad **100% cliente, sin servidor, cero dependencias** (la restricción de arquitectura no se negocia, ver `CLAUDE.md`).

## Quick wins — encajan bien en la arquitectura actual, esfuerzo contenido

- **Curvas de rarefacción.** Es lo más llamativo que falta: aparece en las 4 herramientas comparadas (VAMPS, MicrobiomeAnalyst, Mian) y es una figura estándar que cualquier revisor/profesor espera ver en un TFG de microbioma. Se calcula por completo a partir de la tabla ASV/OTU que ya tenéis en `state.js`, sin datos externos — encaja directo en el patrón de módulo existente.
- **Carga nativa de `.qza`/`.qzv`**, al estilo q2view. Hoy el usuario tiene que exportar manualmente a TSV/formato propio con mapeo de columnas. Los artefactos QIIME2 son en realidad ficheros ZIP — q2view demuestra que se puede leer el contenido, la visualización y hasta el **grafo de proveniencia** (qué comandos generaron el resultado) enteramente en el navegador vía Service Worker, sin servidor. Reduciría fricción de entrada de datos de forma notable, que es justo la prioridad #1 del público objetivo (estudiantes sin experiencia en la CLI de QIIME2).
- **NMDS como alternativa a PCoA** en beta diversidad. Cálculo ligero, mismo tipo de gráfico de dispersión que ya tenéis — es añadir una opción al selector de método existente, no un módulo nuevo.
- **Vista dedicada de "microbioma core"** (taxones presentes en ≥X% de las muestras/grupo). Ya tenéis el filtro de prevalencia en barplots y Venn/UpSet para solapamiento — esto es la pieza que falta para completarlo como su propia vista con umbral ajustable, en vez de solo un filtro dentro de otro gráfico.
- **Informe exportable ampliando el generador de métodos.** MicrobiomeAnalyst tiene generación de informes como función destacada; vosotros ya tenéis el generador de texto de Métodos — el salto natural es un export único (HTML/PDF, todo cliente) que empaquete métodos + figuras + estadísticas en un solo documento listo para pegar en un TFG. Alto valor percibido para el público objetivo con poco esfuerzo relativo, porque reutiliza módulos que ya existen.

## Esfuerzo medio — viable client-side, pero es un módulo nuevo de verdad

- **RDA/CCA (ordenación restringida).** Complementa vuestra PCoA + PERMANOVA: en vez de solo decir "hay diferencia entre grupos", muestra visualmente qué variables de metadatos (ambientales, de diseño) explican la variación de la comunidad. Es álgebra lineal estándar, computable en JS sin dependencias — mismo nivel de dificultad que lo que ya resolvisteis para PCoA/UPGMA.
- **Análisis de enriquecimiento de taxones** (el módulo "Taxon Set Analysis" de MicrobiomeAnalyst: comparar contra ~700 sets de taxones asociados a enfermedad/dieta/fármacos mediante test hipergeométrico/Fisher). Viable 100% cliente si se empaqueta una tabla de referencia curada como JSON estático (no requiere servidor, solo un asset más, como ya hacéis con las paletas). Es la función más "wow" de MicrobiomeAnalyst y encaja con el espíritu educativo del proyecto — pero exige currar/curar la tabla de referencia primero, no es solo código.
- **PCoA en 3D** (rotable con el ratón). MicrobiomeAnalyst lo ofrece como visual diferenciador. Se puede hacer sin librería 3D externa con una proyección isométrica simple sobre canvas/SVG y arrastre de ratón — coherente con la regla de cero dependencias, pero es más trabajo de lo que parece a simple vista (proyección + interacción + que no rompa con el editor de gráficos centralizado).

## Cuestionable / probablemente fuera de alcance dada la arquitectura

- **Random Forest / machine learning para biomarcadores**, como complemento al LEfSe-style que ya tenéis. Reforzaría el panel de biomarcadores, pero implementar un Random Forest razonable a mano en JS vanilla (sin librería) es un proyecto en sí mismo — viable en teoría para datasets del tamaño típico de una clase/TFG, pero es la opción de mayor coste/beneficio dudoso de esta lista.
- **PICRUSt2/Tax4Fun (predicción funcional desde taxonomía 16S)**: necesita bases de datos de referencia grandes (genomas/KO de referencia) — no encaja con "sin servidor, cero dependencias de datos externos pesados" salvo que se acepte distribuir una base de datos muy recortada, y aun así la precisión se resentiría. Lo dejaría como "interesante pero no ahora".
- **DADA2 en el navegador** (partir de FASTQ crudo hasta tabla ASV, en vez de solo el informe de calidad tipo FastQC que ya tenéis). El modelo de errores de DADA2 es computacionalmente pesado y complejo de reimplementar fielmente — alto riesgo de que "casi funcione" mal, que es peor que no tenerlo para un público sin formación en bioinformática que no puede juzgar si el resultado es correcto.
- **Meta-análisis multi-estudio** (Qiita, VAMPS): comparar/combinar datasets de estudios distintos. El público de QiimeLab analiza su propio estudio individual (TFG/curso) — encaja poco con el caso de uso actual, lo mencionaría solo como posible dirección muy a largo plazo.

## Resumen priorizado

Si hay que elegir por dónde seguir: **curvas de rarefacción** y **carga nativa de `.qza`/`.qzv`** son los dos con mejor relación entre lo que aportan (una figura que todo el mundo espera ver, y quitar el paso manual de exportar/mapear columnas que es justo la mayor barrera de entrada del público objetivo) y lo que cuestan de construir dado lo que ya existe en el código. El informe exportable es el tercero en la lista por lo mismo: reutiliza el generador de métodos que ya tenéis en vez de partir de cero.

## Fuentes

- [MicrobiomeAnalyst](https://www.microbiomeanalyst.ca/)
- [MicrobiomeAnalyst — artículo original, Nucleic Acids Research](https://academic.oup.com/nar/article/45/W1/W180/3760191)
- [q2view — repositorio oficial QIIME2](https://github.com/qiime2/q2view)
- [Qiita: rapid, web-enabled microbiome meta-analysis — Nature Methods](https://www.nature.com/articles/s41592-018-0141-9)
- [Review of the Current State of Freely Accessible Web Tools for the Analysis of 16S rRNA Sequencing of the Gut Microbiome — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9501225/)
- [Namco: a microbiome explorer — Microbiology Society](https://www.microbiologyresearch.org/content/journal/mgen/10.1099/mgen.0.000852)
