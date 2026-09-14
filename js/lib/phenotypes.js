// Diccionario de referencia fenotípica, morfológica, fisiológica y ecológica (BacDive / metaTraits)
// Mapeo estandarizado de taxones procariontes a rasgos biológicos fundamentales
// basados en estándares de BacDive (DSMZ) y metaTraits ontology.

export const PHENOTYPES_METADATA = {
  name: 'BacDive / metaTraits Comprehensive Core',
  version: '2.0.0',
  reference: 'BacDive - The Bacterial Diversity Metadatabase (DSMZ) & metaTraits ontology standard.',
  categoriesCount: 10,
  traitsCount: 28,
};

export const PHENOTYPE_CATEGORIES = {
  gram_stain: {
    name: { es: 'Tinción Gram', en: 'Gram Stain' },
    traits: ['gram_positive', 'gram_negative'],
  },
  cell_morphology: {
    name: { es: 'Morfología Celular', en: 'Cell Morphology' },
    traits: ['bacillus', 'coccus', 'spirillum', 'pleomorphic'],
  },
  motility: {
    name: { es: 'Movilidad', en: 'Motility' },
    traits: ['motile', 'non_motile'],
  },
  sporulation: {
    name: { es: 'Esporulación', en: 'Sporulation' },
    traits: ['spore_forming', 'non_spore_forming'],
  },
  oxygen_requirement: {
    name: { es: 'Requerimiento de Oxígeno', en: 'Oxygen Requirement' },
    traits: ['aerobe', 'anaerobe', 'facultative_anaerobe'],
  },
  temperature_range: {
    name: { es: 'Rango de Temperatura Óptima', en: 'Optimal Temperature Range' },
    traits: ['thermophile', 'mesophile', 'psychrophile'],
  },
  ph_range: {
    name: { es: 'Rango de pH', en: 'pH Range' },
    traits: ['acidophile', 'neutrophile', 'alkaliphile'],
  },
  key_enzymes: {
    name: { es: 'Enzimas Clave y Diagnósticas', en: 'Key Diagnostic Enzymes' },
    traits: ['catalase_positive', 'catalase_negative', 'oxidase_positive', 'oxidase_negative', 'cellulase_positive'],
  },
  ecology: {
    name: { es: 'Ecología y Estilo de Vida', en: 'Ecology and Lifestyle' },
    traits: ['biofilm_forming', 'pathogenic', 'extremophile'],
  },
  salinity: {
    name: { es: 'Tolerancia Salina', en: 'Salinity Tolerance' },
    traits: ['halophile', 'halotolerant'],
  },
};

