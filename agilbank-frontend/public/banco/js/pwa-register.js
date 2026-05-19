(function registerAgilBankPwa(window) {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/banco/sw.js', { scope: '/banco/' }).catch(function (error) {
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('AgilBank PWA registration failed:', error);
      }
    });
  });
})(window);
