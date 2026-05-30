(function () {
  const root = document.getElementById("statementV2PreviewRoot");

  if (!root) {
    return;
  }

  root.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-preview-toggle='statement-visibility']");
    if (toggle) {
      const balance = root.querySelector("[data-bind='statement-balance']");
      balance?.classList.toggle("is-hidden");
      toggle.setAttribute("aria-label", balance?.classList.contains("is-hidden") ? "Ocultar saldo" : "Exibir saldo");
      return;
    }

    const filter = event.target.closest(".statement-v2-filter[data-filter]");
    if (filter) {
      root.querySelectorAll(".statement-v2-filter").forEach((button) => {
        button.classList.remove("statement-v2-filter--active");
      });
      filter.classList.add("statement-v2-filter--active");
    }

    const action = event.target.closest("[data-preview-action]")?.getAttribute("data-preview-action");
    if (action) {
      console.log(`[AgilBank Extrato V2 Preview] ação: ${action}`);
    }
  });
})();
