// js/lib/paletteStyle.js — lógica pura del relleno de serie (Fase 2, Pasos
// 2-5): migración de formato, degradado/patrón por defecto, geometría de
// la línea de degradado y del tile de patrón. Sin DOM — la integración
// real (crear <defs>, pintar nodos) se verifica en Chrome real en
// tests/paletteseries.mjs.
//
//   node tests/palettestyle.mjs

import { APP_ROOT } from './lib/env.mjs';
const {
  normalizeSeriesStyle, representativeColor, defaultGradient, defaultPattern,
  darken, gradientLineFromAngle, patternTileSpec, defId,
} = await import(APP_ROOT + '/js/lib/paletteStyle.js');

let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

console.log('-- normalizeSeriesStyle: migración de formato --');
check('undefined → {} (sin personalizar)', JSON.stringify(normalizeSeriesStyle(undefined)) === '{}');
check('null → {}', JSON.stringify(normalizeSeriesStyle(null)) === '{}');
check('string vacía → {}', JSON.stringify(normalizeSeriesStyle('')) === '{}');
check('string hex (formato pre-Fase 2) → { color }', JSON.stringify(normalizeSeriesStyle('#2a78d6')) === JSON.stringify({ color: '#2a78d6' }));
check('objeto ya normalizado se copia tal cual (ralo: no añade opacity/fillType por defecto)',
  JSON.stringify(normalizeSeriesStyle({ color: '#fff' })) === JSON.stringify({ color: '#fff' }));
check('objeto con más campos los conserva todos', (() => {
  const s = normalizeSeriesStyle({ color: '#fff', opacity: 0.5, fillType: 'gradient', gradient: { angle: 0, stops: [] } });
  return s.color === '#fff' && s.opacity === 0.5 && s.fillType === 'gradient' && !!s.gradient;
})());

console.log('\n-- representativeColor --');
check('sin estilo: usa el fallback', representativeColor(null, '#abcabc') === '#abcabc');
check('solid: usa style.color', representativeColor({ color: '#112233' }, '#fallback') === '#112233');
check('solid sin color: usa el fallback', representativeColor({}, '#fallback') === '#fallback');
check('gradient: usa la 1ª parada', representativeColor({ fillType: 'gradient', gradient: { stops: [{ color: '#111111', pos: 0 }, { color: '#222222', pos: 100 }] } }, '#fb') === '#111111');
check('pattern: usa el color de primer plano', representativeColor({ fillType: 'pattern', pattern: { fg: '#334455' } }, '#fb') === '#334455');

console.log('\n-- defaultGradient / defaultPattern / darken --');
{
  const g = defaultGradient('#2a78d6');
  check('defaultGradient: 2 paradas, la 1ª es el color base', g.stops.length === 2 && g.stops[0].color === '#2a78d6');
  check('defaultGradient: la 2ª parada es más oscura (RGB suma menor)', (() => {
    const sum = (h) => [1, 3, 5].reduce((a, i) => a + parseInt(h.slice(i, i + 2), 16), 0);
    return sum(g.stops[1].color) < sum(g.stops[0].color);
  })());
  check('defaultGradient: color base inválido cae a un azul por defecto válido', /^#[0-9a-f]{6}$/i.test(defaultGradient('no-es-hex').stops[0].color));
}
{
  const p = defaultPattern('#e34948', 'dots');
  check('defaultPattern: respeta el kind pedido si es válido', p.kind === 'dots');
  check('defaultPattern: kind inválido cae a "diagonal"', defaultPattern('#000000', 'zigzag').kind === 'diagonal');
  check('defaultPattern: fondo transparente por defecto (deja ver la figura)', p.bg === 'transparent');
}
check('darken: negro se queda en negro (no puede bajar más)', darken('#000000', 0.5) === '#000000');
check('darken: blanco a factor 0.5 → gris medio', darken('#ffffff', 0.5) === '#808080');
check('darken: hex inválido se devuelve tal cual (no explota)', darken('no-hex', 0.5) === 'no-hex');

console.log('\n-- gradientLineFromAngle --');
{
  const a0 = gradientLineFromAngle(0);
  check('0° = de abajo (y1 mayor) hacia arriba (y2 menor), x centrado', a0.y1 > a0.y2 && Math.abs(a0.x1 - 0.5) < 1e-9 && Math.abs(a0.x2 - 0.5) < 1e-9, JSON.stringify(a0));
  const a90 = gradientLineFromAngle(90);
  check('90° = de izquierda a derecha, y centrado', a90.x1 < a90.x2 && Math.abs(a90.y1 - 0.5) < 1e-9 && Math.abs(a90.y2 - 0.5) < 1e-9, JSON.stringify(a90));
  const a180 = gradientLineFromAngle(180);
  check('180° = de arriba hacia abajo (invierte 0°)', Math.abs(a180.y1 - a0.y2) < 1e-9 && Math.abs(a180.y2 - a0.y1) < 1e-9);
  check('la línea siempre mide 1 (extremo a extremo del bounding box) para cualquier ángulo', (() => {
    let ok = true;
    for (let deg = 0; deg < 360; deg += 15) {
      const l = gradientLineFromAngle(deg);
      const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
      if (Math.abs(len - 1) > 1e-9) ok = false;
    }
    return ok;
  })());
}

console.log('\n-- patternTileSpec --');
{
  const diag = patternTileSpec({ kind: 'diagonal', spacing: 10, strokeWidth: 2, angle: 30 });
  check('diagonal: tile cuadrado del tamaño de spacing', diag.width === 10 && diag.height === 10);
  check('diagonal: 1 línea vertical centrada + patternTransform con el ángulo pedido',
    diag.shapes.length === 1 && diag.shapes[0].type === 'line' && diag.shapes[0].x1 === 5 && diag.patternTransform === 'rotate(30)');
  const dots = patternTileSpec({ kind: 'dots', spacing: 12, strokeWidth: 3 });
  check('dots: 1 círculo centrado en el tile', dots.shapes.length === 1 && dots.shapes[0].type === 'circle' && dots.shapes[0].cx === 6 && dots.shapes[0].cy === 6);
  const grid = patternTileSpec({ kind: 'grid', spacing: 8 });
  check('grid: 2 líneas (arriba + izquierda) — al repetir forman la cuadrícula completa sin duplicar bordes',
    grid.shapes.length === 2 && grid.shapes.every((s) => s.type === 'line'));
  check('spacing/strokeWidth con valores absurdos (0, negativos) no producen tile de tamaño 0 ni trazo 0',
    patternTileSpec({ kind: 'dots', spacing: 0, strokeWidth: -5 }).width >= 2 && patternTileSpec({ kind: 'dots', spacing: 0, strokeWidth: -5 }).shapes[0].r >= 1);
}

console.log('\n-- defId --');
check('degradado y patrón de la misma serie en el mismo módulo dan ids distintos', defId('gradient', 'taxaBarplot', 's0') !== defId('pattern', 'taxaBarplot', 's0'));
check('misma serie en dos módulos distintos da ids distintos (namespaced por key — informe.js clona varios <svg> en una página)',
  defId('gradient', 'taxaBarplot', 's0') !== defId('gradient', 'betaDiversity', 's0'));
check('id determinista (mismo input → mismo output)', defId('gradient', 'taxaBarplot', 's0') === defId('gradient', 'taxaBarplot', 's0'));
check('caracteres no alfanuméricos en key/seriesId se sanean (id de SVG válido)', /^fig-grad-[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+$/.test(defId('gradient', 'mi módulo!', 's 0')));

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
