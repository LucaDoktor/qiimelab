// paletteCatalog.js — catálogo ampliado de paletas seleccionables en el
// editor de gráficos (Fase 2, Paso 1 de qiimelab-prompt-editor-fase-2-
// paletas-relleno-series.md). NO sustituye la paleta por defecto de la app
// (esa sigue en js/lib/palettes.js, CATEGORICAL/SEQUENTIAL/DIVERGENT) — son
// opciones ADICIONALES que el usuario puede elegir desde el desplegable de
// "Paleta de la figura" en chartEditor.js.
//
// Generadas y validadas contra js/lib/paletteValidator.js (mismo criterio
// ΔE/CVD/contraste que tests/palettes.mjs ya aplica a la paleta por
// defecto) en la sesión de cowork del 21-22 sep 2026 — ver
// "Claude outputs/assets/palettes_validated.json" (fuente de estos datos,
// no se lee en tiempo de ejecución: sin build step, así que el catálogo va
// literal aquí). Las 2 entradas 'smart175'/'smart175-div' de ese JSON se
// excluyen a propósito: son la paleta por defecto ya existente, no una
// opción nueva.
//
// Fuentes: Okabe & Ito 2008 (dominio público/atribución); Paul Tol, SRON
// Technical Note (uso libre con atribución, personal.sron.nl/~pault);
// ColorBrewer (Brewer & Harrower, Penn State — Apache-2.0 vía matplotlib);
// viridis/magma/inferno/plasma/cividis (matplotlib, CC0); coolwarm
// (Moreland 2009, BSD/matplotlib vía matplotlib).
//
// overflowMode: qué color devuelve resolvePaletteColors() (palettes.js)
// para el índice N+1 cuando N > colors.length. 'cycle' en las categóricas
// (recicla desde el principio — mismo comportamiento ya establecido para
// la paleta categórica por defecto: un tono repetido sigue distinguiendo
// más que inventar uno sin validar). 'clamp' en secuenciales/divergentes
// (repite el tono más extremo — ciclar una rampa continua rompería la
// lectura de "orden" que la define). maxSafeN/maxCleanN (solo
// categóricas, de paletteValidator.js): nº de series hasta el que la
// paleta sigue siendo distinguible sin fallos duros/limpios bajo las 3
// dicromacias simuladas — el editor avisa (sin bloquear) si se aplica a
// más series de las que maxSafeN cubre, en vez de fingir que toda paleta
// categórica sirve para cualquier nº de series por igual.
//
// type: 'qualitative' (categórica, series discretas) | 'sequential' (un
// solo tono, orden — abundancia/distancia) | 'diverging' (dos tonos +
// centro neutro — signo +/−, como el log2FC o una correlación).

