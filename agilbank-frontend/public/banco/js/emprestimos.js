(() => {
  "use strict";

  const LOGIN_PATH = "../index.html";
  const HOME_PATH = "./index.html";
  const REQUEST_TIMEOUT_MS = 12000;
  const TOKEN_KEYS = ["agilbank_token", "govbr_token", "token"];
  const DEFAULT_PRAZOS = [6, 12, 18, 24, 36, 48, 60, 72];

  class EmprestimosModule {
    constructor(documentRef) {
      this.document = documentRef;
      this.apiBase =
        typeof window.getAgilbankApiBase === "function"
          ? window.getAgilbankApiBase()
          : null;

      this.state = {
        currentStep: "loading",
        isEligible: null,
        eligibility: null,
        history: [],
        selectedValue: 0,
        selectedPrazo: null,
        simulation: null,
        insuranceChoice: null
      };

      this.elements = this.getElements();
    }

    getElements() {
      return {
        shell: this.document.getElementById("abEmpShell"),
        statePill: this.document.getElementById("abEmpStatePill"),
        statusText: this.document.getElementById("abEmpStatusText"),
        retryBtn: this.document.getElementById("abEmpRetryBtn"),
        loginBtn: this.document.getElementById("abEmpLoginBtn"),
        backBtn: this.document.getElementById("abEmpBackBtn"),
        topbarTitle: this.document.querySelector(".ab-emp-topbar-title"),

        stepLoading: this.document.getElementById("abEmpStepLoading"),
        stepBlocked: this.document.getElementById("abEmpStepBlocked"),
        stepValue: this.document.getElementById("abEmpStepValue"),
        stepInstallments: this.document.getElementById("abEmpStepInstallments"),
        stepInsurance: this.document.getElementById("abEmpStepInsurance"),
        stepReview: this.document.getElementById("abEmpStepReview"),
        stepSubmitted: this.document.getElementById("abEmpStepSubmitted"),
        stepHistory: this.document.getElementById("abEmpStepHistory"),

        blockedReason: this.document.getElementById("abEmpBlockedReason"),
        backHomeBlockedBtn: this.document.getElementById("abEmpBackHomeBlockedBtn"),

        valueBig: this.document.getElementById("abEmpValueBig"),
        valueLimitText: this.document.getElementById("abEmpValueLimitText"),
        valueInput: this.document.getElementById("abEmpValorInput"),
        valueError: this.document.getElementById("abEmpValueError"),
        continueValueBtn: this.document.getElementById("abEmpContinueValueBtn"),

        requestedValueText: this.document.getElementById("abEmpRequestedValueText"),
        prazoChips: this.document.getElementById("abEmpPrazoChips"),
        simulationCard: this.document.getElementById("abEmpSimulationCard"),
        improveOfferBtn: this.document.getElementById("abEmpImproveOfferBtn"),
        simulationError: this.document.getElementById("abEmpSimulationError"),
        continueInstallmentsBtn: this.document.getElementById("abEmpContinueInstallmentsBtn"),

        insuranceOptions: Array.from(this.document.querySelectorAll("[data-insurance]")),
        insuranceError: this.document.getElementById("abEmpInsuranceError"),
        continueInsuranceBtn: this.document.getElementById("abEmpContinueInsuranceBtn"),

        reviewList: this.document.getElementById("abEmpReviewList"),
        reviewMetricsCard: this.document.getElementById("abEmpReviewMetricsCard"),
        submitProposalBtn: this.document.getElementById("abEmpSubmitProposalBtn"),

        goHistoryBtn: this.document.getElementById("abEmpGoHistoryBtn"),
        historyCards: this.document.getElementById("abEmpHistoryCards"),

        navInicioBtn: this.document.getElementById("abEmpNavInicio"),
        navPerfilBtn: this.document.getElementById("abEmpNavPerfil")
      };
    }

    async init() {
      this.bindEvents();
      this.showStep("loading");
      await this.bootstrapData();
    }

    bindEvents() {
      this.elements.retryBtn.addEventListener("click", () => this.bootstrapData());
      this.elements.loginBtn.addEventListener("click", () => this.redirectToLogin());
      this.elements.backBtn.addEventListener("click", () => this.handleBack());
      this.elements.backHomeBlockedBtn.addEventListener("click", () => this.redirectToHome());
      this.elements.valueInput.addEventListener("input", () => this.onValueInput());
      this.elements.continueValueBtn.addEventListener("click", () => this.handleContinueValue());
      this.elements.continueInstallmentsBtn.addEventListener("click", () => this.goToStep("insurance"));
      if (this.elements.improveOfferBtn) {
        this.elements.improveOfferBtn.addEventListener("click", () => this.goToStep("value"));
      }
      this.elements.continueInsuranceBtn.addEventListener("click", () => this.handleContinueInsurance());
      this.elements.submitProposalBtn.addEventListener("click", () => this.handleSubmitProposal());
      this.elements.goHistoryBtn.addEventListener("click", () => this.goToStep("history"));

      this.elements.insuranceOptions.forEach((btn) => {
        btn.addEventListener("click", () => this.selectInsurance(btn.dataset.insurance || ""));
      });

      if (this.elements.navInicioBtn) {
        this.elements.navInicioBtn.addEventListener("click", () => this.redirectToHome());
      }
      if (this.elements.navPerfilBtn) {
        this.elements.navPerfilBtn.addEventListener("click", () => this.redirectToProfile());
      }
    }

    async bootstrapData() {
      this.setLoadingState("Validando sessao e carregando dados...");

      const token = this.getToken();
      if (!token) {
        this.setErrorState("Sessao nao encontrada. Faca login novamente.", { showLogin: true });
        return;
      }

      const [eligibilityResult, historyResult] = await Promise.all([
        this.requestLoan("loans/eligibility"),
        this.requestLoan("loans")
      ]);

      if (!eligibilityResult.ok) {
        this.handleKnownError(eligibilityResult.error);
        return;
      }
      if (!historyResult.ok) {
        this.handleKnownError(historyResult.error);
        return;
      }

      if (!this.isValidEligibility(eligibilityResult.data)) {
        this.setErrorState("Resposta de elegibilidade veio incompleta.", { showRetry: true });
        return;
      }

      this.state.eligibility = eligibilityResult.data;
      this.state.isEligible = Boolean(eligibilityResult.data.isElegivel);
      this.state.history = this.extractHistory(historyResult.data);
      this.renderHistory();

      if (!this.state.isEligible) {
        this.elements.blockedReason.textContent =
          "Para solicitar credito, e necessario ter renda mensal informada acima de R$ 1.000,00.";
        this.showStep("blocked");
        return;
      }

      const limiteMaximo = this.getLimiteMaximo();
      this.elements.valueLimitText.textContent = `Peça ate R$ ${this.formatMoney(limiteMaximo)}`;
      this.showStep("value");
      this.onValueInput();
    }

    getLimiteMaximo() {
      const payload = this.state.eligibility || {};
      const limite = Number(payload.limiteMaximo);
      return Number.isFinite(limite) && limite > 0 ? limite : 0;
    }

    onValueInput() {
      const raw = Number(this.elements.valueInput.value);
      const value = Number.isFinite(raw) ? raw : 0;
      this.elements.valueBig.textContent = `R$ ${this.formatMoney(value)}`;
      this.elements.valueError.textContent = "";
    }

    handleContinueValue() {
      const value = Number(this.elements.valueInput.value);
      const limiteMaximo = this.getLimiteMaximo();

      if (!Number.isFinite(value) || value <= 0) {
        this.elements.valueError.textContent = "Informe um valor maior que zero para continuar.";
        return;
      }
      if (limiteMaximo > 0 && value > limiteMaximo) {
        this.elements.valueError.textContent = `Valor acima do limite permitido (R$ ${this.formatMoney(limiteMaximo)}).`;
        return;
      }

      this.state.selectedValue = Math.round(value * 100) / 100;
      this.state.selectedPrazo = null;
      this.state.simulation = null;
      this.elements.requestedValueText.textContent = `Valor solicitado: R$ ${this.formatMoney(this.state.selectedValue)}`;
      this.renderPrazoChips();
      this.elements.simulationCard.innerHTML = '<p class="ab-emp-muted">Selecione um prazo para simular na API.</p>';
      this.elements.continueInstallmentsBtn.disabled = true;
      this.goToStep("installments");
    }

    renderPrazoChips() {
      this.elements.prazoChips.innerHTML = "";
      const prazoMaximoApi = Number(this.state.eligibility && this.state.eligibility.prazoMaximo);
      const prazoMaximo = Number.isFinite(prazoMaximoApi) && prazoMaximoApi > 0 ? prazoMaximoApi : 72;
      const prazos = DEFAULT_PRAZOS.filter((prazo) => prazo <= prazoMaximo);
      if (!prazos.length && prazoMaximo > 0) {
        prazos.push(Math.trunc(prazoMaximo));
      }

      prazos.forEach((prazo) => {
        const btn = this.document.createElement("button");
        btn.type = "button";
        btn.className = "ab-emp-chip";
        btn.textContent = `${prazo}x`;
        btn.addEventListener("click", () => this.simulateForPrazo(prazo, btn));
        this.elements.prazoChips.appendChild(btn);
      });
    }

    async simulateForPrazo(prazo, buttonEl) {
      if (!this.state.isEligible) {
        this.elements.simulationError.textContent = "Simulacao indisponivel para conta nao elegivel.";
        return;
      }
      this.elements.simulationError.textContent = "";
      this.elements.continueInstallmentsBtn.disabled = true;
      Array.from(this.elements.prazoChips.querySelectorAll(".ab-emp-chip")).forEach((chip) =>
        chip.classList.remove("is-active")
      );
      if (buttonEl) buttonEl.classList.add("is-active");

      this.elements.simulationCard.innerHTML = '<p class="ab-emp-muted">Consultando simulacao real...</p>';
      const result = await this.requestLoan("loans/simulate", {
        method: "POST",
        body: JSON.stringify({
          valor: this.state.selectedValue,
          prazoMeses: prazo
        })
      });

      if (!result.ok) {
        this.handleSimulationError(result.error);
        return;
      }
      if (!this.isValidSimulation(result.data)) {
        this.elements.simulationError.textContent = "A API retornou simulacao incompleta. Tente outro prazo.";
        return;
      }

      this.state.selectedPrazo = prazo;
      this.state.simulation = result.data;
      this.renderSimulationCard();
      this.elements.continueInstallmentsBtn.disabled = false;
    }

    renderSimulationCard() {
      const sim = this.state.simulation || {};
      const prazo = Number(sim.prazoMeses || this.state.selectedPrazo || 0);
      const parcela = Number(sim.valorParcela || 0);
      const total = this.resolveSimulationTotal(sim, parcela, prazo);

      this.elements.simulationCard.innerHTML =
        `<div class="ab-emp-sim-main">` +
        `<strong>${this.formatInteger(prazo)}x R$ ${this.formatMoney(parcela)}</strong>` +
        `<span>R$ ${this.formatMoney(total)}</span>` +
        `</div>` +
        `<div class="ab-emp-sim-sub">` +
        `<span>Total estimado</span>` +
        `<span>Simulacao real da API</span>` +
        `</div>`;
    }

    resolveSimulationTotal(simulation, parcela, prazo) {
      const candidates = [simulation.totalPagar, simulation.valorTotal, simulation.total, simulation.totalEmprestado];
      for (let i = 0; i < candidates.length; i += 1) {
        const n = Number(candidates[i]);
        if (Number.isFinite(n) && n > 0) return n;
      }
      if (Number.isFinite(parcela) && Number.isFinite(prazo)) {
        return parcela * prazo;
      }
      return 0;
    }

    selectInsurance(choice) {
      if (choice !== "com" && choice !== "sem") return;
      this.state.insuranceChoice = choice;
      this.elements.insuranceError.textContent = "";
      this.elements.insuranceOptions.forEach((btn) => {
        btn.classList.toggle("is-selected", btn.dataset.insurance === choice);
      });
      this.elements.continueInsuranceBtn.disabled = false;
    }

    handleContinueInsurance() {
      if (!this.state.insuranceChoice) {
        this.elements.insuranceError.textContent = "Escolha uma opcao para continuar.";
        return;
      }
      this.renderReview();
      this.goToStep("review");
    }

    renderReview() {
      const sim = this.state.simulation || {};
      const prazo = Number(sim.prazoMeses || this.state.selectedPrazo || 0);
      const parcela = Number(sim.valorParcela || 0);
      const total = this.resolveSimulationTotal(sim, parcela, prazo);

      const fields = [
        ["Voce solicita", `R$ ${this.formatMoney(this.state.selectedValue)}`],
        ["Parcelas", `${this.formatInteger(prazo)}x de R$ ${this.formatMoney(parcela)}`],
        ["Total estimado", `R$ ${this.formatMoney(total)}`],
        ["Taxa de juros", this.formatPercent(sim.taxaJuros)],
        ["Seguro", this.state.insuranceChoice === "com" ? "Com seguro (opcional, nao enviado ao backend)" : "Sem seguro"]
      ];

      const optionalApiFields = [
        ["CET mensal", sim.cetMensal],
        ["CET anual", sim.cetAnual],
        ["IOF", sim.iof]
      ];
      optionalApiFields.forEach(([label, value]) => {
        if (value != null && value !== "") {
          fields.push([label, this.formatDynamic(value)]);
        }
      });

      this.elements.reviewList.innerHTML = fields
        .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
        .join("");

      const metrics = [];
      if (sim.taxaJuros != null && sim.taxaJuros !== "") {
        metrics.push(["Juros mensais", this.formatPercent(sim.taxaJuros)]);
      }
      if (sim.cetMensal != null && sim.cetMensal !== "") {
        metrics.push(["CET mensal", this.formatDynamic(sim.cetMensal)]);
      }
      if (sim.cetAnual != null && sim.cetAnual !== "") {
        metrics.push(["CET anual", this.formatDynamic(sim.cetAnual)]);
      }
      if (sim.iof != null && sim.iof !== "") {
        metrics.push(["IOF", this.formatDynamic(sim.iof)]);
      }
      if (metrics.length) {
        this.elements.reviewMetricsCard.innerHTML =
          `<h3>Detalhes financeiros retornados pela API</h3>` +
          metrics.map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`).join("");
      } else {
        this.elements.reviewMetricsCard.innerHTML =
          `<h3>Detalhes financeiros</h3><p class="ab-emp-muted">CET e IOF nao foram retornados na simulacao atual da API.</p>`;
      }
    }

    async handleSubmitProposal() {
      if (!this.state.isEligible) {
        this.setErrorState("Conta sem elegibilidade. Nao e possivel enviar proposta.", { showRetry: false });
        return;
      }
      if (!this.state.selectedValue || !this.state.selectedPrazo) {
        this.setErrorState("Dados da proposta incompletos. Refaça a simulacao.", { showRetry: false });
        return;
      }

      this.elements.submitProposalBtn.disabled = true;
      this.elements.submitProposalBtn.textContent = "Enviando...";

      try {
        const createResult = await this.requestLoan("loans", {
          method: "POST",
          body: JSON.stringify({
            valorSolicitado: this.state.selectedValue,
            prazoMeses: this.state.selectedPrazo
          })
        });

        if (!createResult.ok) {
          this.handleKnownError(createResult.error);
          return;
        }

        const historyResult = await this.requestLoan("loans");
        if (historyResult.ok) {
          this.state.history = this.extractHistory(historyResult.data);
          this.renderHistory();
        }
        this.goToStep("submitted");
      } finally {
        this.elements.submitProposalBtn.disabled = false;
        this.elements.submitProposalBtn.textContent = "Enviar proposta para analise";
      }
    }

    extractHistory(payload) {
      if (!payload || !Array.isArray(payload.emprestimos)) {
        return [];
      }
      return payload.emprestimos.slice();
    }

    renderHistory() {
      const list = this.state.history || [];
      if (!list.length) {
        this.elements.historyCards.innerHTML =
          '<div class="ab-emp-card"><p class="ab-emp-muted">Voce ainda nao possui solicitacoes de credito registradas.</p></div>';
        return;
      }

      this.elements.historyCards.innerHTML = list
        .map((item) => this.renderHistoryCard(item))
        .join("");
    }

    renderHistoryCard(item) {
      const valor = Number(item && item.valorSolicitado);
      const prazo = Number(item && item.prazoMeses);
      const status = String((item && item.status) || "pendente").toLowerCase();
      const classeStatus = this.mapStatusClass(status);
      const dataSolicitacao = this.formatDate(item && item.dataSolicitacao);
      const totalEstimado = Number(item && (item.valorTotal || item.totalPagar || item.total));

      return (
        `<article class="ab-emp-card ab-emp-history-card">` +
        `<div class="ab-emp-history-top">` +
        `<strong>R$ ${this.formatMoney(valor)}</strong>` +
        `<span class="ab-emp-status ${classeStatus}">${status}</span>` +
        `</div>` +
        `<p>Parcelas: ${this.formatInteger(prazo)}x</p>` +
        `<p>Data: ${dataSolicitacao}</p>` +
        `${Number.isFinite(totalEstimado) && totalEstimado > 0 ? `<p>Total estimado: R$ ${this.formatMoney(totalEstimado)}</p>` : ""}` +
        `</article>`
      );
    }

    mapStatusClass(status) {
      if (status === "aprovado" || status === "approved") return "is-approved";
      if (status === "rejeitado" || status === "rejected") return "is-rejected";
      return "is-pending";
    }

    handleBack() {
      const step = this.state.currentStep;
      if (step === "value" || step === "blocked" || step === "loading") {
        this.redirectToHome();
        return;
      }
      if (step === "installments") this.goToStep("value");
      else if (step === "insurance") this.goToStep("installments");
      else if (step === "review") this.goToStep("insurance");
      else if (step === "submitted") this.goToStep("history");
      else if (step === "history") this.goToStep("value");
      else this.redirectToHome();
    }

    goToStep(step) {
      if (step === "value" && !this.state.isEligible) {
        this.showStep("blocked");
        return;
      }
      this.showStep(step);
    }

    showStep(step) {
      const map = {
        loading: this.elements.stepLoading,
        blocked: this.elements.stepBlocked,
        value: this.elements.stepValue,
        installments: this.elements.stepInstallments,
        insurance: this.elements.stepInsurance,
        review: this.elements.stepReview,
        submitted: this.elements.stepSubmitted,
        history: this.elements.stepHistory
      };

      Object.keys(map).forEach((key) => {
        const el = map[key];
        if (el) {
          el.classList.toggle("ab-emp-step-active", key === step);
        }
      });
      this.state.currentStep = step;
      this.elements.statePill.textContent = step;
      this.elements.topbarTitle.textContent = step === "history" ? "Historico de propostas" : "Credito pessoal";
    }

    setLoadingState(message) {
      this.elements.statusText.textContent = message;
      this.elements.retryBtn.hidden = true;
      this.elements.loginBtn.hidden = true;
      this.showStep("loading");
    }

    setErrorState(message, opts = {}) {
      this.elements.statusText.textContent = message;
      this.elements.retryBtn.hidden = !opts.showRetry;
      this.elements.loginBtn.hidden = !opts.showLogin;
      this.showStep("loading");
      this.elements.statePill.textContent = "erro";
    }

    handleSimulationError(error) {
      const mapped = this.errorToText(error);
      this.elements.simulationError.textContent = mapped;
      this.elements.simulationCard.innerHTML = '<p class="ab-emp-muted">Nao foi possivel gerar simulacao agora.</p>';
      this.elements.continueInstallmentsBtn.disabled = true;
    }

    handleKnownError(error) {
      const kind = (error && error.kind) || "internal";
      const message = this.errorToText(error);
      if (kind === "not-eligible") {
        this.state.isEligible = false;
        this.elements.blockedReason.textContent = message;
        this.showStep("blocked");
        return;
      }
      if (kind === "not-authenticated") {
        this.setErrorState(message, { showLogin: true });
        return;
      }
      this.setErrorState(message, { showRetry: true });
    }

    errorToText(error) {
      const kind = (error && error.kind) || "internal";
      const detail = (error && error.detail) || "Nao foi possivel concluir a operacao.";
      if (kind === "not-eligible") {
        return "Para solicitar credito, e necessario ter renda mensal informada acima de R$ 1.000,00.";
      }
      if (kind === "validation") return `Erro de validacao: ${detail}`;
      return detail;
    }

    isValidEligibility(payload) {
      return payload && typeof payload === "object" && typeof payload.isElegivel === "boolean";
    }

    isValidSimulation(payload) {
      if (!payload || typeof payload !== "object") return false;
      return Number.isFinite(Number(payload.valorParcela)) && Number.isFinite(Number(payload.prazoMeses));
    }

    async requestLoan(path, options = {}) {
      if (!this.apiBase) {
        return {
          ok: false,
          error: { kind: "connection-timeout", detail: "Base de API indisponivel no ambiente." }
        };
      }

      const headers = Object.assign(
        {
          "Content-Type": "application/json"
        },
        options.headers || {}
      );

      const token = this.getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await window.fetch(`${this.apiBase}/${path}`, {
          method: options.method || "GET",
          headers,
          body: options.body,
          signal: controller.signal
        });

        const body = await this.safeParseJson(response);
        if (!response.ok) {
          return { ok: false, error: this.mapHttpError(response.status, body) };
        }

        if (!body || typeof body !== "object" || !("data" in body)) {
          return {
            ok: false,
            error: { kind: "invalid-response", detail: "Resposta nao possui payload esperado." }
          };
        }
        return { ok: true, data: body.data };
      } catch (error) {
        if (error && error.name === "AbortError") {
          return {
            ok: false,
            error: { kind: "connection-timeout", detail: "Tempo limite atingido na comunicacao." }
          };
        }
        return {
          ok: false,
          error: { kind: "connection-timeout", detail: "Falha de conexao com a API." }
        };
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    async safeParseJson(response) {
      try {
        return await response.json();
      } catch (error) {
        return null;
      }
    }

    mapHttpError(status, body) {
      if (status === 401) {
        return { kind: "not-authenticated", detail: "Sessao invalida ou expirada. Faca login novamente." };
      }
      if (status === 403) {
        if (this.hasLoanNotEligibleCode(body) || this.hasAccountNotVerifiedCode(body)) {
          return { kind: "not-eligible", detail: "Conta sem elegibilidade para esta operacao." };
        }
        return { kind: "forbidden", detail: "Operacao indisponivel para o perfil atual." };
      }
      if (status === 400) {
        return { kind: "validation", detail: this.extractValidationMessage(body) };
      }
      if (status >= 500) {
        return { kind: "internal", detail: "Servico indisponivel no momento. Tente novamente em instantes." };
      }
      return { kind: "internal", detail: "Nao foi possivel concluir a operacao. Tente novamente." };
    }

    extractValidationMessage(body) {
      if (body && Array.isArray(body.errors) && body.errors.length) {
        return body.errors
          .map((errorItem) => `${errorItem.field || "campo"}: ${errorItem.message || "valor invalido"}`)
          .join(" | ");
      }
      return (body && (body.message || body.error)) || "Revise valor e prazo antes de continuar.";
    }

    hasLoanNotEligibleCode(body) {
      return Boolean(
        body &&
          (body.error === "LOAN_NOT_ELIGIBLE" ||
            body.code === "LOAN_NOT_ELIGIBLE" ||
            body?.data?.error === "LOAN_NOT_ELIGIBLE" ||
            body?.data?.code === "LOAN_NOT_ELIGIBLE")
      );
    }

    hasAccountNotVerifiedCode(body) {
      return Boolean(
        body &&
          (body.error === "ACCOUNT_NOT_VERIFIED" ||
            body.code === "ACCOUNT_NOT_VERIFIED" ||
            body?.data?.error === "ACCOUNT_NOT_VERIFIED" ||
            body?.data?.code === "ACCOUNT_NOT_VERIFIED")
      );
    }

    getToken() {
      for (let i = 0; i < TOKEN_KEYS.length; i += 1) {
        const key = TOKEN_KEYS[i];
        const sessionValue = window.sessionStorage.getItem(key);
        if (sessionValue) return sessionValue;
        const localValue = window.localStorage.getItem(key);
        if (localValue) return localValue;
      }
      return null;
    }

    formatMoney(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "0,00";
      return numeric.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    formatPercent(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "Nao informado";
      return `${numeric.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    }

    formatInteger(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "0";
      return String(Math.trunc(numeric));
    }

    formatDynamic(value) {
      if (typeof value === "number") {
        return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return String(value);
    }

    formatDate(rawDate) {
      if (!rawDate) return "Nao informado";
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime())) return String(rawDate);
      return d.toLocaleString("pt-BR");
    }

    redirectToLogin() {
      window.location.assign(LOGIN_PATH);
    }

    redirectToHome() {
      window.location.assign(HOME_PATH);
    }

    redirectToProfile() {
      try {
        window.sessionStorage.setItem("agilbank_open_profile", "1");
      } catch (error) {
        // Ignore storage issues and continue navigation.
      }
      window.location.assign(HOME_PATH);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const module = new EmprestimosModule(document);
    module.init().catch(() => {
      module.setErrorState("Falha inesperada ao iniciar o modulo de emprestimos.", { showRetry: true });
    });
  });
})();
