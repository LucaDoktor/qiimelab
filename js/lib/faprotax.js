// Diccionario de referencia FAPROTAX (Functional Annotation of Prokaryotic Taxa)
// Mapeo curado de taxones procariontes a funciones metabólicas y biogeoquímicas
// de referencia (Louca et al., 2016).

export const FAPROTAX_METADATA = {
  name: 'FAPROTAX Standard Core',
  version: '1.2.6',
  reference: 'Louca, S., Parfrey, L. W., & Doebeli, M. (2016). Decoupling function and taxonomy in the global ocean microbiome. Science, 353(6305), 1272-1277.',
  functionsCount: 22,
};

export const DEFAULT_FAPROTAX = {
  nitrification: [
    'Nitrosomonas', 'g__Nitrosomonas',
    'Nitrosococcus', 'g__Nitrosococcus',
    'Nitrosospira', 'g__Nitrosospira',
    'Nitrospira', 'g__Nitrospira',
    'Nitrobacter', 'g__Nitrobacter',
    'Nitrospina', 'g__Nitrospina',
    'Nitrococcus', 'g__Nitrococcus',
    'Nitrolancea', 'g__Nitrolancea',
    'f__Nitrosomonadaceae', 'f__Nitrospiraceae', 'f__Nitrobacteraceae'
  ],
  aerobic_ammonia_oxidation: [
    'Nitrosomonas', 'g__Nitrosomonas',
    'Nitrosococcus', 'g__Nitrosococcus',
    'Nitrosospira', 'g__Nitrosospira',
    'Nitrosopumilus', 'g__Nitrosopumilus',
    'Nitrososphaera', 'g__Nitrososphaera',
    'Candidatus Nitrosocaldus',
    'f__Nitrosomonadaceae'
  ],
  nitrite_oxidation: [
    'Nitrobacter', 'g__Nitrobacter',
    'Nitrospira', 'g__Nitrospira',
    'Nitrospina', 'g__Nitrospina',
    'Nitrococcus', 'g__Nitrococcus',
    'f__Nitrospiraceae'
  ],
  nitrogen_fixation: [
    'Azotobacter', 'g__Azotobacter',
    'Rhizobium', 'g__Rhizobium',
    'Bradyrhizobium', 'g__Bradyrhizobium',
    'Sinorhizobium', 'g__Sinorhizobium',
    'Mesorhizobium', 'g__Mesorhizobium',
    'Frankia', 'g__Frankia',
    'Nostoc', 'g__Nostoc',
    'Anabaena', 'g__Anabaena',
    'Clostridium', 'g__Clostridium',
    'Azospirillum', 'g__Azospirillum',
    'Rhodobacter', 'g__Rhodobacter',
    'Rhodopseudomonas', 'g__Rhodopseudomonas',
    'Beijerinckia', 'g__Beijerinckia',
    'Azoarcus', 'g__Azoarcus',
    'Cyanothece', 'g__Cyanothece',
    'Klebsiella', 'g__Klebsiella',
    'f__Rhizobiaceae'
  ],
  denitrification: [
    'Pseudomonas', 'g__Pseudomonas',
    'Paracoccus', 'g__Paracoccus',
    'Achromobacter', 'g__Achromobacter',
    'Alcaligenes', 'g__Alcaligenes',
    'Ralstonia', 'g__Ralstonia',
    'Thiobacillus', 'g__Thiobacillus',
    'Halomonas', 'g__Halomonas',
    'Denitratisoma', 'g__Denitratisoma'
  ],
  nitrate_reduction: [
    'Pseudomonas', 'g__Pseudomonas',
    'Escherichia', 'g__Escherichia',
    'Salmonella', 'g__Salmonella',
    'Klebsiella', 'g__Klebsiella',
    'Bacillus', 'g__Bacillus',
    'Serratia', 'g__Serratia',
    'Enterobacter', 'g__Enterobacter',
    'Citrobacter', 'g__Citrobacter',
    'Shewanella', 'g__Shewanella',
    'Vibrio', 'g__Vibrio',
    'f__Enterobacteriaceae'
  ],
  sulfate_respiration: [
    'Desulfovibrio', 'g__Desulfovibrio',
    'Desulfobacter', 'g__Desulfobacter',
    'Desulfococcus', 'g__Desulfococcus',
    'Desulfonema', 'g__Desulfonema',
    'Desulfobulbus', 'g__Desulfobulbus',
    'Desulfosarcina', 'g__Desulfosarcina',
    'Desulfobacterium', 'g__Desulfobacterium',
    'Desulfotomaculum', 'g__Desulfotomaculum',
    'Archaeoglobus', 'g__Archaeoglobus',
    'Desulfomicrobium', 'g__Desulfomicrobium',
    'f__Desulfovibrionaceae', 'f__Desulfobacteraceae'
  ],
  sulfur_oxidation: [
    'Thiobacillus', 'g__Thiobacillus',
    'Thiomicrospira', 'g__Thiomicrospira',
    'Acidithiobacillus', 'g__Acidithiobacillus',
    'Thiothrix', 'g__Thiothrix',
    'Beggiatoa', 'g__Beggiatoa',
    'Sulfolobus', 'g__Sulfolobus',
    'Chlorobium', 'g__Chlorobium',
    'Sulfurimonas', 'g__Sulfurimonas',
    'Sulfurovum', 'g__Sulfurovum'
  ],
  methanogenesis: [
    'Methanobacterium', 'g__Methanobacterium',
    'Methanobrevibacter', 'g__Methanobrevibacter',
    'Methanosarcina', 'g__Methanosarcina',
    'Methanothrix', 'g__Methanothrix',
    'Methanococcus', 'g__Methanococcus',
    'Methanoculleus', 'g__Methanoculleus',
    'Methanospirillum', 'g__Methanospirillum',
    'Methanosphaera', 'g__Methanosphaera',
    'Methanothermobacter', 'g__Methanothermobacter',
    'f__Methanobacteriaceae', 'f__Methanosarcinaceae'
  ],
  methanotrophy: [
    'Methylococcus', 'g__Methylococcus',
    'Methylomonas', 'g__Methylomonas',
    'Methylosinus', 'g__Methylosinus',
    'Methylocystis', 'g__Methylocystis',
    'Methylomicrobium', 'g__Methylomicrobium',
    'Methylacidiphilum', 'g__Methylacidiphilum',
    'Methylocaldum', 'g__Methylocaldum',
    'Methylobacter', 'g__Methylobacter',
    'f__Methylococcaceae'
  ],
  fermentation: [
    'Lactobacillus', 'g__Lactobacillus',
    'Lactococcus', 'g__Lactococcus',
    'Streptococcus', 'g__Streptococcus',
    'Clostridium', 'g__Clostridium',
    'Bacteroides', 'g__Bacteroides',
    'Bifidobacterium', 'g__Bifidobacterium',
    'Leuconostoc', 'g__Leuconostoc',
    'Propionibacterium', 'g__Propionibacterium',
    'Ruminococcus', 'g__Ruminococcus',
    'Enterococcus', 'g__Enterococcus',
    'Pediococcus', 'g__Pediococcus',
    'Prevotella', 'g__Prevotella',
    'Veillonella', 'g__Veillonella',
    'Faecalibacterium', 'g__Faecalibacterium',
    'Blautia', 'g__Blautia',
    'f__Lactobacillaceae', 'f__Bacteroidaceae', 'f__Bifidobacteriaceae'
  ],
  cellulolysis: [
    'Cellulomonas', 'g__Cellulomonas',
    'Fibrobacter', 'g__Fibrobacter',
    'Cytophaga', 'g__Cytophaga',
    'Cellvibrio', 'g__Cellvibrio',
    'Streptomyces', 'g__Streptomyces',
    'Paenibacillus', 'g__Paenibacillus',
    'Caldicellulosiruptor', 'g__Caldicellulosiruptor'
  ],
  chitinolysis: [
    'Serratia', 'g__Serratia',
    'Aeromonas', 'g__Aeromonas',
    'Vibrio', 'g__Vibrio',
    'Streptomyces', 'g__Streptomyces',
    'Paenibacillus', 'g__Paenibacillus',
    'Chromobacterium', 'g__Chromobacterium',
    'Pseudoalteromonas', 'g__Pseudoalteromonas'
  ],
  hydrocarbon_degradation: [
    'Pseudomonas', 'g__Pseudomonas',
    'Acinetobacter', 'g__Acinetobacter',
    'Alcanivorax', 'g__Alcanivorax',
    'Dietzia', 'g__Dietzia',
    'Rhodococcus', 'g__Rhodococcus',
    'Marinobacter', 'g__Marinobacter',
    'Bacillus', 'g__Bacillus',
    'Mycobacterium', 'g__Mycobacterium',
    'Sphingomonas', 'g__Sphingomonas'
  ],
  aromatic_hydrocarbon_degradation: [
    'Pseudomonas', 'g__Pseudomonas',
    'Sphingomonas', 'g__Sphingomonas',
    'Acinetobacter', 'g__Acinetobacter',
    'Rhodococcus', 'g__Rhodococcus',
    'Burkholderia', 'g__Burkholderia',
    'Mycobacterium', 'g__Mycobacterium',
    'Novosphingobium', 'g__Novosphingobium',
    'Ralstonia', 'g__Ralstonia'
  ],
  human_pathogens: [
    'Staphylococcus', 'g__Staphylococcus',
    'Streptococcus', 'g__Streptococcus',
    'Pseudomonas', 'g__Pseudomonas',
    'Salmonella', 'g__Salmonella',
    'Shigella', 'g__Shigella',
    'Vibrio', 'g__Vibrio',
    'Listeria', 'g__Listeria',
    'Mycobacterium', 'g__Mycobacterium',
    'Neisseria', 'g__Neisseria',
    'Bordetella', 'g__Bordetella',
    'Helicobacter', 'g__Helicobacter',
    'Legionella', 'g__Legionella',
    'Campylobacter', 'g__Campylobacter',
    'Treponema', 'g__Treponema',
    'Yersinia', 'g__Yersinia'
  ],
  intracellular_parasites: [
    'Chlamydia', 'g__Chlamydia',
    'Rickettsia', 'g__Rickettsia',
    'Coxiella', 'g__Coxiella',
    'Legionella', 'g__Legionella',
    'Ehrlichia', 'g__Ehrlichia',
    'Anaplasma', 'g__Anaplasma',
    'Orientia', 'g__Orientia',
    'Wolbachia', 'g__Wolbachia'
  ],
  predatory_or_exoparasitic: [
    'Bdellovibrio', 'g__Bdellovibrio',
    'Micavibrio', 'g__Micavibrio',
    'Myxococcus', 'g__Myxococcus',
    'Vampirococcus', 'g__Vampirococcus',
    'Bacteriovorax', 'g__Bacteriovorax',
    'Lysobacter', 'g__Lysobacter',
    'Herpetosiphon', 'g__Herpetosiphon'
  ],
  chemoheterotrophy: [
    'Pseudomonas', 'g__Pseudomonas',
    'Bacillus', 'g__Bacillus',
    'Escherichia', 'g__Escherichia',
    'Staphylococcus', 'g__Staphylococcus',
    'Streptococcus', 'g__Streptococcus',
    'Bacteroides', 'g__Bacteroides',
    'Bifidobacterium', 'g__Bifidobacterium',
    'Clostridium', 'g__Clostridium',
    'Enterococcus', 'g__Enterococcus',
    'Lactobacillus', 'g__Lactobacillus',
    'Prevotella', 'g__Prevotella',
    'Corynebacterium', 'g__Corynebacterium',
    'Faecalibacterium', 'g__Faecalibacterium'
  ],
  phototrophy: [
    'Synechococcus', 'g__Synechococcus',
    'Prochlorococcus', 'g__Prochlorococcus',
    'Nostoc', 'g__Nostoc',
    'Anabaena', 'g__Anabaena',
    'Chlorobium', 'g__Chlorobium',
    'Rhodobacter', 'g__Rhodobacter',
    'Rhodopseudomonas', 'g__Rhodopseudomonas',
    'Chloroflexus', 'g__Chloroflexus',
    'Microcystis', 'g__Microcystis',
    'p__Cyanobacteria'
  ],
  iron_respiration: [
    'Geobacter', 'g__Geobacter',
    'Shewanella', 'g__Shewanella',
    'Ferrimonas', 'g__Ferrimonas',
    'Anaeromyxobacter', 'g__Anaeromyxobacter',
    'Pelobacter', 'g__Pelobacter',
    'f__Geobacteraceae'
  ],
  manganese_oxidation: [
    'Leptothrix', 'g__Leptothrix',
    'Pedomicrobium', 'g__Pedomicrobium',
    'Erythrobacter', 'g__Erythrobacter'
  ]
};