export const DEFAULT_PHENOTYPES = {
  // -------------------------------------------------------------------------
  // 1. Tinción Gram
  // -------------------------------------------------------------------------
  gram_stain: {
    gram_positive: [
      'Clostridium', 'g__Clostridium', 'f__Clostridiaceae',
      'Bacillus', 'g__Bacillus', 'f__Bacillaceae',
      'Staphylococcus', 'g__Staphylococcus', 'f__Staphylococcaceae',
      'Streptococcus', 'g__Streptococcus', 'f__Streptococcaceae',
      'Lactobacillus', 'g__Lactobacillus', 'f__Lactobacillaceae',
      'Bifidobacterium', 'g__Bifidobacterium', 'f__Bifidobacteriaceae',
      'Enterococcus', 'g__Enterococcus', 'f__Enterococcaceae',
      'Corynebacterium', 'g__Corynebacterium', 'f__Corynebacteriaceae',
      'Streptomyces', 'g__Streptomyces', 'f__Streptomycetaceae',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Micrococcus', 'g__Micrococcus', 'f__Micrococcaceae',
      'Ruminococcus', 'g__Ruminococcus', 'f__Ruminococcaceae',
      'Mycobacterium', 'g__Mycobacterium', 'f__Mycobacteriaceae',
      'Cutibacterium', 'g__Cutibacterium', 'Propionibacterium', 'g__Propionibacterium',
      'Geobacillus', 'g__Geobacillus',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Alkaliphilus', 'g__Alkaliphilus',
      'Cellulomonas', 'g__Cellulomonas',
      'Methanobrevibacter', 'g__Methanobrevibacter',
      'Listeria', 'g__Listeria', 'f__Listeriaceae',
      'Leuconostoc', 'g__Leuconostoc',
      'Pediococcus', 'g__Pediococcus',
      'Actinomyces', 'g__Actinomyces', 'f__Actinomycetaceae',
      'p__Firmicutes', 'p__Actinobacteria', 'p__Actinobacteriota'
    ],
    gram_negative: [
      'Pseudomonas', 'g__Pseudomonas', 'f__Pseudomonadaceae',
      'Escherichia', 'g__Escherichia', 'f__Enterobacteriaceae',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Enterobacter', 'g__Enterobacter',
      'Citrobacter', 'g__Citrobacter',
      'Proteus', 'g__Proteus',
      'Bacteroides', 'g__Bacteroides', 'f__Bacteroidaceae',
      'Prevotella', 'g__Prevotella', 'f__Prevotellaceae',
      'Helicobacter', 'g__Helicobacter', 'f__Helicobacteraceae',
      'Campylobacter', 'g__Campylobacter', 'f__Campylobacteraceae',
      'Spirillum', 'g__Spirillum', 'f__Spirillaceae',
      'Vibrio', 'g__Vibrio', 'f__Vibrionaceae',
      'Neisseria', 'g__Neisseria', 'f__Neisseriaceae',
      'Treponema', 'g__Treponema', 'f__Spirochaetaceae',
      'Borrelia', 'g__Borrelia',
      'Desulfovibrio', 'g__Desulfovibrio', 'f__Desulfovibrionaceae',
      'Rhizobium', 'g__Rhizobium', 'f__Rhizobiaceae',
      'Bradyrhizobium', 'g__Bradyrhizobium',
      'Sinorhizobium', 'g__Sinorhizobium',
      'Azotobacter', 'g__Azotobacter', 'f__Azotobacteraceae',
      'Acinetobacter', 'g__Acinetobacter',
      'Nitrosomonas', 'g__Nitrosomonas', 'f__Nitrosomonadaceae',
      'Nitrobacter', 'g__Nitrobacter', 'f__Nitrobacteraceae',
      'Nitrospira', 'g__Nitrospira', 'f__Nitrospiraceae',
      'Thermus', 'g__Thermus', 'f__Thermaceae',
      'Halomonas', 'g__Halomonas', 'f__Halomonadaceae',
      'Salinibacter', 'g__Salinibacter',
      'Psychrobacter', 'g__Psychrobacter',
      'Polaribacter', 'g__Polaribacter',
      'Colwellia', 'g__Colwellia',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Acetobacter', 'g__Acetobacter', 'f__Acetobacteraceae',
      'Fibrobacter', 'g__Fibrobacter', 'f__Fibrobacteraceae',
      'Mycoplasma', 'g__Mycoplasma', 'f__Mycoplasmataceae',
      'Legionella', 'g__Legionella', 'f__Legionellaceae',
      'Haemophilus', 'g__Haemophilus', 'f__Pasteurellaceae',
      'Burkholderia', 'g__Burkholderia', 'f__Burkholderiaceae',
      'Ralstonia', 'g__Ralstonia',
      'Shewanella', 'g__Shewanella', 'f__Shewanellaceae',
      'p__Proteobacteria', 'p__Bacteroidetes', 'p__Bacteroidota'
    ]
  },

  // -------------------------------------------------------------------------
  // 2. Morfología Celular
  // -------------------------------------------------------------------------
  cell_morphology: {
    bacillus: [
      'Clostridium', 'g__Clostridium',
      'Pseudomonas', 'g__Pseudomonas',
      'Bacillus', 'g__Bacillus',
      'Escherichia', 'g__Escherichia',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Enterobacter', 'g__Enterobacter',
      'Citrobacter', 'g__Citrobacter',
      'Proteus', 'g__Proteus',
      'Lactobacillus', 'g__Lactobacillus',
      'Bacteroides', 'g__Bacteroides',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Rhizobium', 'g__Rhizobium',
      'Bradyrhizobium', 'g__Bradyrhizobium',
      'Acinetobacter', 'g__Acinetobacter',
      'Nitrosomonas', 'g__Nitrosomonas',
      'Nitrobacter', 'g__Nitrobacter',
      'Thermus', 'g__Thermus',
      'Geobacillus', 'g__Geobacillus',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Halomonas', 'g__Halomonas',
      'Salinibacter', 'g__Salinibacter',
      'Psychrobacter', 'g__Psychrobacter',
      'Polaribacter', 'g__Polaribacter',
      'Colwellia', 'g__Colwellia',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Acetobacter', 'g__Acetobacter',
      'Fibrobacter', 'g__Fibrobacter',
      'Alkaliphilus', 'g__Alkaliphilus',
      'Mycobacterium', 'g__Mycobacterium',
      'Listeria', 'g__Listeria',
      'Legionella', 'g__Legionella',
      'Haemophilus', 'g__Haemophilus',
      'Burkholderia', 'g__Burkholderia',
      'Shewanella', 'g__Shewanella',
      'Vibrio', 'g__Vibrio'
    ],
    coccus: [
      'Staphylococcus', 'g__Staphylococcus',
      'Streptococcus', 'g__Streptococcus',
      'Enterococcus', 'g__Enterococcus',
      'Neisseria', 'g__Neisseria',
      'Micrococcus', 'g__Micrococcus',
      'Ruminococcus', 'g__Ruminococcus',
      'Leuconostoc', 'g__Leuconostoc',
      'Pediococcus', 'g__Pediococcus',
      'Paracoccus', 'g__Paracoccus',
      'Nitrosococcus', 'g__Nitrosococcus',
      'Nitrococcus', 'g__Nitrococcus',
      'Deinococcus', 'g__Deinococcus',
      'Moraxella', 'g__Moraxella',
      'Veillonella', 'g__Veillonella'
    ],
    spirillum: [
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Spirillum', 'g__Spirillum',
      'Treponema', 'g__Treponema',
      'Borrelia', 'g__Borrelia',
      'Leptospira', 'g__Leptospira',
      'Desulfovibrio', 'g__Desulfovibrio',
      'Nitrospira', 'g__Nitrospira',
      'Rhodospirillum', 'g__Rhodospirillum',
      'Azospirillum', 'g__Azospirillum',
      'Arcobacter', 'g__Arcobacter'
    ],
    pleomorphic: [
      'Bifidobacterium', 'g__Bifidobacterium',
      'Corynebacterium', 'g__Corynebacterium',
      'Streptomyces', 'g__Streptomyces',
      'Actinomyces', 'g__Actinomyces',
      'Azotobacter', 'g__Azotobacter',
      'Cutibacterium', 'g__Cutibacterium', 'Propionibacterium', 'g__Propionibacterium',
      'Mycoplasma', 'g__Mycoplasma',
      'Prevotella', 'g__Prevotella',
      'Cellulomonas', 'g__Cellulomonas',
      'Frankia', 'g__Frankia',
      'Nocardia', 'g__Nocardia',
      'Arthrobacter', 'g__Arthrobacter',
      'Sinorhizobium', 'g__Sinorhizobium'
    ]
  },

  // -------------------------------------------------------------------------
  // 3. Movilidad
  // -------------------------------------------------------------------------
  motility: {
    motile: [
      'Clostridium', 'g__Clostridium',
      'Pseudomonas', 'g__Pseudomonas',
      'Bacillus', 'g__Bacillus',
      'Escherichia', 'g__Escherichia',
      'Salmonella', 'g__Salmonella',
      'Proteus', 'g__Proteus',
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Spirillum', 'g__Spirillum',
      'Vibrio', 'g__Vibrio',
      'Treponema', 'g__Treponema',
      'Borrelia', 'g__Borrelia',
      'Desulfovibrio', 'g__Desulfovibrio',
      'Rhizobium', 'g__Rhizobium',
      'Bradyrhizobium', 'g__Bradyrhizobium',
      'Sinorhizobium', 'g__Sinorhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Nitrosomonas', 'g__Nitrosomonas',
      'Geobacillus', 'g__Geobacillus',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Halomonas', 'g__Halomonas',
      'Salinibacter', 'g__Salinibacter',
      'Colwellia', 'g__Colwellia',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Acetobacter', 'g__Acetobacter',
      'Alkaliphilus', 'g__Alkaliphilus',
      'Cellulomonas', 'g__Cellulomonas',
      'Legionella', 'g__Legionella',
      'Burkholderia', 'g__Burkholderia',
      'Shewanella', 'g__Shewanella',
      'Serratia', 'g__Serratia',
      'Enterobacter', 'g__Enterobacter',
      'Listeria', 'g__Listeria'
    ],
    non_motile: [
      'Staphylococcus', 'g__Staphylococcus',
      'Streptococcus', 'g__Streptococcus',
      'Lactobacillus', 'g__Lactobacillus',
      'Bifidobacterium', 'g__Bifidobacterium',
      'Bacteroides', 'g__Bacteroides',
      'Prevotella', 'g__Prevotella',
      'Klebsiella', 'g__Klebsiella',
      'Neisseria', 'g__Neisseria',
      'Corynebacterium', 'g__Corynebacterium',
      'Streptomyces', 'g__Streptomyces',
      'Actinomyces', 'g__Actinomyces',
      'Enterococcus', 'g__Enterococcus',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Micrococcus', 'g__Micrococcus',
      'Acinetobacter', 'g__Acinetobacter',
      'Ruminococcus', 'g__Ruminococcus',
      'Cutibacterium', 'g__Cutibacterium', 'Propionibacterium', 'g__Propionibacterium',
      'Mycobacterium', 'g__Mycobacterium',
      'Mycoplasma', 'g__Mycoplasma',
      'Thermus', 'g__Thermus',
      'Psychrobacter', 'g__Psychrobacter',
      'Polaribacter', 'g__Polaribacter',
      'Fibrobacter', 'g__Fibrobacter',
      'Methanobrevibacter', 'g__Methanobrevibacter',
      'Leuconostoc', 'g__Leuconostoc',
      'Pediococcus', 'g__Pediococcus',
      'Haemophilus', 'g__Haemophilus',
      'Moraxella', 'g__Moraxella',
      'Veillonella', 'g__Veillonella'
    ]
  },

  // -------------------------------------------------------------------------
  // 4. Esporulación
  // -------------------------------------------------------------------------
  sporulation: {
    spore_forming: [
      'Clostridium', 'g__Clostridium', 'f__Clostridiaceae',
      'Bacillus', 'g__Bacillus', 'f__Bacillaceae',
      'Streptomyces', 'g__Streptomyces', 'f__Streptomycetaceae',
      'Geobacillus', 'g__Geobacillus',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Alkaliphilus', 'g__Alkaliphilus',
      'Desulfotomaculum', 'g__Desulfotomaculum',
      'Paenibacillus', 'g__Paenibacillus',
      'Brevibacillus', 'g__Brevibacillus',
      'Lysinibacillus', 'g__Lysinibacillus',
      'Sporolactobacillus', 'g__Sporolactobacillus',
      'Sporosarcina', 'g__Sporosarcina',
      'Actinomyces', 'g__Actinomyces',
      'Frankia', 'g__Frankia'
    ],
    non_spore_forming: [
      'Pseudomonas', 'g__Pseudomonas',
      'Escherichia', 'g__Escherichia',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Staphylococcus', 'g__Staphylococcus',
      'Streptococcus', 'g__Streptococcus',
      'Lactobacillus', 'g__Lactobacillus',
      'Bifidobacterium', 'g__Bifidobacterium',
      'Bacteroides', 'g__Bacteroides',
      'Prevotella', 'g__Prevotella',
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Spirillum', 'g__Spirillum',
      'Vibrio', 'g__Vibrio',
      'Neisseria', 'g__Neisseria',
      'Treponema', 'g__Treponema',
      'Borrelia', 'g__Borrelia',
      'Enterococcus', 'g__Enterococcus',
      'Corynebacterium', 'g__Corynebacterium',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Desulfovibrio', 'g__Desulfovibrio',
      'Rhizobium', 'g__Rhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Micrococcus', 'g__Micrococcus',
      'Acinetobacter', 'g__Acinetobacter',
      'Ruminococcus', 'g__Ruminococcus',
      'Cutibacterium', 'g__Cutibacterium', 'Propionibacterium', 'g__Propionibacterium',
      'Mycobacterium', 'g__Mycobacterium',
      'Nitrosomonas', 'g__Nitrosomonas',
      'Nitrobacter', 'g__Nitrobacter',
      'Nitrospira', 'g__Nitrospira',
      'Thermus', 'g__Thermus',
      'Halomonas', 'g__Halomonas',
      'Salinibacter', 'g__Salinibacter',
      'Psychrobacter', 'g__Psychrobacter',
      'Polaribacter', 'g__Polaribacter',
      'Colwellia', 'g__Colwellia',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Acetobacter', 'g__Acetobacter',
      'Fibrobacter', 'g__Fibrobacter',
      'Cellulomonas', 'g__Cellulomonas',
      'Mycoplasma', 'g__Mycoplasma',
      'Methanobrevibacter', 'g__Methanobrevibacter',
      'Listeria', 'g__Listeria',
      'Leuconostoc', 'g__Leuconostoc',
      'Pediococcus', 'g__Pediococcus'
    ]
  },

  // -------------------------------------------------------------------------
  // 5. Requerimiento de Oxígeno
  // -------------------------------------------------------------------------
  oxygen_requirement: {
    aerobe: [
      'Pseudomonas', 'g__Pseudomonas',
      'Bacillus', 'g__Bacillus',
      'Rhizobium', 'g__Rhizobium',
      'Bradyrhizobium', 'g__Bradyrhizobium',
      'Sinorhizobium', 'g__Sinorhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Spirillum', 'g__Spirillum',
      'Neisseria', 'g__Neisseria',
      'Micrococcus', 'g__Micrococcus',
      'Acinetobacter', 'g__Acinetobacter',
      'Streptomyces', 'g__Streptomyces',
      'Mycobacterium', 'g__Mycobacterium',
      'Nitrosomonas', 'g__Nitrosomonas',
      'Nitrobacter', 'g__Nitrobacter',
      'Nitrospira', 'g__Nitrospira',
      'Thermus', 'g__Thermus',
      'Geobacillus', 'g__Geobacillus',
      'Halomonas', 'g__Halomonas',
      'Salinibacter', 'g__Salinibacter',
      'Psychrobacter', 'g__Psychrobacter',
      'Polaribacter', 'g__Polaribacter',
      'Colwellia', 'g__Colwellia',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Acetobacter', 'g__Acetobacter',
      'Legionella', 'g__Legionella',
      'Burkholderia', 'g__Burkholderia',
      'Ralstonia', 'g__Ralstonia'
    ],
    anaerobe: [
      'Clostridium', 'g__Clostridium', 'f__Clostridiaceae',
      'Bacteroides', 'g__Bacteroides', 'f__Bacteroidaceae',
      'Bifidobacterium', 'g__Bifidobacterium', 'f__Bifidobacteriaceae',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Prevotella', 'g__Prevotella', 'f__Prevotellaceae',
      'Desulfovibrio', 'g__Desulfovibrio', 'f__Desulfovibrionaceae',
      'Treponema', 'g__Treponema',
      'Borrelia', 'g__Borrelia',
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Ruminococcus', 'g__Ruminococcus',
      'Cutibacterium', 'g__Cutibacterium', 'Propionibacterium', 'g__Propionibacterium',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Alkaliphilus', 'g__Alkaliphilus',
      'Fibrobacter', 'g__Fibrobacter',
      'Methanobrevibacter', 'g__Methanobrevibacter',
      'Veillonella', 'g__Veillonella',
      'Fusobacterium', 'g__Fusobacterium',
      'Actinomyces', 'g__Actinomyces',
      'Peptostreptococcus', 'g__Peptostreptococcus'
    ],
    facultative_anaerobe: [
      'Escherichia', 'g__Escherichia', 'f__Enterobacteriaceae',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Enterobacter', 'g__Enterobacter',
      'Citrobacter', 'g__Citrobacter',
      'Proteus', 'g__Proteus',
      'Staphylococcus', 'g__Staphylococcus', 'f__Staphylococcaceae',
      'Streptococcus', 'g__Streptococcus', 'f__Streptococcaceae',
      'Enterococcus', 'g__Enterococcus', 'f__Enterococcaceae',
      'Lactobacillus', 'g__Lactobacillus', 'f__Lactobacillaceae',
      'Corynebacterium', 'g__Corynebacterium',
      'Vibrio', 'g__Vibrio', 'f__Vibrionaceae',
      'Cellulomonas', 'g__Cellulomonas',
      'Listeria', 'g__Listeria',
      'Leuconostoc', 'g__Leuconostoc',
      'Pediococcus', 'g__Pediococcus',
      'Haemophilus', 'g__Haemophilus',
      'Shewanella', 'g__Shewanella',
      'Mycoplasma', 'g__Mycoplasma',
      'Bacillus', 'g__Bacillus'
    ]
  },

  // -------------------------------------------------------------------------
  // 6. Rango de Temperatura Óptima
  // -------------------------------------------------------------------------
  temperature_range: {
    thermophile: [
      'Thermus', 'g__Thermus', 'f__Thermaceae',
      'Geobacillus', 'g__Geobacillus',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Campylobacter', 'g__Campylobacter',
      'Thermotoga', 'g__Thermotoga',
      'Aquifex', 'g__Aquifex',
      'Sulfolobus', 'g__Sulfolobus',
      'Pyrococcus', 'g__Pyrococcus',
      'Methanocaldococcus', 'g__Methanocaldococcus',
      'Thermococcus', 'g__Thermococcus',
      'Desulfotomaculum', 'g__Desulfotomaculum',
      'Candidatus Nitrosocaldus',
      'Chloroflexus', 'g__Chloroflexus'
    ],
    mesophile: [
      'Pseudomonas', 'g__Pseudomonas',
      'Clostridium', 'g__Clostridium',
      'Bacillus', 'g__Bacillus',
      'Escherichia', 'g__Escherichia',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Staphylococcus', 'g__Staphylococcus',
      'Streptococcus', 'g__Streptococcus',
      'Lactobacillus', 'g__Lactobacillus',
      'Bifidobacterium', 'g__Bifidobacterium',
      'Bacteroides', 'g__Bacteroides',
      'Prevotella', 'g__Prevotella',
      'Helicobacter', 'g__Helicobacter',
      'Spirillum', 'g__Spirillum',
      'Vibrio', 'g__Vibrio',
      'Neisseria', 'g__Neisseria',
      'Treponema', 'g__Treponema',
      'Enterococcus', 'g__Enterococcus',
      'Corynebacterium', 'g__Corynebacterium',
      'Streptomyces', 'g__Streptomyces',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Desulfovibrio', 'g__Desulfovibrio',
      'Rhizobium', 'g__Rhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Micrococcus', 'g__Micrococcus',
      'Acinetobacter', 'g__Acinetobacter',
      'Ruminococcus', 'g__Ruminococcus',
      'Cutibacterium', 'g__Cutibacterium', 'Propionibacterium', 'g__Propionibacterium',
      'Mycobacterium', 'g__Mycobacterium',
      'Nitrosomonas', 'g__Nitrosomonas',
      'Nitrobacter', 'g__Nitrobacter',
      'Nitrospira', 'g__Nitrospira',
      'Halomonas', 'g__Halomonas',
      'Salinibacter', 'g__Salinibacter',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Acetobacter', 'g__Acetobacter',
      'Fibrobacter', 'g__Fibrobacter',
      'Alkaliphilus', 'g__Alkaliphilus',
      'Cellulomonas', 'g__Cellulomonas',
      'Mycoplasma', 'g__Mycoplasma',
      'Methanobrevibacter', 'g__Methanobrevibacter',
      'Listeria', 'g__Listeria'
    ],
    psychrophile: [
      'Psychrobacter', 'g__Psychrobacter',
      'Polaribacter', 'g__Polaribacter',
      'Colwellia', 'g__Colwellia',
      'Pseudoalteromonas', 'g__Pseudoalteromonas',
      'Shewanella', 'g__Shewanella',
      'Moritella', 'g__Moritella',
      'Psychromonas', 'g__Psychromonas',
      'Flavobacterium', 'g__Flavobacterium',
      'Glaciecola', 'g__Glaciecola',
      'Arthrobacter', 'g__Arthrobacter',
      'Planococcus', 'g__Planococcus'
    ]
  },

  // -------------------------------------------------------------------------
  // 7. Rango de pH
  // -------------------------------------------------------------------------
  ph_range: {
    acidophile: [
      'Lactobacillus', 'g__Lactobacillus', 'f__Lactobacillaceae',
      'Streptococcus', 'g__Streptococcus',
      'Bifidobacterium', 'g__Bifidobacterium',
      'Helicobacter', 'g__Helicobacter',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Acetobacter', 'g__Acetobacter',
      'Gluconobacter', 'g__Gluconobacter',
      'Acidobacterium', 'g__Acidobacterium', 'p__Acidobacteriota',
      'Alicyclobacillus', 'g__Alicyclobacillus',
      'Sulfolobus', 'g__Sulfolobus',
      'Pediococcus', 'g__Pediococcus',
      'Enterococcus', 'g__Enterococcus'
    ],
    neutrophile: [
      'Pseudomonas', 'g__Pseudomonas',
      'Clostridium', 'g__Clostridium',
      'Bacillus', 'g__Bacillus',
      'Escherichia', 'g__Escherichia',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Staphylococcus', 'g__Staphylococcus',
      'Bacteroides', 'g__Bacteroides',
      'Prevotella', 'g__Prevotella',
      'Spirillum', 'g__Spirillum',
      'Vibrio', 'g__Vibrio',
      'Neisseria', 'g__Neisseria',
      'Treponema', 'g__Treponema',
      'Corynebacterium', 'g__Corynebacterium',
      'Streptomyces', 'g__Streptomyces',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Desulfovibrio', 'g__Desulfovibrio',
      'Rhizobium', 'g__Rhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Micrococcus', 'g__Micrococcus',
      'Acinetobacter', 'g__Acinetobacter',
      'Ruminococcus', 'g__Ruminococcus',
      'Mycobacterium', 'g__Mycobacterium',
      'Nitrosomonas', 'g__Nitrosomonas',
      'Nitrobacter', 'g__Nitrobacter',
      'Nitrospira', 'g__Nitrospira',
      'Halomonas', 'g__Halomonas',
      'Psychrobacter', 'g__Psychrobacter',
      'Fibrobacter', 'g__Fibrobacter',
      'Cellulomonas', 'g__Cellulomonas',
      'Listeria', 'g__Listeria'
    ],
    alkaliphile: [
      'Alkaliphilus', 'g__Alkaliphilus',
      'Bacillus', 'g__Bacillus',
      'Salinibacter', 'g__Salinibacter',
      'Natronomonas', 'g__Natronomonas',
      'Natronobacterium', 'g__Natronobacterium',
      'Halomonas', 'g__Halomonas',
      'Micrococcus', 'g__Micrococcus',
      'Thioalkalivibrio', 'g__Thioalkalivibrio',
      'Nitrosomonas', 'g__Nitrosomonas'
    ]
  },

  // -------------------------------------------------------------------------
  // 8. Enzimas Clave y Diagnósticas
  // -------------------------------------------------------------------------
  key_enzymes: {
    catalase_positive: [
      'Pseudomonas', 'g__Pseudomonas',
      'Bacillus', 'g__Bacillus',
      'Staphylococcus', 'g__Staphylococcus',
      'Escherichia', 'g__Escherichia',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Bacteroides', 'g__Bacteroides',
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Vibrio', 'g__Vibrio',
      'Neisseria', 'g__Neisseria',
      'Corynebacterium', 'g__Corynebacterium',
      'Streptomyces', 'g__Streptomyces',
      'Rhizobium', 'g__Rhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Micrococcus', 'g__Micrococcus',
      'Acinetobacter', 'g__Acinetobacter',
      'Mycobacterium', 'g__Mycobacterium',
      'Thermus', 'g__Thermus',
      'Geobacillus', 'g__Geobacillus',
      'Halomonas', 'g__Halomonas',
      'Psychrobacter', 'g__Psychrobacter',
      'Acetobacter', 'g__Acetobacter',
      'Cellulomonas', 'g__Cellulomonas',
      'Listeria', 'g__Listeria',
      'Desulfovibrio', 'g__Desulfovibrio'
    ],
    catalase_negative: [
      'Clostridium', 'g__Clostridium',
      'Streptococcus', 'g__Streptococcus',
      'Lactobacillus', 'g__Lactobacillus',
      'Enterococcus', 'g__Enterococcus',
      'Bifidobacterium', 'g__Bifidobacterium',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Ruminococcus', 'g__Ruminococcus',
      'Leuconostoc', 'g__Leuconostoc',
      'Pediococcus', 'g__Pediococcus',
      'Actinomyces', 'g__Actinomyces',
      'Veillonella', 'g__Veillonella',
      'Methanobrevibacter', 'g__Methanobrevibacter'
    ],
    oxidase_positive: [
      'Pseudomonas', 'g__Pseudomonas',
      'Neisseria', 'g__Neisseria',
      'Vibrio', 'g__Vibrio',
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Spirillum', 'g__Spirillum',
      'Rhizobium', 'g__Rhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Micrococcus', 'g__Micrococcus',
      'Thermus', 'g__Thermus',
      'Halomonas', 'g__Halomonas',
      'Psychrobacter', 'g__Psychrobacter',
      'Moraxella', 'g__Moraxella',
      'Aeromonas', 'g__Aeromonas',
      'Alcaligenes', 'g__Alcaligenes',
      'Shewanella', 'g__Shewanella',
      'Paracoccus', 'g__Paracoccus'
    ],
    oxidase_negative: [
      'Escherichia', 'g__Escherichia', 'f__Enterobacteriaceae',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Proteus', 'g__Proteus',
      'Enterobacter', 'g__Enterobacter',
      'Citrobacter', 'g__Citrobacter',
      'Staphylococcus', 'g__Staphylococcus',
      'Streptococcus', 'g__Streptococcus',
      'Enterococcus', 'g__Enterococcus',
      'Lactobacillus', 'g__Lactobacillus',
      'Bifidobacterium', 'g__Bifidobacterium',
      'Bacteroides', 'g__Bacteroides',
      'Clostridium', 'g__Clostridium',
      'Acinetobacter', 'g__Acinetobacter',
      'Faecalibacterium', 'g__Faecalibacterium',
      'Acetobacter', 'g__Acetobacter'
    ],
    cellulase_positive: [
      'Cellulomonas', 'g__Cellulomonas',
      'Clostridium', 'g__Clostridium',
      'Fibrobacter', 'g__Fibrobacter',
      'Ruminococcus', 'g__Ruminococcus',
      'Bacillus', 'g__Bacillus',
      'Streptomyces', 'g__Streptomyces',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Paenibacillus', 'g__Paenibacillus',
      'Cytophaga', 'g__Cytophaga',
      'Cellvibrio', 'g__Cellvibrio',
      'Bacteroides', 'g__Bacteroides',
      'Trichoderma', 'g__Trichoderma'
    ]
  },

  // -------------------------------------------------------------------------
  // 9. Ecología y Estilo de Vida
  // -------------------------------------------------------------------------
  ecology: {
    biofilm_forming: [
      'Pseudomonas', 'g__Pseudomonas',
      'Staphylococcus', 'g__Staphylococcus',
      'Escherichia', 'g__Escherichia',
      'Streptococcus', 'g__Streptococcus',
      'Enterococcus', 'g__Enterococcus',
      'Klebsiella', 'g__Klebsiella',
      'Acinetobacter', 'g__Acinetobacter',
      'Bacillus', 'g__Bacillus',
      'Lactobacillus', 'g__Lactobacillus',
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Vibrio', 'g__Vibrio',
      'Serratia', 'g__Serratia',
      'Legionella', 'g__Legionella',
      'Burkholderia', 'g__Burkholderia',
      'Mycobacterium', 'g__Mycobacterium',
      'Acetobacter', 'g__Acetobacter',
      'Rhizobium', 'g__Rhizobium',
      'Azotobacter', 'g__Azotobacter',
      'Streptomyces', 'g__Streptomyces',
      'Bacteroides', 'g__Bacteroides',
      'Prevotella', 'g__Prevotella',
      'Cutibacterium', 'g__Cutibacterium', 'Propionibacterium', 'g__Propionibacterium',
      'Neisseria', 'g__Neisseria'
    ],
    pathogenic: [
      'Pseudomonas', 'g__Pseudomonas',
      'Staphylococcus', 'g__Staphylococcus',
      'Streptococcus', 'g__Streptococcus',
      'Enterococcus', 'g__Enterococcus',
      'Escherichia', 'g__Escherichia',
      'Salmonella', 'g__Salmonella',
      'Klebsiella', 'g__Klebsiella',
      'Serratia', 'g__Serratia',
      'Clostridium', 'g__Clostridium',
      'Helicobacter', 'g__Helicobacter',
      'Campylobacter', 'g__Campylobacter',
      'Vibrio', 'g__Vibrio',
      'Neisseria', 'g__Neisseria',
      'Treponema', 'g__Treponema',
      'Borrelia', 'g__Borrelia',
      'Mycobacterium', 'g__Mycobacterium',
      'Listeria', 'g__Listeria',
      'Legionella', 'g__Legionella',
      'Haemophilus', 'g__Haemophilus',
      'Burkholderia', 'g__Burkholderia',
      'Acinetobacter', 'g__Acinetobacter',
      'Corynebacterium', 'g__Corynebacterium',
      'Prevotella', 'g__Prevotella',
      'Fusobacterium', 'g__Fusobacterium'
    ],
    extremophile: [
      'Thermus', 'g__Thermus',
      'Geobacillus', 'g__Geobacillus',
      'Thermoanaerobacter', 'g__Thermoanaerobacter',
      'Halomonas', 'g__Halomonas',
      'Halobacterium', 'g__Halobacterium',
      'Salinibacter', 'g__Salinibacter',
      'Psychrobacter', 'g__Psychrobacter',
      'Polaribacter', 'g__Polaribacter',
      'Colwellia', 'g__Colwellia',
      'Acidithiobacillus', 'g__Acidithiobacillus',
      'Alkaliphilus', 'g__Alkaliphilus',
      'Sulfolobus', 'g__Sulfolobus',
      'Pyrococcus', 'g__Pyrococcus',
      'Aquifex', 'g__Aquifex',
      'Thermotoga', 'g__Thermotoga',
      'Deinococcus', 'g__Deinococcus'
    ]
  },

  // -------------------------------------------------------------------------
  // 10. Tolerancia Salina
  // -------------------------------------------------------------------------
  salinity: {
    halophile: [
      'Halomonas', 'g__Halomonas',
      'Halobacterium', 'g__Halobacterium',
      'Salinibacter', 'g__Salinibacter',
      'Natronomonas', 'g__Natronomonas',
      'Natronobacterium', 'g__Natronobacterium',
      'Vibrio', 'g__Vibrio',
      'Halobacillus', 'g__Halobacillus',
      'Haloferax', 'g__Haloferax',
      'Halococcus', 'g__Halococcus',
      'Salinicoccus', 'g__Salinicoccus'
    ],
    halotolerant: [
      'Staphylococcus', 'g__Staphylococcus',
      'Bacillus', 'g__Bacillus',
      'Enterococcus', 'g__Enterococcus',
      'Micrococcus', 'g__Micrococcus',
      'Psychrobacter', 'g__Psychrobacter',
      'Planococcus', 'g__Planococcus',
      'Vibrio', 'g__Vibrio',
      'Halomonas', 'g__Halomonas',
      'Corynebacterium', 'g__Corynebacterium',
      'Listeria', 'g__Listeria',
      'Acinetobacter', 'g__Acinetobacter'
    ]
  }
};

