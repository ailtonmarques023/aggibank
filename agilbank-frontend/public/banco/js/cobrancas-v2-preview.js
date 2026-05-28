/**
 * AgilBank - Cobranças V2 Preview
 * Interações visuais com dados mockados. Sem API real.
 */
(function chargesV2PreviewInit() {
  "use strict";

  var mockCharges = {
    totalAberto: "R$ 428,90",
    cobrancasPendentes: 2,
    venceHoje: 1,
    pixDisponivel: true
  };

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
      qsa(".home-v2-preview__nav-item", nav).forEach(function (item) {
        item.classList.remove("home-v2-preview__nav-item--active");
        item.removeAttribute("aria-current");
      });
      btn.classList.add("home-v2-preview__nav-item--active");
      btn.setAttribute("aria-current", "page");
    });
  }

  function bindTabs() {
    var tabs = qsa(".charges-v2-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (item) {
          item.classList.remove("charges-v2-tab--active");
          item.removeAttribute("aria-current");
        });
        tab.classList.add("charges-v2-tab--active");
        tab.setAttribute("aria-current", "page");
        console.info("[charges-v2-preview] Aba visual:", tab.getAttribute("data-tab-target"));
      });
    });
  }

  function bindVisibility() {
    var btn = qs('[data-preview-toggle="charges-visibility"]');
    var total = qs('[data-bind="charges-total"]');
    if (!btn || !total) return;
    var visible = true;
    btn.addEventListener("click", function () {
      visible = !visible;
      total.classList.toggle("is-hidden", !visible);
      btn.setAttribute("aria-label", visible ? "Ocultar valores" : "Mostrar valores");
    });
  }

  function bindPreviewActions() {
    qsa("[data-preview-action]").forEach(function (el) {
      el.addEventListener("click", function () {
        console.info("[charges-v2-preview] Ação visual:", el.getAttribute("data-preview-action"), mockCharges);
      });
    });
  }

  bindBottomNav();
  bindTabs();
  bindVisibility();
  bindPreviewActions();
  console.info("[charges-v2-preview] Preview carregado com dados mockados.", mockCharges);
})();
