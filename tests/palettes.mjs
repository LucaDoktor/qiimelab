// Linter de paletas (js/lib/paletteValidator.js) + las 3 paletas por defecto
// (js/lib/palettes.js): casos conocidos de daltonismo deben marcarse, y las
// paletas por defecto deben pasar con el mismo criterio ya establecido en
// tests/cvd.mjs/contrast.mjs para la paleta --cat-* existente (adyacentes
// ≥ΔE8 salvo excepción documentada solo-tritanopía; el subconjunto "seguro
// para scatter" sin ningún FAIL en ninguna pareja).
//
//   node tests/palettes.mjs

import { APP_ROOT } from './lib/env.mjs';
const {
  comparePair, backgroundContrast, validatePalette, checkAgainstPalette,
  deltaE, DELTA_E_FAIL, DELTA_E_WARN,
} = await import(APP_ROOT + '/js/lib/paletteValidator.js');
const { CATEGORICAL, CATEGORICAL_SCATTER_MAX, SEQUENTIAL, DIVERGENT } = await import(APP_ROOT + '/js/lib/palettes.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// ---- 1. casos conocidos de daltonismo: el validador debe marcarlos ----
console.log('-- casos conocidos de confusión por daltonismo --');

// rojo/verde clásico del daltonismo: MISMA luminosidad OKLab, solo difieren
// en el eje rojo-verde (no vale con rojo/verde "puros" #ff0000/#00ff00 — esos
// tienen luminosidades tan distintas que hasta un dicrómata los distingue por
// brillo; el caso real problemático es rojo/verde IGUAL DE CLAROS).
{
  const r = comparePair('#af4c62', '#008967');
  check('rojo × verde de igual luminosidad: deuteranopía los funde (ΔE<8)', r.deltaE.deuter < DELTA_E_FAIL, 'ΔE deuter=' + r.deltaE.deuter.toFixed(1));
  check('rojo × verde de igual luminosidad: protanopía los acerca mucho (ΔE<15)', r.deltaE.protan < DELTA_E_WARN, 'ΔE protan=' + r.deltaE.protan.toFixed(1));
  check('rojo × verde de igual luminosidad: verdict FAIL', r.verdict === 'FAIL', r.verdict);
  check('el mismo par en visión normal sí se distingue (para confirmar que es un efecto de la simulación, no del color)',
    r.deltaE.normal >= DELTA_E_WARN, 'ΔE normal=' + r.deltaE.normal.toFixed(1));
}
// rojo/marrón oscuro: otro clásico (protanopía los funde)
{
  const r = comparePair('#cc0000', '#806000');
  check('rojo × marrón oliva: protanopía los acerca (ΔE cae vs. visión normal)', r.deltaE.protan < r.deltaE.normal - 5,
    'normal=' + r.deltaE.normal.toFixed(1) + ' protan=' + r.deltaE.protan.toFixed(1));
}
// dos grises idénticos: deben marcarse FAIL directamente (ΔE≈0 en todo)
{
  const r = comparePair('#888888', '#888888');
  check('dos colores idénticos: FAIL en todos los tipos de visión', r.verdict === 'FAIL', JSON.stringify(r.deltaE));
}
// un color hex inválido: se marca FAIL, no explota
{
  const r = checkAgainstPalette('no-es-hex', ['#2a78d6']);
  check('hex inválido: FAIL sin lanzar excepción', r.verdict === 'FAIL' && r.reason === 'invalid');
}
// azul vs rojo bien separados (el par ya usado en --corr-pos/--corr-neg):
// debe pasar limpio, para confirmar que el validador no es solo "todo falla"
{
  const r = comparePair('#2a78d6', '#e34948');
  check('azul × rojo bien separados: PASS en las 3 dicromacias', r.verdict === 'PASS', 'ΔE mín=' + r.worst.toFixed(1) + ' (' + r.worstType + ')');
}

// ---- 2. paleta categórica por defecto ----
console.log('\n-- paleta categórica (8 tonos, orden fijo) --');
check('8 colores, todos hex válidos', CATEGORICAL.length === 8 && CATEGORICAL.every((h) => /^#[0-9a-f]{6}$/i.test(h)));

let adjFailsNonTritan = 0, adjFailsTritanOnly = 0;
for (let i = 0; i < CATEGORICAL.length - 1; i++) {
  const r = comparePair(CATEGORICAL[i], CATEGORICAL[i + 1]);
  if (r.worst < DELTA_E_FAIL) (r.worstType === 'tritan' ? adjFailsTritanOnly++ : adjFailsNonTritan++);
}
check('adyacentes: 0 fallos por protanopía/deuteranopía/normal', adjFailsNonTritan === 0, adjFailsNonTritan + ' fallo(s)');
check('adyacentes: como mucho 1 fallo, y solo por tritanopía (cat4×cat5, ya documentado)',
  adjFailsTritanOnly <= 1, adjFailsTritanOnly + ' fallo(s) tritan-only');

const scatterSubset = CATEGORICAL.slice(0, CATEGORICAL_SCATTER_MAX);
let scatterFails = 0;
for (let i = 0; i < scatterSubset.length; i++) {
  for (let j = i + 1; j < scatterSubset.length; j++) {
    const r = comparePair(scatterSubset[i], scatterSubset[j]);
    if (r.verdict === 'FAIL') scatterFails++;
  }
}
check('subconjunto "seguro para scatter" (primeros ' + CATEGORICAL_SCATTER_MAX + '): 0 pares FAIL en ninguna pareja', scatterFails === 0, scatterFails + ' fallo(s)');

const catContrastFails = CATEGORICAL.filter((hex) => backgroundContrast(hex).verdict === 'FAIL');
check('contraste contra el fondo (claro y oscuro): ningún tono en FAIL', catContrastFails.length === 0, catContrastFails.join(', '));

// validatePalette() es la función de alto nivel que usará el editor — se
// prueba aquí también, no solo comparePair()/backgroundContrast() sueltas.
const fullReport = validatePalette(CATEGORICAL);
check('validatePalette(): mismo veredicto global que los checks de arriba (no PASS, por el cat4×cat5 conocido)',
  fullReport.verdict !== 'PASS', fullReport.verdict);
check('validatePalette(): informa las 28 parejas (8 elige 2) + los 8 colores', fullReport.pairs.length === 28 && fullReport.colors.length === 8);

// ---- 3. paleta secuencial por defecto ----
console.log('\n-- paleta secuencial (rampa azul, 5 paradas) --');
check('5 paradas, todas hex válidas', SEQUENTIAL.length === 5 && SEQUENTIAL.every((h) => /^#[0-9a-f]{6}$/i.test(h)));

// luminosidad monótona: cada parada debe ser más "clara" que la siguiente en
// contraste contra un negro de referencia — comprobación simple sin
// depender de una función de luminancia aparte: el contraste contra el
// fondo OSCURO debe decrecer parada a parada (empieza casi blanca, acaba oscura).
const lumTrend = SEQUENTIAL.map((hex) => backgroundContrast(hex).dark);
let monotonic = true;
for (let i = 0; i < lumTrend.length - 1; i++) if (lumTrend[i] <= lumTrend[i + 1]) monotonic = false;
check('luminosidad decreciente parada a parada (claro → oscuro)', monotonic, lumTrend.map((v) => v.toFixed(1)).join(' > '));

let seqAdjFails = 0;
for (let i = 0; i < SEQUENTIAL.length - 1; i++) {
  if (deltaE(SEQUENTIAL[i], SEQUENTIAL[i + 1]) < DELTA_E_FAIL) seqAdjFails++;
}
check('paradas adyacentes distinguibles entre sí (ΔE ≥ 8, ninguna se confunde con la vecina)', seqAdjFails === 0, seqAdjFails + ' par(es) por debajo de ΔE 8');

// ---- 4. paleta divergente por defecto ----
console.log('\n-- paleta divergente (2 tonos + centro neutro) --');
check('neg/mid/pos son hex válidos', [DIVERGENT.neg, DIVERGENT.mid, DIVERGENT.pos].every((h) => /^#[0-9a-f]{6}$/i.test(h)));

const poleCmp = comparePair(DIVERGENT.neg, DIVERGENT.pos);
check('polos neg×pos: PASS en las 3 dicromacias (es la comparación que importa: signo +/−)',
  poleCmp.verdict === 'PASS', 'ΔE mín=' + poleCmp.worst.toFixed(1) + ' (' + poleCmp.worstType + ')');

const negContrast = backgroundContrast(DIVERGENT.neg), posContrast = backgroundContrast(DIVERGENT.pos);
check('polo negativo: sin FAIL de contraste contra ningún fondo', negContrast.verdict !== 'FAIL', JSON.stringify(negContrast));
check('polo positivo: sin FAIL de contraste contra ningún fondo', posContrast.verdict !== 'FAIL', JSON.stringify(posContrast));
// el centro neutro puede fundirse un poco con el fondo a propósito (como
// --corr-zero) — solo se comprueba que no es un color inválido ni idéntico a un polo
check('centro neutro: distinto de ambos polos', DIVERGENT.mid !== DIVERGENT.neg && DIVERGENT.mid !== DIVERGENT.pos);

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
