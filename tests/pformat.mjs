// pFormat.js: formateador de p-valor al estilo Prism (GP/APA/NEJM/custom).
// Sin equivalente en R que verificar (es formato de presentación, no
// cálculo) — se comprueba contra la especificación textual de
// Claude outputs/assets/pairwise_fixtures.json → pFormatSpec (documentación
// de GraphPad Prism 11), con casos límite exactos en cada umbral.
import { formatPStyled } from '../js/lib/pFormat.js';

let failed = false;
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (detail ? '  ' + detail : ''));
  if (!ok) failed = true;
}

console.log('--- estilo GP (GraphPad): ****/***/**/*/ns, umbral ≤ por defecto ---');
check('p=0.00005 → **** (≤0.0001)', formatPStyled(0.00005, { style: 'gp' }) === '****');
check('p=0.0001 exacto → **** (≤, no <)', formatPStyled(0.0001, { style: 'gp' }) === '****');
check('p=0.0005 → *** (≤0.001)', formatPStyled(0.0005, { style: 'gp' }) === '***');
check('p=0.001 exacto → *** (≤)', formatPStyled(0.001, { style: 'gp' }) === '***');
check('p=0.005 → ** (≤0.01)', formatPStyled(0.005, { style: 'gp' }) === '**');
check('p=0.01 exacto → ** (≤)', formatPStyled(0.01, { style: 'gp' }) === '**');
check('p=0.03 → * (≤0.05)', formatPStyled(0.03, { style: 'gp' }) === '*');
check('p=0.05 exacto → * (≤)', formatPStyled(0.05, { style: 'gp' }) === '*');
check('p=0.051 → ns', formatPStyled(0.051, { style: 'gp' }) === 'ns');
check('p=0.5 → ns', formatPStyled(0.5, { style: 'gp' }) === 'ns');

console.log('\n--- strict:true (ggsignif/ggpubr): umbral < en vez de ≤ ---');
check('p=0.05 exacto con strict → ns (no *)', formatPStyled(0.05, { style: 'gp', strict: true }) === 'ns');
check('p=0.001 exacto con strict → ** (no ***)', formatPStyled(0.001, { style: 'gp', strict: true }) === '**');
check('p=0.0499 con strict → * (sigue por debajo del umbral)', formatPStyled(0.0499, { style: 'gp', strict: true }) === '*');

console.log('\n--- modo exact: decimales y cero inicial por estilo ---');
check('GP: 4 decimales con cero inicial', formatPStyled(0.0523, { style: 'gp', mode: 'exact' }) === '0.0523');
check('GP: por debajo de 0.0001 → "<0.0001"', formatPStyled(0.00003, { style: 'gp', mode: 'exact' }) === '<0.0001');
check('APA: 3 decimales SIN cero inicial', formatPStyled(0.0523, { style: 'apa', mode: 'exact' }) === '.052');
check('APA: por debajo de .001 → "<.001" (sin cero inicial)', formatPStyled(0.0003, { style: 'apa', mode: 'exact' }) === '<.001');
check('NEJM: 3 decimales CON cero inicial', formatPStyled(0.0523, { style: 'nejm', mode: 'exact' }) === '0.052');
check('NEJM: por debajo de 0.001 → "<0.001" (con cero inicial)', formatPStyled(0.0003, { style: 'nejm', mode: 'exact' }) === '<0.001');

console.log('\n--- modo stars+exact ---');
check('combina estrellas y valor exacto', formatPStyled(0.0079, { style: 'gp', mode: 'stars+exact' }) === '** (0.0079)');
check('ns también lleva el valor exacto', formatPStyled(0.4, { style: 'gp', mode: 'stars+exact' }) === 'ns (0.4000)');

console.log('\n--- estilo custom ---');
check('umbrales/etiquetas propios', formatPStyled(0.02, {
  style: 'custom', stars: [[0.01, '#'], [0.05, '+']],
}) === '+');
check('custom respeta decimales/cero inicial propios en modo exact',
  formatPStyled(0.2, { style: 'custom', mode: 'exact', decimals: 2, leadingZero: false }) === '.20');

console.log('\n--- casos borde ---');
check('p no finito → "—"', formatPStyled(NaN) === '—');
check('estilo desconocido lanza', (() => {
  try { formatPStyled(0.1, { style: 'nope' }); return false; } catch (e) { return true; }
})());

console.log('\n--- Resumen ---');
if (failed) {
  console.error('❌ Fallaron algunos tests.');
  process.exit(1);
} else {
  console.log('✅ Todos los tests pasaron exitosamente.');
  process.exit(0);
}
