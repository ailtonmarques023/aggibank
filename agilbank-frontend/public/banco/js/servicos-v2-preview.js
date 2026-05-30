(function () {
  const root = document.getElementById("servicesV2PreviewRoot");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-preview-action]");
    if (!actionTarget) return;
    console.log("[Servicos V2 Preview]", actionTarget.dataset.previewAction);
  });
})();