export const FUNCTION_NAMES = {
  nitrification: { es: 'Nitrificación', en: 'Nitrification' },
  aerobic_ammonia_oxidation: { es: 'Oxidación aerobia de amonio', en: 'Aerobic ammonia oxidation' },
  nitrite_oxidation: { es: 'Oxidación de nitrito', en: 'Nitrite oxidation' },
  nitrogen_fixation: { es: 'Fijación biológica de nitrógeno', en: 'Biological nitrogen fixation' },
  denitrification: { es: 'Desnitrificación', en: 'Denitrification' },
  nitrate_reduction: { es: 'Reducción de nitrato', en: 'Nitrate reduction' },
  sulfate_respiration: { es: 'Respiración de sulfato', en: 'Sulfate respiration' },
  sulfur_oxidation: { es: 'Oxidación de compuestos de azufre', en: 'Sulfur compound oxidation' },
  methanogenesis: { es: 'Metanogénesis', en: 'Methanogenesis' },
  methanotrophy: { es: 'Metanotrofia / Oxidación de metano', en: 'Methanotrophy / Methane oxidation' },
  fermentation: { es: 'Fermentación', en: 'Fermentation' },
  cellulolysis: { es: 'Degradación de celulosa (Celulolisis)', en: 'Cellulolysis' },
  chitinolysis: { es: 'Degradación de quitina (Quitinolisis)', en: 'Chitinolysis' },
  hydrocarbon_degradation: { es: 'Degradación de hidrocarburos', en: 'Hydrocarbon degradation' },
  aromatic_hydrocarbon_degradation: { es: 'Degradación de hidrocarburos aromáticos', en: 'Aromatic hydrocarbon degradation' },
  human_pathogens: { es: 'Potenciales patógenos humanos', en: 'Potential human pathogens' },
  intracellular_parasites: { es: 'Parásitos intracelulares', en: 'Intracellular parasites' },
  predatory_or_exoparasitic: { es: 'Bacterias depredadoras o exoparásitas', en: 'Predatory or exoparasitic bacteria' },
  chemoheterotrophy: { es: 'Quimioheterotrofia', en: 'Chemoheterotrophy' },
  phototrophy: { es: 'Fototrofia / Fotosíntesis', en: 'Phototrophy / Photosynthesis' },
  iron_respiration: { es: 'Respiración / Reducción de hierro', en: 'Iron respiration / reduction' },
  manganese_oxidation: { es: 'Oxidación de manganeso', en: 'Manganese oxidation' },
  Sin_funcion_asignada: { es: 'Sin función asignada', en: 'Unassigned function' }
};
