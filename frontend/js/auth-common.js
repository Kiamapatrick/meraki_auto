// Shared password visibility toggle: eye (SVG) → 🙈 (visible) → 🙊 (hidden). Works on all pages and dynamically added fields.
(function () {
  const EYE_SVG = '<span class="password-toggle-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>';
  const stateByButton = new WeakMap();

  function setIcon(btn, passwordVisible, state) {
    if (passwordVisible) state.revealedOnce = true;
    const icon = btn.querySelector('.password-toggle-icon') || btn;
    if (passwordVisible) {
      btn.classList.add('is-visible');
      icon.outerHTML = '<span class="password-toggle-icon">🙈</span>';
    } else {
      btn.classList.remove('is-visible');
      const next = state.revealedOnce ? '🙊' : EYE_SVG;
      btn.innerHTML = next.startsWith('<') ? next : `<span class="password-toggle-icon">${next}</span>`;
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.password-toggle');
    if (!btn) return;
    const wrap = btn.closest('.field-wrap');
    const input = wrap ? wrap.querySelector('input') : null;
    if (!input) return;
    e.preventDefault();
    let state = stateByButton.get(btn);
    if (!state) stateByButton.set(btn, (state = { revealedOnce: false }));
    const wasHidden = input.type === 'password';
    input.type = wasHidden ? 'text' : 'password';
    const passwordNowVisible = input.type === 'text';
    setIcon(btn, passwordNowVisible, state);
  });
})();
