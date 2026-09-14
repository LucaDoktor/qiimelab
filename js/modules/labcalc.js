// Calculadora Bioquímica y de Laboratorio para Smart-175.
// Módulo 100% en cliente para pesos moleculares (fórmulas e hidratos, ADN/ARN),
// preparación de disoluciones molares (m = C × V × MW) y diluciones (C1V1 = C2V2).

import { t } from '../lib/i18n.js';

const STORE_KEY = 'smart-175.labcalc';

// ============================================================================
// 1. DICCIONARIO IUPAC DE PESOS ATÓMICOS ESTÁNDAR (g/mol)
// ============================================================================
export const ATOMIC_WEIGHTS = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007,
  O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982,
  Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098,
  Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938,
  Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723,
  Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468,
  Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95, Tc: 98,
  Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82,
  Sn: 118.71, Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91,
  Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24, Sm: 150.36,
  Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26,
  Tm: 168.93, Yb: 173.05, Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84,
  Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
  Tl: 204.38, Pb: 207.2, Bi: 208.98, U: 238.03,
};

export const ELEMENT_NAMES = {
  H: 'Hidrógeno / Hydrogen', C: 'Carbono / Carbon', N: 'Nitrógeno / Nitrogen',
  O: 'Oxígeno / Oxygen', Na: 'Sodio / Sodium', Mg: 'Magnesio / Magnesium',
  P: 'Fósforo / Phosphorus', S: 'Azufre / Sulfur', Cl: 'Cloro / Chlorine',
  K: 'Potasio / Potassium', Ca: 'Calcio / Calcium', Fe: 'Hierro / Iron',
  Cu: 'Cobre / Copper', Zn: 'Cinc / Zinc', Mn: 'Manganeso / Manganese',
  Co: 'Cobalto / Cobalt', Ni: 'Níquel / Nickel', I: 'Yodo / Iodine',
  Br: 'Bromo / Bromine', F: 'Flúor / Fluorine', Al: 'Aluminio / Aluminium',
  Si: 'Silicio / Silicon', Ag: 'Plata / Silver', Ba: 'Bario / Barium',
  Pb: 'Plomo / Lead', Li: 'Litio / Lithium',
};

// Factores de conversión a SI base
export const MASS_UNITS = { g: 1, mg: 1e-3, 'µg': 1e-6, ug: 1e-6, ng: 1e-9 };
export const VOL_UNITS = { L: 1, mL: 1e-3, 'µL': 1e-6, uL: 1e-6 };
export const CONC_UNITS = {
  M: 1, mM: 1e-3, 'µM': 1e-6, uM: 1e-6, nM: 1e-9, pM: 1e-12,
  '%': 1, 'mg/mL': 1, 'µg/mL': 1e-3, 'ng/µL': 1, 'X': 1,
};

// ============================================================================
// 2. MOTORES MATEMÁTICOS
// ============================================================================

/**
 * Parsea una fórmula química con soporte para paréntesis, corchetes e hidratos
 * (ej. NaCl, C6H12O6, MgSO4·7H2O, Ca(OH)2, (NH4)2SO4, K3[Fe(CN)6]).
 */
export function parseChemicalFormula(formula) {
  if (!formula || typeof formula !== 'string') {
    return { ok: false, error: 'La fórmula debe ser una cadena no vacía.' };
  }
  const clean = formula.trim().replace(/\s+/g, '');
  if (!clean) {
    return { ok: false, error: 'Introduce una fórmula química.' };
  }

  // Separar hidratos por ·, * o punto entre grupos químicos
  const parts = clean.split(/[·*]|(?<=[A-Za-z0-9)\]])\.(?=\d*[A-Z])/);
  const totalElements = {};

  for (const rawPart of parts) {
    if (!rawPart) continue;
    const m = rawPart.match(/^(\d+)(.*)$/);
    let coeff = 1;
    let body = rawPart;
    if (m && m[2]) {
      coeff = parseInt(m[1], 10);
      body = m[2];
    } else if (m && !m[2]) {
      return { ok: false, error: `Segmento inválido: ${rawPart}` };
    }

    const tokens = body.match(/([A-Z][a-z]?|\d+|[()[\]])/g);
    if (!tokens || tokens.join('') !== body) {
      return { ok: false, error: `Caracteres no reconocidos en la fórmula: ${rawPart}` };
    }

    const stack = [{}];
    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === '(' || tok === '[') {
        stack.push({});
        i++;
      } else if (tok === ')' || tok === ']') {
        if (stack.length <= 1) {
          return { ok: false, error: `Paréntesis o corchete de cierre desbalanceado en: ${rawPart}` };
        }
        i++;
        let mult = 1;
        if (i < tokens.length && /^\d+$/.test(tokens[i])) {
          mult = parseInt(tokens[i], 10);
          i++;
        }
        const top = stack.pop();
        const target = stack[stack.length - 1];
        for (const [el, cnt] of Object.entries(top)) {
          target[el] = (target[el] || 0) + cnt * mult;
        }
      } else if (/^[A-Z][a-z]?$/.test(tok)) {
        if (!ATOMIC_WEIGHTS[tok]) {
          return { ok: false, error: `Elemento químico desconocido o no soportado: "${tok}"` };
        }
        i++;
        let count = 1;
        if (i < tokens.length && /^\d+$/.test(tokens[i])) {
          count = parseInt(tokens[i], 10);
          i++;
        }
        const target = stack[stack.length - 1];
        target[tok] = (target[tok] || 0) + count;
      } else {
        return { ok: false, error: `Sintaxis inesperada cerca de: ${tok}` };
      }
    }

    if (stack.length !== 1) {
      return { ok: false, error: `Paréntesis o corchete de apertura sin cerrar en: ${rawPart}` };
    }

    for (const [el, cnt] of Object.entries(stack[0])) {
      totalElements[el] = (totalElements[el] || 0) + cnt * coeff;
    }
  }

  let mw = 0;
  const elements = [];
  for (const [symbol, count] of Object.entries(totalElements)) {
    const weight = count * ATOMIC_WEIGHTS[symbol];
    mw += weight;
    elements.push({
      symbol,
      name: ELEMENT_NAMES[symbol] || symbol,
      count,
      atomicWeight: ATOMIC_WEIGHTS[symbol],
      weight,
    });
  }

  // Ordenar elementos por masa decreciente
  elements.sort((a, b) => b.weight - a.weight);
  for (const el of elements) {
    el.percent = (el.weight / mw) * 100;
  }

  return {
    ok: true,
    formula: clean,
    mw: Math.round(mw * 1000) / 1000,
    elements,
  };
}

