# tests/

Verificación de QiimeLab. Todo es Node ESM sin dependencias de `npm`
(`node ≥ 20`). Los tests de navegador usan Chrome/Chromium headless vía CDP;
los de estadística comparan contra R cuando está disponible (`stats/primertm.mjs`
compara contra Biopython en vez de R, mismo patrón GOLDEN + recálculo en vivo).

```
node tests/run.mjs              # todo, con resumen final
node tests/run.mjs stats        # solo tests/stats/*
node tests/run.mjs contrast cvd # solo esos
node tests/<archivo>.mjs        # un test suelto
```

Cada test sale con **0** (pasa), **1** (falla) o **2** (se salta: falta
Chrome, R, un paquete de R, o Biopython). El runner sale ≠ 0 solo si algo
**falla**; los saltados no cuentan.

## Qué cubre cada archivo

| archivo | tipo | qué comprueba |
|---|---|---|
| `sweep-routes.mjs` | navegador | Las 19 rutas/subvistas (18 módulos + la subvista "Red" del correlograma) en **claro y oscuro**, con todos los ejemplos cargados. Incluye `#/glosario` con su filtro de texto y sus `<details>`. Falla ante cualquier `console.error` / excepción. |
| `sweep-session.mjs` | navegador | Ciclo `exportSession()` → `clearAllState()` → `importSession()` → re-barrido. Canarios numéricos (nº taxa, KW H/p, % var PCoA, profundidad mín. de rarefacción, nº comparaciones…) **idénticos bit a bit** y **0** referencias `sourceFileId` colgadas. |
| `sweep-a11y.mjs` | navegador | Heurísticas por ruta × tema: nombre accesible en cada `button`/`a`, etiqueta en cada `input`/`select`, `aria-label` en cada `svg[role=img]`, una `<main tabindex=-1>`, enlace “saltar al contenido”, `<nav aria-label>`, `aria-current` en la navegación activa. |
| `keyboard-editor.mjs` | navegador | El editor de gráficos con **solo teclado**: foco en el tirador, flechas mueven (Shift = paso mayor), Intro abre el panel (el foco entra), Escape cierra y devuelve el foco, la posición persiste en `localStorage`. |
| `session-ui.mjs` | navegador | Los botones de guardar/cargar sesión en `#/cargar` + el modal de confirmación de carga: `role=dialog`, `aria-modal`, `aria-labelledby` real, foco en el botón de aceptar, Escape cierra resolviendo `false`. |
| `compare-overlap.mjs` | navegador | Vista “Comparar varias”: recalcula el solapamiento de significativos (`padj < 0.05`) desde los 3 CSV de `datos-ejemplo/` y comprueba que las regiones del diagrama de Venn y el histograma “sig. en N de M” de la UI coinciden. |
| `datahealth.mjs` | estático | Fixtures de `checkDataHealth()`: id duplicado, muestra de más/menos, celda de grupo vacía, los 4 a la vez, tolerancia de sufijos → encuentra **exactamente** cada fallo. |
| `primerdimers.mjs` | estático | `scanDimer()`/`scanHairpin()` (`js/lib/primerDimers.js`): un primer con un palíndromo GC fuerte (auto-dímero) frente a otro sin ninguna base complementaria a sí misma (poli-A); una horquilla diseñada a mano (dos brazos GC con un bucle) frente al mismo poli-A; una pareja con cola 3' complementaria frente a una pareja sin relación; y que `buildDimerMatrix()` no recalcule cada pareja dos veces. |
| `primertemplate.mjs` | estático | `parseFasta()`/`findPrimerSites()`/`findAmplicons()` (`js/lib/primerTemplate.js`): plantilla construida a mano con un primer insertado literal (hebra `+`) y otro como su complementario inverso (hebra `-`) → posición exacta y amplicón correcto; un mismatch introducido a propósito en el extremo 3' desaparece con tolerancia 0 y aparece marcado como crítico con tolerancia 1. |
| `primercoverage.mjs` | estático | `computeCoverage()`/`groupCoverageByTaxon()`/`buildTaxonomyMap()` (`js/lib/primerCoverage.js`): 4 referencias (2 con el primer, 2 sin él) agrupadas en 2 grupos taxonómicos (uno 100% cubierto, el otro 0%); cobertura de una pareja (amplicón) cuando solo una referencia tiene los dos sitios; alias de columnas id/taxonomía habituales. |
| `palettes.mjs` | estático | `paletteValidator.js` (distancia OKLab, simulación de dicromacia Machado 2009, contraste WCAG) marca un par rojo/verde de igual luminosidad como confuso en protanopía/deuteranopía (y NO marca rojo/verde "puros", que sí se distinguen por brillo); las 3 paletas por defecto (`js/lib/palettes.js`) pasan con el mismo criterio que ya usan `cvd.mjs`/`contrast.mjs` para `--cat-*`. |
| `primerdesign.mjs` | estático | `designPrimers()` (`js/lib/primerDesign.js`): sobre una plantilla con 515F/806R real embebido cerca (producto ~129 pb) y un primer sintético embebido lejos (~749 pb), el modo qPCR solo da parejas de 121-140 pb y el modo estándar da parejas de 612-799 pb (que qPCR rechazaría por tamaño); una secuencia duplicada en la plantilla se excluye de los candidatos (especificidad); cambiar el tope de tamaño a mano lo respeta; `confirmSpecificity()` (reutiliza `findPrimerSites` de `primerTemplate.js`) confirma 1 sola aparición de cada primer de la mejor pareja. |
| `phyloalign.mjs` | estático | `needlemanWunsch()`/`buildProgressiveAlignment()` (`js/lib/phyloAlign.js`): secuencias idénticas sin huecos, una inserción conocida produce exactamente 1 hueco neto, máxima divergencia en secuencias de igual longitud no desplaza el marco; el alineamiento progresivo de 4 secuencias (guía UPGMA real) da una MSA de anchura única cuya versión sin huecos reconstruye cada secuencia original byte a byte, y la p-distance de la pareja casi idéntica sale muy por debajo de la de la pareja divergente. |
| `privacy.mjs` | estático | 2 pasadas de literales prohibidos (listas `LEAK_A` + `LEAK_B` en base64, las mismas que `VW_Final/scripts/verify_recursos_qiimelab.mjs`) sobre todo el árbol de código y datos de ejemplo, o sobre un rango git (`node tests/privacy.mjs 08b51af..HEAD`). |
| `contrast.mjs` | estático | Contraste WCAG AA de los pares texto/fondo y componente/fondo, en claro y oscuro. Colores resueltos desde `css/tokens.css` (sigue al archivo). Falla si algún par de texto/UI incumple AA **sin** justificación documentada. |
| `cvd.mjs` | estático | Simulación de proto/deutero/tritanopía (Machado 2009) sobre la paleta de datos. **Gate**: el par divergente `--corr-pos` × `--corr-neg` (único canal solo-color) ≥ ΔE 8 en las 3 dicromacias. La paleta categórica se informa (adyacentes < 8 por protan./deuter. bloquean; solo por tritanopía se aceptan). |
| `forcelayout.mjs` | estático | Invariantes de `forceLayout()`: (a) sin NaN/Infinity, (b) componentes conexas separadas (ratio > 1.5), (c) misma semilla → coordenadas **bit-idénticas**. |
| `stats/diversity.mjs` | R (`vegan`) | `shannonIndex`, `simpsonIndex`, `observedRichness`, `pielouEvenness`, `chao1` vs `vegan::diversity` / `estimateR`, en 6 muestras reales + 2 vectores sintéticos con singletons. |
| `stats/rarefaction.mjs` | R (`vegan`) | `rarefactionCurve()` (Hurlbert 1971) vs `vegan::rarefy()` en 3 muestras reales, en las profundidades que devuelve la curva. |
| `stats/richness.mjs` | R (`vegan`) | `incidenceRichnessEstimators()` vs `vegan::specpool()` (Chao2, jack1/2, bootstrap **y sus SE**) en 3 grupos de muestras reales. |
| `stats/kruskalwallis.mjs` | R base | `kruskalWallis()` → `{H, df, p}` vs `kruskal.test()` (H con corrección por empates + p chi²). |
| `stats/correlation.mjs` | R base | `pearson()` / `spearman()` → `{r, p, n}` vs `cor.test()` (Spearman = Pearson sobre rangos). |
| `stats/incompletebeta.mjs` | R base | `incompleteBeta()` vs `pbeta()` y `studentTwoTailedP()` vs `2·pt(-|t|, df)`. |
| `stats/chisquare.mjs` | R base | `chiSquarePValue()` vs `pchisq(x, df, lower.tail = FALSE)`. |
| `stats/benjaminihochberg.mjs` | R base | `benjaminiHochberg()` vs `p.adjust(p, method = "BH")`. |
| `stats/cliffsdelta.mjs` | R (`effsize`) | `cliffsDelta()` vs `effsize::cliff.delta()$estimate`. |
| `stats/countsummary.mjs` | R base | `summariseCountSeries()` (recuento microbiano): media/SD/SE en log10 por grupo vs. `mean()` / `sd()` / `sd()/sqrt(n)`; además comprueba la exclusión de celdas `#NUM!` / 0 y la vía "el valor ya viene en log10". |
| `stats/permanova.mjs` | R (`vegan`) | `permanova()` (PERMANOVA de un factor): Df, sumas de cuadrados, pseudo-F y R² **exactos** vs `vegan::adonis2`; el p-valor (estocástico) se comprueba por rango + determinismo. |
| `stats/neighborjoining.mjs` | R (`ape`) | `neighborJoining()` (`js/lib/neighborJoining.js`) sobre el ejemplo de 5 taxones publicado en la entrada de Wikipedia "Neighbor joining": las distancias patrísticas reconstruyen la matriz original **exacto** (el árbol es perfectamente aditivo) vs `ape::nj()` + `cophenetic()`; además las 7 longitudes de rama con nombre del artículo (a=2, b=3, u→v=3, c=4, v→w=2, d=2, e=1) y los casos n=2/n=3. |
| `stats/phylodistance.mjs` | R (`ape`) | `pDistance()`/`jukesCantorCorrection()` (`js/lib/phyloDistance.js`) vs `ape::dist.dna(model="raw"/"JC69", pairwise.deletion=TRUE)`: proporción de sitios distintos con huecos excluidos por pares, saturación (NaN) de JC69 a p≥0,75, y `buildDistanceMatrix()` capando el par saturado. |
| `stats/primertm.mjs` | Biopython | `tmNN()`/`meltingTemp()` (`js/lib/primerAnalysis.js`, Tm de vecino más próximo SantaLucia 1998) vs `Bio.SeqUtils.MeltingTemp.Tm_NN` (`nn_table=DNA_NN3`, `saltcorr=5`) — 10 casos (secuencias concretas, sal/concentración de primer variadas) + el primer degenerado 515F (4 resoluciones IUPAC → min/max/media). |
| `mobile-audit.mjs` | navegador | Recorre las 19 rutas a 375px y 768px con todos los ejemplos cargados. **Falla** si alguna ruta ensancha el layout más allá del viewport (ratio > 1.04 → scroll-x del body). Los casos "apretado" (ratio 1.0–1.04) se informan pero no fallan. |
| `pwa.mjs` | estático + navegador | `manifest.json` es JSON válido con los campos obligatorios y sus iconos existen; `index.html` enlaza el manifest. Con navegador: el service worker registra, activa y controla la página tras la 1ª carga; con la red simulada offline por CDP una 2ª navegación sigue sirviendo el shell (sidebar + main + footer) desde caché sin errores; y el evento `offline`/`online` muestra/oculta el banner "sin conexión" de `js/lib/pwa.js`. |
| `perf-stress.mjs` | navegador | Genera un dataset de estrés (260 muestras × 2800 taxones, semilla fija, **no** en `datos-ejemplo/`) y cronometra las 4 operaciones pesadas midiendo el "jank" (hueco máximo entre frames de `requestAnimationFrame`). **Falla** si la ruta migrada a Web Worker (`js/lib/heavyStats.js`: UPGMA de matrices grandes + curvas de rarefacción) vuelve a bloquear el hilo principal (> 120 ms). El resto solo se informa. |

