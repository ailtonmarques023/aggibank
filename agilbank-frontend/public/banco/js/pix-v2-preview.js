/**
 * AgilBank - Pix V2 Preview (isolado)
 * Sem API. Interacoes visuais apenas.
 */
(function pixV2PreviewInit() {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function bindBottomNav() {
    var nav = qs(".home-v2-preview__bottom-nav");
    if (!nav) return;
    nav.addEventListener("click", function (e) {
      var btn = e.target.closest(".home-v2-preview__nav-item");
      if (!btn) return;
      qsa(".home-v2-preview__nav-item", nav).forEach(function (el) {
        el.classList.remove("home-v2-preview__nav-item--active");
        el.removeAttribute("aria-current");
      });
      btn.classList.add("home-v2-preview__nav-item--active");
      btn.setAttribute("aria-current", "page");
    });
  }

  function bindPreviewActions() {
    qsa("[data-preview-action]").forEach(function (el) {
      el.addEventListener("click", function () {
        var action = el.getAttribute("data-preview-action") || "acao";
        console.info("[pix-v2-preview] Acao visual:", action);
      });
    });
  }

  function bindBalanceVisibility() {
    var btn = qs('[data-preview-toggle="balance-visibility"]');
    var val = qs('[data-bind="pix-balance"]');
    if (!btn || !val) return;
    var visible = true;
    btn.addEventListener("click", function () {
      visible = !visible;
      val.textContent = visible ? "R$ 0,00" : "R$ ••••";
      btn.setAttribute("aria-label", visible ? "Ocultar saldo" : "Mostrar saldo");
    });
  }

  bindBottomNav();
  bindPreviewActions();
  bindBalanceVisibility();
  console.info("[pix-v2-preview] Preview pix v2 carregado - sem API.");
})();
