(function () {
  const root = document.getElementById("loansV2PreviewRoot");

  if (!root) {
    return;
  }

  root.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-preview-toggle='loans-visibility']");
    if (toggle) {
      const total = root.querySelector("[data-bind='loan-limit']");
      total?.classList.toggle("is-hidden");
      toggle.setAttribute("aria-label", total?.classList.contains("is-hidden") ? "Ocultar valores" : "Exibir valores");
      return;
    }

    const installment = event.target.closest(".loans-v2-installment");
    if (installment) {
      root.querySelectorAll(".loans-v2-installment").forEach((button) => {
        button.classList.remove("loans-v2-installment--active");
      });
      installment.classList.add("loans-v2-installment--active");
    }

    const action = event.target.closest("[data-preview-action]")?.getAttribute("data-preview-action");
    if (action) {
      console.log(`[AgilBank Empréstimos V2 Preview] ação: ${action}`);
    }
  });
})();
