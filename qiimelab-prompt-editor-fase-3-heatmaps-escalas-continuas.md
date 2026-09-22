# Prompt Fase 3: heatmaps y escalas de color continuas

> Continúa las Fases 0-2. Contexto:
> `Claude outputs/estudio-editor-graficas-nivel-biorender.md` y
> `Claude outputs/inventario-editor-graficas.md` (secciones de `#/beta`
> mapa de calor, `#/correlograma` matriz, `#/diferencial` heatmap).

## Por qué un componente compartido

Tres vistas independientes hoy reimplementan cada una su propia escala de
color continua con `color-mix()` en CSS: `betaDiversity.js` (mapa de
distancias, línea 816, secuencial), `correlogram.js` (matriz de r, línea
514, divergente con centro gris especial para la diagonal), y
`differentialAbundance.js` (heatmap de log2FC, línea 810, divergente
centrado en 0). Las tres comparten el mismo problema de exportación
(`color-mix` → `color(srgb…)` no interoperable, ya resuelto en la Fase 0 a
nivel de pipeline de exportación, pero eso no las hace *configurables*,
solo *exportables*). Construir un único componente de escala configurable y
que las tres lo consuman evita implementar min/max/punto medio/nº de pasos
tres veces.

## Paso 1 — `js/lib/colorScale.js`

Nuevo módulo con una función `makeColorScale({type, domain, range, midpoint,
steps})`:

- `type: 'sequential'|'divergent'` — secuencial (beta) vs divergente
  (correlograma, diferencial).
- `domain: [min, max]` — por defecto el rango real de los datos, pero
  editable (recorte de outliers, por ejemplo).
- `midpoint` — solo divergente; por defecto 0 para diferencial (log2FC) y
  correlograma (r), pero editable.
- `range` — los colores de los extremos (y del centro si es divergente),
  por defecto los `SEQUENTIAL`/`DIVERGENT` de `js/lib/palettes.js` ya
  validados, pero cualquier paleta continua del catálogo ampliado de la
  Fase 2 debe poder usarse aquí también.
- `steps` — `null`/`0` para rampa continua (como hoy), o un entero para
  discretizar en N bandas (BioRender y muchos heatmaps de publicación
  ofrecen ambos modos).
- Devuelve una función `scale(value) => '#rrggbb'` y, para el modo
  continuo, los datos necesarios para pintar un `<linearGradient>` de
  leyenda (patrón que `correlogram.js`/`differentialAbundance.js` ya usan
  para su leyenda — `url(#ql-da-scale)`, `url(#ql-beta-scale)` — generalizar
  ese id a algo compartido).

Interpolación en espacio OKLab (no RGB lineal) para que la rampa se vea
perceptualmente uniforme — `js/lib/paletteValidator.js` ya tiene
utilidades de conversión OKLab (`oklab`) reutilizables aquí, no
reimplementarlas.

## Paso 2 — migrar los 3 consumidores

`betaDiversity.js`, `correlogram.js`, `differentialAbundance.js`: sustituir
la llamada a `color-mix()` (o a `corrFill()` en el caso de correlograma,
línea 95) por `scale(value)` de `colorScale.js`, resolviendo directamente a
`#rrggbb` (no a `color-mix()`) — esto además simplifica el pipeline de
exportación de la Fase 0, que ya no tiene que resolver `color-mix` en estos
tres gráficos porque nunca se genera. **Caso especial a preservar**:
`corrFill()` pinta la diagonal de la matriz de correlación con un gris
mezclado (`color-mix(in srgb, var(--baseline) 55%, var(--surface))`), no
con la escala de datos — la diagonal sigue fuera de `colorScale.js`, no
forzarla a pasar por la escala de r (que no tiene sentido en r=1 fijo).

## Paso 3 — panel de control de escala

Nueva sección en el editor (visible solo para gráficos con escala
continua — puede detectarse por un nuevo flag `cfg.colorScale` pasado a
`attachChartEditor`, o por la presencia de `paletteType: 'sequential'|
'divergent'` ya existente):

- Paleta de la escala (desplegable, reutiliza el catálogo de la Fase 2).
- Min/max del dominio (con botón "restablecer al rango de los datos").
- Punto medio (solo divergente).
- Nº de pasos discretos (0 = continuo).
- Invertir escala.

Persistir en `store.__colorScale`, y en `onChange` cada módulo recalcula
`scale()` y repinta las celdas (repintado completo aquí SÍ está
justificado porque cambia el valor de cada celda, a diferencia del motor de
variables CSS de la Fase 0 que evita repintar cuando no hace falta).

## Paso 4 — controles de celda (H del catálogo)

- **Valor en celda**: mostrar/ocultar el número (`r`, log2FC, distancia)
  dentro de cada celda — en correlograma y diferencial ya se dibuja el
  valor hoy (sin toggle); en beta no se dibuja, añadirlo como opción.
- **Borde de celda**: color/grosor, hoy inexistente en las 3 vistas.
- **Forma de celda**: cuadrado (por defecto, actual) vs círculo con tamaño
  ∝ |valor| (patrón habitual en `corrplot` de R, mencionado en la
  investigación de esta fase como vista alternativa reconocible) — mayor
  esfuerzo, valorar si entra en esta fase o se deja para una iteración
  posterior si el tiempo aprieta.
- **Anotación de celda con p/estrellas** (solo correlograma —
  `differentialAbundance.js` heatmap podría querer lo mismo con `padj` si
  se decide extenderlo): reutiliza el formateador de p de la Fase 0/1, no
  reimplementar el mapeo de umbrales.

## Paso 5 — rendimiento

El mapa de calor de beta-diversidad ya tiene 401 `<rect>` con un dataset
modesto de 20 muestras (confirmado en la auditoría) — con 100+ muestras
esto escala a >10 000 nodos. Al implementar el repintado del Paso 3,
verificar el tiempo de recálculo con un dataset grande simulado (puede
generarse con `js/lib/exampleData.js` ampliado temporalmente, o un script
de prueba) antes de dar la fase por cerrada; si el repintado es
perceptiblemente lento (>200-300ms), considerar limitar el recálculo a
`onChange` con debounce en vez de en cada movimiento de slider.

## Alcance de este prompt

1. `colorScale.js` con tests unitarios (valores conocidos: dominio
   simétrico, punto medio en 0, interpolación en 2-3 puntos verificables a
   mano).
2. Migrar `betaDiversity.js` (el más simple, secuencial, sin caso especial
   de diagonal).
3. Migrar `correlogram.js` (preservando el caso especial de la diagonal).
4. Migrar `differentialAbundance.js` heatmap.
5. Panel de control (Paso 3) una vez los 3 consumidores comparten el mismo
   módulo — implementarlo una vez, no por gráfico.
6. Controles de celda (Paso 4) y verificación de rendimiento (Paso 5).

## Criterio de aceptación

- Los 3 heatmaps usan `js/lib/colorScale.js`, cero `color-mix(` nuevo
  introducido en el código de estos 3 módulos (el que ya había se elimina).
- Cambiar min/max/punto medio/paleta desde el editor recolorea las celdas
  correctamente y de forma consistente entre los 3 gráficos.
- La diagonal de la matriz de correlación sigue gris, no sigue la escala de
  r, tras la migración.
- Exportar cualquiera de los 3 heatmaps produce un SVG sin `color-mix`/
  `color(srgb` (heredado de la Fase 0, pero confirmar que sigue cumpliéndose
  tras este cambio).
- Con un dataset de referencia de ~100 muestras simulado, el repintado tras
  cambiar la escala no bloquea la interfaz de forma perceptible.
- `node tests/run.mjs` en verde.
