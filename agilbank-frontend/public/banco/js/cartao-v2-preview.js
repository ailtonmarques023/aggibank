(function () {
  const root = document.getElementById("cardV2PreviewRoot");

  if (!root) {
    return;
  }

  root.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-preview-toggle='card-visibility']");
    if (toggle) {
      root.querySelectorAll("[data-bind='card-limit'], [data-bind='card-invoice']").forEach((item) => {
        item.classList.toggle("is-hidden");
      });
      return;
    }

    const tab = event.target.closest("[data-card-tab]");
    if (tab) {
      root.querySelectorAll("[data-card-tab]").forEach((button) => {
        button.classList.remove("card-v2-tab--active");
      });
      tab.classList.add("card-v2-tab--active");
    }

    const action = event.target.closest("[data-preview-action]")?.getAttribute("data-preview-action");
    if (action) {
      console.log(`[AgilBank Cartão V2 Preview] ação: ${action}`);
    }
  });
})();
