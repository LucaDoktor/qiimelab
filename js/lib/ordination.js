// Parser del formato de texto "Ordination Results" de scikit-bio
// (lo que exporta `qiime diversity pcoa` → ordination.txt). Sin dependencias.
//
// El archivo tiene secciones separadas por líneas en blanco:
//
//   Eigvals\t<n>
//   <n valores separados por tab>
//
//   Proportion explained\t<n>
//   <n valores>
//
//   Species\t0\t0
//
//   Site\t<n_muestras>\t<n_ejes>
//   <sample-id>\t<coord PCo1>\t<coord PCo2>\t...
//   ...
//
//   Biplot / Site constraints  (normalmente vacías en un PCoA)
//
// NO recalcula nada: solo lee coordenadas ya calculadas.

const SECTION_HEADERS = ['Eigvals', 'Proportion explained', 'Species', 'Site', 'Biplot', 'Site constraints'];

/**
 * @param {string} text  contenido del ordination.txt
 * @param {string} [nameHint]  nombre de archivo (para deducir la métrica)
 * @returns {{ metricName, sampleIds:string[], coords:number[][], proportionExplained:number[], eigvals:number[] } | null}
 */
export function parseOrdination(text, nameHint) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const out = { eigvals: [], proportionExplained: [], sampleIds: [], coords: [] };
  let section = null;

  for (const raw of lines) {
    if (raw.trim() === '') { section = null; continue; }
    const parts = raw.split('\t');
    const head = parts[0].trim();

    if (SECTION_HEADERS.includes(head)) {
      section = head === 'Eigvals' ? 'eig'
        : head === 'Proportion explained' ? 'prop'
        : head === 'Site' ? 'site'
        : null;
      continue;
    }

    if (section === 'eig') {
      out.eigvals = parts.map(Number).filter((x) => isFinite(x));
      section = null;
    } else if (section === 'prop') {
      out.proportionExplained = parts.map(Number).filter((x) => isFinite(x));
      section = null;
    } else if (section === 'site') {
      const coords = parts.slice(1).map(Number);
      if (head && coords.length && coords.every((x) => isFinite(x))) {
        out.sampleIds.push(head);
        out.coords.push(coords);
      }
    }
  }

  if (out.sampleIds.length < 2 || out.coords[0].length < 2) return null;

  // fracción → porcentaje si viniera en 0–1
  if (out.proportionExplained.length && Math.max(...out.proportionExplained) <= 1.001) {
    out.proportionExplained = out.proportionExplained.map((x) => x * 100);
  }

  const base = String(nameHint || 'pcoa').replace(/\.[^.]+$/, '')
    .replace(/[_-]?ordination$/i, '').replace(/[_-]?pcoa$/i, '').replace(/[_-]+$/, '');
  out.metricName = base || 'pcoa';
  return out;
}

/** ¿este texto parece un ordination.txt de scikit-bio? */
export function looksLikeOrdination(text) {
  return /^Eigvals\t\s*\d/.test(String(text).replace(/\r/g, ''));
}
