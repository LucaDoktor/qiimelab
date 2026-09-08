// Modal de confirmación accesible, sin librería.
//   · role="dialog" + aria-modal="true" + aria-labelledby
//   · el foco entra en el diálogo y queda ATRAPADO (Tab / Shift+Tab ciclan)
//   · Escape o clic en el fondo cancelan
//   · al cerrar, el foco vuelve al elemento que lo tenía antes
//
// openConfirm({...}) -> Promise<boolean> (true = confirmado).

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.bodyHtml]  HTML ya saneado por el llamador
 * @param {string} [o.confirmLabel]
 * @param {string} [o.cancelLabel]
 * @param {boolean} [o.danger]   estilo destructivo en el botón de confirmar
 * @returns {Promise<boolean>}
 */
export function openConfirm(o = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'ql-modal-backdrop';

    const dlg = document.createElement('div');
    dlg.className = 'ql-modal ql-card ql-panel';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    const titleId = 'ql-modal-t-' + Math.random().toString(36).slice(2, 9);
    dlg.setAttribute('aria-labelledby', titleId);
    dlg.innerHTML =
      '<h2 id="' + titleId + '" class="ql-modal-title">' + esc(o.title) + '</h2>' +
      '<div class="ql-modal-body">' + (o.bodyHtml || '') + '</div>' +
      '<div class="ql-modal-actions"></div>';

    const mkBtn = (label, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      return b;
    };
    const cancelBtn = mkBtn(o.cancelLabel || 'Cancelar', 'ql-btn');
    const okBtn = mkBtn(o.confirmLabel || 'Aceptar', 'ql-btn ql-btn-primary' + (o.danger ? ' ql-btn-danger' : ''));
    dlg.querySelector('.ql-modal-actions').append(cancelBtn, okBtn);

    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);

    const focusables = () => Array.from(
      dlg.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.disabled);

    function close(val) {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch (e) { /* noop */ }
      }
      resolve(val);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(false); });
    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));

    okBtn.focus();
  });
}
