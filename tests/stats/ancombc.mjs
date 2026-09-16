// ancomBC() (js/lib/ancomBC.js) — Analysis of Compositions of Microbiomes
// with Bias Correction (Lin & Peddada, Nat Commun 2020), reimplementación
// simplificada en JS puro (ver cabecera de ese archivo para las
// simplificaciones documentadas).
//
// LIMITACIÓN CONOCIDA — no hay contraste contra el paquete ANCOMBC real:
// se intentó instalar `ANCOMBC` de Bioconductor en esta sesión y falló:
// su dependencia `CVXR` necesita compilar el paquete `clarabel`, que a su
// vez requiere un compilador de Rust (rustc/cargo) no disponible en este
// entorno («sh: 1: rustc: not found»). Este test por tanto NO puede anclar
// los números a una ejecución real de ANCOMBC::ancombc() — algo que si el
// entorno cambia (se instala rustc + ANCOMBC) se podría añadir después
// siguiendo el patrón `hasRPackage('ANCOMBC')` que usa el resto de
// tests/stats/*.mjs (ver _shared.mjs). Por ahora esto verifica dos cosas
// más modestas pero reales:
//   1. FIDELIDAD NUMÉRICA: el código de ancomBC.js reproduce exactamente
//      los valores de una reimplementación independiente del mismo
//      algoritmo documentado (escrita aparte, sin compartir código, y
//      trazada a mano paso a paso — ver comentarios). Esto detecta
//      regresiones/errores de transcripción, no errores conceptuales
//      compartidos por ambas implementaciones.
//   2. CORRECCIÓN CONCEPTUAL: una demo de saturación composicional (un
//      taxón dominante que crece mucho y "ahoga" en las proporciones a
//      otros taxones cuya abundancia ABSOLUTA no cambió) donde se conoce
//      la respuesta correcta de antemano — demuestra que el método SÍ hace
//      algo distinto (y correcto) de una comparación ingenua de medias, que
//      es el punto entero de un método "composicional". Una primera versión
//      de este archivo (con el sesgo de muestra estimado por GRUPO en vez de
//      globalmente) fallaba justo esta comprobación — daba exactamente el
//      mismo resultado que la comparación ingenua (ver commit) — así que se
//      deja como comprobación permanente, no solo de paso.

import { APP_ROOT, hasR, hasRPackage, done } from './_shared.mjs';

const { ancomBC } = await import(APP_ROOT + '/js/lib/ancomBC.js');
const { studentTwoTailedP, benjaminiHochberg } = await import(APP_ROOT + '/js/lib/stats.js');

const checks = [];
const note = (m, pass, extra) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m + (extra ? '  (' + extra + ')' : '')); };
const close = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---------------------------------------------------------------------
// 1. Fidelidad numérica — caso pequeño (2 taxones, 2+2 muestras), trazado
// a mano y con una reimplementación independiente (ver script de
// derivación en el commit). Con solo 2 taxones la mediana de residuos no
// es robusta (el propio método asume "la mayoría de taxones no cambian",
// algo que con n=2 no se puede cumplir) — este caso NO pretende ilustrar
// el comportamiento composicional (para eso está la demo de más abajo),
// solo confirmar que el código hace la aritmética que dice hacer.
// ---------------------------------------------------------------------
{
  const matrix = [
    [10, 40, 20, 20],  // taxón 1, muestras A1,A2,B1,B2
    [40, 160, 20, 20], // taxón 2
  ];
  const groupsOf = ['A', 'A', 'B', 'B'];
  const res = ancomBC(matrix, groupsOf, { tol: 1e-12 }, studentTwoTailedP);

  // GOLDEN: reimplementación independiente del mismo algoritmo documentado
  // (referencia global por taxón, mediana de residuos, contraste one-vs-rest)
  const GOLDEN = [
    { group: 'B', log2FC: 0.96787131486933, se: 0.0188111218789367, W: 51.452078249149004 },
    { group: 'A', log2FC: 0.9678713148693293, se: 0.0188111218789367, W: 51.45207824914897 },
  ];
  res.forEach((r, i) => {
    const g = GOLDEN[i];
    note(`taxón ${i + 1}: grupo enriquecido = ${g.group}`, r.group === g.group);
    note(`taxón ${i + 1}: log2FC ≈ ${g.log2FC.toFixed(6)}`, close(r.log2FC, g.log2FC, 1e-6), 'js=' + r.log2FC);
    note(`taxón ${i + 1}: EE(log2FC) ≈ ${g.se.toFixed(6)}`, close(r.se, g.se, 1e-6), 'js=' + r.se);
    note(`taxón ${i + 1}: W ≈ ${g.W.toFixed(4)}`, close(r.W, g.W, 1e-4), 'js=' + r.W);
  });
  // p-valor: contraste cruzado con el caso cerrado I_x(1,0.5)=1−√(1−x) de
  // la beta incompleta para df=2 (a = df/2 = 1) — ancla studentTwoTailedP
  // (ya verificado contra pt() de R en tests/stats/incompletebeta.mjs) a
  // una fórmula cerrada independiente para este caso concreto.
  res.forEach((r, i) => {
    const x = 2 / (2 + r.W * r.W);
    const pClosedForm = 1 - Math.sqrt(1 - x);
    note(`taxón ${i + 1}: p (studentTwoTailedP) coincide con el caso cerrado df=2`, close(r.p, pClosedForm, 1e-9), 'p=' + r.p);
  });
}