export const PALETTE_CATALOG = [
  { id: "okabe-ito", name: "Okabe-Ito (Wong)", type: "qualitative", overflowMode: "cycle", maxSafeN: 6, maxCleanN: 2, source: "Okabe & Ito 2008; Wong, Nature Methods 2011", license: "dominio público / atribución", colors: ["#e69f00", "#56b4e9", "#009e73", "#f0e442", "#0072b2", "#d55e00", "#cc79a7", "#000000"] },
  { id: "tol-bright", name: "Paul Tol · Bright", type: "qualitative", overflowMode: "cycle", maxSafeN: 2, maxCleanN: 1, source: "Paul Tol, SRON Technical Note (personal.sron.nl/~pault)", license: "uso libre con atribución", colors: ["#4477aa", "#ee6677", "#228833", "#ccbb44", "#66ccee", "#aa3377", "#bbbbbb"] },
  { id: "tol-vibrant", name: "Paul Tol · Vibrant", type: "qualitative", overflowMode: "cycle", maxSafeN: 4, maxCleanN: 3, source: "Paul Tol, SRON Technical Note", license: "uso libre con atribución", colors: ["#ee7733", "#0077bb", "#33bbee", "#ee3377", "#cc3311", "#009988", "#bbbbbb"] },
  { id: "tol-muted", name: "Paul Tol · Muted", type: "qualitative", overflowMode: "cycle", maxSafeN: 6, maxCleanN: 3, source: "Paul Tol, SRON Technical Note", license: "uso libre con atribución", colors: ["#cc6677", "#332288", "#ddcc77", "#117733", "#88ccee", "#882255", "#44aa99", "#999933", "#aa4499", "#dddddd"] },
  { id: "tol-highcontrast", name: "Paul Tol · High-contrast (3)", type: "qualitative", overflowMode: "cycle", maxSafeN: 3, maxCleanN: 3, source: "Paul Tol, SRON Technical Note", license: "uso libre con atribución", colors: ["#004488", "#ddaa33", "#bb5566"] },
  { id: "brewer-set1", name: "ColorBrewer · Set1", type: "qualitative", overflowMode: "cycle", maxSafeN: 2, maxCleanN: 2, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33", "#a65628", "#f781bf", "#999999"] },
  { id: "brewer-set2", name: "ColorBrewer · Set2", type: "qualitative", overflowMode: "cycle", maxSafeN: 2, maxCleanN: 1, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"] },
  { id: "brewer-dark2", name: "ColorBrewer · Dark2", type: "qualitative", overflowMode: "cycle", maxSafeN: 3, maxCleanN: 1, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666"] },
  { id: "brewer-paired", name: "ColorBrewer · Paired", type: "qualitative", overflowMode: "cycle", maxSafeN: 2, maxCleanN: 2, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c", "#fdbf6f", "#ff7f00", "#cab2d6", "#6a3d9a", "#ffff99", "#b15928"] },
  { id: "brewer-set3", name: "ColorBrewer · Set3", type: "qualitative", overflowMode: "cycle", maxSafeN: 2, maxCleanN: 2, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#8dd3c7", "#ffffb3", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#d9d9d9", "#bc80bd", "#ccebc5", "#ffed6f"] },
  { id: "brewer-accent", name: "ColorBrewer · Accent", type: "qualitative", overflowMode: "cycle", maxSafeN: 2, maxCleanN: 1, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0", "#f0027f", "#bf5b17", "#666666"] },
  { id: "brewer-pastel1", name: "ColorBrewer · Pastel1", type: "qualitative", overflowMode: "cycle", maxSafeN: 1, maxCleanN: 1, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4", "#fed9a6", "#ffffcc", "#e5d8bd", "#fddaec", "#f2f2f2"] },
  { id: "brewer-pastel2", name: "ColorBrewer · Pastel2", type: "qualitative", overflowMode: "cycle", maxSafeN: 1, maxCleanN: 1, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#b3e2cd", "#fdcdac", "#cbd5e8", "#f4cae4", "#e6f5c9", "#fff2ae", "#f1e2cc", "#cccccc"] },
  { id: "brewer-blues", name: "ColorBrewer · Blues", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"] },
  { id: "brewer-greens", name: "ColorBrewer · Greens", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"] },
  { id: "brewer-oranges", name: "ColorBrewer · Oranges", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#fff5eb", "#fee6ce", "#fdd0a2", "#fdae6b", "#fd8d3c", "#f16913", "#d94801", "#a63603", "#7f2704"] },
  { id: "brewer-purples", name: "ColorBrewer · Purples", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#fcfbfd", "#efedf5", "#dadaeb", "#bcbddc", "#9e9ac8", "#807dba", "#6a51a3", "#54278f", "#3f007d"] },
  { id: "brewer-reds", name: "ColorBrewer · Reds", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#fff5f0", "#fee0d2", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"] },
  { id: "brewer-greys", name: "ColorBrewer · Greys", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#ffffff", "#f0f0f0", "#d9d9d9", "#bdbdbd", "#969696", "#737373", "#525252", "#252525", "#000000"] },
  { id: "brewer-ylgnbu", name: "ColorBrewer · YlGnBu", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#ffffd9", "#edf8b1", "#c7e9b4", "#7fcdbb", "#41b6c4", "#1d91c0", "#225ea8", "#253494", "#081d58"] },
  { id: "brewer-ylorrd", name: "ColorBrewer · YlOrRd", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"] },
  { id: "brewer-bugn", name: "ColorBrewer · BuGn", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#f7fcfd", "#e5f5f9", "#ccece6", "#99d8c9", "#66c2a4", "#41ae76", "#238b45", "#006d2c", "#00441b"] },
  { id: "brewer-gnbu", name: "ColorBrewer · GnBu", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#f7fcf0", "#e0f3db", "#ccebc5", "#a8ddb5", "#7bccc4", "#4eb3d3", "#2b8cbe", "#0868ac", "#084081"] },
  { id: "brewer-pubugn", name: "ColorBrewer · PuBuGn", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#fff7fb", "#ece2f0", "#d0d1e6", "#a6bddb", "#67a9cf", "#3690c0", "#02818a", "#016c59", "#014636"] },
  { id: "brewer-orrd", name: "ColorBrewer · OrRd", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#fff7ec", "#fee8c8", "#fdd49e", "#fdbb84", "#fc8d59", "#ef6548", "#d7301f", "#b30000", "#7f0000"] },
  { id: "viridis", name: "Viridis", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "viridis (van der Walt & Smith) via matplotlib", license: "CC0 (matplotlib colormap data)", colors: ["#440154", "#482475", "#414487", "#355f8d", "#2a788e", "#21918c", "#22a884", "#44bf70", "#7ad151", "#bddf26", "#fde725"] },
  { id: "magma", name: "Magma", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "magma via matplotlib", license: "CC0 (matplotlib colormap data)", colors: ["#000004", "#140e36", "#3b0f70", "#641a80", "#8c2981", "#b73779", "#de4968", "#f7705c", "#fe9f6d", "#fecf92", "#fcfdbf"] },
  { id: "inferno", name: "Inferno", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "inferno via matplotlib", license: "CC0 (matplotlib colormap data)", colors: ["#000004", "#160b39", "#420a68", "#6a176e", "#932667", "#bc3754", "#dd513a", "#f37819", "#fca50a", "#f6d746", "#fcffa4"] },
  { id: "plasma", name: "Plasma", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "plasma via matplotlib", license: "CC0 (matplotlib colormap data)", colors: ["#0d0887", "#41049d", "#6a00a8", "#8f0da4", "#b12a90", "#cc4778", "#e16462", "#f2844b", "#fca636", "#fcce25", "#f0f921"] },
  { id: "cividis", name: "Cividis", type: "sequential", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "cividis (Nuñez, Anderton & Renslow 2018) via matplotlib", license: "CC0 (matplotlib colormap data)", colors: ["#00224e", "#083370", "#35456c", "#4f576c", "#666970", "#7d7c78", "#948e77", "#aea371", "#c8b866", "#e5cf52", "#fee838"] },
  { id: "brewer-rdbu", name: "ColorBrewer · RdBu", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"] },
  { id: "brewer-rdylbu", name: "ColorBrewer · RdYlBu", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee090", "#ffffbf", "#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"] },
  { id: "brewer-brbg", name: "ColorBrewer · BrBG", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#35978f", "#01665e", "#003c30"] },
  { id: "brewer-piyg", name: "ColorBrewer · PiYG", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#8e0152", "#c51b7d", "#de77ae", "#f1b6da", "#fde0ef", "#f7f7f7", "#e6f5d0", "#b8e186", "#7fbc41", "#4d9221", "#276419"] },
  { id: "brewer-prgn", name: "ColorBrewer · PRGn", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#40004b", "#762a83", "#9970ab", "#c2a5cf", "#e7d4e8", "#f7f7f7", "#d9f0d3", "#a6dba0", "#5aae61", "#1b7837", "#00441b"] },
  { id: "brewer-puor", name: "ColorBrewer · PuOr", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#7f3b08", "#b35806", "#e08214", "#fdb863", "#fee0b6", "#f7f7f7", "#d8daeb", "#b2abd2", "#8073ac", "#542788", "#2d004b"] },
  { id: "brewer-spectral", name: "ColorBrewer · Spectral", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#9e0142", "#d53e4f", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#e6f598", "#abdda4", "#66c2a5", "#3288bd", "#5e4fa2"] },
  { id: "brewer-rdgy", name: "ColorBrewer · RdGy", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#ffffff", "#e0e0e0", "#bababa", "#878787", "#4d4d4d", "#1a1a1a"] },
  { id: "brewer-rdylgn", name: "ColorBrewer · RdYlGn", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "ColorBrewer (C. Brewer, M. Harrower, Penn State) via matplotlib", license: "Apache-2.0", colors: ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837"] },
  { id: "coolwarm", name: "Moreland · coolwarm", type: "diverging", overflowMode: "clamp", maxSafeN: null, maxCleanN: null, source: "K. Moreland (2009) via matplotlib", license: "BSD/matplotlib", colors: ["#3b4cc0", "#5977e3", "#7b9ff9", "#9ebeff", "#c0d4f5", "#dddcdc", "#f2cbb7", "#f7ac8e", "#ee8468", "#d65244", "#b40426"] },
];
