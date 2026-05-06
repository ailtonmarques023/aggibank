/**
 * URL base da API AgilBank (termina em /api).
 * Ordem de precedência:
 * 1) window.AGILBANK_API_BASE — URL completa (ex.: http://127.0.0.1:3001/api)
 * 2) localhost/127.0.0.1 — http://<host>:<porta>/api com AGILBANK_API_PORT ou localStorage AGILBANK_API_PORT ou porta padrão
 * 3) demais hosts — mesmo origin + /api (útil atrás de reverse proxy)
 *
 * A porta padrão deve coincidir com PORT no .env do backend.
 */
(function initAgilbankApiBase(window) {
  'use strict';

  var DEFAULT_PORT = '3001';

  function getAgilbankApiBase() {
    if (window.AGILBANK_API_BASE && typeof window.AGILBANK_API_BASE === 'string') {
      var b = String(window.AGILBANK_API_BASE).trim().replace(/\/+$/, '');
      var lower = b.toLowerCase();
      if (lower.endsWith('/api')) return b;
      return b + '/api';
    }

    var h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      var rawPort =
        (window.AGILBANK_API_PORT && String(window.AGILBANK_API_PORT)) ||
        (window.localStorage && window.localStorage.getItem('AGILBANK_API_PORT')) ||
        DEFAULT_PORT;
      var port = String(rawPort).replace(/[^\d]/g, '') || DEFAULT_PORT;
      return 'http://' + h + ':' + port + '/api';
    }

    return String(window.location.origin || '').replace(/\/+$/, '') + '/api';
  }

  window.AGILBANK_DEFAULT_API_PORT = DEFAULT_PORT;
  window.getAgilbankApiBase = getAgilbankApiBase;
})(window);