// ---------------------------------------------------------------------
// 2. Demo de saturación composicional — 5 taxones, 3 muestras por grupo,
// profundidad de secuenciación fija (1000 lecturas/muestra, como tras una
// rarefacción). Abundancia ABSOLUTA real: T1-T4 CONSTANTE entre grupos, T5
// sube ×9 en el grupo B. Con profundidad fija, ese aumento de T5 "roba"
// sitio a T1-T4 en los recuentos observados (T1-T4 pasan de 200 a 77
// lecturas) SIN que su abundancia real haya cambiado — el artefacto
// composicional clásico. Un método NO composicional (comparar medias/
// proporciones directamente) lo confundiría con una caída real.
// ---------------------------------------------------------------------
{
  const matrix = [
    [200, 200, 200, 77, 77, 77],
    [200, 200, 200, 77, 77, 77],
    [200, 200, 200, 77, 77, 77],
    [200, 200, 200, 77, 77, 77],
    [200, 200, 200, 692, 692, 692],
  ];
  const groupsOf = ['A', 'A', 'A', 'B', 'B', 'B'];
  const res = ancomBC(matrix, groupsOf, {}, studentTwoTailedP);

  for (let i = 0; i < 4; i++) {
    note(`T${i + 1} (estable en abundancia absoluta): log2FC corregido ≈ 0`, close(res[i].log2FC, 0, 1e-6), 'log2FC=' + res[i].log2FC);
    note(`T${i + 1}: NO se marca como significativo (p ≈ 1)`, res[i].p > 0.9, 'p=' + res[i].p);
  }
  note('T5 (verdadero cambio, ×9 en B): se detecta enriquecido en B', res[4].group === 'B');
  note('T5: log2FC corregido claramente positivo y por encima del log2FC ingenuo (692/200)', res[4].log2FC > Math.log2(692 / 200), 'log2FC=' + res[4].log2FC);
  note('T5: p muy pequeño (claramente significativo)', res[4].p < 1e-6, 'p=' + res[4].p);

  // ---- contraste con la versión SIN corregir (d_j = 0, equivalente a un
  // log2FC ingenuo sobre los recuentos con pseudo-conteo) para demostrar
  // que la corrección de sesgo cambia el resultado y no es un adorno ----
  const naiveLog2FC = (row) => {
    const a = row.slice(0, 3).map((v) => Math.log2(v + 1));
    const b = row.slice(3, 6).map((v) => Math.log2(v + 1));
    const m = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;
    return m(b) - m(a); // B vs A, igual que el contraste one-vs-rest de arriba (bi=B)
  };
  const naiveT1 = naiveLog2FC(matrix[0]);
  note('sin corregir el sesgo, T1 SÍ parecería caer con fuerza (el artefacto que ANCOM-BC corrige)',
    naiveT1 < -1, 'naive log2FC T1=' + naiveT1 + ' vs corregido=' + res[0].log2FC);

  // BH sobre los 5 p-valores: T1-4 no deberían sobrevivir, T5 sí
  const q = benjaminiHochberg(res.map((r) => r.p));
  note('tras BH/FDR, solo T5 queda por debajo de q=0.05', q[4] < 0.05 && q.slice(0, 4).every((qv) => qv >= 0.05), 'q=' + q.map((v) => v.toFixed(4)).join(','));
}

// ---------------------------------------------------------------------
// 3. Casos límite
// ---------------------------------------------------------------------
{
  const res1 = ancomBC([[5, 5, 5]], ['A', 'B', 'B'], {}, studentTwoTailedP); // 1 muestra en un lado
  note('menos de 2 muestras en el grupo enriquecido -> NaN, no revienta', Number.isNaN(res1[0].log2FC) && Number.isNaN(res1[0].p));

  const res2 = ancomBC([[5, 5, 5, 5]], ['A', 'A', 'B', 'B'], {}, studentTwoTailedP); // taxón sin variación alguna
  note('taxón sin ninguna variación -> log2FC=0, p=1 (no revienta con varianza nula)', res2[0].log2FC === 0 && res2[0].p === 1);

  // taxón con ceros estructurales en todo el grupo A, junto a dos taxones
  // de fondo estables (nTaxa=1 sería degenerado: con un solo taxón la
  // referencia global coincide exactamente con ese taxón y "explica" el
  // 100% de la variación como sesgo, dejando log2FC=0 SIEMPRE — hacen
  // falta taxones de fondo para que la mediana tenga sentido, igual que en
  // la demo de saturación de arriba)
  const matrixZ = [
    [300, 300, 300, 300, 300, 300], // taxón de fondo 1, estable
    [300, 300, 300, 300, 300, 300], // taxón de fondo 2, estable
    [0, 0, 0, 50, 60, 55],          // ceros estructurales en A, presente en B
  ];
  const resZeros = ancomBC(matrixZ, ['A', 'A', 'A', 'B', 'B', 'B'], {}, studentTwoTailedP);
  note('ceros estructurales en todo un grupo -> se resuelven con el pseudo-conteo, sin NaN/Infinity espurios',
    Number.isFinite(resZeros[2].log2FC) && resZeros[2].group === 'B', 'log2FC=' + resZeros[2].log2FC);
  note('los taxones de fondo estables no se ven afectados (log2FC ≈ 0)',
    close(resZeros[0].log2FC, 0, 1e-6) && close(resZeros[1].log2FC, 0, 1e-6));
}

if (!hasR()) {
  console.log('  (Rscript no disponible: sin R para ningún contraste en vivo)');
} else if (!hasRPackage('ANCOMBC')) {
  console.log('  (R disponible pero el paquete ANCOMBC de Bioconductor no está instalado en este entorno — ver nota de cabecera: falta rustc para su dependencia CVXR/clarabel. Sin contraste contra el paquete real.)');
}

done('ancombc', checks.every(Boolean));
