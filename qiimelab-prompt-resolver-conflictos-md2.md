# Prompt: aplicar las 18 resoluciones de `scripts/md2-conflicts-report.md`

Estas 18 decisiones ya se revisaron a mano (sesión cowork, 15 sep 2026), caso por caso, con criterio biológico/microbiológico real — no es un arbitraje mecánico entre las dos fuentes. Aplicarlas literalmente, no reabrir el debate salvo que se detecte un error concreto en el razonamiento.

## Las 18 decisiones

| Categoría | Género | Valor final | Razonamiento (para el comentario en el código) |
|---|---|---|---|
| sporulation | Actinomyces | `non_spore_forming` | Rasgo diagnóstico clásico: Actinomyces no forma esporas (se confunde con Streptomyces, que sí). |
| ph_range | Helicobacter | `neutrophile` | H. pylori sobrevive al ácido gástrico neutralizando su entorno con ureasa, pero su pH óptimo de crecimiento en cultivo es neutro (~6-7) — no es un acidófilo real. Malentendido muy extendido, vale la pena explicarlo si el dato se muestra en la UI. |
| ph_range | Enterococcus | `alkaliphile` | El test diagnóstico de manual es crecimiento a pH 9.6, justo lo contrario de "acidophile". |
| salinity | Halobacterium | `halophile` (mantener) | Halófilo extremo de manual (arquea, necesita 25-32% NaCl, se lisa en baja salinidad) — no es meramente tolerante. |
| salinity | Staphylococcus | `halotolerant` (mantener) | Crece bien sin sal pero tolera hasta 7.5-10% (agar manitol-sal, selectivo por eso) — el ejemplo de manual de halotolerante, no halófilo. |
| temperature_range | Campylobacter | `thermophile` (mantener) | Conflicto de definición, no de biología: óptimo ~42°C, termotolerante por convención clínica (medios selectivos a 42°C), aunque bajo el umbral estricto de la propia app (`>45°C`) caería en mesófilo. Se mantiene "thermophile" por ser la convención esperable para un estudiante de microbiología — dejar comentado que es una decisión de convención, no de umbral numérico. |
| temperature_range | Psychrobacter | `psychrophile` (mantener) | Género nombrado específicamente por su psicrofilia; hay especies mesófilas/clínicas, pero no representan el género en un contexto docente. |
| temperature_range | Pseudoalteromonas | `psychrophile` (mantener) | Icónico en microbiología marina/polar; un voto por especie diluye al representante ecológicamente más relevante del género. |
| temperature_range | Shewanella | `mesophile` | El organismo modelo del género, S. oneidensis, es mesófilo (~30°C); la psicrofilia es real pero de un subconjunto, no representativa. |
| temperature_range | Flavobacterium | `mesophile` | F. psychrophilum (patógeno de peces) es una especie muy conocida dentro de un género mucho más amplio de ambientales mesófilos. |
| ph_range | Lactobacillus | `acidophile` (mantener) | A diferencia de Bifidobacterium/Streptococcus, su pH óptimo real baja de 5.5-6.2 en muchas especies — define "bacteria del ácido láctico". |
| ph_range | Gluconobacter | `acidophile` (mantener) | Bacteria acética (vinagre), óptimo típico ~5.5-6.0; su nicho industrial se basa en tolerar/producir ácido. |
| ph_range | Bifidobacterium | `neutrophile` | Tolerante al ácido pero su pH óptimo de crecimiento reportado está cerca de neutro, no por debajo de 5.5. |
| ph_range | Streptococcus | `neutrophile` | Mismo caso que Bifidobacterium. |
| ph_range | Pediococcus | `neutrophile` | Mismo caso, con algo menos de certeza (rango de cultivo amplio, óptimo cerca de neutro en la mayoría de fuentes). |
| salinity | Halobacillus | `halophile` (mantener) | Halófilo moderado por nombre y descripción típica, aunque "halófilo moderado" no exista como categoría intermedia en el esquema actual. |
| salinity | Salinicoccus | `halophile` (mantener) | Mismo caso que Halobacillus. |
| salinity | Halomonas | `halotolerant` | Al contrario que los dos anteriores: en microbiología ambiental es EL ejemplo de tolerancia salina de rango amplísimo (0-20%+), no de halofilia obligada. |

## Qué hacer

1. En `js/lib/phenotypes.js`, para cada fila: mover el género al array del rasgo correcto dentro de `DEFAULT_PHENOTYPES` (quitarlo del rasgo antiguo si estaba en el equivocado, añadirlo al nuevo). Para las filas marcadas "(mantener)" no hay que tocar el valor, pero sí documentarlo (ver punto 2) para que quede constancia de que se revisó y no es un olvido.
2. Añadir un comentario breve junto a cada género resuelto (o un bloque de comentario único antes de `DEFAULT_PHENOTYPES` listando las 18 resoluciones con su razonamiento en una línea) — mismo estilo que ya usa el proyecto para documentar decisiones no obvias (ver por ejemplo los comentarios de blindaje en `betaDiversity.js`). El caso de Campylobacter necesita explicitarse como decisión de convención, no de umbral numérico — que quede claro en el comentario para que nadie lo "corrija" de vuelta a mesophile sin darse cuenta de por qué se dejó así.
3. Actualizar `scripts/build-phenotypes-md2.mjs`: estas 18 decisiones deben quedar como *overrides* fijados (p. ej. un `MANUAL_OVERRIDES` o similar) para que si se vuelve a ejecutar el pipeline contra una versión nueva de MD2, no se vuelvan a reportar como conflicto sin más — pero si MD2 cambia de opinión otra vez sobre alguno de estos 18 géneros en el futuro, sí que debería avisar de que el override ya no coincide con la fuente (para poder revisarlo de nuevo si hiciera falta), no simplemente silenciarlo para siempre.
4. `scripts/md2-conflicts-report.md`: no tiene sentido dejarlo como si fueran conflictos abiertos ahora que están resueltos. Renombrarlo o añadirle una cabecera que dije claro que está resuelto y con qué criterio (fecha, quién lo revisó), en vez de borrarlo sin más — tiene valor como registro de la decisión.
5. Tests: si `tests/phenotypes.mjs` verifica valores concretos de algún género de esta lista, actualizarlo a los valores finales. Añadir (o ampliar) un caso que compruebe que los 18 géneros resueltos tienen exactamente el valor decidido aquí, para que una futura regeneración accidental no los vuelva a cambiar sin que salte un test.

## Criterio de aceptación

- `node tests/run.mjs` en verde.
- Los 18 géneros tienen el valor de la tabla de arriba en `DEFAULT_PHENOTYPES`, con el porqué documentado en el código.
- Re-ejecutar `node scripts/build-phenotypes-md2.mjs` no reporta estos 18 como conflictos nuevos (pero sí seguiría reportando cualquier otro conflicto genuinamente nuevo).
- Commits pequeños, `git push` al terminar.
