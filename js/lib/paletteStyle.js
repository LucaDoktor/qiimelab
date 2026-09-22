// paletteStyle.js — lógica PURA (sin DOM) del relleno de serie del editor de
// gráficos: opacidad, degradado, patrón y borde independientes por serie
// (Fase 2, Pasos 2-5 de qiimelab-prompt-editor-fase-2-paletas-relleno-
// series.md). Separado de chartEditor.js a propósito, igual que stats.js/
// paletteValidator.js: para poder testear la migración de formato y las
// matemáticas de degradado/patrón en Node sin necesitar un <svg> real.
// chartEditor.js hace el trabajo de DOM (crear <defs>, pintar nodos,
// persistir) llamando a estas funciones.

export const FILL_TYPES = ['solid', 'gradient', 'pattern'];
export const PATTERN_KINDS = ['diagonal', 'dots', 'grid'];

/**
 * Normaliza un valor persistido de `store.__palette[seriesId]` a un objeto
 * RALO (solo trae las claves que el usuario tocó de verdad — nunca rellena
 * `opacity`/`fillType` con un valor por defecto que luego se escribiría a
 * los nodos aunque el usuario nunca los haya tocado, lo que pisaría un
 * valor propio del gráfico como el `fill-opacity` fijo de las cajas de
 * groupBoxplot.js). Formatos de entrada válidos:
 *  - `undefined`/`null` → sin personalizar → `{}`
 *  - string hex (formato de antes de la Fase 2) → `{ color: hex }`
 *  - objeto ya en el formato nuevo → copia superficial tal cual
 * @returns {{ color?: string, opacity?: number, fillType?: string,
 *   gradient?: object, pattern?: object, border?: object }}
 */
export function normalizeSeriesStyle(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') return raw ? { color: raw } : {};
  return { ...raw };
}

/** Color "representativo" de un estilo de serie — el que se usa para el
 *  <input type=color> nativo (no entiende degradados/patrones) y para el
 *  aviso de choque de color. Degradado → su primera parada; patrón → su
 *  color de primer plano; si no hay nada de eso, `style.color` o el
 *  `fallback` que pase quien llama (el color ya dibujado en el SVG, o el
 *  que le tocaría por orden de paleta). */
export function representativeColor(style, fallback) {
  if (!style) return fallback;
  if (style.fillType === 'gradient' && style.gradient && style.gradient.stops && style.gradient.stops[0]) {
    return style.gradient.stops[0].color || fallback;
  }
  if (style.fillType === 'pattern' && style.pattern && style.pattern.fg) {
    return style.pattern.fg;
  }
  return style.color || fallback;
}

/** Degradado por defecto al pasar una serie de sólido a degradado por
 *  primera vez: 2 paradas, la primera el color actual (para que el cambio
 *  de "tipo de relleno" no reinicie visualmente el color ya elegido), la
 *  segunda una versión más oscura del mismo tono (mismo criterio que
 *  --accent-2 en tokens.css: oscurecer, no inventar un tono sin relación). */
export function defaultGradient(baseColor) {
  const c = isHex(baseColor) ? baseColor : '#2a78d6';
  return { angle: 90, stops: [{ color: c, pos: 0 }, { color: darken(c, 0.35), pos: 100 }] };
}

/** Patrón por defecto: rayado diagonal con el color actual como trazo y
 *  fondo transparente (dejar ver el fondo de la figura detrás, como un
 *  rayado de verdad, no un bloque de color con líneas encima). */
export function defaultPattern(baseColor, kind) {
  const c = isHex(baseColor) ? baseColor : '#2a78d6';
  return {
    kind: PATTERN_KINDS.includes(kind) ? kind : 'diagonal',
    fg: c, bg: 'transparent', strokeWidth: 2, spacing: 8, angle: 45,
  };
}

function isHex(s) { return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s); }

/** Oscurece un hex un factor 0-1 en RGB simple (no OKLab: es solo para
 *  proponer una 2ª parada de degradado razonable por defecto, el usuario
 *  puede cambiarla — no necesita la precisión perceptual que sí exige
 *  paletteValidator.js para pasar el gate de accesibilidad). */
export function darken(hex, factor) {
  if (!isHex(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const d = (v) => Math.max(0, Math.round(v * (1 - factor)));
  return '#' + [d(r), d(g), d(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Línea del degradado (objectBoundingBox, 0-1) para un ángulo en grados.
 * 0° = de abajo hacia arriba (mismo sentido que `linear-gradient(0deg)` en
 * CSS), sentido horario — no pretende ser idéntico píxel a píxel al motor
 * de CSS (que usa el ángulo relativo a la caja real, no siempre cuadrada),
 * solo una convención consistente y predecible para el usuario.
 */
export function gradientLineFromAngle(angleDeg) {
  const rad = ((angleDeg || 0) - 90) * (Math.PI / 180);
  const dx = Math.cos(rad) * 0.5, dy = Math.sin(rad) * 0.5;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/**
 * Especificación NEUTRAL (sin nodos DOM) del contenido de un tile de
 * `<pattern>` — chartEditor.js la traduce a elementos SVG reales. Separado
 * para poder testear la geometría (que el tile no deje huecos, tamaños
 * mínimos razonables) sin necesitar un `<svg>`.
 *  - diagonal: una única raya vertical + `patternTransform: rotate(angle)`
 *    sobre TODO el tile — el truco estándar para que el rayado rote sin
 *    dejar costuras entre tiles (rotar la propia línea, sin rotar el
 *    lattice, sí las dejaría).
 *  - dots: un punto centrado en un tile cuadrado.
 *  - grid: 2 líneas (arriba + izquierda) de un tile cuadrado — al repetir,
 *    forman una cuadrícula completa sin duplicar líneas en el borde.
 */
export function patternTileSpec(pattern) {
  const p = pattern || defaultPattern();
  const size = Math.max(2, p.spacing || 8);
  const sw = Math.max(0.5, p.strokeWidth || 2);
  if (p.kind === 'dots') {
    return {
      width: size, height: size,
      shapes: [{ type: 'circle', cx: size / 2, cy: size / 2, r: Math.max(1, sw) }],
    };
  }
  if (p.kind === 'grid') {
    return {
      width: size, height: size,
      shapes: [
        { type: 'line', x1: 0, y1: 0, x2: size, y2: 0, strokeWidth: sw },
        { type: 'line', x1: 0, y1: 0, x2: 0, y2: size, strokeWidth: sw },
      ],
    };
  }
  // diagonal (por defecto)
  return {
    width: size, height: size, patternTransform: 'rotate(' + (p.angle != null ? p.angle : 45) + ')',
    shapes: [{ type: 'line', x1: size / 2, y1: 0, x2: size / 2, y2: size, strokeWidth: sw }],
  };
}

/** Id determinista para el `<linearGradient>`/`<pattern>` de una serie —
 *  namespaced por `key` de attachChartEditor (clave del módulo) porque
 *  `js/modules/informe.js` clona el `<svg>` de varios módulos dentro de UNA
 *  sola página: sin el namespace, dos gráficos distintos con una serie 's0'
 *  cada uno chocarían de id y uno de los dos "robaría" el degradado del
 *  otro. */
export function defId(kind, key, seriesId) {
  const prefix = kind === 'pattern' ? 'fig-pat-' : 'fig-grad-';
  return prefix + String(key).replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + String(seriesId).replace(/[^a-zA-Z0-9_-]/g, '_');
}
