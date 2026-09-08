// Asocia cada <label> de un `.ql-field` con su control real.
//
// Por qué: en toda la app el patrón es
//     <div class="ql-field"><label>Texto</label> <select|input …></div>
// El <label> es un elemento real pero sin `for`, así que un lector de pantalla
// no lo anuncia al enfocar el control. Aquí, tras cada render, enlazamos
// label↔control (generando un id si hace falta). Cuando un campo tiene varios
// controles (p. ej. deslizador + número en `.ql-inputrow`), el label apunta al
// primero y los demás reciben `aria-label` con el mismo texto.
//
// Idempotente: los `<label for>` ya resueltos quedan fuera del selector.

let uid = 0;

export function linkFieldLabels(root) {
  if (!root) return;
  const labels = root.querySelectorAll('.ql-field > label:not([for])');
  labels.forEach((label) => {
    const field = label.parentElement;
    const controls = [...field.querySelectorAll('input:not([type="hidden"]), select, textarea')]
      .filter((el) => el.closest('.ql-field') === field);
    if (!controls.length) return;
    const first = controls[0];
    if (!first.id) first.id = 'qlf-' + (++uid);
    label.setAttribute('for', first.id);
    const txt = label.textContent.trim();
    if (txt) {
      controls.slice(1).forEach((el) => {
        if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) el.setAttribute('aria-label', txt);
      });
    }
  });
}

/** Observa `root` y re-enlaza etiquetas cada vez que un módulo re-renderiza. */
export function watchFieldLabels(root) {
  linkFieldLabels(root);
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.addedNodes.length) { linkFieldLabels(root); return; }
    }
  });
  obs.observe(root, { childList: true, subtree: true });
  return obs;
}
