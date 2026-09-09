// Emparejado tolerante de IDs de muestra.
//
// Los distintos archivos de un análisis rara vez traen los IDs escritos igual:
// los metadatos dicen "A-1" y la tabla de features "A-1-16S-L001-…". Todos los
// módulos (alfa, beta, correlograma, funcional, Venn) resolvían esto con la
// MISMA heurística copiada a mano: igualdad exacta y, si no, el primer ID del
// que uno sea prefijo del otro. Aquí está una sola vez.

/**
 * Devuelve el candidato que "casa" con `sid`, tolerando sufijos en cualquiera
 * de los dos lados. Primero prueba la igualdad exacta; si no, el primer
 * candidato (en orden de iteración) del que `sid` sea prefijo, o que sea
 * prefijo de `sid`.
 *
 * @param {Iterable<string>} candidates  ids conocidos (array, claves de Map, …)
 * @param {string} sid                   id a resolver
 * @returns {string | null}              el candidato que casa, o null
 */
export function matchSampleId(candidates, sid) {
  const list = Array.isArray(candidates) ? candidates : Array.from(candidates);
  if (list.indexOf(sid) !== -1) return sid;
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (sid.startsWith(k) || k.startsWith(sid)) return k;
  }
  return null;
}

/**
 * Construye un resolutor "id de muestra → grupo" a partir de los metadatos,
 * tolerante a sufijos. Solo entran en el mapa las filas con id y grupo no
 * vacíos (mismo criterio que antes). Sin coincidencia → null.
 *
 * @param {{rows: object[], sampleIdKey: string}} meta
 * @param {string} groupCol
 * @returns {(sid: string) => (string | null)}
 */
export function makeGroupResolver(meta, groupCol) {
  const map = {};
  meta.rows.forEach((r) => {
    const id = String(r[meta.sampleIdKey] ?? '').trim();
    const g = String(r[groupCol] ?? '').trim();
    if (id && g) map[id] = g;
  });
  const keys = Object.keys(map);
  return (sid) => {
    const k = matchSampleId(keys, sid);
    return k == null ? null : map[k];
  };
}
