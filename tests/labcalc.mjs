// Test unitario y de integridad matemática para la Calculadora Bioquímica (labcalc.js)
//
//   node tests/labcalc.mjs

import { APP_ROOT } from './lib/env.mjs';

const {
  ATOMIC_WEIGHTS,
  parseChemicalFormula,
  calcNucleicAcidMW,
  solveMolarity,
  solveDilution,
  render,
} = await import(APP_ROOT + '/js/modules/labcalc.js');

const { ROUTES } = await import(APP_ROOT + '/js/modules/shell.js');
const { t } = await import(APP_ROOT + '/js/lib/i18n.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

const approxEqual = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

console.log('--- 1. Diccionario IUPAC y Constantes Atómicas ---');
{
  check('H está presente y tiene peso atómico estándar ~1.008', approxEqual(ATOMIC_WEIGHTS.H, 1.008));
  check('C tiene peso atómico estándar ~12.011', approxEqual(ATOMIC_WEIGHTS.C, 12.011));
  check('N tiene peso atómico estándar ~14.007', approxEqual(ATOMIC_WEIGHTS.N, 14.007));
  check('O tiene peso atómico estándar ~15.999', approxEqual(ATOMIC_WEIGHTS.O, 15.999));
  check('Na tiene peso atómico estándar ~22.990', approxEqual(ATOMIC_WEIGHTS.Na, 22.990));
  check('Cl tiene peso atómico estándar ~35.45', approxEqual(ATOMIC_WEIGHTS.Cl, 35.45));
  check('Fe tiene peso atómico estándar ~55.845', approxEqual(ATOMIC_WEIGHTS.Fe, 55.845));
}

console.log('\n--- 2. Motor de Peso Molecular: Fórmulas Estándar ---');
{
  const nacl = parseChemicalFormula('NaCl');
  check('NaCl: ok=true y MW = 58.44 g/mol', nacl.ok && approxEqual(nacl.mw, 58.44), `mw=${nacl.mw}`);
  check('NaCl: contiene 2 elementos (Na, Cl)', nacl.elements.length === 2);

  const glucose = parseChemicalFormula('C6H12O6');
  check('C6H12O6 (Glucosa): ok=true y MW = 180.156 g/mol', glucose.ok && approxEqual(glucose.mw, 180.156), `mw=${glucose.mw}`);
  const sumPercent = glucose.elements.reduce((acc, el) => acc + el.percent, 0);
  check('C6H12O6: la suma de porcentajes elementales es 100%', approxEqual(sumPercent, 100));

  const water = parseChemicalFormula('H2O');
  check('H2O: ok=true y MW = 18.015 g/mol', water.ok && approxEqual(water.mw, 18.015), `mw=${water.mw}`);
}

console.log('\n--- 3. Motor de Peso Molecular: Paréntesis y Corchetes Complejos ---');
{
  const caoh2 = parseChemicalFormula('Ca(OH)2');
  check('Ca(OH)2: ok=true y MW = 74.092 g/mol', caoh2.ok && approxEqual(caoh2.mw, 74.092), `mw=${caoh2.mw}`);

  const ammSulf = parseChemicalFormula('(NH4)2SO4');
  check('(NH4)2SO4: ok=true y MW = 132.134 g/mol', ammSulf.ok && approxEqual(ammSulf.mw, 132.134), `mw=${ammSulf.mw}`);
  const nCount = ammSulf.elements.find(e => e.symbol === 'N')?.count;
  const hCount = ammSulf.elements.find(e => e.symbol === 'H')?.count;
  check('(NH4)2SO4: recuento de átomos N=2 y H=8', nCount === 2 && hCount === 8);

  const complex = parseChemicalFormula('K3[Fe(CN)6]');
  check('K3[Fe(CN)6]: ok=true y MW = 329.247 g/mol', complex.ok && approxEqual(complex.mw, 329.247), `mw=${complex.mw}`);
}

console.log('\n--- 4. Motor de Peso Molecular: Hidratos ---');
{
  const mgso4 = parseChemicalFormula('MgSO4·7H2O');
  check('MgSO4·7H2O (con ·): ok=true y MW = 246.466 g/mol', mgso4.ok && approxEqual(mgso4.mw, 246.466), `mw=${mgso4.mw}`);

  const cuso4 = parseChemicalFormula('CuSO4*5H2O');
  check('CuSO4*5H2O (con *): ok=true y MW = 249.677 g/mol', cuso4.ok && approxEqual(cuso4.mw, 249.677), `mw=${cuso4.mw}`);

  const cacl2 = parseChemicalFormula('CaCl2.2H2O');
  check('CaCl2.2H2O (con .): ok=true y MW = 147.008 g/mol', cacl2.ok && approxEqual(cacl2.mw, 147.008), `mw=${cacl2.mw}`);

  const feso4 = parseChemicalFormula('FeSO4 · 7H2O');
  check('FeSO4 · 7H2O (con espacios alrededor del punto): MW = 278.006 g/mol', feso4.ok && approxEqual(feso4.mw, 278.006), `mw=${feso4.mw}`);
}

console.log('\n--- 5. Reactivos y Tampones Comunes de Laboratorio ---');
{
  const tris = parseChemicalFormula('C4H11NO3');
  check('Tris base (C4H11NO3): MW = 121.136 g/mol', tris.ok && approxEqual(tris.mw, 121.136), `mw=${tris.mw}`);

  const edta = parseChemicalFormula('C10H16N2O8');
  check('EDTA ácido libre (C10H16N2O8): MW = 292.244 g/mol', edta.ok && approxEqual(edta.mw, 292.244), `mw=${edta.mw}`);

  const sds = parseChemicalFormula('NaC12H25SO4');
  check('SDS (NaC12H25SO4): MW = 288.378 g/mol', sds.ok && approxEqual(sds.mw, 288.378), `mw=${sds.mw}`);

  const hepes = parseChemicalFormula('C8H18N2O4S');
  check('HEPES (C8H18N2O4S): MW = 238.302 g/mol', hepes.ok && approxEqual(hepes.mw, 238.302), `mw=${hepes.mw}`);
}

console.log('\n--- 6. Validación de Errores en Fórmulas Químicas ---');
{
  const unclosed = parseChemicalFormula('(NH4');
  check('Paréntesis abierto sin cerrar retorna error', !unclosed.ok && typeof unclosed.error === 'string');

  const unopened = parseChemicalFormula('NaCl)');
  check('Paréntesis de cierre desbalanceado retorna error', !unopened.ok && typeof unopened.error === 'string');

  const unknown = parseChemicalFormula('Xx2O');
  check('Elemento químico desconocido retorna error informativo', !unknown.ok && unknown.error.includes('Xx'));

  const empty = parseChemicalFormula('');
  check('Cadena vacía retorna error', !empty.ok);
}

console.log('\n--- 7. Motor de Ácidos Nucleicos (ADN / ARN) ---');
{
  const dsdna = calcNucleicAcidMW('dsDNA', 1000);
  const expDsDNA = 1000 * 617.96 + 36.04; // 617996.04
  check('dsDNA 1000 pb: MW = (1000 * 617.96) + 36.04 = 617996.04 g/mol', dsdna.ok && approxEqual(dsdna.mw, expDsDNA));

  const ssdna = calcNucleicAcidMW('ssDNA', 20);
  const expSsDNA = 20 * 303.7 + 79.0; // 6153.0
  check('ssDNA (Primer) 20 nt: MW = (20 * 303.7) + 79.0 = 6153 g/mol', ssdna.ok && approxEqual(ssdna.mw, expSsDNA));

  const ssrna = calcNucleicAcidMW('ssRNA', 100);
  const expSsRNA = 100 * 320.5 + 159.0; // 32209.0
  check('ssRNA 100 nt: MW = (100 * 320.5) + 159.0 = 32209 g/mol', ssrna.ok && approxEqual(ssrna.mw, expSsRNA));

  const invalidLen = calcNucleicAcidMW('dsDNA', -5);
  check('Longitud no positiva retorna error', !invalidLen.ok);
}

console.log('\n--- 8. Motor de Molaridad (m = C × V × MW) ---');
{
  // Caso A: Despejar Masa (m)
  // C = 0.5 M, V = 250 mL = 0.25 L, MW = 58.44 g/mol -> m = 0.5 * 0.25 * 58.44 = 7.305 g
  const solMass = solveMolarity({ conc: 0.5, concUnit: 'M', vol: 250, volUnit: 'mL', mw: 58.44, massUnit: 'g' });
  check('Despeje de Masa (m): 0.5M, 250mL, MW 58.44 -> 7.305 g', solMass.ok && solMass.solved === 'mass' && approxEqual(solMass.value, 7.305));

  // Caso B: Masa en mg
  const solMassMg = solveMolarity({ conc: 0.5, concUnit: 'M', vol: 250, volUnit: 'mL', mw: 58.44, massUnit: 'mg' });
  check('Despeje de Masa en mg: 7305 mg', solMassMg.ok && approxEqual(solMassMg.value, 7305));

  // Caso C: Despejar Volumen (V)
  // m = 10 g, C = 0.5 M, MW = 58.44 g/mol -> V = 10 / (0.5 * 58.44) = 0.34223 L = 342.23 mL
  const solVol = solveMolarity({ mass: 10, massUnit: 'g', conc: 0.5, concUnit: 'M', mw: 58.44, volUnit: 'mL' });
  check('Despeje de Volumen (V) en mL: ~342.23 mL', solVol.ok && solVol.solved === 'vol' && approxEqual(solVol.value, 342.23, 0.1));

  // Caso D: Despejar Concentración (C)
  // m = 5.844 g, V = 500 mL = 0.5 L, MW = 58.44 -> C = 5.844 / (0.5 * 58.44) = 0.2 M = 200 mM
  const solConc = solveMolarity({ mass: 5.844, massUnit: 'g', vol: 500, volUnit: 'mL', mw: 58.44, concUnit: 'mM' });
  check('Despeje de Concentración (C) en mM: 200 mM', solConc.ok && solConc.solved === 'conc' && approxEqual(solConc.value, 200));

  // Caso E: Despejar MW
  // m = 5.844 g, C = 0.2 M, V = 0.5 L -> MW = 5.844 / (0.2 * 0.5) = 58.44 g/mol
  const solMW = solveMolarity({ mass: 5.844, massUnit: 'g', conc: 0.2, concUnit: 'M', vol: 0.5, volUnit: 'L' });
  check('Despeje de Peso Molecular (MW): 58.44 g/mol', solMW.ok && solMW.solved === 'mw' && approxEqual(solMW.value, 58.44));

  // Caso F: Menos de 3 campos llenos retorna null
  const solFew = solveMolarity({ mass: 10, massUnit: 'g', mw: 58.44 });
  check('Menos de 3 campos llenos retorna null (espera más datos)', solFew === null);
}

console.log('\n--- 9. Motor de Diluciones (C1 × V1 = C2 × V2) ---');
{
  // Caso A: Despejar V1 (Stock necesario)
  // C1 = 10X, C2 = 1X, V2 = 100 mL -> V1 = (1 * 100) / 10 = 10 mL; V_dil = 90 mL
  const dilV1 = solveDilution({ c1: 10, c1Unit: 'X', c2: 1, c2Unit: 'X', v2: 100, v2Unit: 'mL', v1Unit: 'mL' });
  check('Despeje de V1: Stock 10X a 1X en 100 mL -> V1 = 10 mL', dilV1.ok && dilV1.solved === 'v1' && approxEqual(dilV1.value, 10));
  check('Dilución válida y volumen de diluyente = 90 mL', dilV1.isValidDilution && approxEqual(dilV1.vDilInV2Unit, 90));

  // Caso B: Despejar V2
  // C1 = 5 M, V1 = 20 mL, C2 = 1 M -> V2 = (5 * 20) / 1 = 100 mL; V_dil = 80 mL
  const dilV2 = solveDilution({ c1: 5, c1Unit: 'M', v1: 20, v1Unit: 'mL', c2: 1, c2Unit: 'M', v2Unit: 'mL' });
  check('Despeje de V2: 5M (20mL) a 1M -> V2 = 100 mL', dilV2.ok && dilV2.solved === 'v2' && approxEqual(dilV2.value, 100));
  check('Volumen de disolvente a añadir = 80 mL', dilV2.isValidDilution && approxEqual(dilV2.vDilInV2Unit, 80));

  // Caso C: Despejar C2
  // C1 = 100 mM, V1 = 10 mL, V2 = 50 mL -> C2 = (100 * 10) / 50 = 20 mM
  const dilC2 = solveDilution({ c1: 100, c1Unit: 'mM', v1: 10, v1Unit: 'mL', v2: 50, v2Unit: 'mL', c2Unit: 'mM' });
  check('Despeje de C2: 100mM (10mL) en 50mL -> C2 = 20 mM', dilC2.ok && dilC2.solved === 'c2' && approxEqual(dilC2.value, 20));

  // Caso D: Dilución imposible (C2 > C1)
  // C1 = 1 M, C2 = 5 M (concentración final mayor que stock)
  const dilInvalid = solveDilution({ c1: 1, c1Unit: 'M', c2: 5, c2Unit: 'M', v2: 100, v2Unit: 'mL', v1Unit: 'mL' });
  check('Detección de dilución inválida (C2 > C1): isValidDilution=false', dilInvalid.ok && dilInvalid.isValidDilution === false);
}

console.log('\n--- 10. Integración en el Enrutador y Shell de Smart-175 ---');
{
  const calcRoute = ROUTES.find(r => r.id === 'calculadora');
  check('Ruta "calculadora" registrada en ROUTES de shell.js', !!calcRoute);
  check('Ruta calculadora asignada al grupo "counts"', calcRoute && calcRoute.group === 'counts');
  check('Ruta calculadora usa icono "calculator"', calcRoute && calcRoute.icon === 'calculator');

  check('Traducción de nav.calculadora existe en ES', t('nav.calculadora') === 'Calculadora');
  check('Traducción de calc.title existe en ES', typeof t('calc.title') === 'string' && t('calc.title').length > 0);
  check('Traducción de calc.molTitle existe en ES', typeof t('calc.molTitle') === 'string');
  check('Traducción de calc.dilTitle existe en ES', typeof t('calc.dilTitle') === 'string');

  check('Módulo labcalc exporta función render(container)', typeof render === 'function');
}

console.log(failed ? '\n❌ ALGUNAS PRUEBAS FALLARON\n' : '\n✅ TODAS LAS PRUEBAS DE LAB CALC PASARON EXITOSAMENTE (100%)\n');
process.exit(failed ? 1 : 0);
