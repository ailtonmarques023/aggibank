/**
 * Fatia 8.2 — Gate de identidade em fluxos sensíveis (cartão / empréstimo).
 * GET /api/me/kyc-status real (sem mock). Strip fixo na home removido — só modal ao bloquear.
 */
(function initKycJourneyGate(window, document) {
    'use strict';

    var VERIFY_HREF = '/verificacao-identidade';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getBearerToken() {
        try {
            if (window.AgilBank && window.AgilBank.auth && typeof window.AgilBank.auth.getToken === 'function') {
                var t = window.AgilBank.auth.getToken();
                if (t) return t;
            }
        } catch (e) {
            /* ignore */
        }
        return (
            sessionStorage.getItem('govbr_token') ||
            localStorage.getItem('govbr_token') ||
            sessionStorage.getItem('agilbank_token') ||
            localStorage.getItem('agilbank_token') ||
            null
        );
    }

    var SECONDARY_LABEL = 'Agora não';

    /** Blocos solicitados quando o usuário tenta fluxo sensível sem APPROVED. */
    var UX_CARD_TITLE = 'Confirme sua identidade para pedir seu cartão';
    var UX_CARD_INTRO =
        'Para sua segurança, precisamos validar seu documento e uma selfie antes de seguir.';
    var UX_LOAN_TITLE = 'Confirme sua identidade para solicitar empréstimo';
    var UX_LOAN_INTRO = 'Essa etapa protege sua conta e evita uso indevido dos seus dados.';

    /**
     * @param {'loan'|'card'} product
     * @param {string} identityStatus
     * @param {{ message?: string }=} data
     */
    function buildCopy(product, identityStatus, data) {
        var st = String(identityStatus || '').toUpperCase();
        var apiHint =
            data && typeof data.message === 'string' && data.message.trim() ? data.message.trim() : '';

        if (st === 'APPROVED') {
            return {
                title: 'Identidade confirmada',
                intro: '',
                detail: '',
                primaryLabel: 'Continuar',
                secondaryLabel: SECONDARY_LABEL,
                mode: 'ok',
            };
        }

        if (!st || st === 'NOT_STARTED') {
            return {
                title: product === 'card' ? UX_CARD_TITLE : UX_LOAN_TITLE,
                intro: product === 'card' ? UX_CARD_INTRO : UX_LOAN_INTRO,
                detail: '',
                primaryLabel: 'Verificar agora',
                secondaryLabel: SECONDARY_LABEL,
                mode: 'verify',
            };
        }

        if (st === 'DRAFT' || st === 'PENDING_UPLOADS') {
            var contIntro =
                product === 'card'
                    ? 'Continue enviando documento e selfie para concluir o pedido do cartão.'
                    : 'Continue enviando documento e selfie para concluir sua solicitação.';
            return {
                title: 'Continue sua verificação',
                intro: contIntro,
                detail: 'Envie ou confirme os arquivos pendentes. Você pode retomar de onde parou.',
                primaryLabel: 'Continuar verificação',
                secondaryLabel: SECONDARY_LABEL,
                mode: 'continue',
            };
        }

        if (st === 'READY_FOR_REVIEW' || st === 'UNDER_MANUAL_REVIEW') {
            return {
                title: 'Identidade em análise',
                intro: 'Sua identidade está em análise.',
                detail:
                    'Assim que a análise for concluída, você poderá seguir com esta solicitação. Obrigado pela paciência.',
                primaryLabel: 'Aguardar análise',
                secondaryLabel: SECONDARY_LABEL,
                mode: 'wait',
            };
        }

        if (st === 'RESUBMISSION_REQUIRED') {
            return {
                title: 'Reenvio necessário',
                intro:
                    product === 'card'
                        ? 'Precisamos de novos envios antes de liberar seu cartão.'
                        : 'Precisamos de novos envios antes de liberar sua solicitação.',
                detail:
                    'Reenvie seus documentos conforme as orientações da sua última interação.',
                primaryLabel: 'Reenviar documentos',
                secondaryLabel: SECONDARY_LABEL,
                mode: 'resubmit',
            };
        }

        if (st === 'REJECTED') {
            return {
                title: 'Verificação não aprovada',
                intro:
                    'Não foi possível aprovar sua identidade neste momento. Você pode revisar os detalhes no fluxo de verificação ou falar com o suporte.',
                detail: apiHint ? apiHint : '',
                primaryLabel: 'Ver detalhes',
                secondaryLabel: SECONDARY_LABEL,
                mode: 'rejected',
            };
        }

        return {
            title: product === 'card' ? UX_CARD_TITLE : UX_LOAN_TITLE,
            intro: product === 'card' ? UX_CARD_INTRO : UX_LOAN_INTRO,
            detail: apiHint || 'Consulte o status da sua verificação para continuar.',
            primaryLabel: 'Verificar agora',
            secondaryLabel: SECONDARY_LABEL,
            mode: 'unknown',
        };
    }

    function removeOverlay() {
        var el = document.getElementById('agilbank-kyc-gate-overlay');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /**
     * @param {'loan'|'card'} product
     * @param {string} identityStatus
     * @param {object=} data payload GET /me/kyc-status (campo data)
     */
    function showBlockedModal(product, identityStatus, data) {
        var copy = buildCopy(product, identityStatus, data || {});
        removeOverlay();

        var overlay = document.createElement('div');
        overlay.id = 'agilbank-kyc-gate-overlay';
        overlay.className = 'agilbank-kyc-gate-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'agilbank-kyc-gate-title');

        var card = document.createElement('div');
        card.className = 'agilbank-kyc-gate-card';

        var primaryIsLink = copy.mode !== 'wait';
        var primaryHref = primaryIsLink ? VERIFY_HREF : '#';

        var titleEl = document.createElement('h2');
        titleEl.id = 'agilbank-kyc-gate-title';
        titleEl.className = 'agilbank-kyc-gate-title';
        titleEl.textContent = copy.title;

        card.appendChild(titleEl);

        if (copy.intro) {
            var lead = document.createElement('p');
            lead.className = 'agilbank-kyc-gate-lead';
            lead.textContent = copy.intro;
            card.appendChild(lead);
        }

        if (copy.detail) {
            var det = document.createElement('p');
            det.className = 'agilbank-kyc-gate-detail';
            det.textContent = copy.detail;
            card.appendChild(det);
        }

        var actions = document.createElement('div');
        actions.className = 'agilbank-kyc-gate-actions';

        var primaryBtn = primaryIsLink ? document.createElement('a') : document.createElement('button');
        primaryBtn.id = 'agilbank-kyc-gate-primary';
        primaryBtn.className = 'agilbank-kyc-gate-btn agilbank-kyc-gate-btn--primary';
        primaryBtn.textContent = copy.primaryLabel;
        if (primaryIsLink) {
            primaryBtn.setAttribute('href', primaryHref);
        } else {
            primaryBtn.type = 'button';
            primaryBtn.classList.add('is-disabled-wait');
            primaryBtn.setAttribute('aria-disabled', 'true');
        }

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = 'agilbank-kyc-gate-close';
        closeBtn.className = 'agilbank-kyc-gate-btn agilbank-kyc-gate-btn--secondary';
        closeBtn.textContent = copy.secondaryLabel || SECONDARY_LABEL;

        actions.appendChild(primaryBtn);
        actions.appendChild(closeBtn);
        card.appendChild(actions);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        if (copy.mode === 'wait' && primaryBtn) {
            primaryBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
            });
        }

        function close() {
            removeOverlay();
        }

        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) close();
        });

        document.addEventListener(
            'keydown',
            function escClose(ev) {
                if (ev.key === 'Escape') {
                    close();
                    document.removeEventListener('keydown', escClose);
                }
            },
            { once: true }
        );
    }

    async function fetchKycPayload() {
        var req = window.AgilBank && window.AgilBank.api && typeof window.AgilBank.api.request === 'function';
        if (!req) {
            throw new Error('Cliente de API indisponível.');
        }
        var response = await window.AgilBank.api.request('me/kyc-status', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        var body = await response.json().catch(function () {
            return {};
        });
        return { response: response, body: body };
    }

    /**
     * @param {'loan'|'card'} product
     * @returns {Promise<boolean>} true se APPROVED e pode seguir
     */
    async function ensureApproved(product) {
        var token = getBearerToken();
        if (!token) {
            window.alert('Faça login para continuar.');
            return false;
        }
        try {
            var pack = await fetchKycPayload();
            var body = pack.body;
            if (!pack.response.ok || !body || body.success !== true || !body.data) {
                var msg =
                    body && typeof body.message === 'string'
                        ? body.message
                        : 'Não foi possível consultar o status da sua identidade.';
                window.alert(msg);
                return false;
            }
            var idStatus = body.data.identityStatus;
            if (idStatus === 'APPROVED') {
                return true;
            }
            showBlockedModal(product, idStatus, body.data);
            return false;
        } catch (e) {
            console.warn('agilbankKycEnsureApproved:', e);
            window.alert(
                'Não foi possível verificar sua identidade agora. Confira sua conexão e tente novamente.'
            );
            return false;
        }
    }

    /** Placeholder compatível — aviso fixo na home não é mais utilizado (Fatia UX). */
    function syncDashboardShortcut() {
        /* noop: strip #agilbankKycShortcutStrip removida do dashboard */
    }

    window.agilbankKycVerifyHref = VERIFY_HREF;
    window.agilbankKycShowBlockedModal = showBlockedModal;
    window.agilbankKycEnsureApproved = ensureApproved;
    window.agilbankKycSyncDashboardShortcut = syncDashboardShortcut;
    window.agilbankKycFetchPayload = fetchKycPayload;
})(window, document);
