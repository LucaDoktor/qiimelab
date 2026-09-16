# Prompt: botón de modo oscuro

## Lo que pide el usuario

"Lo del modo oscuro no lo veo, quiero un botón que ponga el modo oscuro en la página."

## Contexto (verificado antes de tocar código, 16 sep 2026)

- El CSS de modo oscuro ya existe completo en `css/tokens.css`: `@media
  (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }`
  (sigue al sistema operativo) y `:root[data-theme="dark"] {...}` (override
  explícito). Lo que faltaba era el interruptor visible — no había ningún
  `data-theme` ni `localStorage` de tema en `js/app.js` ni en el resto de
  `js/` (confirmado por grep antes de escribir nada).
- No hay una "cabecera global" separada en esta app — el `<nav id="sidebar">`
  (`js/modules/shell.js`) hace de cromado global, con una sección "Ajustes"
  que ya aloja el selector de idioma y el nombre de perfil local
  (`js/lib/i18n.js`, `js/lib/profile.js`). El botón de tema va ahí, siguiendo
  el mismo patrón: lib con `localStorage` propio + función `apply`/`set`/`on*Change`.

## Diseño pedido

Botón de 3 estados — Claro / Oscuro / Automático — en la sección de ajustes
de la barra lateral, persistido en `localStorage` (clave `smart-175.theme`,
con migración desde la clave legada `qiimelab.theme` igual que ya hace
`profile.js`). "Automático" (por defecto) sigue `prefers-color-scheme`; los
otros dos fuerzan `data-theme="light"`/`"dark"` en `<html>`.

## Implementado (16 sep 2026)

- `js/lib/theme.js` (nuevo) — `getTheme`/`setTheme`/`applyTheme`/`initTheme`/`onThemeChange`,
  mismo patrón que `profile.js`. También fuerza el `<meta name="theme-color">`
  correcto (hay dos en `index.html`, uno por media query) cuando el usuario
  elige explícitamente claro/oscuro, y restaura las media queries originales
  en modo automático.
- `index.html` — script inline síncrono en `<head>` (antes de cargar fuentes/CSS)
  que aplica `data-theme` desde `localStorage` antes del primer pintado, para
  no dar un parpadeo claro→oscuro mientras carga `js/app.js` (módulo ES,
  diferido por especificación — no llega a tiempo para el primer frame).
- `js/app.js` — `initTheme()` al arrancar (mismo sitio que `initPWA()`).
- `js/modules/shell.js` — segmented control de 3 botones en "Ajustes",
  reutilizando `.ql-segmented`/`.ql-seg-btn` (mismo componente que el
  selector vertical/horizontal de `taxaBarplot.js` y el modo de diseño de
  `primers.js`, con `role="group"` + `aria-pressed`). Nueva variante CSS
  `.ql-segmented-block` (3 botones a ancho completo, `flex:1` cada uno) en
  `css/components.css`.
- `js/lib/i18n.js` — claves `shell.theme`/`shell.themeLight`/`shell.themeDark`/`shell.themeAuto`
  en los 5 idiomas (es/en/it/de/zh).

## Criterio de aceptación

- El botón cambia el tema al instante, sin recargar la página.
- La elección persiste entre sesiones (misma pestaña/navegador).
- "Automático" sigue el `prefers-color-scheme` del sistema operativo, incluso
  si cambia en caliente mientras la app está abierta (lo cubre el CSS, sin JS).
- Sin parpadeo claro→oscuro al recargar con "Oscuro" elegido.
- `node tests/run.mjs` en verde.
