/**
 * UI de cobranças (Cobranças / Gerar Pix) — cards, urgência 2 min, pagamento sequencial honesto.
 * Depende de: legacyApiClient, agilbankChargesLoadDetail, agilbankChargesGerarPix (index.html).
 */
(function initChargesPaymentUi(window) {
    'use strict';

    var URGENCY_MS = 2 * 60 * 1000;
    var SELECT_ALL_ID = '__ALL__';

    var state = {
        charges: [],
        selectedId: null,
        selectAll: false,
        timerEnd: 0,
        timerInterval: null,
        timerExpired: false,
        sequentialQueue: [],
        sequentialIndex: 0,
        inSequential: false,
    };

    function formatMoneyBr(n) {
        if (typeof window.agilbankFormatMoneyBr === 'function') {
            return window.agilbankFormatMoneyBr(n);
        }
        var x = Number(n);
        if (!isFinite(x)) return '—';
        return x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function setVisible(id, show) {
        var el = document.getElementById(id);
        if (el) el.style.display = show ? '' : 'none';
    }

    function getApi() {
        return window.legacyApiClient || (window.AgilBank && window.AgilBank.api);
    }

    function isCardShippingCharge(ch) {
        if (!ch) return false;
        var t = String(ch.type || '').toLowerCase();
        if (t === 'card_shipping') return true;
        var p = String(ch.product || '').toLowerCase();
        return p.indexOf('frete') !== -1 && p.indexOf('cart') !== -1;
    }

    function isCardRelatedBoleto(ch) {
        if (!ch || String(ch.type || '').toLowerCase() !== 'gru_boleto') return false;
        var d = String(ch.description || ch.product || '').toLowerCase();
        return d.indexOf('frete') !== -1 || d.indexOf('envio') !== -1 || d.indexOf('cartão') !== -1 || d.indexOf('cartao') !== -1;
    }

    /** Copy de exibição (backend ainda pode enviar "Frete do cartão"). */
    function formatChargeDisplay(ch) {
        if (!ch) {
            return {
                title: 'Cobrança',
                subtitle: '',
                statusLabel: 'Aguardando pagamento',
                amount: 0,
            };
        }
        if (isCardShippingCharge(ch) || isCardRelatedBoleto(ch)) {
            return {
                title: 'Produção e envio do cartão físico',
                subtitle: 'Libera a confecção do cartão e a entrega no endereço cadastrado.',
                statusLabel: mapStatusAwaiting(ch),
                amount: ch.amount,
            };
        }
        return {
            title: ch.product || ch.description || 'Cobrança pendente',
            subtitle: ch.description && ch.description !== ch.product ? String(ch.description) : '',
            statusLabel: mapStatusAwaiting(ch),
            amount: ch.amount,
        };
    }

    function mapStatusAwaiting(ch) {
        var s = String(ch.status || '').toLowerCase();
        var lbl = String(ch.statusLabel || '').toLowerCase();
        if (s === 'pendente' || lbl === 'pendente' || s === 'aguardando_cobranca') {
            return 'Aguardando pagamento';
        }
        if (ch.statusLabel) return ch.statusLabel;
        return 'Aguardando pagamento';
    }

    function sumAmounts(list) {
        return (list || []).reduce(function (acc, ch) {
            var n = Number(ch.amount);
            return acc + (isFinite(n) ? n : 0);
        }, 0);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function formatTimerDisplay(msLeft) {
        var sec = Math.max(0, Math.ceil(msLeft / 1000));
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateTimerUi() {
        var clock = document.getElementById('gruPaymentTimer');
        var title = document.getElementById('gruPaymentUrgencyTitle');
        var text = document.getElementById('gruPaymentUrgencyText');
        var badge = document.getElementById('gruPaymentUrgencyBadge');
        if (!clock) return;

        var left = state.timerEnd - Date.now();
        if (left <= 0) {
            state.timerExpired = true;
            clock.textContent = '00:00';
            if (title) title.textContent = 'Tempo encerrado';
            if (text) {
                text.textContent = 'Gere um novo pagamento para continuar e liberar a produção do seu cartão físico.';
            }
            if (badge) badge.textContent = 'Etapa expirada';
            stopTimer();
            return;
        }
        state.timerExpired = false;
        clock.textContent = formatTimerDisplay(left);
        if (title) title.textContent = 'Seu cartão está quase pronto para produção';
        if (text) {
            text.textContent =
                'Finalize em até 2 minutos para liberar a produção e o envio do seu cartão físico.';
        }
        if (badge) badge.textContent = 'Condição liberada agora';
    }

    function startUrgencyTimer() {
        stopTimer();
        state.timerEnd = Date.now() + URGENCY_MS;
        state.timerExpired = false;
        setVisible('gruPaymentUrgencyBanner', true);
        updateTimerUi();
        state.timerInterval = setInterval(updateTimerUi, 1000);
    }

    function renderChargeCard(ch, index) {
        var d = formatChargeDisplay(ch);
        var selected = !state.selectAll && state.selectedId === ch.id;
        return (
            '<button type="button" class="gru-payment-card' +
            (selected ? ' is-selected' : '') +
            '" data-charge-id="' +
            escapeHtml(ch.id) +
            '" aria-pressed="' +
            (selected ? 'true' : 'false') +
            '">' +
            '<span class="gru-payment-card-radio" aria-hidden="true"></span>' +
            '<span class="gru-payment-card-body">' +
            '<span class="gru-payment-card-title">' +
            escapeHtml(d.title) +
            '</span>' +
            (d.subtitle ? '<span class="gru-payment-card-sub">' + escapeHtml(d.subtitle) + '</span>' : '') +
            '<span class="gru-payment-card-meta">' +
            '<span class="gru-payment-card-amount">' +
            escapeHtml(formatMoneyBr(d.amount)) +
            '</span>' +
            '<span class="gru-payment-card-status">' +
            escapeHtml(d.statusLabel) +
            '</span>' +
            '</span>' +
            '</span>' +
            '</button>'
        );
    }

    function renderPayAllCard(total, selected) {
        return (
            '<button type="button" class="gru-payment-card gru-payment-card--all' +
            (selected ? ' is-selected' : '') +
            '" data-charge-id="' +
            SELECT_ALL_ID +
            '" aria-pressed="' +
            (selected ? 'true' : 'false') +
            '">' +
            '<span class="gru-payment-card-radio" aria-hidden="true"></span>' +
            '<span class="gru-payment-card-body">' +
            '<span class="gru-payment-card-title">Pagar tudo agora</span>' +
            '<span class="gru-payment-card-sub">Quite todas as pendências em um único fluxo — cada uma com pagamento separado.</span>' +
            '<span class="gru-payment-card-meta">' +
            '<span class="gru-payment-card-amount">Total: ' +
            escapeHtml(formatMoneyBr(total)) +
            '</span>' +
            '</span>' +
            '<span class="gru-payment-card-warn">Você fará o pagamento de cada pendência separadamente.</span>' +
            '</button>'
        );
    }

    function updatePrimaryButton() {
        var btn = document.getElementById('gruPaymentPrimaryBtn');
        if (!btn) return;
        if (state.selectAll && state.charges.length > 1) {
            btn.textContent = 'Pagar pendências';
        } else if (state.inSequential) {
            btn.textContent = 'Gerar pagamento (' + (state.sequentialIndex + 1) + ' de ' + state.sequentialQueue.length + ')';
        } else {
            var ch = state.charges.find(function (c) {
                return c.id === state.selectedId;
            });
            var disp = formatChargeDisplay(ch);
            if (isCardShippingCharge(ch) || isCardRelatedBoleto(ch)) {
                btn.textContent = 'Pagar produção e envio';
            } else {
                btn.textContent = 'Gerar pagamento';
            }
        }
        btn.disabled = false;
    }

    function updateSequentialBar() {
        var bar = document.getElementById('gruPaymentSeqBar');
        if (!bar) return;
        if (!state.inSequential || state.sequentialQueue.length < 2) {
            bar.style.display = 'none';
            bar.textContent = '';
            return;
        }
        bar.style.display = '';
        bar.textContent =
            'Pagamento ' +
            (state.sequentialIndex + 1) +
            ' de ' +
            state.sequentialQueue.length +
            ' — cada pendência exige um Pix separado.';
    }

    function renderCards() {
        var host = document.getElementById('gruPaymentCardsHost');
        if (!host) return;
        var list = state.charges;
        if (!list.length) {
            host.innerHTML = '';
            return;
        }

        var html = '';
        list.forEach(function (ch, i) {
            html += renderChargeCard(ch, i);
        });

        if (list.length > 1) {
            html += renderPayAllCard(sumAmounts(list), state.selectAll);
            setVisible('gruPaymentMultiHint', true);
            var hint = document.getElementById('gruPaymentMultiHint');
            if (hint) {
                hint.textContent =
                    'Total das pendências: ' +
                    formatMoneyBr(sumAmounts(list)) +
                    '. Você fará o pagamento de cada pendência separadamente.';
            }
        } else {
            setVisible('gruPaymentMultiHint', false);
        }

        host.innerHTML = html;

        host.querySelectorAll('.gru-payment-card').forEach(function (card) {
            card.addEventListener('click', function () {
                selectCharge(card.getAttribute('data-charge-id'));
            });
        });

        updatePrimaryButton();
        updateSequentialBar();
    }

    function selectCharge(id) {
        if (id === SELECT_ALL_ID) {
            state.selectAll = true;
            state.selectedId = null;
            state.inSequential = false;
            state.sequentialQueue = state.charges.map(function (c) {
                return c.id;
            });
            state.sequentialIndex = 0;
        } else {
            state.selectAll = false;
            state.selectedId = id;
            state.inSequential = false;
            state.sequentialQueue = [];
            state.sequentialIndex = 0;
            if (typeof window.agilbankChargesLoadDetail === 'function') {
                void window.agilbankChargesLoadDetail(id);
            }
        }
        setVisible('gruPixResultPanel', false);
        setVisible('gruPixSeqNextBtn', false);
        renderCards();
    }

    function beginSequentialIfNeeded() {
        if (state.selectAll && state.charges.length > 1) {
            state.inSequential = true;
            state.sequentialQueue = state.charges.map(function (c) {
                return c.id;
            });
            state.sequentialIndex = 0;
            state.selectedId = state.sequentialQueue[0];
            state.selectAll = false;
            updateSequentialBar();
            updatePrimaryButton();
            return true;
        }
        return false;
    }

    function onPrimaryPayClick(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (state.timerExpired) {
            if (typeof window.mostrarAgilbankAviso === 'function') {
                window.mostrarAgilbankAviso('Tempo encerrado. Gere um novo pagamento para continuar.');
            }
            return;
        }
        if (!state.charges.length) return;

        if (state.selectAll && state.charges.length > 1) {
            beginSequentialIfNeeded();
        }

        var chargeId = state.inSequential ? state.sequentialQueue[state.sequentialIndex] : state.selectedId;

        if (!chargeId) {
            chargeId = state.charges[0].id;
            state.selectedId = chargeId;
        }

        var loadDetail =
            typeof window.agilbankChargesLoadDetail === 'function'
                ? window.agilbankChargesLoadDetail(chargeId)
                : Promise.resolve();

        Promise.resolve(loadDetail).then(function () {
            if (typeof window.agilbankChargesGerarPix === 'function') {
                window.agilbankChargesGerarPix(ev);
            }
        });
    }

    function advanceSequential() {
        if (!state.inSequential) return;
        if (state.sequentialIndex >= state.sequentialQueue.length - 1) {
            state.inSequential = false;
            setVisible('gruPixSeqNextBtn', false);
            if (typeof window.mostrarAgilbankAviso === 'function') {
                window.mostrarAgilbankAviso('Você gerou o Pix da última pendência. Após pagar, atualize a lista em Cobranças.');
            }
            updatePrimaryButton();
            updateSequentialBar();
            return;
        }
        state.sequentialIndex += 1;
        state.selectedId = state.sequentialQueue[state.sequentialIndex];
        setVisible('gruPixResultPanel', false);
        updatePrimaryButton();
        updateSequentialBar();
        renderCards();
        if (typeof window.agilbankChargesLoadDetail === 'function') {
            void window.agilbankChargesLoadDetail(state.selectedId);
        }
        if (typeof window.mostrarAgilbankAviso === 'function') {
            window.mostrarAgilbankAviso(
                'Próxima pendência (' + (state.sequentialIndex + 1) + ' de ' + state.sequentialQueue.length + '). Gere o pagamento abaixo.'
            );
        }
    }

    function onPixGenerated() {
        if (!state.inSequential || state.sequentialQueue.length < 2) {
            setVisible('gruPixSeqNextBtn', false);
            return;
        }
        if (state.sequentialIndex < state.sequentialQueue.length - 1) {
            var btn = document.getElementById('gruPixSeqNextBtn');
            if (btn) {
                btn.style.display = '';
                btn.textContent =
                    'Próxima pendência (' + (state.sequentialIndex + 2) + ' de ' + state.sequentialQueue.length + ')';
            }
        } else {
            setVisible('gruPixSeqNextBtn', false);
        }
    }

    function refresh() {
        var api = getApi();
        if (!api || typeof api.request !== 'function') {
            if (typeof window.mostrarAgilbankAviso === 'function') {
                window.mostrarAgilbankAviso('Serviço de cobranças indisponível no cliente.');
            }
            return Promise.resolve();
        }

        setVisible('gruCobrancasLoading', true);
        setVisible('gruCobrancasEmpty', false);
        setVisible('gruCobrancasPanel', false);
        stopTimer();

        return api
            .request('charges', { method: 'GET' })
            .then(function (res) {
                return res.json().then(function (body) {
                    return { res: res, body: body };
                });
            })
            .then(function (_ref) {
                var res = _ref.res;
                var body = _ref.body;
                setVisible('gruCobrancasLoading', false);

                if (!res.ok || !body || !body.success) {
                    setVisible('gruCobrancasEmpty', true);
                    if (typeof window.mostrarAgilbankAviso === 'function' && res.status === 403) {
                        window.mostrarAgilbankAviso((body && body.message) || 'Conta não verificada ou sem permissão.');
                    }
                    return;
                }

                var list = (body.data && body.data.charges) ? body.data.charges : [];
                window.__agilbankChargesList = list;
                state.charges = list;
                state.inSequential = false;
                state.sequentialQueue = [];
                state.sequentialIndex = 0;

                if (!list.length) {
                    setVisible('gruCobrancasEmpty', true);
                    return;
                }

                setVisible('gruCobrancasPanel', true);
                state.selectAll = false;
                state.selectedId = list[0].id;

                startUrgencyTimer();
                renderCards();

                if (typeof window.agilbankChargesLoadDetail === 'function') {
                    return window.agilbankChargesLoadDetail(state.selectedId);
                }
            })
            .catch(function (err) {
                console.error('agilbankCobrancasRefresh', err);
                setVisible('gruCobrancasLoading', false);
                setVisible('gruCobrancasEmpty', true);
                if (typeof window.mostrarAgilbankAviso === 'function') {
                    window.mostrarAgilbankAviso('Não foi possível carregar cobranças. Verifique a conexão.');
                }
            });
    }

    function bindUi() {
        var primary = document.getElementById('gruPaymentPrimaryBtn');
        if (primary && !primary._agilPaymentBound) {
            primary._agilPaymentBound = true;
            primary.addEventListener('click', onPrimaryPayClick);
        }
        var seqNext = document.getElementById('gruPixSeqNextBtn');
        if (seqNext && !seqNext._agilPaymentBound) {
            seqNext._agilPaymentBound = true;
            seqNext.addEventListener('click', function (e) {
                if (e && e.preventDefault) e.preventDefault();
                advanceSequential();
            });
        }
    }

    window.AgilbankChargesPaymentUI = {
        refresh: refresh,
        formatChargeDisplay: formatChargeDisplay,
        onPixGenerated: onPixGenerated,
        resetTimer: startUrgencyTimer,
    };

    window.agilbankCobrancasRefresh = refresh;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUi);
    } else {
        bindUi();
    }
})(window);
