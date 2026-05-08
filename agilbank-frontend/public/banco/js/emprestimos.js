(() => {
  "use strict";

  const LOGIN_PATH = "../index.html";
  const REQUEST_TIMEOUT_MS = 12000;
  const TOKEN_KEYS = ["agilbank_token", "govbr_token", "token"];

  class EmprestimosModule {
    constructor(documentRef) {
      this.document = documentRef;
      this.currentState = "loading";
      this.elements = this.getElements();
      this.apiBase =
        typeof window.getAgilbankApiBase === "function"
          ? window.getAgilbankApiBase()
          : null;
      this.isEligible = null;
    }

    getElements() {
      return {
        app: this.document.getElementById("abEmpApp"),
        statePill: this.document.getElementById("abEmpStatePill"),
        eligibilityText: this.document.getElementById("abEmpEligibilityText"),
        simulacaoResultado: this.document.getElementById("abEmpSimulacaoResultado"),
        statusText: this.document.getElementById("abEmpStatusText"),
        historico: this.document.getElementById("abEmpHistorico"),
        valor: this.document.getElementById("abEmpValor"),
        parcelas: this.document.getElementById("abEmpParcelas"),
        finalidade: this.document.getElementById("abEmpFinalidade"),
        simularBtn: this.document.getElementById("abEmpSimularBtn"),
        enviarBtn: this.document.getElementById("abEmpEnviarBtn"),
        form: this.document.getElementById("abEmpForm"),
        retryBtn: this.document.getElementById("abEmpRetryBtn"),
        loginBtn: this.document.getElementById("abEmpLoginBtn"),
        navInicioBtn: this.document.getElementById("abEmpNavInicio"),
        navPerfilBtn: this.document.getElementById("abEmpNavPerfil")
      };
    }

    async init() {
      this.bindEvents();
      this.setState("loading", "Carregando modulo de emprestimos...");
      await this.bootstrapData();
    }

    bindEvents() {
      this.elements.simularBtn.addEventListener("click", () => this.handleSimulacao());
      this.elements.form.addEventListener("submit", (event) => this.handleSubmit(event));
      this.elements.retryBtn.addEventListener("click", () => this.bootstrapData());
      this.elements.loginBtn.addEventListener("click", () => this.redirectToLogin());
      if (this.elements.navInicioBtn) {
        this.elements.navInicioBtn.addEventListener("click", () => this.redirectToHome());
      }
      if (this.elements.navPerfilBtn) {
        this.elements.navPerfilBtn.addEventListener("click", () => this.redirectToProfile());
      }
    }

    setState(nextState, statusMessage, actions = {}) {
      this.currentState = nextState;
      this.elements.app.className = `ab-emp-app ab-emp-state-${nextState}`;
      this.elements.statePill.textContent = nextState;
      this.elements.statusText.textContent = statusMessage;
      this.elements.retryBtn.hidden = !actions.retry;
      this.elements.loginBtn.hidden = !actions.login;
    }

    async bootstrapData() {
      this.setState("loading", "Validando sessao e carregando informacoes de emprestimos...");

      const token = this.getToken();
      if (!token) {
        this.handleKnownError({ kind: "not-authenticated", detail: "Sessao nao encontrada." });
        return;
      }

      const [eligibilityResult, historicoResult] = await Promise.all([
        this.requestLoan("loans/eligibility"),
        this.requestLoan("loans")
      ]);

      if (!eligibilityResult.ok) {
        this.handleKnownError(eligibilityResult.error);
        return;
      }

      if (!historicoResult.ok) {
        this.handleKnownError(historicoResult.error);
        return;
      }

      this.renderEligibility(eligibilityResult.data);
      this.renderHistorico(historicoResult.data);
    }

    renderEligibility(payload) {
      if (!payload || typeof payload !== "object" || typeof payload.isElegivel !== "boolean") {
        this.handleKnownError({
          kind: "invalid-response",
          detail: "Resposta de elegibilidade veio incompleta."
        });
        return;
      }

      if (!payload.isElegivel) {
        this.isEligible = false;
        this.elements.enviarBtn.disabled = true;
        this.elements.simularBtn.disabled = true;
        this.elements.eligibilityText.textContent =
          "Voce ainda nao esta elegivel para solicitar credito pessoal. Continue usando sua conta para melhorar seu relacionamento com o AgilBank.";
        this.elements.simulacaoResultado.textContent =
          "Sem elegibilidade no momento. Simulacao e envio de proposta permanecem bloqueados.";
        this.setState("historico-vazio", "Conta sem elegibilidade para enviar proposta neste momento.");
        return;
      }

      this.isEligible = true;
      this.elements.enviarBtn.disabled = false;
      this.elements.simularBtn.disabled = false;
      const taxa = this.formatMoney(payload.taxaJuros);
      const limite = this.formatMoney(payload.limiteMaximo);
      this.elements.eligibilityText.textContent =
        `Elegivel para analise. Limite de referencia: R$ ${limite}. Taxa inicial estimada: ${taxa}% ao mes.`;
    }

    async handleSimulacao() {
      try {
        const valor = Number(this.elements.valor.value);
        const parcelas = Number(this.elements.parcelas.value);

        if (!Number.isFinite(valor) || !Number.isFinite(parcelas) || valor <= 0 || parcelas <= 0) {
          this.setState("erro", "Erro de validacao: informe valor e parcelas maiores que zero.");
          this.elements.simulacaoResultado.textContent = "Simulacao invalida. Revise os campos.";
          return;
        }

        this.setState("loading", "Consultando simulacao na API...");
        const simulationResult = await this.requestLoan("loans/simulate", {
          method: "POST",
          body: JSON.stringify({ valor, prazoMeses: parcelas })
        });

        if (!simulationResult.ok) {
          this.handleKnownError(simulationResult.error);
          return;
        }

        const data = simulationResult.data;
        if (!data || !Number.isFinite(Number(data.valorParcela))) {
          this.handleKnownError({
            kind: "invalid-response",
            detail: "Simulacao veio sem valor de parcela valido."
          });
          return;
        }

        this.setState("simulacao", "Simulacao recebida da API para apoio de decisao.");
        this.elements.simulacaoResultado.textContent =
          `Estimativa: ${this.formatInteger(data.prazoMeses)}x de R$ ${this.formatMoney(data.valorParcela)}. ` +
          "Resultado nao representa aprovacao nem liberacao imediata.";
      } catch (error) {
        this.handleKnownError({ kind: "internal", detail: "Falha inesperada na simulacao." });
      }
    }

    async handleSubmit(event) {
      event.preventDefault();

      const valor = Number(this.elements.valor.value);
      const parcelas = Number(this.elements.parcelas.value);
      const finalidade = this.elements.finalidade.value;

      if (!finalidade || !Number.isFinite(valor) || !Number.isFinite(parcelas) || valor <= 0 || parcelas <= 0) {
        this.setState(
          "erro",
          "Erro de validacao: preencha valor, parcelas e finalidade para seguir."
        );
        return;
      }

      if (this.isEligible === false) {
        this.handleKnownError({
          kind: "not-eligible",
          detail:
            "Voce ainda nao esta elegivel para solicitar credito pessoal. Continue usando sua conta para melhorar seu relacionamento com o AgilBank."
        });
        return;
      }

      this.elements.enviarBtn.disabled = true;
      this.elements.simularBtn.disabled = true;
      this.setState(
        "em-analise",
        "Enviando solicitacao para analise..."
      );

      try {
        const createResult = await this.requestLoan("loans", {
          method: "POST",
          body: JSON.stringify({ valorSolicitado: valor, prazoMeses: parcelas })
        });

        if (!createResult.ok) {
          this.handleKnownError(createResult.error);
          return;
        }

        this.setState(
          "em-analise",
          "Solicitacao enviada com sucesso para analise. Aguarde atualizacao de status no historico."
        );

        const historyRefresh = await this.requestLoan("loans");
        if (historyRefresh.ok) {
          this.renderHistorico(historyRefresh.data);
        }
      } finally {
        this.elements.enviarBtn.disabled = false;
        this.elements.simularBtn.disabled = false;
      }
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
        return {
          kind: "not-authenticated",
          detail: "Sessao invalida ou expirada. Faca login novamente."
        };
      }

      if (status === 403) {
        if (this.hasLoanNotEligibleCode(body)) {
          return {
            kind: "not-eligible",
            detail:
              "Voce ainda nao esta elegivel para solicitar credito pessoal. Continue usando sua conta para melhorar seu relacionamento com o AgilBank."
          };
        }

        return {
          kind: "forbidden",
          detail: "Operacao indisponivel para o perfil atual."
        };
      }

      if (status === 400) {
        if (this.hasLoanNotEligibleCode(body)) {
          return {
            kind: "not-eligible",
            detail:
              "Voce ainda nao esta elegivel para solicitar credito pessoal. Continue usando sua conta para melhorar seu relacionamento com o AgilBank."
          };
        }
        return {
          kind: "validation",
          detail: this.extractValidationMessage(body)
        };
      }

      if (status >= 500) {
        return {
          kind: "internal",
          detail: "Servico indisponivel no momento. Tente novamente em instantes."
        };
      }

      return {
        kind: "internal",
        detail: "Nao foi possivel concluir a operacao. Tente novamente."
      };
    }

    extractValidationMessage(body) {
      if (body && Array.isArray(body.errors) && body.errors.length) {
        return body.errors
          .map((errorItem) => `${errorItem.field || "campo"}: ${errorItem.message || "valor invalido"}`)
          .join(" | ");
      }

      return "Revise valor, prazo e campos obrigatorios antes de continuar.";
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

    handleKnownError(error) {
      const kind = (error && error.kind) || "internal";
      const detail = (error && error.detail) || "Falha inesperada.";

      if (kind === "not-authenticated") {
        this.setState("erro", detail, { login: true });
        this.elements.historico.innerHTML =
          '<li class="ab-emp-history-empty">Sessao expirada. Faca login para consultar historico.</li>';
        return;
      }

      if (kind === "forbidden") {
        this.setState("erro", detail, { retry: false });
        return;
      }

      if (kind === "not-eligible") {
        this.isEligible = false;
        this.elements.enviarBtn.disabled = true;
        this.elements.simularBtn.disabled = true;
        this.setState("historico-vazio", detail);
        this.elements.simulacaoResultado.textContent =
          "Sem elegibilidade no momento. Simulacao e envio de proposta permanecem bloqueados.";
        return;
      }

      if (kind === "connection-timeout") {
        this.setState("erro", `${detail} Voce pode tentar novamente.`, { retry: true });
        return;
      }

      if (kind === "invalid-response") {
        this.setState("erro", "Falha controlada ao processar resposta da API.", { retry: true });
        this.elements.simulacaoResultado.textContent =
          "Os dados recebidos vieram incompletos. Tente novamente em instantes.";
        return;
      }

      if (kind === "validation") {
        this.setState("erro", `Erro de validacao: ${detail}`);
        return;
      }

      this.setState("erro", detail, { retry: true });
    }

    renderHistorico(payload) {
      const emprestimos = payload && Array.isArray(payload.emprestimos) ? payload.emprestimos : null;

      if (!emprestimos) {
        this.handleKnownError({
          kind: "invalid-response",
          detail: "Historico retornou estrutura invalida."
        });
        return;
      }

      if (!emprestimos.length) {
        this.elements.historico.innerHTML =
          '<li class="ab-emp-history-empty">Voce ainda nao possui solicitacoes de emprestimo registradas.</li>';
        this.setState("historico-vazio", "Historico vazio confirmado pela API.");
        return;
      }

      const items = emprestimos
        .map((item) => {
          const statusInfo = this.getLoanStatusInfo(item && item.status);
          const valor = this.formatMoney(item && item.valorSolicitado);
          const prazo = this.formatInteger(item && item.prazoMeses);
          return (
            `<li class="ab-emp-history-item">` +
            `<strong>R$ ${valor} em ${prazo} meses - status: ${statusInfo.label}</strong><br>` +
            `${statusInfo.message}` +
            `</li>`
          );
        })
        .join("");

      this.elements.historico.innerHTML = items;
      this.setState("em-analise", "Historico carregado com dados reais da API.");
    }

    getLoanStatusInfo(statusRaw) {
      const normalized = statusRaw ? String(statusRaw).toLowerCase() : "";

      if (normalized === "aprovado" || normalized === "approved") {
        return {
          label: "APROVADO",
          message:
            "Sua proposta foi aprovada. Confira os detalhes antes de qualquer proxima etapa."
        };
      }

      if (normalized === "rejeitado" || normalized === "rejected") {
        return {
          label: "REJEITADO",
          message: "No momento, sua proposta nao foi aprovada."
        };
      }

      if (normalized === "pendente" || normalized === "pending" || !normalized) {
        return {
          label: "PENDENTE",
          message: "Sua proposta foi enviada e esta em analise."
        };
      }

      return {
        label: String(statusRaw).toUpperCase(),
        message: "Status retornado pela API. Acompanhe atualizacoes no historico."
      };
    }

    formatMoney(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return "0,00";
      }

      return numeric.toFixed(2).replace(".", ",");
    }

    formatInteger(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return "0";
      }

      return String(Math.trunc(numeric));
    }

    getToken() {
      for (const key of TOKEN_KEYS) {
        const sessionValue = window.sessionStorage.getItem(key);
        if (sessionValue) {
          return sessionValue;
        }

        const localValue = window.localStorage.getItem(key);
        if (localValue) {
          return localValue;
        }
      }

      return null;
    }

    redirectToLogin() {
      window.location.assign(LOGIN_PATH);
    }

    redirectToHome() {
      window.location.assign("./index.html");
    }

    redirectToProfile() {
      try {
        window.sessionStorage.setItem("agilbank_open_profile", "1");
      } catch (error) {
        // Ignore storage errors and still navigate.
      }
      window.location.assign("./index.html");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const module = new EmprestimosModule(document);
    module.init().catch(() => {
      module.handleKnownError({
        kind: "internal",
        detail: "Falha inesperada ao iniciar o modulo de emprestimos."
      });
    });
  });
})();
