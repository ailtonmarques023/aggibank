/**
 * AgilBank — Home V2 Preview (isolado)
 * Sem API. Interações visuais apenas.
 */
(function homeV2PreviewInit() {
  'use strict';

  /** Mock — substituir por API real na integração */
  var MOCK = {
    userName: 'Camila',
    availableBalance: 'R$ 0,00',
    availableBalanceAmount: '0,00',
    blockedBalance: 'R$ 2.000,00',
    pendingRelease: 'R$ 2.000,00',
    accountStatus: 'Conta em dia',
  };

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function bindMockData() {
    var greeting = qs('[data-bind="user-greeting"]');
    if (greeting) greeting.textContent = 'Olá, ' + MOCK.userName + ' \u{1F44B}';

    qsa('[data-bind="available-balance-amount"]').forEach(function (el) {
      el.textContent = MOCK.availableBalanceAmount;
    });
    qsa('[data-bind="blocked-balance"]').forEach(function (el) {
      el.textContent = MOCK.blockedBalance;
    });
    qsa('[data-bind="pending-release"]').forEach(function (el) {
      el.textContent = MOCK.pendingRelease;
    });
    qsa('[data-bind="account-status"]').forEach(function (el) {
      el.textContent = MOCK.accountStatus;
    });
  }

  function bindBottomNav() {
    var nav = qs('.home-v2-preview__bottom-nav');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.home-v2-preview__nav-item');
      if (!btn) return;
      qsa('.home-v2-preview__nav-item', nav).forEach(function (el) {
        el.classList.remove('home-v2-preview__nav-item--active');
        el.removeAttribute('aria-current');
      });
      btn.classList.add('home-v2-preview__nav-item--active');
      btn.setAttribute('aria-current', 'page');
    });
  }

  function bindCarouselDots() {
    var dots = qsa('.home-v2-preview__dot');
    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        dots.forEach(function (d) {
          d.classList.remove('home-v2-preview__dot--active');
          d.setAttribute('aria-selected', 'false');
        });
        dot.classList.add('home-v2-preview__dot--active');
        dot.setAttribute('aria-selected', 'true');
      });
    });
  }

  function bindBalanceVisibility() {
    var btn = qs('[data-preview-toggle="balance-visibility"]');
    var val = qs('[data-bind="available-balance"]');
    if (!btn || !val) return;
    var visible = true;
    btn.addEventListener('click', function () {
      visible = !visible;
      val.classList.toggle('is-hidden', !visible);
      btn.setAttribute('aria-label', visible ? 'Ocultar saldo' : 'Mostrar saldo');
    });
  }

  function bindPreviewActions() {
    qsa('[data-preview-action]').forEach(function (el) {
      el.addEventListener('click', function () {
        var action = el.getAttribute('data-preview-action') || 'acao';
        console.info('[home-v2-preview] Ação visual:', action);
      });
    });
  }

  bindMockData();
  bindBottomNav();
  bindCarouselDots();
  bindBalanceVisibility();
  bindPreviewActions();

  console.info('[home-v2-preview] Preview premium v2 — sem API.');
})();
