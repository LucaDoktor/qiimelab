# Conflictos MD2 vs curación manual — RESUELTO (2026-09-16)

> **Estado: resuelto.** Los 18 conflictos de abajo se revisaron uno por uno
> a mano, con criterio biológico/microbiológico real (sesión cowork, 15 sep
> 2026; aplicado en el repo el 16 sep 2026 — ver
> `qiimelab-prompt-resolver-conflictos-md2.md` para el razonamiento completo
> de cada decisión y el bloque de comentario en la cabecera de
> `js/lib/phenotypes.js` para el resumen). La columna **Decisión final**
> añadida abajo es el valor que quedó fijado en `DEFAULT_PHENOTYPES`, ya sea
> aceptando la sugerencia de MD2 o manteniendo la curación manual anterior.
> `scripts/build-phenotypes-md2.mjs` fija estos 18 como `MANUAL_OVERRIDES`:
> una regeneración futura no los reportará de nuevo como conflicto mientras
> MD2 siga opinando lo mismo que aquí — si MD2 cambia de opinión sobre
> alguno de estos géneros más adelante, sí volverá a avisar (ver el propio
> script). No se conserva como un simple histórico borrado: sirve de
> registro de la decisión y su fecha.

Generado originalmente por scripts/build-phenotypes-md2.mjs — umbral de consenso 0.7.
Estos géneros ya tenían un rasgo asignado a mano en una categoría excluyente
(Gram, esporulación, temperatura, pH o salinidad) que MD2 contradecía.

| Categoría | Género | Curado (manual, antes) | MD2 (agregado) | Decisión final |
|---|---|---|---|---|
| sporulation | Actinomyces | spore_forming | non_spore_forming | **non_spore_forming** (se acepta MD2) |
| temperature_range | Pseudoalteromonas | psychrophile | mesophile | **psychrophile** (se mantiene) |
| temperature_range | Shewanella | psychrophile | mesophile | **mesophile** (se acepta MD2) |
| temperature_range | Psychrobacter | psychrophile | mesophile | **psychrophile** (se mantiene) |
| temperature_range | Campylobacter | thermophile | mesophile | **thermophile** (se mantiene — decisión de convención clínica, no de umbral numérico) |
| temperature_range | Flavobacterium | psychrophile | mesophile | **mesophile** (se acepta MD2) |
| ph_range | Bifidobacterium | acidophile | neutrophile | **neutrophile** (se acepta MD2) |
| ph_range | Streptococcus | acidophile | neutrophile | **neutrophile** (se acepta MD2) |
| ph_range | Pediococcus | acidophile | neutrophile | **neutrophile** (se acepta MD2) |
| ph_range | Enterococcus | acidophile | alkaliphile | **alkaliphile** (se acepta MD2) |
| ph_range | Lactobacillus | acidophile | neutrophile | **acidophile** (se mantiene) |
| ph_range | Helicobacter | acidophile | neutrophile | **neutrophile** (se acepta MD2) |
| ph_range | Gluconobacter | acidophile | neutrophile | **acidophile** (se mantiene) |
| salinity | Halobacterium | halophile | halotolerant | **halophile** (se mantiene) |
| salinity | Halobacillus | halophile | halotolerant | **halophile** (se mantiene) |
| salinity | Halomonas | halophile | halotolerant | **halotolerant** (se acepta MD2) |
| salinity | Salinicoccus | halophile | halotolerant | **halophile** (se mantiene) |
| salinity | Staphylococcus | halotolerant | halophile | **halotolerant** (se mantiene) |

## Tabla original (para referencia — antes de resolver)

| Categoría | Género | Curado (manual) | MD2 (agregado) |
|---|---|---|---|
| sporulation | Actinomyces | spore_forming | non_spore_forming |
| temperature_range | Pseudoalteromonas | psychrophile | mesophile |
| temperature_range | Shewanella | psychrophile | mesophile |
| temperature_range | Psychrobacter | psychrophile | mesophile |
| temperature_range | Campylobacter | thermophile | mesophile |
| temperature_range | Flavobacterium | psychrophile | mesophile |
| ph_range | Bifidobacterium | acidophile | neutrophile |
| ph_range | Streptococcus | acidophile | neutrophile |
| ph_range | Pediococcus | acidophile | neutrophile |
| ph_range | Enterococcus | acidophile | alkaliphile |
| ph_range | Lactobacillus | acidophile | neutrophile |
| ph_range | Helicobacter | acidophile | neutrophile |
| ph_range | Gluconobacter | acidophile | neutrophile |
| salinity | Halobacterium | halophile | halotolerant |
| salinity | Halobacillus | halophile | halotolerant |
| salinity | Halomonas | halophile | halotolerant |
| salinity | Salinicoccus | halophile | halotolerant |
| salinity | Staphylococcus | halotolerant | halophile |
