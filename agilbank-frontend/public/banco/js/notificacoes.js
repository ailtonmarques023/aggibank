(() => {
  "use strict";

  const HOME_PATH = "./index.html";
  const EMPRESTIMOS_PATH = "./emprestimos.html";
  const TOKEN_KEYS = ["agilbank_token", "govbr_token", "token"];

  function getToken() {
    for (let i = 0; i < TOKEN_KEYS.length; i += 1) {
      const k = TOKEN_KEYS[i];
      const s = window.sessionStorage.getItem(k);
      if (s) return s;
      const l = window.localStorage.getItem(k);
      if (l) return l;
    }
    return null;
  }

  function apiBase() {
    if (typeof window.getAgilbankApiBase === "function") {
      return String(window.getAgilbankApiBase() || "").replace(/\/$/, "");
    }
    return "";
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function iconForType(type) {
    const t = String(type || "").toLowerCase();
    if (t.indexOf("loan") !== -1) return "💰";
    if (t.indexOf("card") !== -1) return "💳";
    return "📌";
  }

  function ctaForNotification(n) {
    const meta = n.metadata && typeof n.metadata === "object" ? n.metadata : {};
    const action = meta.action;
    const loanId = meta.loanId ? String(meta.loanId) : "";

    if (action === "pay_insurance" && loanId) {
      return {
        label: "Quitar seguro",
        muted: false,
        run: () => {
          window.location.assign(`${EMPRESTIMOS_PATH}?loanId=${encodeURIComponent(loanId)}&cta=pay_insurance`);
        },
      };
    }

    if (action === "submit_guarantee") {
      return {
        label: "Apresentar garantia",
        muted: false,
        run: () => {
          window.alert(
            "Funcionalidade de garantia em preparação. Use a área de empréstimos para acompanhar sua proposta."
          );
          window.location.assign(
            loanId
              ? `${EMPRESTIMOS_PATH}?loanId=${encodeURIComponent(loanId)}&cta=submit_guarantee`
              : EMPRESTIMOS_PATH
          );
        },
      };
    }

    if (action === "view_card") {
      return {
        label: "Ver cartão",
        muted: false,
        run: () => {
          try {
            window.sessionStorage.setItem("agilbank_open_cards", "1");
          } catch (e) {
            /* ignore storage errors */
          }
          window.location.assign(HOME_PATH);
        },
      };
    }

    return null;
  }

  class NotificacoesModule {
    constructor() {
      this.token = getToken();
      this.els = {
        back: document.getElementById("abNotifBackBtn"),
        readAll: document.getElementById("abNotifReadAllBtn"),
        retry: document.getElementById("abNotifRetryBtn"),
        loading: document.getElementById("abNotifStateLoading"),
        error: document.getElementById("abNotifStateError"),
        empty: document.getElementById("abNotifStateEmpty"),
        list: document.getElementById("abNotifList"),
        pill: document.getElementById("abNotifPill"),
      };
    }

    bind() {
      if (this.els.back) {
        this.els.back.addEventListener("click", () => {
          window.location.assign(HOME_PATH);
        });
      }
      if (this.els.readAll) {
        this.els.readAll.addEventListener("click", () => void this.markAllRead());
      }
      if (this.els.retry) {
        this.els.retry.addEventListener("click", () => void this.load());
      }
    }

    setView(state) {
      const map = { loading: this.els.loading, error: this.els.error, empty: this.els.empty, list: this.els.list };
      Object.keys(map).forEach((k) => {
        const el = map[k];
        if (el) el.hidden = k !== state;
      });
    }

    async fetchJson(path, options) {
      const base = apiBase();
      if (!base) throw new Error("API base indisponível");
      const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
      const headers = Object.assign(
        { Accept: "application/json" },
        options && options.headers ? options.headers : {}
      );
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const res = await fetch(url, Object.assign({}, options, { headers }));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.message || res.statusText || "Erro na requisição");
        err.code = body.code;
        err.status = res.status;
        throw err;
      }
      return body;
    }

    renderList(items) {
      const ul = this.els.list;
      if (!ul) return;
      ul.innerHTML = "";
      items.forEach((n) => {
        const li = document.createElement("li");
        const unread = n.status === "unread";
        li.className = "ab-notif-card" + (unread ? " ab-notif-card--unread" : "");

        const cta = ctaForNotification(n);

        const head = document.createElement("div");
        head.className = "ab-notif-card-head";
        const ic = document.createElement("div");
        ic.className = "ab-notif-icon";
        ic.setAttribute("aria-hidden", "true");
        ic.textContent = iconForType(n.type);
        const titleRow = document.createElement("div");
        titleRow.className = "ab-notif-card-title-row";
        const h2 = document.createElement("h2");
        h2.className = "ab-notif-card-title";
        h2.appendChild(document.createTextNode(n.title || "Aviso"));
        if (unread) {
          const badge = document.createElement("span");
          badge.className = "ab-notif-badge-novo";
          badge.textContent = "Novo";
          h2.appendChild(badge);
        }
        const timeEl = document.createElement("div");
        timeEl.className = "ab-notif-time";
        timeEl.textContent = formatTime(n.createdAt);
        titleRow.appendChild(h2);
        titleRow.appendChild(timeEl);
        head.appendChild(ic);
        head.appendChild(titleRow);
        li.appendChild(head);

        const msg = document.createElement("p");
        msg.className = "ab-notif-message";
        msg.textContent = n.message || "";
        li.appendChild(msg);

        if (cta) {
          const wrap = document.createElement("div");
          wrap.className = "ab-notif-cta";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = cta.label;
          if (cta.muted) btn.classList.add("ab-notif-cta--muted");
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            void this.markReadIfNeeded(n.id, unread).then(() => cta.run());
          });
          wrap.appendChild(btn);
          li.appendChild(wrap);
        } else if (unread && n.id) {
          li.style.cursor = "pointer";
          li.addEventListener("click", () => void this.markReadIfNeeded(n.id, true));
        }

        ul.appendChild(li);
      });
    }

    async markReadIfNeeded(id, unread) {
      if (!id || !unread || !this.token) return;
      try {
        await this.fetchJson(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
      } catch (e) {
        console.warn("Falha ao marcar notificação como lida:", e);
      }
    }

    async markAllRead() {
      if (!this.token) return;
      try {
        await this.fetchJson("/notifications/read-all", { method: "POST" });
        await this.load();
      } catch (e) {
        console.warn(e);
        window.alert("Não foi possível marcar todas como lidas.");
      }
    }

    async load() {
      if (!this.token) {
        window.location.assign("../index.html");
        return;
      }

      this.setView("loading");
      try {
        const data = await this.fetchJson("/notifications?limit=50");
        const items = (data.data && data.data.notifications) || [];
        const unread = (data.data && data.data.unreadCount) || 0;
        if (this.els.pill) {
          if (unread > 0) {
            this.els.pill.textContent = String(unread) + " não lidas";
            this.els.pill.hidden = false;
          } else {
            this.els.pill.hidden = true;
          }
        }
        if (!items.length) {
          this.setView("empty");
          return;
        }
        this.renderList(items);
        this.setView("list");
      } catch (e) {
        console.error(e);
        this.setView("error");
      }
    }

    async init() {
      this.bind();
      await this.load();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const m = new NotificacoesModule();
    m.init().catch((err) => {
      console.error(err);
      const errEl = document.getElementById("abNotifStateError");
      const loadEl = document.getElementById("abNotifStateLoading");
      if (loadEl) loadEl.hidden = true;
      if (errEl) errEl.hidden = false;
    });
  });
})();
