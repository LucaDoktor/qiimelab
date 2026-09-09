// PWA: registro del service worker, aviso de "versión nueva", estado de
// instalación y banner de "sin conexión".
//
// Todo con detección de soporte: en un navegador sin service workers (o con
// ellos deshabilitados) la app funciona exactamente igual, solo sin caché
// offline ni botón de instalar.

import { t } from './i18n.js';

let deferredInstallPrompt = null;
let changeCb = () => {};

// Estado consultado por el footer para pintar (o no) el botón "Instalar app".
export const pwa = {
  get canInstall() { return !!deferredInstallPrompt; },
  async promptInstall() {
    const p = deferredInstallPrompt;
    if (!p) return;
    deferredInstallPrompt = null;
    changeCb();
    p.prompt();
    try { await p.userChoice; } catch (e) { /* el usuario cerró el diálogo */ }
  },
};

// app.js registra aquí un repintado del footer cuando cambia `canInstall`.
export function onPWAChange(cb) { changeCb = typeof cb === 'function' ? cb : () => {}; }

// --- barra global efímera (sin conexión / versión nueva) -------------------
// Vive en <body>, fuera de #app-view, así que ningún módulo la borra al
// repintar. Un solo elemento reutilizado; la clase dice qué muestra.
function bar() {
  let el = document.getElementById('ql-pwa-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ql-pwa-bar';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function showOffline(on) {
  const el = bar();
  if (on) {
    el.className = 'ql-pwa-bar is-offline';
    el.textContent = t('pwa.offline');
    el.hidden = false;
  } else if (el.classList.contains('is-offline')) {
    el.hidden = true;
    el.className = 'ql-pwa-bar';
  }
}

function showUpdate(reg) {
  const el = bar();
  el.className = 'ql-pwa-bar is-update';
  el.textContent = '';
  const span = document.createElement('span');
  span.textContent = t('pwa.updateReady');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ql-pwa-reload';
  btn.textContent = t('pwa.reload');
  btn.addEventListener('click', () => {
    const waiting = reg.waiting;
    if (waiting) {
      waiting.postMessage('skip-waiting'); // → activate → controllerchange → reload
    } else {
      window.location.reload();
    }
  });
  el.append(span, btn);
  el.hidden = false;
}

export function initPWA() {
  // 1) banner de sin conexión
  window.addEventListener('online', () => showOffline(false));
  window.addEventListener('offline', () => showOffline(true));
  if (navigator.onLine === false) showOffline(true);

  // 2) botón "Instalar app" (Chromium): capturamos el evento y dejamos que el
  //    footer lo dispare cuando el usuario quiera.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    changeCb();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    changeCb();
  });

  // 3) service worker
  if (!('serviceWorker' in navigator)) return;

  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // El SW nuevo tomó el control tras aceptar el aviso → recargar una vez.
    // En la primera visita de todas (sin controller previo) no recargamos:
    // ese controllerchange lo dispara el clients.claim() inicial.
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  const swUrl = new URL('../../sw.js', import.meta.url); // raíz del sitio, sea cual sea el subpath
  navigator.serviceWorker.register(swUrl).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
      });
    });
  }).catch(() => { /* sin SW: la app funciona igual, solo sin offline */ });
}