/**
 * Calcula el Peso Molecular aproximado de ácidos nucleicos.
 * - dsDNA: bp * 617.96 + 36.04
 * - ssDNA/primers: nt * 303.7 + 79.0
 * - ssRNA: nt * 320.5 + 159.0
 */
export function calcNucleicAcidMW(type, length) {
  const len = parseInt(length, 10);
  if (!Number.isFinite(len) || len <= 0) {
    return { ok: false, error: 'Introduce una longitud en bases o nucleótidos mayor a 0.' };
  }

  let mw = 0;
  let formulaStr = '';
  switch (type) {
    case 'dsDNA':
      mw = len * 617.96 + 36.04;
      formulaStr = `(${len} pb × 617.96) + 36.04`;
      break;
    case 'ssDNA':
      mw = len * 303.7 + 79.0;
      formulaStr = `(${len} nt × 303.7) + 79.0`;
      break;
    case 'ssRNA':
      mw = len * 320.5 + 159.0;
      formulaStr = `(${len} nt × 320.5) + 159.0`;
      break;
    default:
      return { ok: false, error: `Tipo de ácido nucleico desconocido: ${type}` };
  }

  return {
    ok: true,
    type,
    length: len,
    mw: Math.round(mw * 100) / 100,
    formulaStr,
  };
}

/**
 * Resuelve la ecuación de molaridad: m = C × V × MW.
 * Normaliza internamente a SI (m en g, V en L, C en M, MW en g/mol).
 */
export function solveMolarity({ mass, massUnit = 'g', vol, volUnit = 'L', conc, concUnit = 'M', mw }) {
  const mFactor = MASS_UNITS[massUnit] || 1;
  const vFactor = VOL_UNITS[volUnit] || 1;
  const cFactor = CONC_UNITS[concUnit] || 1;

  const mNum = parseFloat(String(mass).replace(',', '.'));
  const vNum = parseFloat(String(vol).replace(',', '.'));
  const cNum = parseFloat(String(conc).replace(',', '.'));
  const mwNum = parseFloat(String(mw).replace(',', '.'));

  const mVal = Number.isFinite(mNum) && mNum > 0 ? mNum * mFactor : null;
  const vVal = Number.isFinite(vNum) && vNum > 0 ? vNum * vFactor : null;
  const cVal = Number.isFinite(cNum) && cNum > 0 ? cNum * cFactor : null;
  const mwVal = Number.isFinite(mwNum) && mwNum > 0 ? mwNum : null;

  const filledCount = [mVal !== null, vVal !== null, cVal !== null, mwVal !== null].filter(Boolean).length;
  if (filledCount < 3) return null;

  let solved = null;
  let solvedValSI = null;
  let unit = null;
  let formulaDesc = '';

  if (mVal === null) {
    solved = 'mass';
    solvedValSI = cVal * vVal * mwVal;
    unit = massUnit;
    formulaDesc = 'm = C × V × MW';
  } else if (cVal === null) {
    solved = 'conc';
    solvedValSI = mVal / (vVal * mwVal);
    unit = concUnit;
    formulaDesc = 'C = m / (V × MW)';
  } else if (vVal === null) {
    solved = 'vol';
    solvedValSI = mVal / (cVal * mwVal);
    unit = volUnit;
    formulaDesc = 'V = m / (C × MW)';
  } else if (mwVal === null) {
    solved = 'mw';
    solvedValSI = mVal / (cVal * vVal);
    unit = 'g/mol';
    formulaDesc = 'MW = m / (C × V)';
  }

  if (!solved) return null;

  const resVal = solved === 'mass' ? solvedValSI / mFactor :
                 solved === 'vol' ? solvedValSI / vFactor :
                 solved === 'conc' ? solvedValSI / cFactor :
                 solvedValSI;

  return {
    ok: true,
    solved,
    value: resVal,
    unit,
    siValue: solvedValSI,
    formulaDesc,
  };
}

/**
 * Resuelve la ecuación de dilución: C1 × V1 = C2 × V2.
 * Normaliza unidades y calcula el volumen de diluyente requerido (V2 - V1).
 */
