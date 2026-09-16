# Prompt: selector de tipo de gráfico por análisis (burbujas, cajas y bigotes, lollipop...)

> Rescatado de una sesión de cowork (claude.ai) cuyo "puente" con esta máquina
> se cayó a mitad de la investigación — nunca llegó a guardarse en el repo.
> Contenido recuperado el 16 sep 2026 desde el chat de esa sesión. Pendiente
> de ejecución.

## Lo que pide el usuario

Para los distintos análisis, que el usuario pueda elegir entre varios tipos
de gráfico en vez de tener uno solo fijo por módulo — burbujas, cajas y
bigotes (boxplot), lollipop, y lo que tenga sentido según el análisis. El
tipo que hay hoy por defecto en cada módulo se mantiene como opción por
defecto; el resto se añaden como alternativas seleccionables, no como
sustitutos.

## Antes de tocar código: verificar el estado real

La sesión de cowork que preparó este prompt perdió la conexión con la
máquina a mitad de la investigación, así que lo de abajo es lo que se sabía
de sesiones anteriores, no una auditoría fresca. Antes de aplicar nada,
comprobar con grep en cada módulo qué tipo(s) de gráfico tiene realmente hoy
— puede haber cambiado.

Lo último confirmado (15 sep 2026):

- `js/lib/groupBoxplot.js` ya existe como componente de cajas y bigotes
  reutilizable, migrado a la API central de tooltips
  (`showTooltip`/`hideTooltip`). Probablemente ya en uso en
  `alphaDiversity.js`. Es el punto de partida para ofrecer boxplot en otros
  módulos, no reimplementarlo.
- `differentialAbundance.js` ya tiene una vista tipo lollipop ("barras
  horizontales tipo LEfSe") además de heatmap y volcano plot.
- `taxaBarplot.js` ya tiene selector vertical/horizontal (patrón de
  segmented control ya existente — reutilizar ese mismo patrón de UI para el
  selector de tipo de gráfico, no inventar uno nuevo).
- Todo gráfico nuevo debe consumir `js/lib/dom.js` (`escapeHtml`, `svgEl`) y
  `js/lib/tooltip.js`, y el editor de gráficos centralizado (`chartEditor.js`,
  modal a pantalla completa) — no reimplementar a mano (regla explícita de
  CLAUDE.md).

## Diseño propuesto

1. Construir primero la infraestructura compartida, no ir módulo a módulo
   reinventando el selector: un componente de "selector de tipo de gráfico"
   (segmented control, mismo estilo visual que el de vertical/horizontal en
   `taxaBarplot.js`) que cada módulo pueda montar pasándole la lista de tipos
   disponibles y el tipo activo, con persistencia en el localStorage/estado
   propio de cada módulo (igual que ya se persiste la orientación de barras).

2. Menú de tipos por análisis (propuesta inicial, ajustar según lo que
   confirme el grep del paso anterior — no todos los tipos tienen sentido en
   todos los análisis):

   | Módulo | Por defecto (mantener) | Añadir como alternativa | Por qué |
   |---|---|---|---|
   | `taxaBarplot.js` | Barras apiladas | Burbujas (género × muestra, tamaño = abundancia) | Las barras apiladas dificultan comparar un solo taxón entre muestras; burbujas lo resuelven sin apilar. |
   | `alphaDiversity.js` | Cajas y bigotes (si ya usa `groupBoxplot.js`) | Puntos con dispersión (jitter), violin si se quiere ir más lejos | Ver la distribución real con pocas muestras, no solo el resumen. |
   | `betaDiversity.js` | Dispersión PCoA | Burbujas sobre las mismas coordenadas (tamaño = una variable numérica de metadatos) | Añade una tercera dimensión de información sin cambiar el layout. |
   | `differentialAbundance.js` | El que ya sea por defecto hoy (heatmap/volcano/lollipop) | Cajas y bigotes de abundancia por grupo, por cada taxón significativo | Complementa el lollipop (que resume el efecto) con la distribución real. |
   | `correlogram.js` | Matriz de calor | Burbujas (tamaño = \|r\|, color = signo) | Vista alternativa habitual en paquetes de correlación (p. ej. `corrplot` en R). |
   | `microbialCounts.js` (#/recuentos) | Barras ± SD/SE | Puntos con dispersión (jitter) | Con pocas réplicas una barra con error puede ocultar la variabilidad real. |
   | `inference.js` | Barras apiladas / aluvial | Lollipop para comparar rutas/funciones dominantes entre grupos | Mismo argumento que en `taxaBarplot.js`. |
   | `venn.js`, `phylo.js` (árbol) | — | — | No aplica: son tipos de diagrama fijos por naturaleza, no tiene sentido un "tipo de gráfico alternativo". |

3. No romper lo que ya funciona: el tipo que hoy es el único/por defecto en
   cada módulo se queda como opción marcada al abrir, para que nadie note un
   cambio de comportamiento sin pedirlo.

## Alcance de este prompt

Dado el tamaño (toca 7-8 módulos), no intentar hacerlo todo en una sola
sesión/commit gigante — CLAUDE.md pide commits pequeños y frecuentes.
Sugerencia de orden:

1. Construir el componente compartido de selector + aplicarlo primero en
   `taxaBarplot.js` (burbujas) por ser el más usado y el más beneficiado.
2. `betaDiversity.js` y `correlogram.js` (burbujas, reutilizan lo aprendido
   en el paso 1).
3. `alphaDiversity.js` y `microbialCounts.js` (dispersión con jitter).
4. `differentialAbundance.js` e `inference.js` al final.

Si no da tiempo a todo en una sesión, dejar claramente documentado en el
commit/README qué módulos quedan pendientes con el mismo patrón, para
retomarlo después.

## Criterio de aceptación

- Existe un componente de selector de tipo de gráfico reutilizado en todos
  los módulos tocados, no una implementación distinta por módulo.
- El tipo por defecto de cada módulo no cambia respecto a hoy.
- Cambiar de tipo no pierde el estado de agrupación/filtros ya aplicados en
  ese gráfico.
- Exportación (PNG/SVG, editor de gráficos) funciona igual en todos los tipos.
- `node tests/run.mjs` en verde.
- Commits pequeños, uno por módulo o por lote razonable, `git push` al
  terminar de cada uno (no esperar a tenerlo todo para el primer push).
