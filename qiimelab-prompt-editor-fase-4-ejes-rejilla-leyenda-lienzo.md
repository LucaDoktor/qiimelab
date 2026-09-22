# Prompt Fase 4: ejes, rejilla, leyenda y lienzo (controles globales G3-G6)

> Continúa las Fases 0-3. Contexto:
> `Claude outputs/estudio-editor-graficas-nivel-biorender.md` (secciones 4.1
> y 4.2 — motor de variables CSS ya construido en la Fase 0, y capa de
> opciones estructurales con repintado, `getFigureOptions(key)`, que esta
> fase implementa por primera vez) y
> `Claude outputs/inventario-editor-graficas.md`.

## Qué cubre esta fase

Del catálogo de controles del estudio: **G3** (lienzo: tamaño mm ya cubierto
parcialmente en exportación de la Fase 0, márgenes, fondo del panel, marco),
**G4** (ejes: min/max, log, orden de categorías, formato/rotación de
etiquetas), **G5** (rejilla: mayor/menor, orientación — el color/grosor ya
lo cubre el motor de variables CSS de la Fase 0, aquí falta lo que necesita
repintado: mostrar/ocultar, rejilla menor, orientación), **G6** (leyenda:
posición, tamaño, orientación, ocultar).

## Paso 1 — `getFigureOptions(key)`

En `chartEditor.js`, junto a `getPaletteOverrides(key)` (línea 51, mismo
patrón): una función que lee `store.__structure` del mismo objeto
`localStorage['smart-175.chartStyle.' + key]` y devuelve un objeto tipado
con valores por defecto sensatos cuando no hay override:

```js
export function getFigureOptions(key) {
  // lee localStorage['smart-175.chartStyle.' + key].__structure
  // devuelve { axisMin, axisMax, axisLog, categoryOrder, gridMinor,
  //            legendPosition, legendVisible, panelBorder, plotBackground, ... }
  // con undefined -> valor por defecto de quien la llama, no aquí
}
```

Cada módulo `draw*` la consulta al principio del pintado (mismo punto donde
ya lee `groupData`/`series` — 2-3 líneas añadidas, no una reestructuración)
y ajusta la geometría antes de dibujar. El editor expone los controles en
una nueva sección del panel y llama a `cfg.onChange()` (ya implementado en
el 100% de los módulos como "repinta con los datos actuales") en vez de
tocar el DOM directamente — no hay infraestructura nueva de bajo nivel más
allá de esta función lectora, es extender el patrón `onChange`/`onReset`
que ya existe.

## Paso 2 — controles de eje (G4)

Por gráfico con eje numérico (la mayoría): min/max manual (con
"restablecer al rango de los datos"), escala logarítmica (toggle, relevante
sobre todo en recuentos de UFC que ya se muestran en escala log según
`js/modules/microbialCounts.js` — confirmar si hoy es automático o fijo
antes de asumir que hace falta añadirlo desde cero), formato de número en
las etiquetas de tick (decimales, notación científica).

Por gráfico con eje categórico (barras, boxplot): orden de categorías —
original (por defecto), alfabético A-Z/Z-A, por valor mediano ascendente/
descendente, manual (arrastrar y soltar, más costoso — valorar si entra en
esta fase o se pospone). Aplica sobre todo a `taxaBarplot.js` (barras
apiladas, orden de taxones) y a los boxplot de `groupBoxplot.js` (orden de
grupos en el eje X, hoy fijo al orden de `groupNames` tal como llega).

## Paso 3 — controles de rejilla (G5)

Mostrar/ocultar rejilla (mayor), añadir rejilla menor (nueva, no existe
hoy en ningún gráfico — confirmar con grep de `ql-gridline` antes de
asumir), orientación (horizontal/vertical/ambas — relevante en barras
horizontales de `taxaBarplot.js`). El color/grosor de la rejilla ya lo
cubre el motor de variables CSS de la Fase 0 (`--fig-grid-color`,
`--fig-grid-width`) — este paso es solo lo que necesita repintar
(añadir/quitar líneas, no solo recolorearlas).

## Paso 4 — controles de leyenda (G6)

Hoy la leyenda es un `<g data-ce="legend">` que cada módulo dibuja con su
propio layout fijo (columnas calculadas por `legCols`/`legRows` en
`groupBoxplot.js`, por ejemplo) — es editable como grupo (mover/recolorear
el texto) pero no reposicionable de forma estructurada ni ocultable sin más.
Añadir: posición (dentro del panel arriba/abajo/izq/dcha, o fuera del
panel), ocultar leyenda por completo, tamaño de las claves de color,
espaciado entre entradas. Esto SÍ requiere recalcular el layout interno de
la leyenda en cada módulo que la dibuja — no es solo mover el `<g>` (aunque
mover el `<g>` ya es posible hoy con el drag existente, `startDrag`).
Priorizar los módulos con más vistas compartiendo el mismo dibujo de
leyenda (`groupBoxplot.js` cubre 3 rutas de un golpe) sobre los que dibujan
su leyenda una sola vez.

## Paso 5 — lienzo (G3, lo que falta tras la Fase 0)

La Fase 0 ya cubrió el tamaño físico en mm en el momento de exportar. Lo
que falta aquí es **editable antes de exportar, visible en pantalla**:
márgenes internos del área de trazado (hoy `marginL`/`marginR`/`marginT`/
`marginB` son constantes en cada función `draw*`, p. ej.
`groupBoxplot.js:59-60`), fondo del área de trazado (hoy transparente,
sigue el tema), marco/borde alrededor del panel (hoy inexistente en
cualquier gráfico — nuevo `<rect>` opcional con `class="ql-panel-border"`,
candidato también para el motor de variables CSS de la Fase 0 en cuanto
exista, ya que solo necesita color/grosor, no repintado de geometría salvo
que cambien los márgenes).

## Alcance de este prompt

1. `getFigureOptions(key)` (Paso 1) — infraestructura, sin efecto visible
   hasta que algún módulo la consuma.
2. Aplicar a `groupBoxplot.js` primero (Pasos 2-4: orden de grupos, rejilla,
   leyenda) — beneficia a 3 rutas de golpe, y sirve de piloto para validar
   el diseño del panel de control antes de replicarlo.
3. `taxaBarplot.js` (orden de taxones, rejilla, leyenda en barras
   apiladas/burbujas).
4. Resto de gráficos con eje numérico/categórico, en el orden que convenga
   según lo que quede de tiempo — no es necesario agotar las ~28 vistas en
   esta fase si el patrón ya está validado en 2-3, puede documentarse como
   trabajo de "aplicar el patrón ya construido" en una fase de limpieza
   posterior.
5. Márgenes/fondo/marco del panel (Paso 5) al final, es el de menor
   urgencia según lo pedido explícitamente por el usuario.

## Criterio de aceptación

- `getFigureOptions(key)` tiene el mismo nivel de robustez que
  `getPaletteOverrides(key)` (maneja `localStorage` vacío/corrupto sin
  lanzar excepción).
- En `#/alfa`, cambiar el orden de grupos a "alfabético" reordena las cajas
  sin romper el corchete de significación de la Fase 1 (que depende de
  posiciones X — verificar que se recalculan tras el reordenamiento).
- Ocultar la rejilla y ocultar la leyenda funcionan de forma independiente
  en al menos 3 gráficos de módulos distintos.
- La leyenda es reposicionable (no solo arrastrable libremente, sino con al
  menos 2-3 posiciones predefinidas) en `groupBoxplot.js`.
- `node tests/run.mjs` en verde.
