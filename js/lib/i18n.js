// Internacionalización mínima, sin dependencias.
//
// Mecanismo (una frase): cada literal visible del HTML generado por JS se
// sustituye por una llamada `t('modulo.clave')` en el mismo sitio donde
// estaba el texto; `t(clave, {n: 5})` interpola `{n}`; si falta la
// traducción en el idioma activo se cae a español y, si tampoco está, a la
// propia clave (nunca texto roto).
//
// Los TÉRMINOS TÉCNICOS del dominio (Bray-Curtis, PERMANOVA, Shannon, PCoA,
// rangos taxonómicos, nombres de género, KO/KEGG…) NO se traducen: se dejan
// igual en los 5 idiomas y solo se traduce la interfaz alrededor.

const STORAGE_KEY = 'qiimelab.lang';
const DEFAULT_LANG = 'es';

// Autónimos (el nombre de cada idioma en ese mismo idioma), sin banderas.
export const LANGS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'zh', label: '中文' },
];

const DICTS = {
  es: {
    app: { loading: 'Cargando…', moduleLoadError: 'No se ha podido cargar este módulo', unknownError: 'Error desconocido.' },
    nav: {
      home: 'Resumen', upload: 'Cargar datos', barplots: 'Barplots taxonómicos',
      alpha: 'Diversidad alfa', beta: 'Diversidad beta', differential: 'Abundancia diferencial',
      venn: 'Venn / UpSet', qc: 'Control de calidad (FASTQ)',
    },
    shell: {
      groupModules: 'Módulos', sessionData: 'Datos en esta sesión',
      footer: 'Todo corre en tu navegador — nada se sube a un servidor.',
      noData: 'sin datos', language: 'Idioma',
    },
    slots: {
      metadata: 'Metadatos', taxonomy: 'Taxonomía', taxaBarplot: 'Barplot taxonómico',
      taxaCounts: 'Conteos taxón × muestra', alpha: 'Diversidad alfa', beta: 'Diversidad beta',
      differential: 'Abundancia diferencial', fastq: 'Archivos FASTQ',
    },
    common: {
      available: 'Disponible', noData: 'Sin datos', goLoadData: 'Ir a cargar datos',
      loadRealExample: 'Cargar ejemplo real (estudio de microbioma 16S)',
      loadSyntheticExample: 'Cargar ejemplo sintético (rápido)',
      controls: 'Controles', loadingProcessing: 'Descargando y procesando…',
    },
    home: {
      eyebrow: 'Análisis de microbioma · sin servidor',
      subtitle: 'Sube tus resultados de QIIME2 (o los archivos ya exportados) y obtén las figuras y tablas estándar al instante — barplots, diversidad alfa y beta, abundancia diferencial. Todo se calcula en tu navegador: nada se envía a ningún servidor.',
      ctaLoadedTitle: 'Ya tienes datos cargados en esta sesión',
      ctaLoadedNote: 'Entra en un módulo del menú para ver el análisis, o sube más archivos.',
      ctaEmptyTitle: 'Empieza subiendo tus resultados de QIIME2',
      ctaEmptyNote: 'Acepta directamente artefactos <span class="mono">.qza</span>/<span class="mono">.qzv</span> (los desempaqueta en el propio navegador) o archivos <span class="mono">.tsv</span>/<span class="mono">.csv</span> ya exportados.',
      ctaBtnMore: 'Ir a cargar más datos', ctaBtnLoad: 'Cargar datos',
      summaryTitle: 'Qué hay cargado ahora mismo',
      summaryNote: 'Un módulo puede necesitar más de un archivo (por ejemplo, diversidad alfa necesita la métrica + los metadatos con los grupos).',
      modulesTitle: 'Módulos',
      modulesNote: 'El plan es ir ampliando esta lista — cada módulo es un archivo independiente en <span class="mono">js/modules/</span>.',
    },
    modules: {
      barplots: { desc: 'Composición relativa por muestra, coloreada por taxón, con las categorías menos abundantes agrupadas en «Otros».' },
      alpha: { desc: 'Boxplot por grupo de metadatos + test de Kruskal-Wallis (no paramétrico) para comparar la diversidad dentro de cada muestra.' },
      beta: { desc: 'Mapa de calor de la matriz de distancias, ordenado por un dendrograma UPGMA (clustering jerárquico).' },
      differential: { desc: 'Volcano plot interactivo a partir de una tabla tipo DESeq2/ANCOM-BC, con generador de script de R a partir de tus umbrales.' },
      venn: { desc: 'Taxones compartidos y exclusivos entre grupos, a partir de una tabla de conteos. Hasta 4 grupos con diagrama de Venn; 5+ con vista UpSet.' },
      qc: { desc: 'Informe de calidad estilo FastQC de tus archivos FASTQ: calidad por posición, contenido de bases, duplicación, sobrerrepresentadas y más.' },
    },
    qc: {
      eyebrow: 'Calidad de las lecturas crudas',
      title: 'Control de calidad de secuencias',
      subtitle: 'Sube tus archivos FASTQ (.fastq, .fq, .fastq.gz, .fq.gz) y obtén un informe de calidad estilo FastQC: calidad por posición, composición de bases, duplicación, adaptadores y más. Todo se calcula en tu navegador, en streaming — el archivo no se sube a ningún sitio. No sustituye a DADA2/QIIME2: son estadísticas descriptivas sobre el FASTQ tal cual.',
      empty: {
        title: 'Todavía no has cargado ningún FASTQ',
        note: 'Arrastra uno o varios archivos .fastq / .fq (comprimidos .gz o sin comprimir). Si subes varias muestras se añade una tabla comparativa.',
        drop: 'Arrastra tus FASTQ aquí o haz clic para elegirlos',
        dropSub: '.fastq · .fq · .fastq.gz · .fq.gz — puedes seleccionar varios',
      },
      addMore: 'Añadir más archivos FASTQ',
      loadExampleReal: 'Cargar ejemplo real (FASTQ 16S: R1 + R2)',
      analyzing: 'Analizando…',
      analyzeError: 'No se pudo analizar el archivo',
      pairedWith: 'emparejado con {name}',
      subsampleNote: 'Análisis basado en una submuestra de las primeras {n} lecturas (el archivo tiene ~{total} en total).',
      wholeFileNote: 'Análisis del archivo completo: {n} lecturas.',
      bigFileWarn: 'Archivo grande ({size}). Se procesará solo una submuestra de {n} lecturas.',
      maxReadsLabel: 'Lecturas a procesar por archivo',
      maxReadsHelp: 'Máximo de lecturas que se analizan de cada archivo. Súbelo para más precisión (más lento); bájalo si el navegador va justo.',
      reanalyze: 'Volver a analizar con este límite',
      verdict: { good: 'Bien', warning: 'Aviso', critical: 'Crítico', na: '—' },
      overall: { title: 'Resumen (semáforo)', note: 'Un vistazo rápido a cada control, con el código de color estilo FastQC (verde / amarillo / rojo).' },
      compare: {
        title: 'Comparativa de muestras', note: 'Todas las muestras cargadas, una fila por archivo (estilo MultiQC). Pulsa una fila para ver su informe completo.',
        colFile: 'Archivo', colReads: 'Lecturas', colLen: 'Long. media', colGC: '%GC', colQual: 'Calidad media', colDup: '% duplicadas', colAdapter: '% adaptador (máx.)',
      },
      stats: {
        title: 'Estadísticas básicas',
        reads: 'Lecturas procesadas', readsEst: 'Total estimado en el archivo', length: 'Longitud (mín / media / máx)',
        gc: '%GC global', meanQ: 'Calidad media (Phred)', encoding: 'Codificación de calidad', nContent: '%N global', totalBases: 'Bases analizadas',
      },
      perPosQ: {
        title: 'Calidad por posición',
        explain: 'Para cada posición de la lectura, la distribución de la puntuación de calidad Phred (mediana, rango intercuartílico y percentiles 10–90). Phred 20 = 1 error por cada 100 bases; Phred 30 = 1 por cada 1.000.',
        interpret: 'Es normal que la calidad baje hacia el final de la lectura, sobre todo en las R2. Si la mediana cae por debajo de 20–25 conviene recortar esas posiciones (parámetro de truncado en DADA2 / cutadapt).',
        bandGood: 'Phred ≥ 28', bandMid: 'Phred 20–28', bandBad: 'Phred < 20',
        verdictGood: 'Todas las posiciones mantienen una mediana de calidad alta.',
        verdictWarn: 'Algunas posiciones (normalmente el extremo 3′) bajan de Phred 25 — plantéate recortarlas.',
        verdictCrit: 'Hay posiciones con mediana por debajo de Phred 20 o cuartil inferior muy bajo: recorta el extremo de la lectura antes de seguir.',
        colPos: 'Posición', colMedian: 'Mediana', colQ25: 'Q1', colQ75: 'Q3', colMean: 'Media',
      },
      seqQ: {
        title: 'Calidad media por lectura',
        explain: 'Cuántas lecturas hay para cada valor de calidad media. Lo deseable es un pico único desplazado a la derecha (Phred alto).',
        interpret: 'Un segundo pico a la izquierda (calidad baja) indica un subconjunto de lecturas malas — a menudo de zonas concretas de la celda de flujo.',
        verdictGood: 'La mayoría de las lecturas tienen una calidad media alta.',
        verdictWarn: 'La calidad media más frecuente está entre Phred 20 y 27 — aceptable pero no ideal.',
        verdictCrit: 'La calidad media más frecuente está por debajo de Phred 20 — muchas lecturas son poco fiables.',
        colQ: 'Calidad media', colCount: 'Nº de lecturas',
      },
      baseContent: {
        title: 'Composición de bases por posición',
        explain: 'Porcentaje de A, C, G y T en cada posición. En una librería aleatoria las cuatro líneas irían casi paralelas.',
        interpret: 'En amplicones (16S, ITS…) las primeras posiciones muestran el patrón del primer y de regiones conservadas: las líneas se separan mucho. Es lo esperado, no un fallo de secuenciación.',
        ampliconNote: 'FastQC marcaría esto como «aviso» o «crítico» en casi cualquier amplicón. Aquí es solo informativo.',
        verdictGood: 'La composición de bases es estable a lo largo de la lectura.',
        verdictWarn: 'Hay sesgo de composición (típico del primer en las primeras bases de un amplicón).',
        verdictCrit: 'Sesgo de composición fuerte y sostenido — normal en amplicón; revísalo si esperabas una librería aleatoria (metagenómica, RNA-seq).',
        colPos: 'Posición',
      },
      nContent: {
        title: 'Contenido de N por posición',
        explain: 'Porcentaje de bases sin llamar (N) en cada posición. El secuenciador escribe N cuando no puede decidir la base.',
        interpret: 'Debería ser prácticamente 0 en toda la lectura. Un pico de N en una posición concreta apunta a un problema en ese ciclo de secuenciación.',
        verdictGood: 'Contenido de N insignificante.',
        verdictWarn: 'Alguna posición supera el 5 % de N.',
        verdictCrit: 'Alguna posición supera el 20 % de N — ese tramo de la lectura no es fiable.',
      },
      gcDist: {
        title: 'Distribución de %GC por lectura',
        explain: 'Cuántas lecturas hay para cada valor de %GC. La curva de puntos es una normal teórica centrada en la media observada, como referencia visual.',
        interpret: 'Un amplicón 16S tiene un %GC bastante definido, así que se espera un pico único y estrecho. Varios picos pueden indicar contaminación o mezcla de organismos muy distintos.',
        verdictGood: 'Distribución de GC de un solo pico, cercana a la referencia.',
        verdictWarn: 'La distribución de GC se aparta algo de una normal (hombros o ligera asimetría).',
        verdictCrit: 'La distribución de GC se aparta mucho de una normal — posible contaminación o mezcla de librerías.',
        colGC: '%GC', colObs: 'Observadas', colTheo: 'Teóricas',
      },
      lengthDist: {
        title: 'Distribución de longitud de lectura',
        explain: 'Cuántas lecturas hay de cada longitud.',
        interpret: 'FASTQ recién salido del secuenciador: todas las lecturas miden lo mismo (p. ej. 301 nt). Si ya has pasado cutadapt/recorte, es normal ver un rango de longitudes.',
        verdictGood: 'Todas las lecturas tienen la misma longitud.',
        verdictWarn: 'Hay varias longitudes de lectura (normal si el archivo ya está recortado).',
        colLen: 'Longitud', colCount: 'Nº de lecturas',
      },
      duplication: {
        title: 'Niveles de duplicación',
        explain: 'Agrupa las secuencias idénticas y cuenta cuántas lecturas caen en cada nivel de duplicación (aparecen 1 vez, 2, 3…). Es una estimación sobre la submuestra y sobre un número acotado de secuencias distintas.',
        interpret: 'En secuenciación aleatoria, mucha duplicación indica sobre-amplificación por PCR. En amplicón 16S es al revés: se espera MUCHA duplicación, porque el mismo ASV se secuencia miles de veces.',
        ampliconNote: 'Para amplicón, un valor alto aquí es normal y no hay que «de-duplicar».',
        verdictGood: 'Nivel de duplicación bajo.',
        verdictWarn: 'Duplicación moderada ({pct} % de lecturas duplicadas).',
        verdictCrit: 'Duplicación alta ({pct} % de lecturas duplicadas) — normal en amplicón; en librerías aleatorias, revisa la PCR.',
        colLevel: 'Nivel (nº de copias)', colReads: '% de lecturas', colSeqs: 'Nº de secuencias',
        remaining: 'Si se dejara una sola copia de cada secuencia quedaría el {pct} % de las lecturas.',
        cappedNote: 'Se rastrearon las primeras {n} secuencias distintas (límite de memoria); el resto cuenta como poco duplicado.',
      },
      overrep: {
        title: 'Secuencias sobrerrepresentadas',
        explain: 'Secuencias exactas que por sí solas superan el 0,1 % de las lecturas.',
        interpret: 'En amplicón, las primeras suelen ser los ASVs dominantes de la muestra (real). Secuencias de adaptador o poli-G aquí sí son señal de un problema técnico.',
        none: 'Ninguna secuencia supera el 0,1 % de las lecturas.',
        colSeq: 'Secuencia (inicio)', colLen: 'Long.', colCount: 'Nº lecturas', colPct: '% del total',
        verdictGood: 'Sin secuencias sobrerrepresentadas.',
        verdictWarn: 'Hay secuencias que superan el 0,1 % (esperable en amplicón: ASVs dominantes).',
        verdictCrit: 'Hay secuencias que superan el 1 % de las lecturas.',
      },
      adapter: {
        title: 'Contenido de adaptadores',
        explain: 'Porcentaje acumulado de lecturas que contienen un k-mer de adaptador Illumina a partir de cada posición. Es una búsqueda heurística por k-mer, no el algoritmo exacto de FastQC.',
        interpret: 'Una curva que sube hacia el final de la lectura significa que el fragmento es más corto que la lectura y el secuenciador ha leído hasta el adaptador — hay que recortarlo (cutadapt).',
        none: 'No se detecta contenido de adaptador apreciable.',
        verdictGood: 'Contenido de adaptador insignificante.',
        verdictWarn: 'Se detecta algo de adaptador ({pct} % máx.) — recorta con cutadapt antes de DADA2.',
        verdictCrit: 'Contenido de adaptador alto ({pct} % máx.) — recorta con cutadapt antes de seguir.',
        colPos: 'Posición',
      },
      primer16S: {
        detected: 'Primer 16S detectado al inicio del {pct} % de las lecturas ({name}). Aún llevas el primer pegado: recórtalo con cutadapt (paso previo a DADA2).',
        notDetected: 'No se detecta el primer 16S V3 al inicio de las lecturas (o ya está recortado).',
      },
      showTable: 'Ver tabla de datos',
    },
  },

  en: {
    app: { loading: 'Loading…', moduleLoadError: 'This module could not be loaded', unknownError: 'Unknown error.' },
    nav: {
      home: 'Overview', upload: 'Load data', barplots: 'Taxonomic barplots',
      alpha: 'Alpha diversity', beta: 'Beta diversity', differential: 'Differential abundance',
      venn: 'Venn / UpSet', qc: 'Quality control (FASTQ)',
    },
    shell: {
      groupModules: 'Modules', sessionData: 'Data in this session',
      footer: 'Everything runs in your browser — nothing is uploaded to a server.',
      noData: 'no data', language: 'Language',
    },
    slots: {
      metadata: 'Metadata', taxonomy: 'Taxonomy', taxaBarplot: 'Taxonomic barplot',
      taxaCounts: 'Taxon × sample counts', alpha: 'Alpha diversity', beta: 'Beta diversity',
      differential: 'Differential abundance', fastq: 'FASTQ files',
    },
    common: {
      available: 'Available', noData: 'No data', goLoadData: 'Go to load data',
      loadRealExample: 'Load real example (16S microbiome study)',
      loadSyntheticExample: 'Load synthetic example (fast)',
      controls: 'Controls', loadingProcessing: 'Downloading and processing…',
    },
    home: {
      eyebrow: 'Microbiome analysis · no server',
      subtitle: 'Upload your QIIME2 results (or the already-exported files) and get the standard figures and tables instantly — barplots, alpha and beta diversity, differential abundance. Everything is computed in your browser: nothing is sent to any server.',
      ctaLoadedTitle: 'You already have data loaded in this session',
      ctaLoadedNote: 'Open a module from the menu to see the analysis, or upload more files.',
      ctaEmptyTitle: 'Start by uploading your QIIME2 results',
      ctaEmptyNote: 'Accepts <span class="mono">.qza</span>/<span class="mono">.qzv</span> artifacts directly (unpacked in the browser itself) or already-exported <span class="mono">.tsv</span>/<span class="mono">.csv</span> files.',
      ctaBtnMore: 'Go to load more data', ctaBtnLoad: 'Load data',
      summaryTitle: "What's loaded right now",
      summaryNote: 'A module may need more than one file (for example, alpha diversity needs the metric + the metadata with the groups).',
      modulesTitle: 'Modules',
      modulesNote: 'The plan is to keep expanding this list — each module is a standalone file in <span class="mono">js/modules/</span>.',
    },
    modules: {
      barplots: { desc: 'Relative composition per sample, coloured by taxon, with the least abundant categories grouped into “Other”.' },
      alpha: { desc: 'Boxplot by metadata group + Kruskal-Wallis test (non-parametric) to compare within-sample diversity.' },
      beta: { desc: 'Heatmap of the distance matrix, ordered by a UPGMA dendrogram (hierarchical clustering).' },
      differential: { desc: 'Interactive volcano plot from a DESeq2/ANCOM-BC-style table, with an R script generator based on your thresholds.' },
      venn: { desc: 'Shared and exclusive taxa between groups, from a counts table. Up to 4 groups with a Venn diagram; 5+ with an UpSet view.' },
      qc: { desc: 'FastQC-style quality report for your FASTQ files: per-position quality, base content, duplication, overrepresented sequences and more.' },
    },
    qc: {
      eyebrow: 'Quality of the raw reads',
      title: 'Sequence quality control',
      subtitle: 'Upload your FASTQ files (.fastq, .fq, .fastq.gz, .fq.gz) and get a FastQC-style quality report: per-position quality, base composition, duplication, adapters and more. Everything is computed in your browser, streaming — the file is not uploaded anywhere. It does not replace DADA2/QIIME2: these are descriptive statistics on the FASTQ as-is.',
      empty: {
        title: 'No FASTQ loaded yet',
        note: 'Drag one or more .fastq / .fq files (gzip-compressed or plain). If you upload several samples a comparison table is added.',
        drop: 'Drag your FASTQ files here or click to choose them',
        dropSub: '.fastq · .fq · .fastq.gz · .fq.gz — you can select several',
      },
      addMore: 'Add more FASTQ files',
      loadExampleReal: 'Load real example (16S FASTQ: R1 + R2)',
      analyzing: 'Analysing…',
      analyzeError: 'Could not analyse the file',
      pairedWith: 'paired with {name}',
      subsampleNote: 'Analysis based on a subsample of the first {n} reads (the file has ~{total} in total).',
      wholeFileNote: 'Analysis of the whole file: {n} reads.',
      bigFileWarn: 'Large file ({size}). Only a subsample of {n} reads will be processed.',
      maxReadsLabel: 'Reads to process per file',
      maxReadsHelp: 'Maximum reads analysed from each file. Raise it for more precision (slower); lower it if the browser struggles.',
      reanalyze: 'Re-analyse with this limit',
      verdict: { good: 'Good', warning: 'Warning', critical: 'Critical', na: '—' },
      overall: { title: 'Summary (traffic light)', note: 'A quick look at each check, with the FastQC-style colour code (green / amber / red).' },
      compare: {
        title: 'Sample comparison', note: 'All loaded samples, one row per file (MultiQC-style). Click a row to see its full report.',
        colFile: 'File', colReads: 'Reads', colLen: 'Mean length', colGC: '%GC', colQual: 'Mean quality', colDup: '% duplicated', colAdapter: '% adapter (max)',
      },
      stats: {
        title: 'Basic statistics',
        reads: 'Reads processed', readsEst: 'Estimated total in the file', length: 'Length (min / mean / max)',
        gc: 'Global %GC', meanQ: 'Mean quality (Phred)', encoding: 'Quality encoding', nContent: 'Global %N', totalBases: 'Bases analysed',
      },
      perPosQ: {
        title: 'Per-position quality',
        explain: 'For each position in the read, the distribution of the Phred quality score (median, interquartile range and 10–90 percentiles). Phred 20 = 1 error per 100 bases; Phred 30 = 1 per 1,000.',
        interpret: 'Quality dropping towards the end of the read is normal, especially for R2. If the median falls below 20–25 it is worth trimming those positions (truncation parameter in DADA2 / cutadapt).',
        bandGood: 'Phred ≥ 28', bandMid: 'Phred 20–28', bandBad: 'Phred < 20',
        verdictGood: 'Every position keeps a high median quality.',
        verdictWarn: 'Some positions (usually the 3′ end) drop below Phred 25 — consider trimming them.',
        verdictCrit: 'Some positions have a median below Phred 20 or a very low lower quartile: trim the end of the read before continuing.',
        colPos: 'Position', colMedian: 'Median', colQ25: 'Q1', colQ75: 'Q3', colMean: 'Mean',
      },
      seqQ: {
        title: 'Per-read mean quality',
        explain: 'How many reads there are for each mean-quality value. A single peak shifted to the right (high Phred) is what you want.',
        interpret: 'A second peak on the left (low quality) points to a subset of poor reads — often from specific areas of the flow cell.',
        verdictGood: 'Most reads have a high mean quality.',
        verdictWarn: 'The most frequent mean quality is between Phred 20 and 27 — acceptable but not ideal.',
        verdictCrit: 'The most frequent mean quality is below Phred 20 — many reads are unreliable.',
        colQ: 'Mean quality', colCount: 'Number of reads',
      },
      baseContent: {
        title: 'Per-position base composition',
        explain: 'Percentage of A, C, G and T at each position. In a random library the four lines would run almost parallel.',
        interpret: 'In amplicons (16S, ITS…) the first positions show the primer pattern and conserved regions: the lines separate a lot. That is expected, not a sequencing fault.',
        ampliconNote: 'FastQC would flag this as “warning” or “critical” for almost any amplicon. Here it is informational only.',
        verdictGood: 'Base composition is stable along the read.',
        verdictWarn: 'There is composition bias (typical of the primer in the first bases of an amplicon).',
        verdictCrit: 'Strong, sustained composition bias — normal for amplicons; check it if you expected a random library (metagenomics, RNA-seq).',
        colPos: 'Position',
      },
      nContent: {
        title: 'Per-position N content',
        explain: 'Percentage of uncalled bases (N) at each position. The sequencer writes N when it cannot decide the base.',
        interpret: 'It should be virtually 0 across the whole read. An N spike at a specific position points to a problem in that sequencing cycle.',
        verdictGood: 'Negligible N content.',
        verdictWarn: 'Some position exceeds 5 % N.',
        verdictCrit: 'Some position exceeds 20 % N — that stretch of the read is unreliable.',
      },
      gcDist: {
        title: 'Per-read %GC distribution',
        explain: 'How many reads there are for each %GC value. The dotted curve is a theoretical normal centred on the observed mean, as a visual reference.',
        interpret: 'A 16S amplicon has a fairly defined %GC, so a single narrow peak is expected. Several peaks may indicate contamination or a mix of very different organisms.',
        verdictGood: 'Single-peak GC distribution, close to the reference.',
        verdictWarn: 'The GC distribution departs somewhat from a normal (shoulders or slight skew).',
        verdictCrit: 'The GC distribution departs strongly from a normal — possible contamination or mixed libraries.',
        colGC: '%GC', colObs: 'Observed', colTheo: 'Theoretical',
      },
      lengthDist: {
        title: 'Read length distribution',
        explain: 'How many reads there are of each length.',
        interpret: 'FASTQ straight off the sequencer: all reads are the same length (e.g. 301 nt). If you have already run cutadapt/trimming, a range of lengths is normal.',
        verdictGood: 'All reads have the same length.',
        verdictWarn: 'There are several read lengths (normal if the file is already trimmed).',
        colLen: 'Length', colCount: 'Number of reads',
      },
      duplication: {
        title: 'Duplication levels',
        explain: 'Groups identical sequences and counts how many reads fall into each duplication level (appear 1 time, 2, 3…). It is an estimate over the subsample and over a bounded number of distinct sequences.',
        interpret: 'In random sequencing, heavy duplication indicates PCR over-amplification. In 16S amplicons it is the opposite: HEAVY duplication is expected, because the same ASV is sequenced thousands of times.',
        ampliconNote: 'For amplicons, a high value here is normal and you should not “de-duplicate”.',
        verdictGood: 'Low duplication level.',
        verdictWarn: 'Moderate duplication ({pct} % of reads duplicated).',
        verdictCrit: 'High duplication ({pct} % of reads duplicated) — normal for amplicons; for random libraries, check the PCR.',
        colLevel: 'Level (number of copies)', colReads: '% of reads', colSeqs: 'Number of sequences',
        remaining: 'Keeping a single copy of each sequence would leave {pct} % of the reads.',
        cappedNote: 'The first {n} distinct sequences were tracked (memory limit); the rest count as lightly duplicated.',
      },
      overrep: {
        title: 'Overrepresented sequences',
        explain: 'Exact sequences that on their own exceed 0.1 % of the reads.',
        interpret: 'In amplicons, the top ones are usually the sample’s dominant ASVs (real). Adapter or poly-G sequences here are a sign of a technical problem.',
        none: 'No sequence exceeds 0.1 % of the reads.',
        colSeq: 'Sequence (start)', colLen: 'Len.', colCount: 'Reads', colPct: '% of total',
        verdictGood: 'No overrepresented sequences.',
        verdictWarn: 'Some sequences exceed 0.1 % (expected in amplicons: dominant ASVs).',
        verdictCrit: 'Some sequences exceed 1 % of the reads.',
      },
      adapter: {
        title: 'Adapter content',
        explain: 'Cumulative percentage of reads containing an Illumina adapter k-mer from each position onward. It is a heuristic k-mer search, not the exact FastQC algorithm.',
        interpret: 'A curve rising towards the end of the read means the fragment is shorter than the read and the sequencer has read into the adapter — it must be trimmed (cutadapt).',
        none: 'No appreciable adapter content detected.',
        verdictGood: 'Negligible adapter content.',
        verdictWarn: 'Some adapter is detected ({pct} % max) — trim with cutadapt before DADA2.',
        verdictCrit: 'High adapter content ({pct} % max) — trim with cutadapt before continuing.',
        colPos: 'Position',
      },
      primer16S: {
        detected: '16S primer detected at the start of {pct} % of reads ({name}). The primer is still attached: trim it with cutadapt (step before DADA2).',
        notDetected: 'No 16S V3 primer detected at the start of the reads (or it is already trimmed).',
      },
      showTable: 'Show data table',
    },
  },

  it: {
    app: { loading: 'Caricamento…', moduleLoadError: 'Impossibile caricare questo modulo', unknownError: 'Errore sconosciuto.' },
    nav: {
      home: 'Panoramica', upload: 'Carica dati', barplots: 'Barplot tassonomici',
      alpha: 'Diversità alfa', beta: 'Diversità beta', differential: 'Abbondanza differenziale',
      venn: 'Venn / UpSet', qc: 'Controllo qualità (FASTQ)',
    },
    shell: {
      groupModules: 'Moduli', sessionData: 'Dati in questa sessione',
      footer: 'Tutto viene eseguito nel tuo browser — nulla viene caricato su un server.',
      noData: 'nessun dato', language: 'Lingua',
    },
    slots: {
      metadata: 'Metadati', taxonomy: 'Tassonomia', taxaBarplot: 'Barplot tassonomico',
      taxaCounts: 'Conteggi taxon × campione', alpha: 'Diversità alfa', beta: 'Diversità beta',
      differential: 'Abbondanza differenziale', fastq: 'File FASTQ',
    },
    common: {
      available: 'Disponibile', noData: 'Nessun dato', goLoadData: 'Vai a caricare i dati',
      loadRealExample: 'Carica esempio reale (studio di microbioma 16S)',
      loadSyntheticExample: 'Carica esempio sintetico (veloce)',
      controls: 'Controlli', loadingProcessing: 'Download ed elaborazione…',
    },
    home: {
      eyebrow: 'Analisi del microbioma · senza server',
      subtitle: 'Carica i risultati di QIIME2 (o i file già esportati) e ottieni subito le figure e le tabelle standard — barplot, diversità alfa e beta, abbondanza differenziale. Tutto viene calcolato nel tuo browser: nulla viene inviato a un server.',
      ctaLoadedTitle: 'Hai già dei dati caricati in questa sessione',
      ctaLoadedNote: "Apri un modulo dal menu per vedere l'analisi, oppure carica altri file.",
      ctaEmptyTitle: 'Inizia caricando i risultati di QIIME2',
      ctaEmptyNote: 'Accetta direttamente artefatti <span class="mono">.qza</span>/<span class="mono">.qzv</span> (decompressi nel browser stesso) o file <span class="mono">.tsv</span>/<span class="mono">.csv</span> già esportati.',
      ctaBtnMore: 'Vai a caricare altri dati', ctaBtnLoad: 'Carica dati',
      summaryTitle: 'Cosa è caricato in questo momento',
      summaryNote: 'Un modulo può richiedere più di un file (per esempio, la diversità alfa richiede la metrica + i metadati con i gruppi).',
      modulesTitle: 'Moduli',
      modulesNote: 'Il piano è continuare ad ampliare questa lista — ogni modulo è un file autonomo in <span class="mono">js/modules/</span>.',
    },
    modules: {
      barplots: { desc: 'Composizione relativa per campione, colorata per taxon, con le categorie meno abbondanti raggruppate in «Altri».' },
      alpha: { desc: 'Boxplot per gruppo di metadati + test di Kruskal-Wallis (non parametrico) per confrontare la diversità entro ciascun campione.' },
      beta: { desc: 'Mappa di calore della matrice delle distanze, ordinata con un dendrogramma UPGMA (clustering gerarchico).' },
      differential: { desc: 'Volcano plot interattivo da una tabella tipo DESeq2/ANCOM-BC, con generatore di script R basato sulle tue soglie.' },
      venn: { desc: 'Taxa condivisi ed esclusivi tra gruppi, da una tabella di conteggi. Fino a 4 gruppi con diagramma di Venn; 5+ con vista UpSet.' },
      qc: { desc: 'Report di qualità in stile FastQC dei tuoi file FASTQ: qualità per posizione, contenuto in basi, duplicazione, sequenze sovrarappresentate e altro.' },
    },
    qc: {
      eyebrow: 'Qualità delle letture grezze',
      title: 'Controllo qualità delle sequenze',
      subtitle: 'Carica i tuoi file FASTQ (.fastq, .fq, .fastq.gz, .fq.gz) e ottieni un report di qualità in stile FastQC. Tutto viene calcolato nel tuo browser, in streaming — il file non viene caricato da nessuna parte. Non sostituisce DADA2/QIIME2.',
      empty: {
        title: 'Nessun FASTQ ancora caricato',
        note: 'Trascina uno o più file .fastq / .fq (compressi .gz o non compressi). Con più campioni viene aggiunta una tabella comparativa.',
        drop: 'Trascina qui i tuoi FASTQ o clicca per sceglierli',
        dropSub: '.fastq · .fq · .fastq.gz · .fq.gz — puoi selezionarne diversi',
      },
      addMore: 'Aggiungi altri file FASTQ',
      loadExampleReal: 'Carica esempio reale (FASTQ 16S: R1 + R2)',
      analyzing: 'Analisi in corso…',
      analyzeError: 'Impossibile analizzare il file',
      verdict: { good: 'Bene', warning: 'Avviso', critical: 'Critico', na: '—' },
      overall: { title: 'Riepilogo (semaforo)', note: 'Uno sguardo rapido a ogni controllo, con il codice colore in stile FastQC (verde / giallo / rosso).' },
      compare: {
        title: 'Confronto tra campioni', note: 'Tutti i campioni caricati, una riga per file (stile MultiQC). Clicca una riga per il report completo.',
        colFile: 'File', colReads: 'Letture', colLen: 'Lungh. media', colGC: '%GC', colQual: 'Qualità media', colDup: '% duplicate', colAdapter: '% adattatore (max)',
      },
      stats: {
        title: 'Statistiche di base',
        reads: 'Letture elaborate', readsEst: 'Totale stimato nel file', length: 'Lunghezza (min / media / max)',
        gc: '%GC globale', meanQ: 'Qualità media (Phred)', encoding: 'Codifica qualità', nContent: '%N globale', totalBases: 'Basi analizzate',
      },
      perPosQ: { title: 'Qualità per posizione', colPos: 'Posizione', colMedian: 'Mediana', colQ25: 'Q1', colQ75: 'Q3', colMean: 'Media', bandGood: 'Phred ≥ 28', bandMid: 'Phred 20–28', bandBad: 'Phred < 20' },
      seqQ: { title: 'Qualità media per lettura', colQ: 'Qualità media', colCount: 'N. di letture' },
      baseContent: { title: 'Composizione delle basi per posizione', colPos: 'Posizione' },
      nContent: { title: 'Contenuto di N per posizione' },
      gcDist: { title: 'Distribuzione del %GC per lettura', colGC: '%GC', colObs: 'Osservate', colTheo: 'Teoriche' },
      lengthDist: { title: 'Distribuzione della lunghezza delle letture', colLen: 'Lunghezza', colCount: 'N. di letture' },
      duplication: { title: 'Livelli di duplicazione', colLevel: 'Livello (n. di copie)', colReads: '% di letture', colSeqs: 'N. di sequenze' },
      overrep: { title: 'Sequenze sovrarappresentate', none: 'Nessuna sequenza supera lo 0,1 % delle letture.', colSeq: 'Sequenza (inizio)', colLen: 'Lungh.', colCount: 'Letture', colPct: '% del totale' },
      adapter: { title: 'Contenuto di adattatori', none: 'Nessun contenuto di adattatore apprezzabile.', colPos: 'Posizione' },
      showTable: 'Mostra tabella dati',
    },
  },

  de: {
    app: { loading: 'Wird geladen…', moduleLoadError: 'Dieses Modul konnte nicht geladen werden', unknownError: 'Unbekannter Fehler.' },
    nav: {
      home: 'Übersicht', upload: 'Daten laden', barplots: 'Taxonomische Barplots',
      alpha: 'Alpha-Diversität', beta: 'Beta-Diversität', differential: 'Differenzielle Abundanz',
      venn: 'Venn / UpSet', qc: 'Qualitätskontrolle (FASTQ)',
    },
    shell: {
      groupModules: 'Module', sessionData: 'Daten in dieser Sitzung',
      footer: 'Alles läuft in deinem Browser — nichts wird auf einen Server hochgeladen.',
      noData: 'keine Daten', language: 'Sprache',
    },
    slots: {
      metadata: 'Metadaten', taxonomy: 'Taxonomie', taxaBarplot: 'Taxonomischer Barplot',
      taxaCounts: 'Zählungen Taxon × Probe', alpha: 'Alpha-Diversität', beta: 'Beta-Diversität',
      differential: 'Differenzielle Abundanz', fastq: 'FASTQ-Dateien',
    },
    common: {
      available: 'Verfügbar', noData: 'Keine Daten', goLoadData: 'Zu „Daten laden“',
      loadRealExample: 'Echtes Beispiel laden (16S-Mikrobiom-Studie)',
      loadSyntheticExample: 'Synthetisches Beispiel laden (schnell)',
      controls: 'Steuerung', loadingProcessing: 'Wird heruntergeladen und verarbeitet…',
    },
    home: {
      eyebrow: 'Mikrobiom-Analyse · ohne Server',
      subtitle: 'Lade deine QIIME2-Ergebnisse hoch (oder die bereits exportierten Dateien) und erhalte sofort die üblichen Abbildungen und Tabellen — Barplots, Alpha- und Beta-Diversität, differenzielle Abundanz. Alles wird in deinem Browser berechnet: nichts wird an einen Server gesendet.',
      ctaLoadedTitle: 'Du hast in dieser Sitzung bereits Daten geladen',
      ctaLoadedNote: 'Öffne ein Modul im Menü, um die Analyse zu sehen, oder lade weitere Dateien hoch.',
      ctaEmptyTitle: 'Beginne mit dem Hochladen deiner QIIME2-Ergebnisse',
      ctaEmptyNote: 'Akzeptiert <span class="mono">.qza</span>/<span class="mono">.qzv</span>-Artefakte direkt (im Browser selbst entpackt) oder bereits exportierte <span class="mono">.tsv</span>/<span class="mono">.csv</span>-Dateien.',
      ctaBtnMore: 'Weitere Daten laden', ctaBtnLoad: 'Daten laden',
      summaryTitle: 'Was gerade geladen ist',
      summaryNote: 'Ein Modul kann mehr als eine Datei benötigen (zum Beispiel braucht die Alpha-Diversität die Metrik + die Metadaten mit den Gruppen).',
      modulesTitle: 'Module',
      modulesNote: 'Der Plan ist, diese Liste weiter auszubauen — jedes Modul ist eine eigenständige Datei in <span class="mono">js/modules/</span>.',
    },
    modules: {
      barplots: { desc: 'Relative Zusammensetzung pro Probe, nach Taxon eingefärbt, wobei die am wenigsten häufigen Kategorien zu „Andere“ zusammengefasst werden.' },
      alpha: { desc: 'Boxplot nach Metadaten-Gruppe + Kruskal-Wallis-Test (nicht-parametrisch) zum Vergleich der Diversität innerhalb der Proben.' },
      beta: { desc: 'Heatmap der Distanzmatrix, geordnet nach einem UPGMA-Dendrogramm (hierarchisches Clustering).' },
      differential: { desc: 'Interaktiver Volcano-Plot aus einer Tabelle im DESeq2/ANCOM-BC-Stil, mit R-Skript-Generator auf Basis deiner Schwellenwerte.' },
      venn: { desc: 'Gemeinsame und exklusive Taxa zwischen Gruppen, aus einer Zähltabelle. Bis zu 4 Gruppen mit Venn-Diagramm; 5+ mit UpSet-Ansicht.' },
      qc: { desc: 'Qualitätsbericht im FastQC-Stil für deine FASTQ-Dateien: Qualität pro Position, Basengehalt, Duplikation, überrepräsentierte Sequenzen und mehr.' },
    },
    qc: {
      eyebrow: 'Qualität der Rohdaten-Reads',
      title: 'Sequenz-Qualitätskontrolle',
      subtitle: 'Lade deine FASTQ-Dateien (.fastq, .fq, .fastq.gz, .fq.gz) hoch und erhalte einen Qualitätsbericht im FastQC-Stil. Alles wird in deinem Browser im Streaming berechnet — die Datei wird nirgendwo hochgeladen. Ersetzt DADA2/QIIME2 nicht.',
      empty: {
        title: 'Noch keine FASTQ geladen',
        note: 'Ziehe eine oder mehrere .fastq / .fq-Dateien hierher (gzip-komprimiert oder unkomprimiert). Bei mehreren Proben wird eine Vergleichstabelle ergänzt.',
        drop: 'Ziehe deine FASTQ-Dateien hierher oder klicke zum Auswählen',
        dropSub: '.fastq · .fq · .fastq.gz · .fq.gz — mehrere möglich',
      },
      addMore: 'Weitere FASTQ-Dateien hinzufügen',
      loadExampleReal: 'Echtes Beispiel laden (16S-FASTQ: R1 + R2)',
      analyzing: 'Wird analysiert…',
      analyzeError: 'Datei konnte nicht analysiert werden',
      verdict: { good: 'Gut', warning: 'Warnung', critical: 'Kritisch', na: '—' },
      overall: { title: 'Zusammenfassung (Ampel)', note: 'Ein schneller Blick auf jede Prüfung, mit dem FastQC-Farbcode (grün / gelb / rot).' },
      compare: {
        title: 'Probenvergleich', note: 'Alle geladenen Proben, eine Zeile pro Datei (MultiQC-Stil). Klicke eine Zeile für den vollständigen Bericht.',
        colFile: 'Datei', colReads: 'Reads', colLen: 'Mittl. Länge', colGC: '%GC', colQual: 'Mittl. Qualität', colDup: '% dupliziert', colAdapter: '% Adapter (max)',
      },
      stats: {
        title: 'Basis-Statistik',
        reads: 'Verarbeitete Reads', readsEst: 'Geschätzte Gesamtzahl in der Datei', length: 'Länge (min / Mittel / max)',
        gc: 'Globaler %GC', meanQ: 'Mittlere Qualität (Phred)', encoding: 'Qualitätskodierung', nContent: 'Globaler %N', totalBases: 'Analysierte Basen',
      },
      perPosQ: { title: 'Qualität pro Position', colPos: 'Position', colMedian: 'Median', colQ25: 'Q1', colQ75: 'Q3', colMean: 'Mittel', bandGood: 'Phred ≥ 28', bandMid: 'Phred 20–28', bandBad: 'Phred < 20' },
      seqQ: { title: 'Mittlere Qualität pro Read', colQ: 'Mittlere Qualität', colCount: 'Anzahl Reads' },
      baseContent: { title: 'Basenzusammensetzung pro Position', colPos: 'Position' },
      nContent: { title: 'N-Gehalt pro Position' },
      gcDist: { title: '%GC-Verteilung pro Read', colGC: '%GC', colObs: 'Beobachtet', colTheo: 'Theoretisch' },
      lengthDist: { title: 'Verteilung der Read-Länge', colLen: 'Länge', colCount: 'Anzahl Reads' },
      duplication: { title: 'Duplikationsstufen', colLevel: 'Stufe (Anzahl Kopien)', colReads: '% der Reads', colSeqs: 'Anzahl Sequenzen' },
      overrep: { title: 'Überrepräsentierte Sequenzen', none: 'Keine Sequenz überschreitet 0,1 % der Reads.', colSeq: 'Sequenz (Anfang)', colLen: 'Länge', colCount: 'Reads', colPct: '% des Gesamt' },
      adapter: { title: 'Adaptergehalt', none: 'Kein nennenswerter Adaptergehalt erkannt.', colPos: 'Position' },
      showTable: 'Datentabelle anzeigen',
    },
  },

  zh: {
    app: { loading: '加载中…', moduleLoadError: '无法加载此模块', unknownError: '未知错误。' },
    nav: {
      home: '概览', upload: '加载数据', barplots: '分类学条形图',
      alpha: 'Alpha 多样性', beta: 'Beta 多样性', differential: '差异丰度',
      venn: 'Venn / UpSet', qc: '质量控制（FASTQ）',
    },
    shell: {
      groupModules: '模块', sessionData: '本次会话的数据',
      footer: '所有处理都在你的浏览器中进行——不会上传到任何服务器。',
      noData: '无数据', language: '语言',
    },
    slots: {
      metadata: '元数据', taxonomy: '分类学', taxaBarplot: '分类学条形图',
      taxaCounts: '类群 × 样本 计数', alpha: 'Alpha 多样性', beta: 'Beta 多样性',
      differential: '差异丰度', fastq: 'FASTQ 文件',
    },
    common: {
      available: '可用', noData: '无数据', goLoadData: '前往加载数据',
      loadRealExample: '加载真实示例（16S 微生物组研究）',
      loadSyntheticExample: '加载合成示例（快速）',
      controls: '控制项', loadingProcessing: '正在下载和处理…',
    },
    home: {
      eyebrow: '微生物组分析 · 无服务器',
      subtitle: '上传你的 QIIME2 结果（或已导出的文件），立即获得标准图表——条形图、Alpha 和 Beta 多样性、差异丰度。所有计算都在你的浏览器中完成：不会发送到任何服务器。',
      ctaLoadedTitle: '本次会话已加载数据',
      ctaLoadedNote: '从菜单打开一个模块查看分析，或上传更多文件。',
      ctaEmptyTitle: '先上传你的 QIIME2 结果',
      ctaEmptyNote: '可直接接受 <span class="mono">.qza</span>/<span class="mono">.qzv</span> 制品（在浏览器中解包），或已导出的 <span class="mono">.tsv</span>/<span class="mono">.csv</span> 文件。',
      ctaBtnMore: '前往加载更多数据', ctaBtnLoad: '加载数据',
      summaryTitle: '当前已加载的内容',
      summaryNote: '一个模块可能需要多个文件（例如，Alpha 多样性需要指标 + 含分组的元数据）。',
      modulesTitle: '模块',
      modulesNote: '计划会持续扩充此列表——每个模块都是 <span class="mono">js/modules/</span> 中的独立文件。',
    },
    modules: {
      barplots: { desc: '按样本显示相对组成，按类群着色，丰度最低的类别归入「其他」。' },
      alpha: { desc: '按元数据分组的箱线图 + Kruskal-Wallis 检验（非参数），用于比较样本内多样性。' },
      beta: { desc: '距离矩阵的热图，按 UPGMA 树状图（层次聚类）排序。' },
      differential: { desc: '基于 DESeq2/ANCOM-BC 类型表格的交互式火山图，可按你的阈值生成 R 脚本。' },
      venn: { desc: '基于计数表显示各分组间共享和特有的类群。最多 4 组用 Venn 图；5 组及以上用 UpSet 视图。' },
      qc: { desc: '对 FASTQ 文件的 FastQC 风格质量报告：每位置质量、碱基组成、重复水平、过度代表序列等。' },
    },
    qc: {
      eyebrow: '原始读长的质量',
      title: '序列质量控制',
      subtitle: '上传你的 FASTQ 文件（.fastq、.fq、.fastq.gz、.fq.gz），获得 FastQC 风格的质量报告。所有计算都在浏览器中以流式方式完成——文件不会上传到任何地方。它不能替代 DADA2/QIIME2。',
      empty: {
        title: '尚未加载任何 FASTQ',
        note: '拖入一个或多个 .fastq / .fq 文件（gzip 压缩或未压缩）。上传多个样本时会附加一个对比表。',
        drop: '将 FASTQ 文件拖到此处，或点击选择',
        dropSub: '.fastq · .fq · .fastq.gz · .fq.gz — 可多选',
      },
      addMore: '添加更多 FASTQ 文件',
      loadExampleReal: '加载真实示例（16S FASTQ：R1 + R2）',
      analyzing: '正在分析…',
      analyzeError: '无法分析该文件',
      verdict: { good: '良好', warning: '警告', critical: '严重', na: '—' },
      overall: { title: '总览（红绿灯）', note: '快速查看每一项检查，采用 FastQC 风格的颜色编码（绿 / 黄 / 红）。' },
      compare: {
        title: '样本对比', note: '所有已加载样本，每个文件一行（MultiQC 风格）。点击某一行查看其完整报告。',
        colFile: '文件', colReads: '读长数', colLen: '平均长度', colGC: '%GC', colQual: '平均质量', colDup: '% 重复', colAdapter: '% 接头（最大）',
      },
      stats: {
        title: '基本统计',
        reads: '已处理读长', readsEst: '文件估计总数', length: '长度（最小 / 平均 / 最大）',
        gc: '全局 %GC', meanQ: '平均质量（Phred）', encoding: '质量编码', nContent: '全局 %N', totalBases: '已分析碱基',
      },
      perPosQ: { title: '每位置质量', colPos: '位置', colMedian: '中位数', colQ25: 'Q1', colQ75: 'Q3', colMean: '平均', bandGood: 'Phred ≥ 28', bandMid: 'Phred 20–28', bandBad: 'Phred < 20' },
      seqQ: { title: '每条读长的平均质量', colQ: '平均质量', colCount: '读长数' },
      baseContent: { title: '每位置碱基组成', colPos: '位置' },
      nContent: { title: '每位置 N 含量' },
      gcDist: { title: '每条读长的 %GC 分布', colGC: '%GC', colObs: '观测', colTheo: '理论' },
      lengthDist: { title: '读长长度分布', colLen: '长度', colCount: '读长数' },
      duplication: { title: '重复水平', colLevel: '水平（拷贝数）', colReads: '% 读长', colSeqs: '序列数' },
      overrep: { title: '过度代表序列', none: '没有序列超过读长的 0.1%。', colSeq: '序列（开头）', colLen: '长度', colCount: '读长数', colPct: '占总数 %' },
      adapter: { title: '接头含量', none: '未检测到明显的接头含量。', colPos: '位置' },
      showTable: '显示数据表',
    },
  },
};

let currentLang = readStoredLang();
const listeners = new Set();

function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && DICTS[v]) return v;
  } catch (e) { /* localStorage puede lanzar en modo privado */ }
  return DEFAULT_LANG;
}

function lookup(dict, key) {
  if (!dict) return undefined;
  let cur = dict;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

/** Traduce `key` al idioma activo. Cae a español y luego a la propia clave. */
export function t(key, params) {
  const val = lookup(DICTS[currentLang], key)
    ?? lookup(DICTS[DEFAULT_LANG], key)
    ?? key;
  return interpolate(val, params);
}

export function getLang() { return currentLang; }

export function setLang(code) {
  if (!DICTS[code] || code === currentLang) return;
  currentLang = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
  try { document.documentElement.lang = code; } catch (e) { /* ignore */ }
  listeners.forEach((fn) => { try { fn(code); } catch (e) { /* noop */ } });
}

/** Se ejecuta `fn` cada vez que cambia el idioma. Devuelve una función para desuscribirse. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// deja el <html lang> sincronizado desde el arranque
try { document.documentElement.lang = currentLang; } catch (e) { /* ignore */ }
