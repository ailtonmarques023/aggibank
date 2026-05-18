/**
 * FATIA 3 — Central "Mais pra você": scroll suave para âncora (#cdb, etc.).
 * Sem chamadas de API.
 */
(function () {
  'use strict';

  function scrollToHash() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash) return;
    var el = document.getElementById(hash);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      el.scrollIntoView(true);
    }
    try {
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    } catch (e2) {
      /* ignore */
    }
  }

  function initBack() {
    var btn = document.getElementById('mpvBack');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (window.history.length > 1) window.history.back();
      else window.location.href = 'index.html';
    });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    initBack();
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
  });
})();
