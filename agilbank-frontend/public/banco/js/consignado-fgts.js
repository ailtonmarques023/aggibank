(function () {
  "use strict";

  var screens = {
    home: document.getElementById("abFgtsHome"),
    loading: document.getElementById("abFgtsLoading"),
    authorize: document.getElementById("abFgtsAuthorize"),
    simulator: document.getElementById("abFgtsSimulator"),
    result: document.getElementById("abFgtsResult"),
    tutorial: document.getElementById("abFgtsTutorial"),
    client: document.getElementById("abFgtsClient")
  };

  var title = document.getElementById("abFgtsTitle");
  var input = document.getElementById("abFgtsSaldoInput");
  var continueBtn = document.getElementById("abFgtsContinueBtn");
  var resultValue = document.getElementById("abFgtsResultValue");
  var lastScreen = "home";

  function setTitle(view) {
    var labels = {
      home: "Consignado e FGTS",
      loading: "Simulador",
      authorize: "Antecipação FGTS",
      simulator: "Simulador",
      result: "Resultado",
      tutorial: "Antecipação FGTS",
      client: "Área do cliente"
    };
    if (title) title.textContent = labels[view] || "Consignado e FGTS";
  }

  function show(view) {
    Object.keys(screens).forEach(function (key) {
      if (screens[key]) {
        screens[key].classList.toggle("ab-fgts-screen--active", key === view);
      }
    });
    setTitle(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showLoadingThen(view) {
    lastScreen = view;
    show("loading");
    window.setTimeout(function () {
      show(view);
      if (view === "simulator" && input) input.focus();
    }, 950);
  }

  function moneyToNumber(value) {
    var raw = String(value || "").replace(/\D/g, "");
    if (!raw) return 0;
    return Number(raw) / 100;
  }

  function formatMoney(value) {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function applyMoneyMask() {
    var value = moneyToNumber(input.value);
    input.value = value ? formatMoney(value) : "";
    continueBtn.disabled = value < 100;
  }

  function simulate() {
    var balance = moneyToNumber(input.value);
    if (balance < 100) return;
    var available = Math.min(balance * 0.82, balance - 30);
    resultValue.textContent = formatMoney(Math.max(available, 0));
    showLoadingThen("result");
  }

  function goHome() {
    window.location.assign("./index.html");
  }

  document.getElementById("abFgtsBackBtn").addEventListener("click", function () {
    if (screens.home && screens.home.classList.contains("ab-fgts-screen--active")) {
      goHome();
      return;
    }
    show("home");
  });
  document.getElementById("abFgtsHomeBtn").addEventListener("click", goHome);
  document.getElementById("abFgtsStartBtn").addEventListener("click", function () {
    showLoadingThen("simulator");
  });
  document.getElementById("abFgtsHowBtn").addEventListener("click", function () {
    show("tutorial");
  });
  document.getElementById("abFgtsAreaBtn").addEventListener("click", function () {
    show("client");
  });
  document.getElementById("abFgtsConsignadoBtn").addEventListener("click", function () {
    show("client");
  });
  document.getElementById("abFgtsAuthorizeHowBtn").addEventListener("click", function () {
    show("tutorial");
  });
  document.getElementById("abFgtsApproxBtn").addEventListener("click", function () {
    showLoadingThen("simulator");
  });
  document.getElementById("abFgtsInlineHowBtn").addEventListener("click", function () {
    show("tutorial");
  });
  document.getElementById("abFgtsAlreadyBtn").addEventListener("click", function () {
    showLoadingThen("simulator");
  });
  document.getElementById("abFgtsClientSimBtn").addEventListener("click", function () {
    showLoadingThen("simulator");
  });
  document.getElementById("abFgtsBackSimBtn").addEventListener("click", function () {
    show("simulator");
  });
  document.getElementById("abFgtsFinishBtn").addEventListener("click", function () {
    window.alert("Solicitação registrada para análise. Em breve você poderá acompanhar pela Área do cliente.");
    show("client");
  });

  input.addEventListener("input", applyMoneyMask);
  continueBtn.addEventListener("click", simulate);

  if (window.location.hash === "#autorizar") {
    show("tutorial");
  } else if (window.location.hash === "#cliente") {
    show("client");
  } else if (window.location.hash === "#adesao") {
    show("authorize");
  }
})();