// Asignar los rasgos planos directamente sobre DEFAULT_PHENOTYPES para máxima compatibilidad
// (permite acceso tanto categorizado como plano: DEFAULT_PHENOTYPES.gram_positive)
Object.keys(DEFAULT_PHENOTYPES).forEach((catKey) => {
  const catObj = DEFAULT_PHENOTYPES[catKey];
  if (catObj && typeof catObj === 'object' && !Array.isArray(catObj)) {
    Object.assign(DEFAULT_PHENOTYPES, catObj);
  }
});

export const FLAT_PHENOTYPES = { ...DEFAULT_PHENOTYPES };

export const PHENOTYPE_NAMES = {
  // Tinción Gram
  gram_positive: { es: 'Gram positivo', en: 'Gram-positive' },
  gram_negative: { es: 'Gram negativo', en: 'Gram-negative' },

  // Morfología Celular
  bacillus: { es: 'Bacilo (Bastón)', en: 'Bacillus (Rod)' },
  coccus: { es: 'Coco (Esférico)', en: 'Coccus (Spherical)' },
  spirillum: { es: 'Espirilo / Espiral', en: 'Spirillum / Spiral' },
  pleomorphic: { es: 'Pleomórfico', en: 'Pleomorphic' },

  // Movilidad
  motile: { es: 'Móvil', en: 'Motile' },
  non_motile: { es: 'No móvil (Inmóvil)', en: 'Non-motile' },

  // Esporulación
  spore_forming: { es: 'Formador de endosporas', en: 'Spore-forming' },
  non_spore_forming: { es: 'No formador de esporas', en: 'Non-spore-forming' },

  // Requerimiento de Oxígeno
  aerobe: { es: 'Aerobio estricto', en: 'Strict aerobe' },
  anaerobe: { es: 'Anaerobio estricto', en: 'Strict anaerobe' },
  facultative_anaerobe: { es: 'Anaerobio facultativo', en: 'Facultative anaerobe' },

  // Rango de Temperatura
  thermophile: { es: 'Termófilo (>45°C)', en: 'Thermophile (>45°C)' },
  mesophile: { es: 'Mesófilo (20-45°C)', en: 'Mesophile (20-45°C)' },
  psychrophile: { es: 'Psicrófilo (<20°C)', en: 'Psychrophile (<20°C)' },

  // Rango de pH
  acidophile: { es: 'Acidófilo (pH < 5.5)', en: 'Acidophile (pH < 5.5)' },
  neutrophile: { es: 'Neutrófilo (pH 5.5-8)', en: 'Neutrophile (pH 5.5-8)' },
  alkaliphile: { es: 'Alcalífilo (pH > 8)', en: 'Alkaliphile (pH > 8)' },

  // Enzimas Clave
  catalase_positive: { es: 'Catalasa positiva', en: 'Catalase positive' },
  catalase_negative: { es: 'Catalasa negativa', en: 'Catalase negative' },
  oxidase_positive: { es: 'Oxidasa positiva', en: 'Oxidase positive' },
  oxidase_negative: { es: 'Oxidasa negativa', en: 'Oxidase negative' },
  cellulase_positive: { es: 'Celulasa positiva (Celulolítico)', en: 'Cellulase positive' },

  // Ecología y Estilo de Vida
  biofilm_forming: { es: 'Formador de biopelícula', en: 'Biofilm forming' },
  pathogenic: { es: 'Potencial patógeno', en: 'Potential pathogen' },
  extremophile: { es: 'Extremófilo', en: 'Extremophile' },

  // Tolerancia Salina
  halophile: { es: 'Halófilo (requiere sal)', en: 'Halophile' },
  halotolerant: { es: 'Halotolerante', en: 'Halotolerant' },

  // No asignado
  Sin_funcion_asignada: { es: 'Sin rasgo asignado', en: 'Unassigned trait' },
  Sin_rasgo_asignado: { es: 'Sin rasgo asignado', en: 'Unassigned trait' },
};

export default DEFAULT_PHENOTYPES;
