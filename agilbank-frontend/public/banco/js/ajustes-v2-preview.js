(function () {
  const root = document.getElementById("settingsV2PreviewRoot");

  if (!root) {
    return;
  }

  root.addEventListener("click", (event) => {
    const switchButton = event.target.closest("[data-preview-switch]");
    if (switchButton) {
      const isOn = switchButton.classList.toggle("settings-v2-switch--on");
      switchButton.setAttribute("aria-pressed", String(isOn));
      console.log(`[AgilBank Ajustes V2 Preview] switch: ${switchButton.dataset.previewSwitch}=${isOn}`);
      return;
    }

    const action = event.target.closest("[data-preview-action]")?.getAttribute("data-preview-action");
    if (action) {
      console.log(`[AgilBank Ajustes V2 Preview] ação: ${action}`);
    }
  });
})();
