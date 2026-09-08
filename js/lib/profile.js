// Perfil local, puramente decorativo. Un nombre que el usuario puede escribir
// una vez y que se guarda SOLO en localStorage de su navegador — sin cuentas,
// sin contraseñas, sin backend, sin telemetría. Si no lo rellena, la app
// funciona exactamente igual. Se usa nada más para un "Hola, X" discreto.

const KEY = 'qiimelab.profileName';
const MAX = 40;
const listeners = new Set();

function clean(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, MAX);
}

/** Nombre guardado, o '' si no hay. */
export function getProfileName() {
  try { return clean(localStorage.getItem(KEY) || ''); }
  catch (e) { return ''; }
}

/** Guarda (o borra, si `name` queda vacío) y avisa a los suscriptores. */
export function setProfileName(name) {
  const v = clean(name);
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch (e) { /* modo privado: se queda en memoria de esta pestaña */ }
  listeners.forEach((fn) => { try { fn(v); } catch (e) { /* noop */ } });
  return v;
}

/** Se ejecuta `fn(name)` cada vez que cambia. Devuelve función para desuscribir. */
export function onProfileChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
