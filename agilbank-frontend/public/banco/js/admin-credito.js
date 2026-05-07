(() => {
  'use strict';

  const REQUEST_TIMEOUT_MS = 20000;
  const TOKEN_KEYS = ['agilbank_token', 'govbr_token', 'token'];

  function getApiBase() {
    if (typeof window.getAgilbankApiBase === 'function') {
      return window.getAgilbankApiBase();
    }
    return null;
  }

  function getToken() {
    for (let i = 0; i < TOKEN_KEYS.length; i += 1) {
      const k = TOKEN_KEYS[i];
      const v = window.sessionStorage.getItem(k) || window.localStorage.getItem(k);
      if (v) return v;
    }
    return null;
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('pt-BR');
  }

  class AdminCreditoPanel {
    constructor() {
      this.apiBase = getApiBase();
      this.token = getToken();
      this.selectedId = null;
      this.processing = false;
      this.pendingConfirm = null;
      this.elements = {
        app: document.getElementById('abAcApp'),
        pill: document.getElementById('abAcStatePill'),
        error: document.getElementById('abAcError'),
        list: document.getElementById('abAcList'),
        listEmpty: document.getElementById('abAcListEmpty'),
        detailSection: document.getElementById('abAcDetailSection'),
        detail: document.getElementById('abAcDetail'),
        detailActions: document.getElementById('abAcDetailActions'),
        refreshBtn: document.getElementById('abAcRefreshBtn'),
        modal: document.getElementById('abAcModal'),
        modalText: document.getElementById('abAcModalText'),
        modalTitle: document.getElementById('abAcModalTitle'),
        modalCancel: document.getElementById('abAcModalCancel'),
        modalConfirm: document.getElementById('abAcModalConfirm'),
      };
    }

    setState(pill, message) {
      this.elements.pill.textContent = pill;
      this.appClass(pill);
    }

    appClass(state) {
      const base = 'ab-ac-app';
      this.elements.app.className = `${base} ab-ac-state-${state}`;
    }

    showError(msg) {
      this.elements.error.textContent = msg;
      this.elements.error.classList.remove('ab-ac-hidden');
    }

    hideError() {
      this.elements.error.classList.add('ab-ac-hidden');
      this.elements.error.textContent = '';
    }

    async request(path, options = {}) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url = `${this.apiBase.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
        const headers = Object.assign(
          {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
          },
          options.headers || {},
        );
        const res = await fetch(url, Object.assign({}, options, { headers, signal: controller.signal }));
        const text = await res.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = { raw: text };
        }
        clearTimeout(t);
        return { ok: res.ok, status: res.status, body };
      } catch (e) {
        clearTimeout(t);
        if (e && e.name === 'AbortError') {
          return { ok: false, status: 0, body: { message: 'Tempo esgotado ou conexão interrompida.' } };
        }
        return { ok: false, status: 0, body: { message: e && e.message ? e.message : 'Erro de rede.' } };
      }
    }

    mapError(r) {
      const code = r.body && r.body.code;
      const msg = (r.body && r.body.message) || 'Falha na operação.';
      if (r.status === 401) {
        if (code === 'TOKEN_REQUIRED' || code === 'INVALID_TOKEN') return `${msg} Faça login com conta de operador.`;
        return msg;
      }
      if (r.status === 403) {
        if (code === 'ADMIN_ACCESS_DENIED') {
          return 'Acesso negado: seu usuário não está autorizado para este painel.';
        }
        if (code === 'ACCOUNT_NOT_VERIFIED') {
          return 'Conta não verificada. Verifique o e-mail antes de usar o painel.';
        }
        return msg;
      }
      if (r.status === 503 && code === 'INTERNAL_OPERATION_UNAVAILABLE') {
        return 'Painel indisponível no servidor (configuração incompleta). Contate a operação.';
      }
      return msg + (code ? ` (${code})` : '');
    }

    async init() {
      if (!this.apiBase) {
        this.setState('erro', 'Configuração');
        this.showError('Base da API não configurada.');
        return;
      }
      if (!this.token) {
        this.setState('erro', 'Sessão');
        this.showError('Nenhuma sessão encontrada. Abra o login do banco, autentique com o usuário operador e volte a esta página.');
        return;
      }

      this.elements.refreshBtn.addEventListener('click', () => this.loadList());
      this.elements.modalCancel.addEventListener('click', () => this.closeModal());
      this.elements.modalConfirm.addEventListener('click', () => this.runConfirmedAction());
      this.elements.modal.addEventListener('click', (e) => {
        if (e.target === this.elements.modal) this.closeModal();
      });

      await this.loadList();
    }

    async loadList() {
      this.hideError();
      this.setState('carregando', 'Lista');
      this.elements.refreshBtn.disabled = true;
      const r = await this.request('internal/credit/loans?status=pendente', { method: 'GET' });
      this.elements.refreshBtn.disabled = false;
      if (!r.ok) {
        this.setState('erro', 'Lista');
        this.showError(this.mapError(r));
        this.renderList([]);
        return;
      }
      const loans = (r.body && r.body.data && r.body.data.loans) || [];
      this.renderList(loans);
      this.setState('pronto', 'Lista');
      if (this.selectedId && !loans.some((x) => x.id === this.selectedId)) {
        this.selectedId = null;
        this.hideDetail();
      }
    }

    renderList(loans) {
      const ul = this.elements.list;
      ul.innerHTML = '';
      if (!loans.length) {
        this.elements.listEmpty.classList.remove('ab-ac-hidden');
        return;
      }
      this.elements.listEmpty.classList.add('ab-ac-hidden');
      loans.forEach((loan) => {
        const li = document.createElement('li');
        li.className = 'ab-ac-list-item';
        if (loan.id === this.selectedId) li.classList.add('is-active');
        const br = loan.borrower || {};
        li.textContent = `${loan.id.slice(0, 8)}… · ${formatMoney(loan.valorSolicitado)} · ${br.nomeCompleto || '—'}`;
        li.addEventListener('click', () => {
          this.selectedId = loan.id;
          void this.openDetail(loan.id);
          Array.from(ul.querySelectorAll('.ab-ac-list-item')).forEach((el) => el.classList.remove('is-active'));
          li.classList.add('is-active');
        });
        ul.appendChild(li);
      });
    }

    hideDetail() {
      this.elements.detailSection.classList.add('ab-ac-hidden');
      this.elements.detail.innerHTML = '';
      this.elements.detailActions.innerHTML = '';
    }

    async openDetail(loanId) {
      this.hideError();
      this.setState('carregando', 'Detalhe');
      const r = await this.request(`internal/credit/loans/${encodeURIComponent(loanId)}`, { method: 'GET' });
      if (!r.ok) {
        this.setState('erro', 'Detalhe');
        this.showError(this.mapError(r));
        return;
      }
      const loan = r.body && r.body.data && r.body.data.loan;
      if (!loan) {
        this.setState('erro', 'Detalhe');
        this.showError('Resposta inválida da API.');
        return;
      }
      this.renderDetail(loan);
      this.setState('pronto', 'Detalhe');
    }

    renderDetail(loan) {
      const br = loan.borrower || {};
      const lines = [
        ['ID', loan.id],
        ['Status', loan.status],
        ['Valor solicitado', formatMoney(loan.valorSolicitado)],
        ['Prazo (meses)', String(loan.prazoMeses)],
        ['Taxa juros (mês)', loan.taxaJuros != null ? String(loan.taxaJuros) + '%' : '—'],
        ['Parcela', loan.valorParcela != null ? formatMoney(loan.valorParcela) : '—'],
        ['Solicitação', formatDate(loan.dataSolicitacao)],
        ['Titular', br.nomeCompleto || '—'],
        ['E-mail titular', br.email || '—'],
        ['UserId', loan.userId || '—'],
      ];
      this.elements.detail.innerHTML = '';
      lines.forEach(([k, v]) => {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${k}:</strong> ${v}`;
        this.elements.detail.appendChild(div);
      });

      const actions = this.elements.detailActions;
      actions.innerHTML = '';
      if (loan.status !== 'pendente') {
        const p = document.createElement('p');
        p.className = 'ab-ac-note';
        p.textContent = 'Esta proposta já foi decidida. Não há ações disponíveis.';
        actions.appendChild(p);
        this.elements.detailSection.classList.remove('ab-ac-hidden');
        return;
      }

      const btnAp = document.createElement('button');
      btnAp.type = 'button';
      btnAp.className = 'ab-ac-btn';
      btnAp.textContent = 'Aprovar (credita titular)';
      btnAp.addEventListener('click', () => this.confirmApprove(loan));

      const btnRj = document.createElement('button');
      btnRj.type = 'button';
      btnRj.className = 'ab-ac-btn ab-ac-btn-danger';
      btnRj.textContent = 'Rejeitar';
      btnRj.addEventListener('click', () => this.confirmReject(loan));

      actions.appendChild(btnAp);
      actions.appendChild(btnRj);
      this.elements.detailSection.classList.remove('ab-ac-hidden');
    }

    confirmApprove(loan) {
      this.pendingConfirm = {
        type: 'approve',
        loanId: loan.id,
        valorAprovado: Number(loan.valorSolicitado),
      };
      this.elements.modalTitle.textContent = 'Confirmar aprovação';
      this.elements.modalText.textContent =
        'A aprovação credita o valor na conta do titular de forma definitiva. Confirme apenas se a análise interna estiver concluída.';
      this.openModal();
    }

    confirmReject(loan) {
      this.pendingConfirm = { type: 'reject', loanId: loan.id };
      this.elements.modalTitle.textContent = 'Confirmar rejeição';
      this.elements.modalText.textContent =
        'A proposta será marcada como rejeitada. Não há crédito ao titular. Deseja continuar?';
      this.openModal();
    }

    openModal() {
      this.elements.modal.classList.remove('ab-ac-hidden');
      this.elements.modal.setAttribute('aria-hidden', 'false');
    }

    closeModal() {
      this.pendingConfirm = null;
      this.elements.modal.classList.add('ab-ac-hidden');
      this.elements.modal.setAttribute('aria-hidden', 'true');
    }

    async runConfirmedAction() {
      if (!this.pendingConfirm || this.processing) return;
      const { type, loanId, valorAprovado } = this.pendingConfirm;
      this.processing = true;
      this.elements.modalConfirm.disabled = true;
      this.closeModal();

      let r;
      if (type === 'approve') {
        r = await this.request(`internal/credit/loans/${encodeURIComponent(loanId)}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valorAprovado }),
        });
      } else {
        r = await this.request(`internal/credit/loans/${encodeURIComponent(loanId)}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      }

      this.processing = false;
      this.elements.modalConfirm.disabled = false;

      if (!r.ok) {
        this.showError(this.mapError(r));
        return;
      }
      this.hideError();
      await this.loadList();
      if (loanId === this.selectedId) {
        await this.openDetail(loanId);
      }
    }
  }

  const panel = new AdminCreditoPanel();
  document.addEventListener('DOMContentLoaded', () => {
    void panel.init();
  });
})();
