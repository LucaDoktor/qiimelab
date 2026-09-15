# Conflictos MD2 vs curación manual

Generado por scripts/build-phenotypes-md2.mjs — umbral de consenso 0.7.
Estos géneros ya tenían un rasgo asignado a mano en una categoría excluyente
(Gram, esporulación, temperatura, pH o salinidad) que MD2 contradice. NO se
han sobrescrito automáticamente — revisar caso por caso antes de decidir.

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
