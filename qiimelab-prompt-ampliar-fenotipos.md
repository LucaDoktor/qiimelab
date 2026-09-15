# Prompt: ampliar enormemente la base de datos de fenotipos (`js/lib/phenotypes.js`)

## Estado actual (verificado en sesión cowork, 15 sep 2026 — leed esto antes de releer el archivo entero, para no gastar contexto redescubriéndolo)

`js/lib/phenotypes.js` (34 KB) tiene 4 exports:

- `PHENOTYPES_METADATA`: nombre/versión/referencia de la fuente (hoy dice "BacDive / metaTraits Comprehensive Core").
- `PHENOTYPE_CATEGORIES`: **10 categorías, 28 rasgos**, con nombre ES/EN cada una — `gram_stain` (2), `cell_morphology` (4), `motility` (2), `sporulation` (2), `oxygen_requirement` (3), `temperature_range` (3), `ph_range` (3), `key_enzymes` (5), `ecology` (3), `salinity` (2).
- `DEFAULT_PHENOTYPES`: `categoría → rasgo → [nombres de taxón]`. Cada rasgo lista los taxones que lo tienen, con varias convenciones de nombrado a la vez para que el match funcione da igual el formato de taxonomía del usuario: nombre plano (`'Bacillus'`), estilo QIIME/Greengenes (`'g__Bacillus'`), a veces familia (`'f__Bacillaceae'`) o incluso filo (`'p__Firmicutes'`) como red de seguridad amplia. Al final del archivo hay un `Object.assign` que aplana todas las categorías directamente sobre `DEFAULT_PHENOTYPES`, así que también sirve como acceso plano (`DEFAULT_PHENOTYPES.gram_positive`).
- `FLAT_PHENOTYPES`: copia del objeto ya aplanado.
- `PHENOTYPE_NAMES`: `rasgo → {es, en}` para pintar las etiquetas en la UI.

**Cobertura real hoy: unos 50-70 géneros curados a mano**, repetidos a través de las categorías donde se conocía el dato — un escaparate de géneros de manual (intestino humano, alimentación, patógenos clásicos, algunos ambientales), nada parecido a la diversidad que devuelve un 16S/ITS real. Es exactamente el hueco que quieres cerrar.

**Consumo actual:** `js/modules/inference.js` (`mapTaxonomyToFunction`, `findFunctionsForTaxon`, `buildDatabaseIndex`) — hay trabajo sin commitear ahora mismo en `tests/inference.mjs` conectando esto (ver nota al final). Comprobar con grep si hay más consumidores antes de cambiar la forma del objeto.

## Objetivo

Multiplicar la cobertura de taxones en uno o dos órdenes de magnitud, sin salir de la arquitectura: sigue siendo un asset estático, cero llamadas de red desde el navegador en producción, cero dependencias de código nuevas en la app.

## Fuente de datos recomendada

**The Microbe Directory (MD2)** — https://github.com/dcdanko/MD2 — MIT, distribuida en CSV, más de 68.000 especies (bacterias, arqueas, hongos, virus, algas). Cubre Gram, formación de esporas, biofilm, patogenicidad, extremofilia (termófilo/psicrófilo/halófilo/acidófilo/alcalífilo...) y tipo metabólico — solapa mucho con las 10 categorías que ya tenéis, y además trae resistencia antimicrobiana y tipo fototrofo/quimiotrofo que hoy no tenéis ninguna categoría equivalente (valorar si merece una categoría nueva).

## Cómo hacerlo

1. Descargar/clonar MD2. Esto es un paso de preparación de datos con la herramienta de desarrollo (tu máquina), no algo que la app llame en producción — igual de "sin servidor" que cuando se curó a mano la lista actual, solo que esta vez el origen de los datos es un CSV en vez de conocimiento propio.
2. Escribir un script Node de conversión, fuera de lo que se sirve al navegador (p. ej. en `scripts/`, para poder re-ejecutarlo cuando MD2 saque una versión nueva), que:
   - Lea el CSV de MD2.
   - Mapee sus columnas a las 10 categorías/28 rasgos existentes (documentar en un comentario qué campos de MD2 no tienen categoría equivalente hoy).
   - **Agregue a nivel de género**, no de especie: el 16S/ITS que analiza QiimeLab rara vez resuelve más allá de género, así que volcar 68.000 filas especie a especie no sirve de nada y dispara el tamaño del archivo. Agregar por consenso (si ≥X% de las especies de un género comparten el rasgo, asignárselo al género) y decidir un umbral razonable.
   - Genere las claves con las mismas convenciones de nombrado que ya usáis (`Genero`, `g__Genero`, y `f__Familia`/`p__Filo` cuando aplique).
3. **Antes de sustituir el archivo actual**, comparar automáticamente el resultado nuevo contra los ~50-70 géneros que ya estaban curados a mano. Si MD2 contradice alguno en un rasgo muy conocido (p. ej. el Gram de un género de manual), no asumir que la fuente agregada tiene razón sin más — revisar el caso a mano antes de sobrescribir. Es una fuente compilada automáticamente y puede tener ruido.
4. Actualizar `PHENOTYPES_METADATA` para reflejar la fuente real (MD2, además de BacDive/metaTraits si se mantiene algo de la curación original), con su licencia. Considerar créditar MD2 en la UI donde se muestren estos datos — el proyecto ya tiene la costumbre de decir explícitamente cuando se apoya en otra herramienta (ver `CLAUDE.md`).
5. Evaluar si la estructura actual (array de nombres de taxón por rasgo) sigue siendo la adecuada a esta escala. Con 50-70 géneros un array por rasgo es legible a mano; con miles de géneros puede compensar más indexar por taxón (`taxón → { categoría: rasgo }`) para lookup O(1) en vez de recorrer arrays. Mirar el impacto en `inference.js` (y cualquier otro consumidor que aparezca por grep) antes de decidir si merece el cambio de forma o si basta con ampliar los arrays tal cual.
6. Ampliar los tests: el que ya exista de fenotipos si lo hay, más las pruebas de `mapTaxonomyToFunction` + `DEFAULT_PHENOTYPES` ya en curso en `tests/inference.mjs`. Casos a cubrir: integridad estructural (todo taxón referenciado cae dentro de una categoría/rasgo válidos), un puñado de géneros de control muy conocidos no cambian de valor sin que quede documentado por qué, y que el tamaño final del archivo sigue siendo razonable para una PWA sin build step (sin necesidad de lazy-load extra si cabe cómodo; si no cabe, valorar cargarlo con `import()` perezoso solo cuando se necesite, siguiendo el patrón de rutas que ya usa `app.js`).

## Criterio de aceptación

- Cobertura de géneros ampliada muy por encima de los ~50-70 actuales — un orden de magnitud más, no un puñado más.
- `node tests/run.mjs` en verde.
- `PHENOTYPES_METADATA` refleja la fuente real y su licencia.
- Commits pequeños, `git push` al terminar (regla fija del proyecto).

## Nota sobre el trabajo de Antigravity ya en curso

Hay cambios sin commitear en `tests/inference.mjs` (tests de `mapTaxonomyToFunction` combinado con `DEFAULT_PHENOTYPES`) de una sesión de Antigravity que ya se cerró y se confirmó muerta (`ps aux`, 15 sep ~21:00, sin proceso `agy` vivo). Revisar con `git diff` antes de tocar nada — probablemente sea precisamente la pieza que conecta esta ampliación con el módulo de inferencia funcional, no descartarlo sin mirar primero.