export function solveDilution({ c1, c1Unit = 'M', v1, v1Unit = 'mL', c2, c2Unit = 'M', v2, v2Unit = 'mL' }) {
  const c1Factor = CONC_UNITS[c1Unit] || 1;
  const c2Factor = CONC_UNITS[c2Unit] || 1;
  const v1Factor = VOL_UNITS[v1Unit] || 1;
  const v2Factor = VOL_UNITS[v2Unit] || 1;

  const c1Num = parseFloat(String(c1).replace(',', '.'));
  const v1Num = parseFloat(String(v1).replace(',', '.'));
  const c2Num = parseFloat(String(c2).replace(',', '.'));
  const v2Num = parseFloat(String(v2).replace(',', '.'));

  const c1Val = Number.isFinite(c1Num) && c1Num > 0 ? c1Num * c1Factor : null;
  const v1Val = Number.isFinite(v1Num) && v1Num > 0 ? v1Num * v1Factor : null;
  const c2Val = Number.isFinite(c2Num) && c2Num > 0 ? c2Num * c2Factor : null;
  const v2Val = Number.isFinite(v2Num) && v2Num > 0 ? v2Num * v2Factor : null;

  const filledCount = [c1Val !== null, v1Val !== null, c2Val !== null, v2Val !== null].filter(Boolean).length;
  if (filledCount < 3) return null;

  let solved = null;
  let solvedValSI = null;
  let solvedUnit = null;

  if (v1Val === null) {
    solved = 'v1';
    solvedValSI = (c2Val * v2Val) / c1Val;
    solvedUnit = v1Unit;
  } else if (c1Val === null) {
    solved = 'c1';
    solvedValSI = (c2Val * v2Val) / v1Val;
    solvedUnit = c1Unit;
  } else if (v2Val === null) {
    solved = 'v2';
    solvedValSI = (c1Val * v1Val) / c2Val;
    solvedUnit = v2Unit;
  } else if (c2Val === null) {
    solved = 'c2';
    solvedValSI = (c1Val * v1Val) / v2Val;
    solvedUnit = c2Unit;
  }

  if (!solved) return null;

  const resVal = solved === 'v1' ? solvedValSI / v1Factor :
                 solved === 'v2' ? solvedValSI / v2Factor :
                 solved === 'c1' ? solvedValSI / c1Factor :
                 solvedValSI / c2Factor;

  const actV1SI = solved === 'v1' ? solvedValSI : v1Val;
  const actV2SI = solved === 'v2' ? solvedValSI : v2Val;
  const actC1SI = solved === 'c1' ? solvedValSI : c1Val;
  const actC2SI = solved === 'c2' ? solvedValSI : c2Val;

  const isValidDilution = actC1SI >= actC2SI && actV2SI >= actV1SI;
  const vDilSI = actV2SI - actV1SI;
  const vDilInV2Unit = vDilSI / v2Factor;

  return {
    ok: true,
    solved,
    value: resVal,
    unit: solvedUnit,
    isValidDilution,
    vDilSI,
    vDilInV2Unit,
    v1Val: actV1SI / v1Factor,
    v1Unit,
    v2Val: actV2SI / v2Factor,
    v2Unit,
    c1Val: actC1SI / c1Factor,
    c1Unit,
    c2Val: actC2SI / c2Factor,
    c2Unit,
  };
}

// Formateador limpio de números de laboratorio
export function fmtLabNumber(val, decimals = 4) {
  if (!Number.isFinite(val)) return '—';
  if (val === 0) return '0';
  const abs = Math.abs(val);
  if (abs >= 1e6 || (abs < 1e-4 && abs > 0)) {
    return val.toExponential(decimals);
  }
  const factor = Math.pow(10, decimals);
  return (Math.round(val * factor) / factor).toString();
}

// ============================================================================
// 3. ESTADO DEL MÓDULO Y PERSISTENCIA
// ============================================================================

function defaultState() {
  return {
    tab: 'mw', // 'mw' | 'molarity' | 'dilutions'
    formula: 'MgSO4·7H2O',
    naType: 'dsDNA',
    naLength: '1000',
    molarity: {
      mass: '',
      massUnit: 'g',
      vol: '500',
      volUnit: 'mL',
      conc: '0.1',
      concUnit: 'M',
      mw: '58.44',
      lastAuto: 'mass',
    },
    dilution: {
      c1: '10',
      c1Unit: 'X',
      v1: '',
      v1Unit: 'mL',
      c2: '1',
      c2Unit: 'X',
      v2: '100',
      v2Unit: 'mL',
      lastAuto: 'v1',
    },
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const def = defaultState();
      return {
        tab: ['mw', 'molarity', 'dilutions'].includes(raw.tab) ? raw.tab : def.tab,
        formula: typeof raw.formula === 'string' ? raw.formula : def.formula,
        naType: ['dsDNA', 'ssDNA', 'ssRNA'].includes(raw.naType) ? raw.naType : def.naType,
        naLength: String(raw.naLength || def.naLength),
        molarity: { ...def.molarity, ...(raw.molarity || {}) },
        dilution: { ...def.dilution, ...(raw.dilution || {}) },
      };
    }
  } catch (e) { /* ignore */ }
  return defaultState();
}

function saveState(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch (e) { /* ignore */ }
}

// ============================================================================
// 4. RENDERIZADO PRINCIPAL DEL MÓDULO (SUB-PESTAÑAS)
// ============================================================================

