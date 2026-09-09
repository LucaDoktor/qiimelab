# tests/

Verificación de QiimeLab. Todo es Node ESM sin dependencias de `npm`
(`node ≥ 20`). Los tests de navegador usan Chrome/Chromium headless vía CDP;
los de estadística comparan contra R cuando está disponible.

```
node tests/run.mjs              # todo, con resumen final
node tests/run.mjs stats        # solo tests/stats/*
node tests/run.mjs contrast cvd # solo esos
node tests/<archivo>.mjs        # un test suelto
```

Cada test sale con **0** (pasa), **1** (falla) o **2** (se salta: falta
Chrome, R, o un paquete de R). El runner sale ≠ 0 solo si algo **falla**;
los saltados no cuentan.

## Qué cubre cada archivo

| archivo | tipo | qué comprueba |
|---|---|---|
| `sweep-routes.mjs` | navegador | Las 14 rutas/subvistas (13 módulos + la subvista "Red" del correlograma) en **claro y oscuro**, con todos los ejemplos cargados. Incluye `#/glosario` con su filtro de texto y sus `<details>`. Falla ante cualquier `console.error` / excepción. |
| `sweep-session.mjs` | navegador | Ciclo `exportSession()` → `clearAllState()` → `importSession()` → re-barrido. Canarios numéricos (nº taxa, KW H/p, % var PCoA, profundidad mín. de rarefacción, nº comparaciones…) **idénticos bit a bit** y **0** referencias `sourceFileId` colgadas. |
| `sweep-a11y.mjs` | navegador | Heurísticas por ruta × tema: nombre accesible en cada `button`/`a`, etiqueta en cada `input`/`select`, `aria-label` en cada `svg[role=img]`, una `<main tabindex=-1>`, enlace “saltar al contenido”, `<nav aria-label>`, `aria-current` en la navegación activa. |
| `keyboard-editor.mjs` | navegador | El editor de gráficos con **solo teclado**: foco en el tirador, flechas mueven (Shift = paso mayor), Intro abre el panel (el foco entra), Escape cierra y devuelve el foco, la posición persiste en `localStorage`. |
| `session-ui.mjs` | navegador | Los botones de guardar/cargar sesión en `#/cargar` + el modal de confirmación de carga: `role=dialog`, `aria-modal`, `aria-labelledby` real, foco en el botón de aceptar, Escape cierra resolviendo `false`. |
| `compare-overlap.mjs` | navegador | Vista “Comparar varias”: recalcula el solapamiento de significativos (`padj < 0.05`) desde los 3 CSV de `datos-ejemplo/` y comprueba que las regiones del diagrama de Venn y el histograma “sig. en N de M” de la UI coinciden. |
| `datahealth.mjs` | estático | Fixtures de `checkDataHealth()`: id duplicado, muestra de más/menos, celda de grupo vacía, los 4 a la vez, tolerancia de sufijos → encuentra **exactamente** cada fallo. |
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
| `mobile-audit.mjs` | navegador | Recorre las 14 rutas a 375px y 768px con todos los ejemplos cargados. **Falla** si alguna ruta ensancha el layout más allá del viewport (ratio > 1.04 → scroll-x del body). Los casos "apretado" (ratio 1.0–1.04) se informan pero no fallan. |
| `pwa.mjs` | estático + navegador | `manifest.json` es JSON válido con los campos obligatorios y sus iconos existen; `index.html` enlaza el manifest. Con navegador: el service worker registra, activa y controla la página tras la 1ª carga, y con la red simulada offline por CDP una 2ª navegación sigue sirviendo el shell (sidebar + main + footer) desde caché con el banner "sin conexión". |

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
- **i18n**: no se comprueba que existan todas las claves en `es`/`en` ni que
  `it`/`de`/`zh` caigan a `es` sin huecos.
- **Rendimiento** y **compatibilidad de navegadores** (solo se prueba en el
  Chrome del sistema).