### Modo de los tests de `stats/`

Cada uno lleva:
1. entradas deterministas,
2. resultado JS de `js/lib/stats.js`,
3. **GOLDEN** embebido = lo que devolvió R al escribir el test.

Se compara **siempre** JS vs GOLDEN (regresión sin depender de R). Si hay
`Rscript` + el paquete necesario, además se recalcula en R y se compara R vs
GOLDEN (detecta deriva) y R vs JS. Así `node tests/stats/*` funciona con o sin
R instalado.

## Qué NO cubre (para saber qué falta si algo se rompe)

- **Ingesta / parsers** (`ingest.js`, `csv.js`, `minizip.js`, `ordination.js`,
  `fastq.js`): se ejercitan de forma indirecta al cargar los ejemplos en el
  barrido, pero no hay tests unitarios de casos límite (`.qza` corrupto,
  cabeceras raras, `#q2:types`, gzip, BIOM). El nuevo `diagnoseTable()` tampoco
  tiene test propio.
- **`upgma()` / `leafOrder()`** (clustering del mapa de calor beta): sin
  verificación numérica contra R (`hclust`).
- **Vista de biomarcadores end-to-end**: `stats/benjaminihochberg.mjs` +
  `stats/cliffsdelta.mjs` + `stats/kruskalwallis.mjs` cubren las fórmulas;
  la comprobación de que la pestaña “Biomarcadores” pinta esos números no está
  persistida (sí lo está la equivalente de “Comparar varias”, ver
  `compare-overlap.mjs`).
- **Exportación SVG/PNG del editor de gráficos**, **impresión del informe
  combinado**, **descarga del HTML autocontenido**: no automatizadas.
- **`#/arbol` interactivo**: `sweep-routes.mjs` carga el ejemplo, espera a que
  termine el pipeline y prueba "Personalizar" sobre el árbol ya dibujado (con
  las fórmulas cubiertas por `phyloalign.mjs`/`stats/neighborjoining.mjs`/
  `stats/phylodistance.mjs`); el aviso de "demasiadas secuencias" con el botón
  de quedarse con las más abundantes, quitar una secuencia a mano de la lista,
  y que cambiar p-distance↔Jukes-Cantor NO repita el alineamiento (cacheado
  aparte), se verificaron a mano una vez, no de forma persistida.
- **i18n**: no se comprueba que existan todas las claves en `es`/`en` ni que
  `it`/`de`/`zh` caigan a `es` sin huecos.
- **Rendimiento**: `perf-stress.mjs` mide las 4 operaciones pesadas y verifica
  que las migradas a worker no bloqueen; no hay presupuesto de tiempo para el
  resto de rutas ni medición de memoria.
- **Compatibilidad de navegadores**: solo se prueba en el Chrome del sistema.
