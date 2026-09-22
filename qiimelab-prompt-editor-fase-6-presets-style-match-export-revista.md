# Prompt Fase 6: presets, Style Match y exportación final nivel revista

> Fase de cierre — requiere las Fases 0-4 completas (0 imprescindible; 1-4
> aportan las secciones de panel que un preset debe poder guardar/aplicar;
> la Fase 5 es independiente y puede ir en paralelo o después, no bloquea
> esta). Contexto:
> `Claude outputs/estudio-editor-graficas-nivel-biorender.md` (secciones 4.6
> y 1.5 — tabla de especificaciones Nature/Cell) y
> `Claude outputs/inventario-editor-graficas.md`.

## Por qué esta fase va al final

Un preset es "una foto del `store`" — solo tiene sentido una vez `store`
tiene forma estable (`__palette`, `__figureStyle`, `__structure`, `__stats`,
según las claves que hayan ido apareciendo en las fases 1-4). Construir
presets antes habría significado migrar su formato en cada fase anterior.

## Paso 1 — presets como snapshot de `store`

Un preset es un objeto JSON con la misma forma que `store` (las claves que
ya se guardan en `localStorage['smart-175.chartStyle.' + key]`), más un
`name`/`description`. Aplicar un preset es sobreescribir `store` con el
contenido del preset (con un mapeo de `paletteSeries` por posición cuando
el nº de series del preset no coincide con el del gráfico activo — que no
falle si un preset se guardó con 3 series y se aplica a uno con 5, las
series extra quedan sin override, sin lanzar excepción) y llamar a
`writeStore()` + `sync()` — no hace falta código de bajo nivel nuevo, es
reutilizar exactamente las funciones que ya existen para leer/escribir
`store`.

UI: nueva sección "Presets" en la barra de herramientas (`renderToolbar`,
línea 277) con: guardar el estilo actual como preset con nombre, aplicar un
preset guardado, borrar un preset. Persistir los presets en una clave de
`localStorage` propia (`smart-175.chartPresets`, compartida entre TODAS las
gráficas, no por `key` como el estilo — un preset debe poder aplicarse a
cualquier gráfico, esa es la idea).

## Paso 2 — Style Match (copiar estilo entre gráficas)

Leer el `store` completo de una clave origen (`localStorage['smart-175.chartStyle.' + keyOrigen]`)
y escribirlo en la clave destino, con el mismo mapeo por posición de
series del Paso 1. UI: en cada gráfico, "copiar estilo de..." con una lista
de las demás claves de gráfico conocidas (puede obtenerse enumerando
`localStorage` con el prefijo `smart-175.chartStyle.`, o manteniendo un
registro estático de claves conocidas si se prefiere no depender de que el
usuario ya haya visitado esa gráfica antes). Menor prioridad que el Paso 1
si el tiempo aprieta — un preset ya cubre el caso de uso principal
("quiero que todas mis figuras se vean igual") sin necesitar Style Match
gráfico-a-gráfico.

## Paso 3 — presets de revista (Nature/Cell)

Dos presets predefinidos, no editables por el usuario (o editables pero
con un "restablecer a la especificación oficial"), construidos con los
valores exactos de la tabla del estudio (sección 1.5):

- **Nature**: fuente Arial/Helvetica, texto 5-7 pt (títulos de panel 8 pt
  negrita), grosor de línea 0.25-1 pt, ancho 89 mm (columna simple) o
  183 mm (doble columna) — ofrecer ambos como opción dentro del preset.
- **Cell**: fuente Arial, texto 6-8 pt, grosor de línea 0.5-1.5 pt, ancho
  85 mm / 114 mm / 174 mm.

