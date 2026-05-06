/**
 * URL base da API AgilBank (termina em /api). FRONTEND_URL (Vercel) ≠ API (Railway).
 * Ordem de precedência:
 * 1) window.AGILBANK_API_BASE — definir antes deste script se precisar de outra base
 * 2) <meta name="agilbank-api-base" content="https://.../api"> — deploy estático (domínio próprio na Vercel, etc.)
 * 3) localhost/127.0.0.1 — localStorage/sessionStorage AGILBANK_API_BASE; senão DEFAULT_REMOTE_API_BASE
 * 4) host *.vercel.app — DEFAULT_REMOTE_API_BASE (o static host não serve /api do backend)
 * 5) demais hosts — mesmo origin + /api (reverse proxy que encaminha /api ao backend)
 *
 * Backend local: localStorage.setItem('AGILBANK_API_BASE','http://127.0.0.1:3001/api') e recarregar.
 */
(function initAgilbankApiBase(window) {
  'use strict';

  /** Base pública atual do backend AgilBank (login + user-complete-data devem usar a mesma). */
  var DEFAULT_REMOTE_API_BASE = 'https://aggibank-production.up.railway.app/api';

  function normalizeApiBaseString(raw) {
    var b = String(raw || '').trim().replace(/\/+$/, '');
    if (!b) return null;
    var lower = b.toLowerCase();
    if (lower.endsWith('/api')) return b;
    return b + '/api';
  }

  function getMetaAgilbankApiBase() {
    try {
      if (!document.querySelector) return null;
      var el = document.querySelector('meta[name="agilbank-api-base"]');
      if (!el || !el.getAttribute) return null;
      return normalizeApiBaseString(el.getAttribute('content') || '');
    } catch (e) {
      return null;
    }
  }

  function isVercelHost(hostname) {
    var h = String(hostname || '').toLowerCase();
    return h.endsWith('.vercel.app');
  }

  function getAgilbankApiBase() {
    if (window.AGILBANK_API_BASE && typeof window.AGILBANK_API_BASE === 'string') {
      var explicit = normalizeApiBaseString(window.AGILBANK_API_BASE);
      if (explicit) return explicit;
    }

    var fromMeta = getMetaAgilbankApiBase();
    if (fromMeta) return fromMeta;

    var h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      var stored = null;
      try {
        stored =
          (window.localStorage && window.localStorage.getItem('AGILBANK_API_BASE')) ||
          (window.sessionStorage && window.sessionStorage.getItem('AGILBANK_API_BASE'));
      } catch (e) {
        stored = null;
      }
      var fromStorage = normalizeApiBaseString(stored);
      if (fromStorage) return fromStorage;

      return DEFAULT_REMOTE_API_BASE;
    }

    if (isVercelHost(h)) {
      return DEFAULT_REMOTE_API_BASE;
    }

    return String(window.location.origin || '').replace(/\/+$/, '') + '/api';
  }

  window.AGILBANK_DEFAULT_REMOTE_API_BASE = DEFAULT_REMOTE_API_BASE;
  window.getAgilbankApiBase = getAgilbankApiBase;
})(window);
