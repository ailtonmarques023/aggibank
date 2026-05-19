/**
 * Fatia 8.2 — Gate de identidade em fluxos sensíveis (sem mock; GET /api/me/kyc-status real).
 * Depende de legacyApiClient (AgilBank.api.request) e sessão Bearer já configurada.
 */
(function initKycJourneyGate(window, document) {
    'use strict';

    /** SPA React na mesma origem */
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

    /**
     * @param {'loan'|'card'} product
     * @param {string} identityStatus
     * @param {{ message?: string }=} data
     */
    function buildCopy(product, identityStatus, data) {
        var loanIntro =
            'Antes de solicitar seu empréstimo, precisamos confirmar sua identidade. Isso protege sua conta e evita uso indevido dos seus dados.';
        var cardIntro =
            'Para solicitar seu cartão com segurança, confirme sua identidade com documento e selfie.';
        var intro = product === 'card' ? cardIntro : loanIntro;

        var st = String(identityStatus || '').toUpperCase();
        var apiHint =
            data && typeof data.message === 'string' && data.message.trim() ? data.message.trim() : '';

        if (st === 'APPROVED') {
            return { title: 'Identidade confirmada', intro: intro, detail: '', primaryLabel: 'Continuar', mode: 'ok' };
        }

        if (!st || st === 'NOT_STARTED') {
            return {
                title: 'Verificação de identidade',
                intro: intro,
                detail: '',
                primaryLabel: 'Verificar agora',
                mode: 'verify',
            };
        }

        if (st === 'DRAFT' || st === 'PENDING_UPLOADS') {
            return {
                title: 'Continue sua verificação',
                intro: intro,
                detail:
                    'Envie ou confirme os arquivos pendentes. Você pode retomar de onde parou.',
                primaryLabel: 'Continuar verificação',
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
                mode: 'wait',
            };
        }

        if (st === 'RESUBMISSION_REQUIRED') {
            return {
                title: 'Reenvio necessário',
                intro: intro,
                detail:
                    'Precisamos que você reenvie seus documentos conforme as orientações da sua última interação.',
                primaryLabel: 'Reenviar documentos',
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
                mode: 'rejected',
            };
        }

        return {
            title: 'Verificação de identidade',
            intro: intro,
            detail: apiHint || 'Consulte o status da sua verificação para continuar.',
            primaryLabel: 'Verificar agora',
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
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'agilbank-kyc-gate-title');
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:16px;';

        var card = document.createElement('div');
        card.style.cssText =
            'max-width:420px;width:100%;background:#fff;border-radius:16px;padding:22px 20px 18px;box-shadow:0 20px 50px rgba(0,0,0,.18);font-family:system-ui,-apple-system,sans-serif;';

        var primaryIsLink = copy.mode !== 'wait';
        var primaryHref = primaryIsLink ? VERIFY_HREF : null;

        card.innerHTML =
            '<h2 id="agilbank-kyc-gate-title" style="margin:0 0 10px;font-size:1.15rem;color:#0f172a;">' +
            esc(copy.title) +
            '</h2>' +
            '<p style="margin:0 0 12px;font-size:.95rem;line-height:1.45;color:#334155;">' +
            esc(copy.intro) +
            '</p>' +
            (copy.detail
                ? '<p style="margin:0 0 16px;font-size:.875rem;line-height:1.4;color:#64748b;">' +
                  esc(copy.detail) +
                  '</p>'
                : '') +
            '<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">' +
            '<a id="agilbank-kyc-gate-primary" href="' +
            esc(primaryHref || '#') +
            '" style="display:inline-block;text-align:center;padding:12px 14px;border-radius:12px;background:#0066b3;color:#fff;font-weight:600;text-decoration:none;font-size:.95rem;">' +
            esc(copy.primaryLabel) +
            '</a>' +
            '<button type="button" id="agilbank-kyc-gate-close" style="padding:10px 14px;border-radius:12px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;font-weight:600;font-size:.9rem;cursor:pointer;">Fechar</button>' +
            '</div>';

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        var primary = document.getElementById('agilbank-kyc-gate-primary');
        var closeBtn = document.getElementById('agilbank-kyc-gate-close');

        if (copy.mode === 'wait' && primary) {
            primary.removeAttribute('href');
            primary.style.opacity = '0.85';
            primary.style.cursor = 'default';
            primary.addEventListener('click', function (ev) {
                ev.preventDefault();
            });
        }

        function close() {
            removeOverlay();
        }

        if (closeBtn) closeBtn.addEventListener('click', close);
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

    function syncDashboardShortcut() {
        var strip = document.getElementById('agilbankKycShortcutStrip');
        var link = document.getElementById('agilbankKycShortcutLink');
        if (!strip || !link) return;
        var token = getBearerToken();
        strip.style.display = token ? 'flex' : 'none';
        link.setAttribute('href', VERIFY_HREF);
    }

    window.agilbankKycVerifyHref = VERIFY_HREF;
    window.agilbankKycShowBlockedModal = showBlockedModal;
    window.agilbankKycEnsureApproved = ensureApproved;
    window.agilbankKycSyncDashboardShortcut = syncDashboardShortcut;
    window.agilbankKycFetchPayload = fetchKycPayload;

    document.addEventListener('DOMContentLoaded', function () {
        syncDashboardShortcut();
    });
    window.addEventListener('agilbank-auth-changed', function () {
        syncDashboardShortcut();
    });
})(window, document);