Aplicar un preset de revista debe tocar: `--fig-font` (motor CSS, Fase 0),
tamaños de texto por rol (`--fig-tick-size`, `--fig-axis-title-size`, y el
tamaño de los elementos de texto editables vía `s.size` en `openPanel`),
grosor de líneas (`--fig-grid-width`, `--fig-axis-width`), y el ancho en mm
del diálogo de exportación (Fase 0, Paso 3) — es decir, este preset toca
varias capas a la vez, buen caso de prueba de que las fases anteriores
componen bien entre sí.

## Paso 4 — verificación final de exportación

Antes de cerrar el proyecto:

1. Exportar al menos una gráfica de cada tipo (barras, boxplot, heatmap,
   scatter/PCoA, árbol, Venn) en SVG, PNG a 300 dpi y TIFF, con el preset
   Nature aplicado, y confirmar visualmente que el resultado es coherente
   con la especificación (tamaño de texto legible pero no desproporcionado
   a 89 mm de ancho real, por ejemplo — imprimir o ver el PNG a tamaño
   real, no solo en pantalla a zoom arbitrario).
2. Abrir al menos un SVG exportado en un editor vectorial real (Illustrator
   o Inkscape) — verificación pendiente de toda la investigación previa,
   no debe cerrarse el proyecto sin haberla hecho al menos una vez.
3. Revisar `js/lib/paletteValidator.js` contra las paletas nuevas
   integradas en la Fase 2 (Okabe-Ito, Tol) — confirmar qué N de series es
   "seguro" según el validador para cada una (el estudio recomienda mostrar
   el N seguro calculado, no una afirmación genérica de "colorblind-safe" —
   aplicar ese mismo criterio aquí a las paletas nuevas antes de
   presentarlas al usuario como validadas sin más).
4. `node tests/run.mjs` completo en verde, incluyendo cualquier suite E2E
   que necesite Chrome local (no saltarlas si Chrome está disponible en
   esta máquina).
5. Accesibilidad: pasar el linter/suite de a11y del proyecto sobre los
   paneles nuevos añadidos en las Fases 1-5 (etiquetas `<label for>`,
   `aria-label` en controles sin texto visible — el patrón ya existe en
   `openPanel`, línea 833-836, seguirlo para cualquier control nuevo). Nota
   de la investigación previa: hay una suite `sweep-a11y` con un fallo
   preexistente conocido antes de este proyecto — no atribuirlo a este
   trabajo sin verificar primero si sigue siendo el mismo fallo.

## Alcance de este prompt

1. Paso 1 (presets) — el de mayor valor por esfuerzo.
2. Paso 3 (presets de revista) — reutiliza el Paso 1, es solo contenido
   (2 JSON con los valores de la tabla), no lógica nueva.
3. Paso 2 (Style Match) si queda tiempo.
4. Paso 4 (verificación final) — no es opcional, es el cierre de todo el
   proyecto de las 7 fases, dedicar tiempo real aquí y no comprimirlo al
   final de una sesión ya larga.

## Criterio de aceptación

- Guardar y aplicar un preset personalizado funciona en al menos 3 tipos de
  gráfico distintos, sin romper series que no coinciden en número.
- Los presets Nature/Cell aplican correctamente fuente/tamaño/grosor/ancho
  a la vez, verificado visualmente en al menos 2 gráficos.
- Al menos un SVG exportado con preset Nature aplicado se ha abierto en un
  editor vectorial real y se ve como se espera (texto editable, no
  rasterizado; colores correctos; tamaño físico correcto).
- El N de series "seguro" de cada paleta nueva está documentado (en el
  propio selector de paleta del editor, como tooltip o nota, no solo en un
  documento aparte).
- `node tests/run.mjs` en verde, incluyendo suites E2E si Chrome está
  disponible.
- Commit final + `git push` (regla fija de `CLAUDE.md`, sin excepción) con
  un resumen en el mensaje de commit de qué fases del proyecto de 7 fases
  quedaron completas y cuáles pendientes, para que la próxima sesión (de
  cualquier herramienta de IA) sepa dónde retomar sin tener que releer los
   7 prompts enteros.
