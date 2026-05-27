(() => {
  "use strict";

  const LOGIN_PATH = "../index.html";
  const HOME_PATH = "./index.html";
  const REQUEST_TIMEOUT_MS = 12000;
  const TOKEN_KEYS = ["agilbank_token", "govbr_token", "token"];
  const DEFAULT_PRAZOS = [6, 12, 18, 24, 36, 48, 60, 72];
  const INSURANCE_UNIQUE_LABEL = "R$ 39,90 valor único";

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
        amountDigits: "",
        draftValue: 0,
        selectedValue: 0,
        selectedPrazo: null,
        simulation: null,
        insuranceChoice: null,
        insuranceTermsAccepted: false,
        kycApproved: false,
        kycPayload: null
      };

      this.elements = this.getElements();
    }

    getElements() {
      return {
        shell: this.document.getElementById("abEmpShell"),
        footer: this.document.getElementById("abEmpFooter"),
        statePill: this.document.getElementById("abEmpStatePill"),
        statusText: this.document.getElementById("abEmpStatusText"),
        retryBtn: this.document.getElementById("abEmpRetryBtn"),
        loginBtn: this.document.getElementById("abEmpLoginBtn"),
        backBtn: this.document.getElementById("abEmpBackBtn"),
        closeBtn: this.document.getElementById("abEmpCloseBtn"),
        topbarTitle: this.document.querySelector(".ab-emp-topbar-title"),

        stepLoading: this.document.getElementById("abEmpStepLoading"),
        stepManage: this.document.getElementById("abEmpStepManage"),
        manageRoot: this.document.getElementById("abEmpManageRoot"),
        stepBlocked: this.document.getElementById("abEmpStepBlocked"),
        stepKyc: this.document.getElementById("abEmpStepKyc"),
        kycTitle: this.document.getElementById("abEmpKycTitle"),
        kycIntro: this.document.getElementById("abEmpKycIntro"),
        kycDetail: this.document.getElementById("abEmpKycDetail"),
        kycPrimaryLink: this.document.getElementById("abEmpKycPrimaryLink"),
        kycWaitBtn: this.document.getElementById("abEmpKycWaitBtn"),
        kycBackBtn: this.document.getElementById("abEmpKycBackBtn"),
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
        insuranceTermsWrap: this.document.getElementById("abEmpInsuranceTermsWrap"),
        insuranceTermsCheck: this.document.getElementById("abEmpInsuranceTermsCheck"),
        insuranceError: this.document.getElementById("abEmpInsuranceError"),
        continueInsuranceBtn: this.document.getElementById("abEmpContinueInsuranceBtn"),

        reviewList: this.document.getElementById("abEmpReviewList"),
        reviewMetricsCard: this.document.getElementById("abEmpReviewMetricsCard"),
        submitProposalBtn: this.document.getElementById("abEmpSubmitProposalBtn"),

        goHistoryBtn: this.document.getElementById("abEmpGoHistoryBtn"),
        historyCards: this.document.getElementById("abEmpHistoryCards"),

        navInicioBtn: this.document.getElementById("abEmpNavInicio"),
        navEmprestimosBtn: this.document.getElementById("abEmpNavEmprestimos")
      };
    }

    async init() {
      this.bindEvents();
      this.setFooterActive("emprestimos");
      this.showStep("loading");
      await this.bootstrapData();
    }

    bindEvents() {
      this.elements.retryBtn.addEventListener("click", () => this.bootstrapData());
      this.elements.loginBtn.addEventListener("click", () => this.redirectToLogin());
      this.elements.backBtn.addEventListener("click", () => this.handleBack());
      if (this.elements.closeBtn) {
        this.elements.closeBtn.addEventListener("click", () => {
          window.location.assign("./index.html");
        });
      }
      this.elements.backHomeBlockedBtn.addEventListener("click", () => this.redirectToHome());
      if (this.elements.kycBackBtn) {
        this.elements.kycBackBtn.addEventListener("click", () => this.redirectToHome());
      }
      this.elements.valueInput.addEventListener("beforeinput", (event) => this.onValueBeforeInput(event));
      this.elements.valueInput.addEventListener("input", () => this.onValueInput());
      this.elements.valueInput.addEventListener("paste", (event) => this.onValuePaste(event));
      this.elements.continueValueBtn.addEventListener("click", () => this.handleContinueValue());
      this.elements.continueInstallmentsBtn.addEventListener("click", () => {
        this.clearInsuranceSelection();
        this.goToStep("insurance");
      });
      if (this.elements.improveOfferBtn) {
        this.elements.improveOfferBtn.addEventListener("click", () => {
          this.clearInsuranceSelection();
          this.goToStep("value");
        });
      }
      this.elements.continueInsuranceBtn.addEventListener("click", () => this.handleContinueInsurance());
      this.elements.submitProposalBtn.addEventListener("click", () => this.handleSubmitProposal());
      this.elements.goHistoryBtn.addEventListener("click", () => this.goToStep("history"));

      this.elements.insuranceOptions.forEach((btn) => {
        btn.addEventListener("click", () => this.selectInsurance(btn.dataset.insurance || ""));
      });

      if (this.elements.insuranceTermsCheck) {
        this.elements.insuranceTermsCheck.addEventListener("change", () => this.onInsuranceTermsChange());
      }

      this.bindPayInsuranceDelegation(this.elements.historyCards);
      if (this.elements.stepManage) {
        this.elements.stepManage.addEventListener("click", (event) => {
          const target = event.target;
          if (target instanceof Element) {
            const payBtn = target.closest("[data-pay-insurance]");
            if (payBtn && payBtn.getAttribute("data-pay-insurance")) {
              event.preventDefault();
              void this.payLoanInsurance(payBtn.getAttribute("data-pay-insurance") || "");
              return;
            }
          }
          this.onManagePanelClick(event);
        });
      }

      if (this.elements.navInicioBtn) {
        this.elements.navInicioBtn.addEventListener("click", () => {
          this.setFooterActive("inicio");
          this.redirectToHome();
        });
      }
      if (this.elements.navEmprestimosBtn) {
        this.elements.navEmprestimosBtn.addEventListener("click", () => {
          this.setFooterActive("emprestimos");
          const focus = this.pickFocusLoan(this.state.history);
          if (focus) {
            this.renderFullManagement();
            this.showStep("manage");
            return;
          }
          this.goToStep(this.state.currentStep || "value");
        });
      }

    }

    applyKycGateUi(kycData) {
      const st = String((kycData && kycData.identityStatus) || "").toUpperCase();
      const introDefault =
        "Essa etapa protege sua conta e evita uso indevido dos seus dados.";
      let title = "Confirme sua identidade para solicitar empréstimo";
      let intro = introDefault;
      let detail = "";
      let primaryLabel = "Verificar agora";
      let mode = "verify";

      if (st === "DRAFT" || st === "PENDING_UPLOADS") {
        title = "Continue sua verificação";
        detail =
          "Envie ou confirme os arquivos pendentes. Você pode retomar de onde parou.";
        primaryLabel = "Continuar verificação";
        mode = "continue";
      } else if (st === "READY_FOR_REVIEW" || st === "UNDER_MANUAL_REVIEW") {
        title = "Identidade em análise";
        intro = "Sua identidade está em análise.";
        detail =
          "Assim que a análise for concluída, você poderá seguir com esta solicitação.";
        primaryLabel = "Aguardar análise";
        mode = "wait";
      } else if (st === "RESUBMISSION_REQUIRED") {
        title = "Reenvio necessário";
        detail =
          "Precisamos que você reenvie seus documentos conforme as orientações da sua última interação.";
        primaryLabel = "Reenviar documentos";
        mode = "resubmit";
      } else if (st === "REJECTED") {
        title = "Verificação não aprovada";
        intro =
          "Não foi possível aprovar sua identidade neste momento. Você pode revisar os detalhes no fluxo de verificação ou falar com o suporte.";
        detail =
          kycData && typeof kycData.message === "string" && kycData.message.trim()
            ? kycData.message.trim()
            : "";
        primaryLabel = "Ver detalhes";
        mode = "rejected";
      }

      if (this.elements.kycTitle) this.elements.kycTitle.textContent = title;
      if (this.elements.kycIntro) this.elements.kycIntro.textContent = intro;
      const detEl = this.elements.kycDetail;
      if (detEl) {
        if (detail) {
          detEl.textContent = detail;
          detEl.style.display = "";
        } else {
          detEl.textContent = "";
          detEl.style.display = "none";
        }
      }
      const link = this.elements.kycPrimaryLink;
      const waitBtn = this.elements.kycWaitBtn;
      if (mode === "wait" && link && waitBtn) {
        link.hidden = true;
        waitBtn.hidden = false;
      } else if (link && waitBtn) {
        link.hidden = false;
        waitBtn.hidden = true;
        link.textContent = primaryLabel;
        link.setAttribute("href", "/verificacao-identidade");
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
        await this.handleKnownError(eligibilityResult.error);
        return;
      }
      if (!historyResult.ok) {
        await this.handleKnownError(historyResult.error);
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

      const kycResult = await this.requestLoan("me/kyc-status");
      if (!kycResult.ok) {
        this.setErrorState(
          "Não foi possível consultar sua verificação de identidade. Tente novamente.",
          { showRetry: true }
        );
        return;
      }
      this.state.kycPayload = kycResult.data;
      this.state.kycApproved = String(kycResult.data.identityStatus || "") === "APPROVED";

      if (!this.state.isEligible) {
        this.elements.blockedReason.textContent =
          "Para solicitar credito, e necessario ter renda mensal informada acima de R$ 1.000,00.";
        this.showStep("blocked");
        return;
      }

      const focusLoan = this.pickFocusLoan(this.state.history);
      if (focusLoan) {
        this.renderFullManagement();
        this.showStep("manage");
        return;
      }

      if (!this.state.kycApproved) {
        this.applyKycGateUi(this.state.kycPayload);
        this.showStep("kyc");
        return;
      }

      const limiteMaximo = this.getLimiteMaximo();
      this.elements.valueLimitText.textContent = `Peça ate R$ ${this.formatMoney(limiteMaximo)}`;
      this.showStep("value");
      this.applyAmountDigits("");
    }

    bindPayInsuranceDelegation(container) {
      if (!container) return;
      container.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const payBtn = target.closest("[data-pay-insurance]");
        if (payBtn && payBtn.getAttribute("data-pay-insurance")) {
          event.preventDefault();
          this.payLoanInsurance(payBtn.getAttribute("data-pay-insurance") || "");
        }
      });
    }

    onManagePanelClick(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const actionEl = target.closest("[data-manage-action]");
      if (!actionEl) return;
      const action = actionEl.getAttribute("data-manage-action") || "";
      if (action === "refresh") {
        event.preventDefault();
        void this.refreshLoansAndShowManage();
        return;
      }
      if (action === "pay-insurance") {
        event.preventDefault();
        const id = actionEl.getAttribute("data-loan-id") || "";
        void this.payLoanInsurance(id);
        return;
      }
      if (action === "guarantee-info") {
        event.preventDefault();
        window.alert(
          "Funcionalidade de garantia em preparacao. Entre em contato com o banco ou aguarde novidades no app."
        );
        return;
      }
      if (action === "nova-simulacao") {
        event.preventDefault();
        this.startNewProposalAfterRejected();
      }
    }

    pickFocusLoan(list) {
      if (!list || !list.length) return null;
      try {
        const params = new URLSearchParams(window.location.search || "");
        const forcedId = params.get("loanId");
        if (forcedId) {
          const direct = list.find((row) => row && String(row.id) === String(forcedId));
          if (direct) return direct;
        }
      } catch (_) {
        /* ignore */
      }
      const sorted = [...list].sort((a, b) => {
        const ta = new Date(a && a.dataSolicitacao ? a.dataSolicitacao : 0).getTime();
        const tb = new Date(b && b.dataSolicitacao ? b.dataSolicitacao : 0).getTime();
        return tb - ta;
      });
      const st = (row) => String((row && row.status) || "").toLowerCase();
      let hit = sorted.find((row) => st(row) === "pendente");
      if (hit) return hit;
      hit = sorted.find((row) => st(row) === "aprovado" || st(row) === "approved");
      if (hit) return hit;
      hit = sorted.find((row) => st(row) === "rejeitado" || st(row) === "rejected");
      return hit || sorted[0];
    }

    hasPendingLoan(list) {
      return (list || []).some((row) => String((row && row.status) || "").toLowerCase() === "pendente");
    }

    loanStatusNorm(item) {
      return String((item && item.status) || "").toLowerCase();
    }

    async refreshLoansAndShowManage() {
      const historyResult = await this.requestLoan("loans");
      if (!historyResult.ok) {
        await this.handleKnownError(historyResult.error);
        return;
      }
      this.state.history = this.extractHistory(historyResult.data);
      this.renderHistory();
      this.renderFullManagement();
      this.showStep("manage");
    }

    renderFullManagement() {
      const root = this.elements.manageRoot;
      if (!root) return;
      const focus = this.pickFocusLoan(this.state.history);
      if (!focus) {
        root.innerHTML =
          '<div class="ab-emp-card"><p class="ab-emp-muted">Nenhuma proposta encontrada.</p></div>';
        return;
      }
      const st = this.loanStatusNorm(focus);
      let heroHtml = "";
      let extraHtml = "";
      let actionsHtml = "";

      if (st === "pendente") {
        heroHtml = this.renderManageHeroPending(focus);
        actionsHtml = `<button type="button" class="ab-emp-btn ab-emp-btn-block" data-manage-action="refresh">Atualizar status</button>`;
      } else if (st === "aprovado" || st === "approved") {
        const blocked = String((focus.fundsStatus || "").toLowerCase()) === "bloqueado";
        if (blocked) {
          heroHtml = this.renderManageHeroApprovedBlocked(focus);
          extraHtml = this.renderManageExtraCards(focus);
          const showPay = this.shouldShowPayInsuranceCta(focus);
          if (showPay && focus.id) {
            const lid = String(focus.id).replace(/"/g, "");
            actionsHtml += `<button type="button" class="ab-emp-btn ab-emp-btn-block" data-manage-action="pay-insurance" data-loan-id="${lid}">Quitar seguro</button>`;
          }
          const showGuarantee = this.shouldShowGuaranteeCta(focus);
          if (showGuarantee) {
            actionsHtml += `<button type="button" class="ab-emp-btn ab-emp-btn-secondary ab-emp-btn-block" data-manage-action="guarantee-info">Apresentar garantia</button>`;
          }
        } else {
          heroHtml = this.renderManageHeroApprovedAvailable(focus);
        }
        actionsHtml += `<button type="button" class="ab-emp-btn ab-emp-btn-secondary ab-emp-btn-block" data-manage-action="refresh">Atualizar status</button>`;
      } else if (st === "rejeitado" || st === "rejected") {
        heroHtml = this.renderManageHeroRejected(focus);
        actionsHtml = `<button type="button" class="ab-emp-btn ab-emp-btn-block" data-manage-action="nova-simulacao">Fazer nova simulacao</button>`;
      } else {
        heroHtml = `<div class="ab-emp-card"><h2>Sua proposta</h2><p class="ab-emp-muted">Status: ${this.escapeHtml(st || "—")}</p>${this.renderManageDlCore(focus)}</div>`;
        actionsHtml = `<button type="button" class="ab-emp-btn ab-emp-btn-block" data-manage-action="refresh">Atualizar status</button>`;
      }

      const sortedAll = [...(this.state.history || [])].sort((a, b) => {
        const ta = new Date(a && a.dataSolicitacao ? a.dataSolicitacao : 0).getTime();
        const tb = new Date(b && b.dataSolicitacao ? b.dataSolicitacao : 0).getTime();
        return tb - ta;
      });
      const focusId = focus && focus.id;
      const listInner = sortedAll
        .map((row) => this.renderLoanDetailCard(row, { featured: Boolean(focusId && row && row.id === focusId) }))
        .join("");
      const listHtml = `<div class="ab-emp-card ab-emp-manage-list-card"><h3 class="ab-emp-manage-list-title">Suas propostas</h3><div class="ab-emp-manage-list-inner">${listInner}</div></div>`;

      root.innerHTML = `${heroHtml}${extraHtml}${listHtml}<div class="ab-emp-manage-actions">${actionsHtml}</div>`;
      this.applyLoanDeepLinkFromUrl();
    }

    applyLoanDeepLinkFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search || "");
        const loanId = params.get("loanId");
        const cta = (params.get("cta") || "").toLowerCase().replace(/-/g, "_");
        if (!loanId) return;
        if (cta === "pay_insurance" || cta === "payinsurance") {
          void this.payLoanInsurance(loanId);
          return;
        }
        if (cta === "submit_guarantee" || cta === "guarantee") {
          window.alert(
            "Funcionalidade de garantia em preparacao. Entre em contato com o banco ou aguarde novidades no app."
          );
        }
      } catch (_) {
        /* ignore */
      }
    }

    escapeHtml(text) {
      const s = String(text == null ? "" : text);
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    renderManageHeroPending(item) {
      return (
        `<div class="ab-emp-card ab-emp-manage-hero">` +
        `<h2 class="ab-emp-manage-title">Sua proposta esta em analise</h2>` +
        `<p class="ab-emp-manage-lead">Recebemos sua solicitacao de credito. Voce podera acompanhar a atualizacao por aqui.</p>` +
        `${this.renderManageDlPending(item)}` +
        `</div>`
      );
    }

    renderManageDlPending(item) {
      const prazo = Number(item && item.prazoMeses);
      const vs = Number(item && item.valorSolicitado);
      const ins = Boolean(item && item.insuranceSelected);
      const g = String((item && item.guaranteeStatus) || "").toLowerCase();
      let garantiaLinha = "—";
      if (!ins && (g === "pending" || g === "submitted")) {
        garantiaLinha = "Pendente (sem seguro)";
      } else if (ins) {
        garantiaLinha = "Nao aplicavel (com seguro)";
      } else {
        garantiaLinha = this.formatGuaranteeStatusLabel(item);
      }
      const rows = [
        ["Valor solicitado", `R$ ${this.formatMoney(vs)}`],
        ["Parcelas", `${this.formatInteger(prazo)}x`],
        ["Data da solicitacao", this.formatDate(item && item.dataSolicitacao)],
        ["Status", "Pendente"],
        ["Seguro", ins ? "Com seguro" : "Sem seguro"],
        ["Garantia", garantiaLinha]
      ];
      return this.renderDlRows(rows);
    }

    renderManageDlCore(item) {
      const st = this.loanStatusNorm(item);
      const prazo = Number(item && item.prazoMeses);
      const vs = Number(item && item.valorSolicitado);
      const va = Number(item && item.valorAprovado);
      const ins = Boolean(item && item.insuranceSelected);
      const fs = String((item && item.fundsStatus) || "").toLowerCase();
      const rows = [];
      if (st === "aprovado" || st === "approved") {
        rows.push(["Valor aprovado", `R$ ${this.formatMoney(Number.isFinite(va) && va > 0 ? va : vs)}`]);
        if (fs === "bloqueado") {
          const blocked = Number(item && item.blockedAmount);
          rows.push([
            "Saldo bloqueado (credito)",
            `R$ ${this.formatMoney(Number.isFinite(blocked) && blocked > 0 ? blocked : va || vs)}`
          ]);
          rows.push(["Status do valor", "Bloqueado"]);
        } else {
          rows.push(["Status do valor", "Disponivel conforme a proposta"]);
        }
      } else {
        rows.push(["Valor solicitado", `R$ ${this.formatMoney(vs)}`]);
      }
      rows.push(["Parcelas", `${this.formatInteger(prazo)}x`]);
      rows.push(["Data da solicitacao", this.formatDate(item && item.dataSolicitacao)]);
      rows.push(["Seguro", ins ? "Com seguro" : "Sem seguro"]);
      rows.push(["Garantia", this.formatGuaranteeStatusLabel(item)]);
      return this.renderDlRows(rows);
    }

    renderDlRows(rows) {
      return (
        `<dl class="ab-emp-manage-dl">` +
        rows.map(([k, v]) => `<div><dt>${this.escapeHtml(k)}</dt><dd>${this.escapeHtml(v)}</dd></div>`).join("") +
        `</dl>`
      );
    }

    formatGuaranteeStatusLabel(item) {
      const g = String((item && item.guaranteeStatus) || "").toLowerCase();
      const ins = Boolean(item && item.insuranceSelected);
      if (ins) return "Nao exigida (com seguro)";
      if (g === "pending" || g === "submitted") return "Pendente de analise";
      if (g === "approved") return "Aprovada";
      if (g === "rejected") return "Nao aprovada";
      if (g === "not_required") return "Nao exigida";
      return g ? g : "—";
    }

    renderManageHeroApprovedBlocked(item) {
      return (
        `<div class="ab-emp-card ab-emp-manage-hero">` +
        `<h2 class="ab-emp-manage-title">Seu emprestimo foi aprovado</h2>` +
        `<p class="ab-emp-manage-sub">O valor esta bloqueado ate cumprir a condicao de desbloqueio.</p>` +
        `${this.renderManageDlCore(item)}` +
        `</div>`
      );
    }

    renderManageHeroApprovedAvailable(item) {
      return (
        `<div class="ab-emp-card ab-emp-manage-hero ab-emp-manage-hero--success">` +
        `<h2 class="ab-emp-manage-title">Emprestimo aprovado</h2>` +
        `<p class="ab-emp-manage-lead">O valor aprovado esta disponivel conforme as condicoes da sua proposta.</p>` +
        `${this.renderManageDlCore(item)}` +
        `</div>`
      );
    }

    renderManageHeroRejected(item) {
      return (
        `<div class="ab-emp-card ab-emp-manage-hero ab-emp-manage-hero--muted">` +
        `<h2 class="ab-emp-manage-title">Proposta nao aprovada</h2>` +
        `<p class="ab-emp-manage-lead">No momento, sua solicitacao nao foi aprovada. Continue usando sua conta e tente novamente em outro momento.</p>` +
        `${this.renderManageDlRejected(item)}` +
        `</div>`
      );
    }

    renderManageDlRejected(item) {
      const prazo = Number(item && item.prazoMeses);
      const vs = Number(item && item.valorSolicitado);
      const ins = Boolean(item && item.insuranceSelected);
      const rows = [
        ["Valor solicitado", `R$ ${this.formatMoney(vs)}`],
        ["Parcelas", `${this.formatInteger(prazo)}x`],
        ["Data da solicitacao", this.formatDate(item && item.dataSolicitacao)],
        ["Status", "Rejeitado"],
        ["Seguro", ins ? "Com seguro" : "Sem seguro"]
      ];
      return this.renderDlRows(rows);
    }

    shouldShowPayInsuranceCta(item) {
      const st = this.loanStatusNorm(item);
      if (st !== "aprovado" && st !== "approved") return false;
      if (!item || !item.insuranceSelected) return false;
      const fs = String((item.fundsStatus || "").toLowerCase());
      if (fs !== "bloqueado") return false;
      const ich = String((item.insuranceChargeStatus || "").toLowerCase());
      return ich === "pendente";
    }

    shouldShowGuaranteeCta(item) {
      const st = this.loanStatusNorm(item);
      if (st !== "aprovado" && st !== "approved") return false;
      if (!item || item.insuranceSelected) return false;
      const fs = String((item.fundsStatus || "").toLowerCase());
      if (fs !== "bloqueado") return false;
      const g = String((item.guaranteeStatus || "").toLowerCase());
      return g === "pending" || g === "submitted";
    }

    renderManageExtraCards(item) {
      let html = "";
      if (this.shouldShowPayInsuranceCta(item)) {
        html +=
          `<div class="ab-emp-card ab-emp-manage-alert ab-emp-manage-alert--insurance">` +
          `<h3 class="ab-emp-manage-alert-title">Seguro pendente</h3>` +
          `<p class="ab-emp-muted">Quite o seguro de R$ 39,90 para continuar com o desbloqueio, conforme as regras da proposta.</p>` +
          `</div>`;
      }
      if (this.shouldShowGuaranteeCta(item)) {
        html +=
          `<div class="ab-emp-card ab-emp-manage-alert ab-emp-manage-alert--guarantee">` +
          `<h3 class="ab-emp-manage-alert-title">Garantia pendente</h3>` +
          `<p class="ab-emp-muted">Para desbloquear o valor sem seguro, apresente uma garantia valida para analise.</p>` +
          `</div>`;
      }
      return html;
    }

    renderLoanDetailCard(item, opts) {
      const featured = Boolean(opts && opts.featured);
      const vs = Number(item && item.valorSolicitado);
      const va = Number(item && item.valorAprovado);
      const st = this.loanStatusNorm(item);
      const valorExib =
        st === "aprovado" || st === "approved"
          ? Number.isFinite(va) && va > 0
            ? va
            : vs
          : vs;
      const prazo = Number(item && item.prazoMeses);
      const summary = this.formatHistoryStatusSummary(item);
      const classeStatus = this.mapHistoryChipClass(st, item, summary);
      const ins = Boolean(item && item.insuranceSelected);
      const fs = String((item && item.fundsStatus) || "").toLowerCase();
      let fundsLine = "—";
      if (st === "aprovado" || st === "approved") {
        fundsLine = fs === "bloqueado" ? "Credito bloqueado (nao disponivel para uso livre)" : "Disponivel conforme proposta";
      } else if (st === "pendente") {
        fundsLine = "Aguardando analise";
      }
      const payInsuranceBtn =
        this.shouldShowPayInsuranceCta(item) && item.id
          ? `<button type="button" class="ab-emp-history-pay-ins" data-pay-insurance="${String(item.id).replace(/"/g, "")}">Quitar seguro (${INSURANCE_UNIQUE_LABEL})</button>`
          : "";

      const cls = `ab-emp-card ab-emp-history-card${featured ? " ab-emp-history-card--featured" : ""}`;
      return (
        `<article class="${cls}">` +
        `<div class="ab-emp-history-top">` +
        `<strong>R$ ${this.formatMoney(valorExib)}</strong>` +
        `<span class="ab-emp-status ${classeStatus}">${this.escapeHtml(summary.chipLabel)}</span>` +
        `</div>` +
        `<ul class="ab-emp-loan-meta">` +
        `<li><span>Parcelas</span> ${this.formatInteger(prazo)}x</li>` +
        `<li><span>Status</span> ${this.escapeHtml(summary.chipLabel)}</li>` +
        `<li><span>Seguro</span> ${ins ? "Com seguro" : "Sem seguro"}</li>` +
        `<li><span>Garantia</span> ${this.escapeHtml(this.formatGuaranteeStatusLabel(item))}</li>` +
        `<li><span>Valor</span> ${this.escapeHtml(fundsLine)}</li>` +
        `<li><span>Data</span> ${this.escapeHtml(this.formatDate(item && item.dataSolicitacao))}</li>` +
        `</ul>` +
        `${summary.detailLine ? `<p class="ab-emp-muted">${this.escapeHtml(summary.detailLine)}</p>` : ""}` +
        payInsuranceBtn +
        `</article>`
      );
    }

    startNewProposalAfterRejected() {
      if (this.hasPendingLoan(this.state.history)) {
        this.renderFullManagement();
        this.showStep("manage");
        return;
      }
      this.clearInsuranceSelection();
      const limiteMaximo = this.getLimiteMaximo();
      this.elements.valueLimitText.textContent = `Peça ate R$ ${this.formatMoney(limiteMaximo)}`;
      this.applyAmountDigits("");
      this.goToStep("value");
    }

    getLimiteMaximo() {
      const payload = this.state.eligibility || {};
      const limite = Number(payload.limiteMaximo);
      return Number.isFinite(limite) && limite > 0 ? limite : 0;
    }

    onValueBeforeInput(event) {
      const inputType = String(event.inputType || "");
      const data = String(event.data || "");

      if (inputType.startsWith("insert") || inputType.startsWith("delete")) {
        event.preventDefault();
      }

      if (inputType === "deleteContentBackward" || inputType === "deleteContentForward") {
        this.applyAmountDigits(this.state.amountDigits.slice(0, -1));
        return;
      }
      if (inputType === "insertText") {
        if (!/\d/.test(data)) return;
        this.applyAmountDigits(this.state.amountDigits + data.replace(/\D/g, ""));
        return;
      }
      if (inputType === "insertFromPaste") {
        return;
      }
    }

    onValuePaste(event) {
      event.preventDefault();
      const pasted = (event.clipboardData && event.clipboardData.getData("text")) || "";
      this.applyAmountDigits(this.state.amountDigits + String(pasted).replace(/\D/g, ""));
    }

    onValueInput() {
      // Fallback for environments where beforeinput is unavailable.
      const rawText = String(this.elements.valueInput.value || "");
      const digits = rawText.replace(/\D/g, "");
      const normalizedDigits = /R\$\s?/.test(rawText) && digits.length > 2 ? digits.slice(0, -2) : digits;
      this.applyAmountDigits(normalizedDigits);
    }

    handleContinueValue() {
      const value = Number(this.state.draftValue);
      const limiteMaximo = this.getLimiteMaximo();

      if (!Number.isFinite(value) || value <= 0) {
        this.elements.valueError.textContent = "Informe um valor maior que zero para continuar.";
        return;
      }
      if (limiteMaximo > 0 && value > limiteMaximo) {
        this.elements.valueError.textContent = `Valor acima do limite permitido (R$ ${this.formatMoney(limiteMaximo)}).`;
        return;
      }

      this.clearInsuranceSelection();
      this.state.selectedValue = Math.round(value * 100) / 100;
      this.state.selectedPrazo = null;
      this.state.simulation = null;
      this.elements.requestedValueText.textContent = `Valor solicitado: R$ ${this.formatMoney(this.state.selectedValue)}`;
      this.renderPrazoChips();
      this.elements.simulationCard.innerHTML = '<p class="ab-emp-muted">Selecione um prazo para simular na API.</p>';
      this.elements.continueInstallmentsBtn.disabled = true;
      this.goToStep("installments");
    }

    applyAmountDigits(rawDigits) {
      const digitsOnly = String(rawDigits || "").replace(/\D/g, "");
      const normalizedDigits = digitsOnly.replace(/^0+/, "");
      const limiteMaximo = this.getLimiteMaximo();

      let numericValue = Number(normalizedDigits || 0);
      if (!Number.isFinite(numericValue)) numericValue = 0;
      if (limiteMaximo > 0 && numericValue > limiteMaximo) {
        numericValue = Math.trunc(limiteMaximo);
      }

      this.state.amountDigits = String(Math.trunc(numericValue));
      this.state.draftValue = numericValue;
      this.elements.valueInput.value = `R$ ${this.formatMoney(numericValue)}`;
      this.elements.valueBig.textContent = `R$ ${this.formatMoney(numericValue)}`;
      this.elements.valueError.textContent = "";
    }

    setFooterActive(activeKey) {
      const mapping = {
        inicio: this.elements.navInicioBtn,
        emprestimos: this.elements.navEmprestimosBtn
      };
      Object.keys(mapping).forEach((key) => {
        const btn = mapping[key];
        if (btn) btn.classList.toggle("is-active", key === activeKey);
      });
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
      if (choice === "sem") {
        this.state.insuranceTermsAccepted = false;
        if (this.elements.insuranceTermsCheck) {
          this.elements.insuranceTermsCheck.checked = false;
        }
      }
      this.elements.insuranceOptions.forEach((btn) => {
        btn.classList.toggle("is-selected", btn.dataset.insurance === choice);
      });
      this.updateInsuranceTermsVisibility();
      this.syncInsuranceCta();
    }

    onInsuranceTermsChange() {
      this.state.insuranceTermsAccepted = Boolean(
        this.elements.insuranceTermsCheck && this.elements.insuranceTermsCheck.checked
      );
      this.syncInsuranceCta();
    }

    updateInsuranceTermsVisibility() {
      const wrap = this.elements.insuranceTermsWrap;
      if (!wrap) return;
      wrap.hidden = this.state.insuranceChoice !== "com";
    }

    syncInsuranceCta() {
      const btn = this.elements.continueInsuranceBtn;
      if (!btn) return;
      if (!this.state.insuranceChoice) {
        btn.disabled = true;
        btn.textContent = "Escolha uma opção";
        return;
      }
      if (this.state.insuranceChoice === "com" && !this.state.insuranceTermsAccepted) {
        btn.disabled = true;
        btn.textContent = "Aceite os termos do seguro para continuar";
        return;
      }
      btn.disabled = false;
      btn.textContent = "Revisar detalhes da proposta";
    }

    clearInsuranceSelection() {
      this.state.insuranceChoice = null;
      this.state.insuranceTermsAccepted = false;
      if (this.elements.insuranceTermsCheck) {
        this.elements.insuranceTermsCheck.checked = false;
      }
      this.elements.insuranceOptions.forEach((btn) => btn.classList.remove("is-selected"));
      this.updateInsuranceTermsVisibility();
      this.syncInsuranceCta();
    }

    updateFooterVisibility(step) {
      const footer = this.elements.footer;
      const shell = this.elements.shell;
      const showFooter =
        step === "loading" ||
        step === "blocked" ||
        step === "kyc" ||
        step === "history" ||
        step === "manage";
      if (footer) {
        footer.hidden = !showFooter;
      }
      if (shell) {
        shell.classList.toggle("ab-emp-shell--no-footer", !showFooter);
      }
    }

    handleContinueInsurance() {
      if (!this.state.insuranceChoice) {
        this.elements.insuranceError.textContent = "Escolha uma opcao para continuar.";
        return;
      }
      if (this.state.insuranceChoice === "com" && !this.state.insuranceTermsAccepted) {
        this.elements.insuranceError.textContent = "Aceite os termos do seguro para continuar.";
        return;
      }
      this.elements.insuranceError.textContent = "";
      this.renderReview();
      this.goToStep("review");
    }

    renderReview() {
      const sim = this.state.simulation || {};
      const prazo = Number(sim.prazoMeses || this.state.selectedPrazo || 0);
      const parcela = Number(sim.valorParcela || 0);
      const total = this.resolveSimulationTotal(sim, parcela, prazo);

      const seguroRow =
        this.state.insuranceChoice === "com"
          ? ["Seguro", `Com seguro — ${INSURANCE_UNIQUE_LABEL}`]
          : ["Seguro", "Sem seguro"];

      const fields = [
        ["Voce solicita", `R$ ${this.formatMoney(this.state.selectedValue)}`],
        ["Parcelas", `${this.formatInteger(prazo)}x de R$ ${this.formatMoney(parcela)}`],
        ["Total estimado", `R$ ${this.formatMoney(total)}`],
        ["Taxa de juros", this.formatPercent(sim.taxaJuros)],
        seguroRow,
        this.state.insuranceChoice === "com"
          ? ["Termos aceitos", "Sim"]
          : ["Desbloqueio", "Mediante garantia aprovada"]
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
        const insuranceSelected = this.state.insuranceChoice === "com";
        const createResult = await this.requestLoan("loans", {
          method: "POST",
          body: JSON.stringify({
            valorSolicitado: this.state.selectedValue,
            prazoMeses: this.state.selectedPrazo,
            insuranceSelected,
            insuranceTermsAccepted: insuranceSelected ? Boolean(this.state.insuranceTermsAccepted) : false
          })
        });

        if (!createResult.ok) {
          await this.handleKnownError(createResult.error);
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

      const sorted = [...list].sort((a, b) => {
        const ta = new Date(a && a.dataSolicitacao ? a.dataSolicitacao : 0).getTime();
        const tb = new Date(b && b.dataSolicitacao ? b.dataSolicitacao : 0).getTime();
        return tb - ta;
      });
      const focus = this.pickFocusLoan(list);
      const focusId = focus && focus.id;
      this.elements.historyCards.innerHTML = sorted
        .map((item) => this.renderLoanDetailCard(item, { featured: Boolean(focusId && item && item.id === focusId) }))
        .join("");
    }

    formatHistoryStatusSummary(item) {
      const st = String((item && item.status) || "pendente").toLowerCase();
      if (st === "pendente") {
        return { chipLabel: "Pendente", detailLine: "", showPayInsurance: false };
      }
      if (st === "rejeitado") {
        return { chipLabel: "Rejeitado", detailLine: "", showPayInsurance: false };
      }
      const ins = Boolean(item && item.insuranceSelected);
      const fs = String((item && item.fundsStatus) || "").toLowerCase();
      const g = String((item && item.guaranteeStatus) || "").toLowerCase();
      const ich = String((item && item.insuranceChargeStatus) || "").toLowerCase();

      if (st === "aprovado" && ins && ich === "pendente" && fs === "bloqueado") {
        return {
          chipLabel: "Aprovado — valor bloqueado",
          detailLine:
            "Credito bloqueado ate quitar o seguro. O saldo disponivel so aumenta apos o pagamento da taxa e liberacao pelo banco.",
          showPayInsurance: true
        };
      }
      if (st === "aprovado" && ins && fs === "disponivel") {
        return {
          chipLabel: "Aprovado — valor disponivel",
          detailLine: "",
          showPayInsurance: false
        };
      }
      if (st === "aprovado" && !ins && g === "pending" && fs === "bloqueado") {
        return {
          chipLabel: "Garantia pendente",
          detailLine: "Valor bloqueado ate apresentacao/aprovacao de garantia.",
          showPayInsurance: false
        };
      }
      if (st === "aprovado" && !ins && g === "approved" && fs === "disponivel") {
        return {
          chipLabel: "Aprovado — valor disponivel",
          detailLine: "",
          showPayInsurance: false
        };
      }
      if (st === "aprovado") {
        return {
          chipLabel: "Aprovado",
          detailLine: fs === "bloqueado" ? "Valor bloqueado conforme regras da proposta." : "",
          showPayInsurance: false
        };
      }
      return { chipLabel: st || "—", detailLine: "", showPayInsurance: false };
    }

    async payLoanInsurance(loanId) {
      if (typeof window.containerGerarBoletoPix === "function") {
        window.containerGerarBoletoPix();
        return;
      }
      try {
        sessionStorage.setItem("agilbank_modulos_target", "pagar");
      } catch (e) {
        // Ignore storage access issues.
      }
      window.location.href = "./index.html";
    }

    mapHistoryChipClass(status, item, summary) {
      if (status === "rejeitado" || status === "rejected") return "is-rejected";
      if (status === "pendente") return "is-pending";
      if (status === "aprovado" || status === "approved") {
        const fs = String((item && item.fundsStatus) || "").toLowerCase();
        if (fs === "bloqueado" || summary.chipLabel.includes("bloqueado") || summary.chipLabel.includes("Garantia pendente")) {
          return "is-pending";
        }
        return "is-approved";
      }
      return "is-pending";
    }

    mapStatusClass(status) {
      if (status === "aprovado" || status === "approved") return "is-approved";
      if (status === "rejeitado" || status === "rejected") return "is-rejected";
      return "is-pending";
    }

    handleBack() {
      const step = this.state.currentStep;
      if (step === "manage") {
        this.redirectToHome();
        return;
      }
      if (step === "value" || step === "blocked" || step === "loading" || step === "kyc") {
        this.redirectToHome();
        return;
      }
      if (step === "installments") {
        this.clearInsuranceSelection();
        this.goToStep("value");
      } else if (step === "insurance") {
        this.clearInsuranceSelection();
        this.goToStep("installments");
      }
      else if (step === "review") this.goToStep("insurance");
      else if (step === "submitted") this.goToStep("history");
      else if (step === "history") {
        this.clearInsuranceSelection();
        this.goToStep("value");
      }
      else this.redirectToHome();
    }

    goToStep(step) {
      if (step === "value" && !this.state.kycApproved && this.state.kycPayload) {
        this.applyKycGateUi(this.state.kycPayload);
        this.showStep("kyc");
        return;
      }
      if (step === "value" && !this.state.isEligible) {
        this.showStep("blocked");
        return;
      }
      if (step === "value" && this.hasPendingLoan(this.state.history)) {
        this.renderFullManagement();
        this.showStep("manage");
        return;
      }
      this.showStep(step);
    }

    showStep(step) {
      const map = {
        loading: this.elements.stepLoading,
        manage: this.elements.stepManage,
        blocked: this.elements.stepBlocked,
        kyc: this.elements.stepKyc,
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
      if (step === "history") {
        this.elements.topbarTitle.textContent = "Historico de propostas";
      } else if (step === "manage") {
        this.elements.topbarTitle.textContent = "Seu credito";
      } else if (step === "kyc") {
        this.elements.topbarTitle.textContent = "Verificação";
      } else {
        this.elements.topbarTitle.textContent = "Credito pessoal";
      }
      this.updateFooterVisibility(step);
      if (step === "insurance") {
        this.updateInsuranceTermsVisibility();
        this.syncInsuranceCta();
      }
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

    async handleKnownError(error) {
      const kind = (error && error.kind) || "internal";
      const message = this.errorToText(error);
      if (kind === "loan-pending-conflict") {
        await this.refreshLoansAndShowManage();
        return;
      }
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
      if (kind === "loan-pending-conflict") {
        return detail;
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
        if (this.isLoanPendingConflict(body)) {
          return {
            kind: "loan-pending-conflict",
            detail: "Voce ja possui uma proposta em analise. Acompanhe pelo painel."
          };
        }
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

    isLoanPendingConflict(body) {
      if (!body || typeof body !== "object") return false;
      const code = body.code || body.error;
      if (code === "LOAN_PENDING") return true;
      const msg = String(body.message || body.error || "").toLowerCase();
      if (msg.includes("loan_pending")) return true;
      if (msg.includes("empréstimo pendente") || msg.includes("emprestimo pendente")) return true;
      if (msg.includes("já possui") && msg.includes("pendente")) return true;
      if (msg.includes("ja possui") && msg.includes("pendente")) return true;
      return false;
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
  }

  document.addEventListener("DOMContentLoaded", () => {
    const module = new EmprestimosModule(document);
    module.init().catch(() => {
      module.setErrorState("Falha inesperada ao iniciar o modulo de emprestimos.", { showRetry: true });
    });
  });
})();