export function render(container) {
  const s = loadState();

  const TABS = [
    { id: 'mw', labelKey: 'calc.tabMW' },
    { id: 'molarity', labelKey: 'calc.tabMolarity' },
    { id: 'dilutions', labelKey: 'calc.tabDilutions' },
  ];

  function paint() {
    container.innerHTML = '';

    // Cabecera estándar de página
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      `<p class="ql-eyebrow">${t('calc.eyebrow')}</p>` +
      `<h1 class="ql-page-title">${t('calc.title')}</h1>` +
      `<p class="ql-page-sub">${t('calc.subtitle')}</p>`;
    container.appendChild(header);

    // Navegación interna con sub-pestañas (.ql-tabs)
    const tabsEl = document.createElement('div');
    tabsEl.className = 'ql-tabs';
    tabsEl.setAttribute('role', 'tablist');
    TABS.forEach((tabDef) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-tab' + (s.tab === tabDef.id ? ' is-active' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(s.tab === tabDef.id));
      b.textContent = t(tabDef.labelKey);
      b.addEventListener('click', () => {
        s.tab = tabDef.id;
        saveState(s);
        paint();
      });
      tabsEl.appendChild(b);
    });
    container.appendChild(tabsEl);

    // Renderizado exclusivo del panel activo
    if (s.tab === 'mw') {
      paintMW(container);
    } else if (s.tab === 'molarity') {
      paintMolarity(container);
    } else {
      paintDilutions(container);
    }
  }

  // --------------------------------------------------------------------------
  // SUB-PESTAÑA 1: PESO MOLECULAR (FÓRMULAS QUÍMICAS Y ÁCIDOS NUCLEICOS)
  // --------------------------------------------------------------------------
  function paintMW(parent) {
    const stack = document.createElement('div');
    stack.className = 'ql-stack';

    // ---- TARJETA 1: Fórmulas Químicas ----
    const chemCard = document.createElement('section');
    chemCard.className = 'ql-card ql-panel';

    const chemPresets = [
      { label: 'NaCl', formula: 'NaCl' },
      { label: 'Tris base', formula: 'C4H11NO3' },
      { label: 'EDTA', formula: 'C10H16N2O8' },
      { label: 'SDS', formula: 'NaC12H25SO4' },
      { label: 'HEPES', formula: 'C8H18N2O4S' },
      { label: 'MgSO₄·7H₂O', formula: 'MgSO4·7H2O' },
      { label: 'Glucosa', formula: 'C6H12O6' },
      { label: 'CaCl₂·2H₂O', formula: 'CaCl2.2H2O' },
      { label: 'CuSO₄·5H₂O', formula: 'CuSO4*5H2O' },
      { label: '(NH₄)₂SO₄', formula: '(NH4)2SO4' },
    ];

    chemCard.innerHTML = `
      <h2>${t('calc.chemTitle')}</h2>
      <p class="ql-panel-note">${t('calc.chemDesc')}</p>
      <div class="ql-calc-presets">
        <span class="ql-calc-presets-label">${t('calc.chemExamples')}</span>
        <div class="ql-calc-presets-tags">
          ${chemPresets.map(p => `<button type="button" class="ql-calc-preset-tag" data-formula="${p.formula}">${p.label}</button>`).join('')}
        </div>
      </div>
      <div class="ql-calc-input-row" style="margin-top:14px;">
        <input type="text" id="ql-calc-formula-input" class="ql-calc-text-input"
               placeholder="${t('calc.formulaPlaceholder')}" value="${s.formula || ''}" spellcheck="false" autocomplete="off" />
        <button type="button" id="ql-calc-formula-btn" class="ql-btn ql-btn-primary">${t('calc.calculateBtn')}</button>
      </div>
      <div id="ql-calc-formula-result" class="ql-calc-result-area" style="margin-top:16px;"></div>
    `;
    stack.appendChild(chemCard);

    // ---- TARJETA 2: Ácidos Nucleicos (ADN / ARN) ----
    const naCard = document.createElement('section');
    naCard.className = 'ql-card ql-panel';
    naCard.innerHTML = `
      <h2>${t('calc.naTitle')}</h2>
      <p class="ql-panel-note">${t('calc.naDesc')}</p>
      <div class="ql-calc-form-grid" style="margin-top:14px;">
        <div class="ql-calc-field">
          <label class="ql-calc-label" for="ql-calc-na-type">${t('calc.naType')}</label>
          <select id="ql-calc-na-type" class="ql-calc-select">
            <option value="dsDNA" ${s.naType === 'dsDNA' ? 'selected' : ''}>${t('calc.dsDNA')}</option>
            <option value="ssDNA" ${s.naType === 'ssDNA' ? 'selected' : ''}>${t('calc.ssDNA')}</option>
            <option value="ssRNA" ${s.naType === 'ssRNA' ? 'selected' : ''}>${t('calc.ssRNA')}</option>
          </select>
        </div>
        <div class="ql-calc-field">
          <label class="ql-calc-label" for="ql-calc-na-len">${t('calc.naLength')} (<span id="ql-calc-na-unit-label">${s.naType === 'dsDNA' ? t('calc.bpUnit') : t('calc.ntUnit')}</span>)</label>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-calc-na-len" min="1" step="1" value="${s.naLength || '1000'}" class="ql-calc-number-input" />
            <span class="ql-calc-unit-badge" id="ql-calc-na-unit-badge">${s.naType === 'dsDNA' ? t('calc.bpUnit') : t('calc.ntUnit')}</span>
          </div>
        </div>
      </div>
      <div id="ql-calc-na-result" class="ql-calc-result-area" style="margin-top:16px;"></div>
    `;
    stack.appendChild(naCard);

    parent.appendChild(stack);

    // Eventos y cálculo interactivo de Fórmulas Químicas
    const formulaInput = chemCard.querySelector('#ql-calc-formula-input');
    const formulaBtn = chemCard.querySelector('#ql-calc-formula-btn');
    const formulaResult = chemCard.querySelector('#ql-calc-formula-result');

    function updateFormula() {
      const f = formulaInput.value.trim();
      s.formula = f;
      saveState(s);
      if (!f) {
        formulaResult.innerHTML = '';
        return;
      }
      const res = parseChemicalFormula(f);
      if (!res.ok) {
        formulaResult.innerHTML = `<div class="ql-calc-alert ql-calc-alert-error">${res.error}</div>`;
        return;
      }

      formulaResult.innerHTML = `
        <div class="ql-calc-result-box">
          <div class="ql-calc-result-header">
            <div>
              <span class="ql-calc-result-label">${t('calc.molarMass')}:</span>
              <div class="ql-calc-result-val">${fmtLabNumber(res.mw, 3)} <span class="ql-calc-result-unit">g/mol</span></div>
            </div>
            <button type="button" class="ql-btn ql-btn-secondary ql-calc-bridge-btn" id="ql-calc-use-mw-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              ${t('calc.useInMolarity')}
            </button>
          </div>
          <div class="ql-calc-composition-title">${t('calc.composition')}:</div>
          <div class="ql-calc-table-wrap">
            <table class="ql-calc-table">
              <thead>
                <tr>
                  <th>Símbolo</th>
                  <th>Elemento</th>
                  <th style="text-align:right;">Átomos</th>
                  <th style="text-align:right;">Masa (g/mol)</th>
                  <th style="text-align:right;">% Masa</th>
                </tr>
              </thead>
              <tbody>
                ${res.elements.map(el => `
                  <tr>
                    <td><strong>${el.symbol}</strong></td>
                    <td class="ql-ink-muted">${el.name}</td>
                    <td style="text-align:right;">${el.count}</td>
                    <td style="text-align:right; font-family:var(--font-mono);">${fmtLabNumber(el.weight, 3)}</td>
                    <td style="text-align:right;">
                      <span class="ql-calc-percent-tag">${el.percent.toFixed(2)}%</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Puente hacia Molaridad
      const useBtn = formulaResult.querySelector('#ql-calc-use-mw-btn');
      if (useBtn) {
        useBtn.addEventListener('click', () => {
          s.molarity.mw = String(res.mw);
          if (s.molarity.lastAuto === 'mw') s.molarity.lastAuto = null;
          s.tab = 'molarity';
          saveState(s);
          paint();
        });
      }
    }

    formulaBtn.addEventListener('click', updateFormula);
    formulaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') updateFormula();
    });
    formulaInput.addEventListener('input', () => {
      s.formula = formulaInput.value;
      saveState(s);
    });

    chemCard.querySelectorAll('.ql-calc-preset-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        formulaInput.value = tag.getAttribute('data-formula') || '';
        updateFormula();
      });
    });

    // Render inicial si había fórmula
    if (s.formula) updateFormula();

    // Eventos y cálculo de Ácidos Nucleicos
    const naTypeSelect = naCard.querySelector('#ql-calc-na-type');
    const naLenInput = naCard.querySelector('#ql-calc-na-len');
    const naUnitLabel = naCard.querySelector('#ql-calc-na-unit-label');
    const naUnitBadge = naCard.querySelector('#ql-calc-na-unit-badge');
    const naResult = naCard.querySelector('#ql-calc-na-result');

    function updateNA() {
      const type = naTypeSelect.value;
      const len = naLenInput.value;
      s.naType = type;
      s.naLength = len;
      saveState(s);

      const unitText = type === 'dsDNA' ? t('calc.bpUnit') : t('calc.ntUnit');
      if (naUnitLabel) naUnitLabel.textContent = unitText;
      if (naUnitBadge) naUnitBadge.textContent = unitText;

      const res = calcNucleicAcidMW(type, len);
      if (!res.ok) {
        naResult.innerHTML = `<div class="ql-calc-alert ql-calc-alert-error">${res.error}</div>`;
        return;
      }

      const mwKDa = res.mw / 1000;
      naResult.innerHTML = `
        <div class="ql-calc-result-box">
          <div class="ql-calc-result-header">
            <div>
              <span class="ql-calc-result-label">${t('calc.molarMass')}:</span>
              <div class="ql-calc-result-val">
                ${fmtLabNumber(res.mw, 2)} <span class="ql-calc-result-unit">g/mol</span>
                <span class="ql-calc-secondary-val">(${fmtLabNumber(mwKDa, 2)} kDa)</span>
              </div>
              <div class="ql-field-help" style="margin-top:4px;">${res.formulaStr}</div>
            </div>
            <button type="button" class="ql-btn ql-btn-secondary ql-calc-bridge-btn" id="ql-calc-use-na-mw-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              ${t('calc.useInMolarity')}
            </button>
          </div>
        </div>
      `;

      const useBtn = naResult.querySelector('#ql-calc-use-na-mw-btn');
      if (useBtn) {
        useBtn.addEventListener('click', () => {
          s.molarity.mw = String(res.mw);
          if (s.molarity.lastAuto === 'mw') s.molarity.lastAuto = null;
          s.tab = 'molarity';
          saveState(s);
          paint();
        });
      }
    }

    naTypeSelect.addEventListener('change', updateNA);
    naLenInput.addEventListener('input', updateNA);
    updateNA();
  }

  // --------------------------------------------------------------------------
  // SUB-PESTAÑA 2: CALCULADORA DE MOLARIDAD (m = C × V × MW)
  // --------------------------------------------------------------------------
  function paintMolarity(parent) {
    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';
    card.innerHTML = `
      <div class="ql-calc-header-row">
        <div>
          <h2>${t('calc.molTitle')}</h2>
          <p class="ql-panel-note">${t('calc.molDesc')}</p>
        </div>
        <button type="button" id="ql-calc-mol-clear" class="ql-btn ql-btn-subtle ql-btn-sm">${t('calc.clearBtn')}</button>
      </div>

      <div class="ql-calc-params-grid" style="margin-top:18px;">
        <!-- Masa -->
        <div class="ql-calc-param-box" id="ql-param-mass-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-mol-mass">${t('calc.mass')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-mass">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-mol-mass" step="any" min="0" value="${s.molarity.mass || ''}"
                   placeholder="Ej. 2.92" class="ql-calc-number-input" />
            <select id="ql-mol-mass-unit" class="ql-calc-unit-select">
              <option value="g" ${s.molarity.massUnit === 'g' ? 'selected' : ''}>g</option>
              <option value="mg" ${s.molarity.massUnit === 'mg' ? 'selected' : ''}>mg</option>
              <option value="µg" ${s.molarity.massUnit === 'µg' ? 'selected' : ''}>µg</option>
              <option value="ng" ${s.molarity.massUnit === 'ng' ? 'selected' : ''}>ng</option>
            </select>
          </div>
        </div>

        <!-- Volumen -->
        <div class="ql-calc-param-box" id="ql-param-vol-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-mol-vol">${t('calc.volume')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-vol">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-mol-vol" step="any" min="0" value="${s.molarity.vol || ''}"
                   placeholder="Ej. 500" class="ql-calc-number-input" />
            <select id="ql-mol-vol-unit" class="ql-calc-unit-select">
              <option value="L" ${s.molarity.volUnit === 'L' ? 'selected' : ''}>L</option>
              <option value="mL" ${s.molarity.volUnit === 'mL' ? 'selected' : ''}>mL</option>
              <option value="µL" ${s.molarity.volUnit === 'µL' ? 'selected' : ''}>µL</option>
            </select>
          </div>
        </div>

        <!-- Concentración -->
        <div class="ql-calc-param-box" id="ql-param-conc-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-mol-conc">${t('calc.concentration')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-conc">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-mol-conc" step="any" min="0" value="${s.molarity.conc || ''}"
                   placeholder="Ej. 0.1" class="ql-calc-number-input" />
            <select id="ql-mol-conc-unit" class="ql-calc-unit-select">
              <option value="M" ${s.molarity.concUnit === 'M' ? 'selected' : ''}>M</option>
              <option value="mM" ${s.molarity.concUnit === 'mM' ? 'selected' : ''}>mM</option>
              <option value="µM" ${s.molarity.concUnit === 'µM' ? 'selected' : ''}>µM</option>
              <option value="nM" ${s.molarity.concUnit === 'nM' ? 'selected' : ''}>nM</option>
              <option value="pM" ${s.molarity.concUnit === 'pM' ? 'selected' : ''}>pM</option>
            </select>
          </div>
        </div>

        <!-- Peso Molecular -->
        <div class="ql-calc-param-box" id="ql-param-mw-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-mol-mw">${t('calc.mw')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-mw">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-mol-mw" step="any" min="0" value="${s.molarity.mw || ''}"
                   placeholder="Ej. 58.44" class="ql-calc-number-input" />
            <span class="ql-calc-unit-badge">g/mol</span>
          </div>
        </div>
      </div>

      <!-- Resumen y fórmula explicativa -->
      <div id="ql-mol-summary" class="ql-calc-math-summary" style="margin-top:20px;"></div>
    `;

    parent.appendChild(card);

    const inputMass = card.querySelector('#ql-mol-mass');
    const selectMassUnit = card.querySelector('#ql-mol-mass-unit');
    const badgeMass = card.querySelector('#ql-badge-mass');
    const boxMass = card.querySelector('#ql-param-mass-box');

    const inputVol = card.querySelector('#ql-mol-vol');
    const selectVolUnit = card.querySelector('#ql-mol-vol-unit');
    const badgeVol = card.querySelector('#ql-badge-vol');
    const boxVol = card.querySelector('#ql-param-vol-box');

    const inputConc = card.querySelector('#ql-mol-conc');
    const selectConcUnit = card.querySelector('#ql-mol-conc-unit');
    const badgeConc = card.querySelector('#ql-badge-conc');
    const boxConc = card.querySelector('#ql-param-conc-box');

    const inputMW = card.querySelector('#ql-mol-mw');
    const badgeMW = card.querySelector('#ql-badge-mw');
    const boxMW = card.querySelector('#ql-param-mw-box');

    const summaryEl = card.querySelector('#ql-mol-summary');
    const clearBtn = card.querySelector('#ql-calc-mol-clear');

    const fields = {
      mass: { input: inputMass, unit: selectMassUnit, badge: badgeMass, box: boxMass },
      vol: { input: inputVol, unit: selectVolUnit, badge: badgeVol, box: boxVol },
      conc: { input: inputConc, unit: selectConcUnit, badge: badgeConc, box: boxConc },
      mw: { input: inputMW, unit: null, badge: badgeMW, box: boxMW },
    };

    function recalculate(userFieldChanged) {
      // Si el usuario tecleó en el campo que antes era auto-despejado, deja de serlo
      if (userFieldChanged && s.molarity.lastAuto === userFieldChanged) {
        s.molarity.lastAuto = null;
      }

      const currentVals = {
        mass: inputMass.value.trim(),
        massUnit: selectMassUnit.value,
        vol: inputVol.value.trim(),
        volUnit: selectVolUnit.value,
        conc: inputConc.value.trim(),
        concUnit: selectConcUnit.value,
        mw: inputMW.value.trim(),
      };

      // Si hay 4 campos con valor pero uno es lastAuto, omitimos ese para recalcularlo
      const targetParams = { ...currentVals };
      if (s.molarity.lastAuto && targetParams[s.molarity.lastAuto]) {
        targetParams[s.molarity.lastAuto] = '';
      }

      const res = solveMolarity(targetParams);

      // Limpiar insignias de todos
      Object.keys(fields).forEach((k) => {
        fields[k].badge.classList.add('is-hidden');
        fields[k].box.classList.remove('is-solved');
      });

      if (res && res.ok && res.solved) {
        s.molarity.lastAuto = res.solved;
        const target = fields[res.solved];
        const formattedVal = fmtLabNumber(res.value, 4);
        target.input.value = formattedVal;
        target.badge.classList.remove('is-hidden');
        target.box.classList.add('is-solved');

        // Sincronizar en estado
        s.molarity[res.solved] = formattedVal;

        summaryEl.innerHTML = `
          <div class="ql-calc-callout">
            <div class="ql-calc-callout-title">${t('calc.formulaExpl')}</div>
            <div class="ql-calc-callout-desc">
              Despeje: <strong>${res.formulaDesc}</strong> &rarr;
              Resultado: <strong>${formattedVal} ${res.unit}</strong>
            </div>
          </div>
        `;
      } else {
        summaryEl.innerHTML = `
          <div class="ql-calc-callout-idle">
            ${t('calc.molDesc')}
          </div>
        `;
      }

      // Guardar entradas de usuario
      s.molarity.mass = inputMass.value;
      s.molarity.massUnit = selectMassUnit.value;
      s.molarity.vol = inputVol.value;
      s.molarity.volUnit = selectVolUnit.value;
      s.molarity.conc = inputConc.value;
      s.molarity.concUnit = selectConcUnit.value;
      s.molarity.mw = inputMW.value;
      saveState(s);
    }

    // Listeners
    ['mass', 'vol', 'conc', 'mw'].forEach((k) => {
      fields[k].input.addEventListener('input', () => recalculate(k));
      if (fields[k].unit) {
        fields[k].unit.addEventListener('change', () => recalculate(k));
      }
    });

    clearBtn.addEventListener('click', () => {
      s.molarity.mass = '';
      s.molarity.vol = '';
      s.molarity.conc = '';
      s.molarity.mw = '';
      s.molarity.lastAuto = null;
      inputMass.value = '';
      inputVol.value = '';
      inputConc.value = '';
      inputMW.value = '';
      recalculate(null);
    });

    // Ejecución inicial
    recalculate(null);
  }

  // --------------------------------------------------------------------------
  // SUB-PESTAÑA 3: CALCULADORA DE DILUCIONES (C1 × V1 = C2 × V2)
  // --------------------------------------------------------------------------
  function paintDilutions(parent) {
    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';
    card.innerHTML = `
      <div class="ql-calc-header-row">
        <div>
          <h2>${t('calc.dilTitle')}</h2>
          <p class="ql-panel-note">${t('calc.dilDesc')}</p>
        </div>
        <button type="button" id="ql-calc-dil-clear" class="ql-btn ql-btn-subtle ql-btn-sm">${t('calc.clearBtn')}</button>
      </div>

      <div class="ql-calc-params-grid" style="margin-top:18px;">
        <!-- C1 (Stock) -->
        <div class="ql-calc-param-box" id="ql-param-c1-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-dil-c1">${t('calc.c1')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-c1">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-dil-c1" step="any" min="0" value="${s.dilution.c1 || ''}"
                   placeholder="Ej. 10" class="ql-calc-number-input" />
            <select id="ql-dil-c1-unit" class="ql-calc-unit-select">
              <option value="X" ${s.dilution.c1Unit === 'X' ? 'selected' : ''}>X</option>
              <option value="M" ${s.dilution.c1Unit === 'M' ? 'selected' : ''}>M</option>
              <option value="mM" ${s.dilution.c1Unit === 'mM' ? 'selected' : ''}>mM</option>
              <option value="µM" ${s.dilution.c1Unit === 'µM' ? 'selected' : ''}>µM</option>
              <option value="nM" ${s.dilution.c1Unit === 'nM' ? 'selected' : ''}>nM</option>
              <option value="%" ${s.dilution.c1Unit === '%' ? 'selected' : ''}>%</option>
              <option value="mg/mL" ${s.dilution.c1Unit === 'mg/mL' ? 'selected' : ''}>mg/mL</option>
              <option value="µg/mL" ${s.dilution.c1Unit === 'µg/mL' ? 'selected' : ''}>µg/mL</option>
            </select>
          </div>
        </div>

        <!-- V1 (Volumen Stock) -->
        <div class="ql-calc-param-box" id="ql-param-v1-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-dil-v1">${t('calc.v1')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-v1">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-dil-v1" step="any" min="0" value="${s.dilution.v1 || ''}"
                   placeholder="Ej. 10" class="ql-calc-number-input" />
            <select id="ql-dil-v1-unit" class="ql-calc-unit-select">
              <option value="mL" ${s.dilution.v1Unit === 'mL' ? 'selected' : ''}>mL</option>
              <option value="µL" ${s.dilution.v1Unit === 'µL' ? 'selected' : ''}>µL</option>
              <option value="L" ${s.dilution.v1Unit === 'L' ? 'selected' : ''}>L</option>
            </select>
          </div>
        </div>

        <!-- C2 (Final) -->
        <div class="ql-calc-param-box" id="ql-param-c2-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-dil-c2">${t('calc.c2')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-c2">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-dil-c2" step="any" min="0" value="${s.dilution.c2 || ''}"
                   placeholder="Ej. 1" class="ql-calc-number-input" />
            <select id="ql-dil-c2-unit" class="ql-calc-unit-select">
              <option value="X" ${s.dilution.c2Unit === 'X' ? 'selected' : ''}>X</option>
              <option value="M" ${s.dilution.c2Unit === 'M' ? 'selected' : ''}>M</option>
              <option value="mM" ${s.dilution.c2Unit === 'mM' ? 'selected' : ''}>mM</option>
              <option value="µM" ${s.dilution.c2Unit === 'µM' ? 'selected' : ''}>µM</option>
              <option value="nM" ${s.dilution.c2Unit === 'nM' ? 'selected' : ''}>nM</option>
              <option value="%" ${s.dilution.c2Unit === '%' ? 'selected' : ''}>%</option>
              <option value="mg/mL" ${s.dilution.c2Unit === 'mg/mL' ? 'selected' : ''}>mg/mL</option>
              <option value="µg/mL" ${s.dilution.c2Unit === 'µg/mL' ? 'selected' : ''}>µg/mL</option>
            </select>
          </div>
        </div>

        <!-- V2 (Volumen Final) -->
        <div class="ql-calc-param-box" id="ql-param-v2-box">
          <div class="ql-calc-param-header">
            <label class="ql-calc-label" for="ql-dil-v2">${t('calc.v2')}</label>
            <span class="ql-calc-auto-badge is-hidden" id="ql-badge-v2">${t('calc.solvedBadge')}</span>
          </div>
          <div class="ql-calc-unit-group">
            <input type="number" id="ql-dil-v2" step="any" min="0" value="${s.dilution.v2 || ''}"
                   placeholder="Ej. 100" class="ql-calc-number-input" />
            <select id="ql-dil-v2-unit" class="ql-calc-unit-select">
              <option value="mL" ${s.dilution.v2Unit === 'mL' ? 'selected' : ''}>mL</option>
              <option value="µL" ${s.dilution.v2Unit === 'µL' ? 'selected' : ''}>µL</option>
              <option value="L" ${s.dilution.v2Unit === 'L' ? 'selected' : ''}>L</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Resumen de instrucción de preparación y advertencias -->
      <div id="ql-dil-summary" class="ql-calc-math-summary" style="margin-top:20px;"></div>
    `;

    parent.appendChild(card);

    const inputC1 = card.querySelector('#ql-dil-c1');
    const selectC1Unit = card.querySelector('#ql-dil-c1-unit');
    const badgeC1 = card.querySelector('#ql-badge-c1');
    const boxC1 = card.querySelector('#ql-param-c1-box');

    const inputV1 = card.querySelector('#ql-dil-v1');
    const selectV1Unit = card.querySelector('#ql-dil-v1-unit');
    const badgeV1 = card.querySelector('#ql-badge-v1');
    const boxV1 = card.querySelector('#ql-param-v1-box');

    const inputC2 = card.querySelector('#ql-dil-c2');
    const selectC2Unit = card.querySelector('#ql-dil-c2-unit');
    const badgeC2 = card.querySelector('#ql-badge-c2');
    const boxC2 = card.querySelector('#ql-param-c2-box');

    const inputV2 = card.querySelector('#ql-dil-v2');
    const selectV2Unit = card.querySelector('#ql-dil-v2-unit');
    const badgeV2 = card.querySelector('#ql-badge-v2');
    const boxV2 = card.querySelector('#ql-param-v2-box');

    const summaryEl = card.querySelector('#ql-dil-summary');
    const clearBtn = card.querySelector('#ql-calc-dil-clear');

    const fields = {
      c1: { input: inputC1, unit: selectC1Unit, badge: badgeC1, box: boxC1 },
      v1: { input: inputV1, unit: selectV1Unit, badge: badgeV1, box: boxV1 },
      c2: { input: inputC2, unit: selectC2Unit, badge: badgeC2, box: boxC2 },
      v2: { input: inputV2, unit: selectV2Unit, badge: badgeV2, box: boxV2 },
    };

    function recalculateDilution(userFieldChanged) {
      if (userFieldChanged && s.dilution.lastAuto === userFieldChanged) {
        s.dilution.lastAuto = null;
      }

      const currentVals = {
        c1: inputC1.value.trim(),
        c1Unit: selectC1Unit.value,
        v1: inputV1.value.trim(),
        v1Unit: selectV1Unit.value,
        c2: inputC2.value.trim(),
        c2Unit: selectC2Unit.value,
        v2: inputV2.value.trim(),
        v2Unit: selectV2Unit.value,
      };

      const targetParams = { ...currentVals };
      if (s.dilution.lastAuto && targetParams[s.dilution.lastAuto]) {
        targetParams[s.dilution.lastAuto] = '';
      }

      const res = solveDilution(targetParams);

      Object.keys(fields).forEach((k) => {
        fields[k].badge.classList.add('is-hidden');
        fields[k].box.classList.remove('is-solved');
      });

      if (res && res.ok && res.solved) {
        s.dilution.lastAuto = res.solved;
        const target = fields[res.solved];
        const formattedVal = fmtLabNumber(res.value, 4);
        target.input.value = formattedVal;
        target.badge.classList.remove('is-hidden');
        target.box.classList.add('is-solved');

        s.dilution[res.solved] = formattedVal;

        if (!res.isValidDilution) {
          summaryEl.innerHTML = `
            <div class="ql-calc-alert ql-calc-alert-error">
              <strong>Error de dilución:</strong> ${t('calc.dilError')}
            </div>
          `;
        } else {
          const v1Fmt = `${fmtLabNumber(res.v1Val, 4)} ${res.v1Unit}`;
          const v2Fmt = `${fmtLabNumber(res.v2Val, 4)} ${res.v2Unit}`;
          const vDilFmt = `${fmtLabNumber(res.vDilInV2Unit, 4)} ${res.v2Unit}`;

          const tipText = t('calc.dilTip', {
            v1: v1Fmt,
            vDil: vDilFmt,
            v2: v2Fmt,
          });

          summaryEl.innerHTML = `
            <div class="ql-calc-callout">
              <div class="ql-calc-callout-title">${t('calc.dilInstruction')}</div>
              <div class="ql-calc-callout-desc">${tipText}</div>
              <div class="ql-calc-secondary-meta" style="margin-top:8px;">
                <span>${t('calc.diluentVol')}: <strong>${vDilFmt}</strong></span>
              </div>
            </div>
          `;
        }
      } else {
        summaryEl.innerHTML = `
          <div class="ql-calc-callout-idle">
            ${t('calc.dilDesc')}
          </div>
        `;
      }

      s.dilution.c1 = inputC1.value;
      s.dilution.c1Unit = selectC1Unit.value;
      s.dilution.v1 = inputV1.value;
      s.dilution.v1Unit = selectV1Unit.value;
      s.dilution.c2 = inputC2.value;
      s.dilution.c2Unit = selectC2Unit.value;
      s.dilution.v2 = inputV2.value;
      s.dilution.v2Unit = selectV2Unit.value;
      saveState(s);
    }

    ['c1', 'v1', 'c2', 'v2'].forEach((k) => {
      fields[k].input.addEventListener('input', () => recalculateDilution(k));
      fields[k].unit.addEventListener('change', () => recalculateDilution(k));
    });

    clearBtn.addEventListener('click', () => {
      s.dilution.c1 = '';
      s.dilution.v1 = '';
      s.dilution.c2 = '';
      s.dilution.v2 = '';
      s.dilution.lastAuto = null;
      inputC1.value = '';
      inputV1.value = '';
      inputC2.value = '';
      inputV2.value = '';
      recalculateDilution(null);
    });

    recalculateDilution(null);
  }

  // Pintar vista inicial
  paint();

  return () => {
    saveState(s);
  };
}
