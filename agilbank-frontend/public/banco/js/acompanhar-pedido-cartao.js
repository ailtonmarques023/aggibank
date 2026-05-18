/**
 * Página dedicada: acompanhar pedido do cartão físico.
 * Fonte primária: GET /api/cards/status. Opcional: GET /api/cards/:id/shipment (timeline).
 * Sem alteração de backend — apenas leitura.
 */
(function () {
    'use strict';

    var STORAGE_CARD_ID = 'agilbank_acompanhar_pedido_card_id';
    var STORAGE_RETURN = 'agilbank_acompanhar_pedido_return';

    function normalizeBearer(raw) {
        if (raw == null) return null;
        var s = String(raw).trim();
        if (!s) return null;
        var m = s.match(/^Bearer\s+(.+)$/i);
        return m ? m[1].trim() : s;
    }

    function getToken() {
        var raw = null;
        if (window.AgilBank && window.AgilBank.auth && typeof window.AgilBank.auth.getToken === 'function') {
            raw = window.AgilBank.auth.getToken();
        }
        if (!raw) {
            raw =
                sessionStorage.getItem('govbr_token') ||
                localStorage.getItem('govbr_token') ||
                sessionStorage.getItem('agilbank_token') ||
                localStorage.getItem('agilbank_token') ||
                sessionStorage.getItem('token') ||
                localStorage.getItem('token') ||
                null;
        }
        return normalizeBearer(raw);
    }

    function apcFormatDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('pt-BR');
    }

    function apcAddressText(snap) {
        var a = snap && typeof snap === 'object' ? snap : null;
        if (!a) return '';
        var logradouro = [a.logradouro, a.numero].filter(function (x) {
            return x && String(x).trim();
        }).join(', ');
        if (a.complemento && String(a.complemento).trim()) {
            logradouro = logradouro ? logradouro + ' — ' + a.complemento : String(a.complemento).trim();
        }
        var cidadeUf = [a.cidade, a.estado].filter(function (x) {
            return x && String(x).trim();
        }).join('/');
        var parts = [logradouro, a.bairro, cidadeUf, a.cep].filter(function (x) {
            return x && String(x).trim();
        });
        return parts.length ? parts.join(' — ') : '';
    }

    function apcSnapshotFromPedidoPreview(pv) {
        var er = pv && pv.enderecoResumo && typeof pv.enderecoResumo === 'object' ? pv.enderecoResumo : null;
        if (!er) return null;
        var snap = {
            logradouro: er.rua != null ? String(er.rua).trim() : '',
            numero: '',
            complemento: null,
            bairro: er.bairro != null ? String(er.bairro).trim() : '',
            cidade: er.cidade != null ? String(er.cidade).trim() : '',
            estado: er.estado != null ? String(er.estado).trim().toUpperCase() : '',
            cep: er.cep != null ? String(er.cep).trim() : ''
        };
        return apcAddressText(snap) ? snap : null;
    }

    function apcNormalizeShipment(s) {
        if (!s || typeof s !== 'object') return null;
        var snap =
            s.addressSnapshot && typeof s.addressSnapshot === 'object' && !Array.isArray(s.addressSnapshot)
                ? Object.assign({}, s.addressSnapshot)
                : {};
        var hasMean =
            (snap.logradouro != null && String(snap.logradouro).trim()) ||
            (snap.cep != null && String(snap.cep).trim()) ||
            (snap.cidade != null && String(snap.cidade).trim());
        if (!hasMean && (s.addressLine || s.zipCode || s.city || s.number)) {
            snap = {
                logradouro: s.addressLine != null ? String(s.addressLine).trim() : '',
                numero: s.number != null ? String(s.number).trim() : '',
                complemento: s.complement != null ? String(s.complement).trim() : null,
                bairro: s.district != null ? String(s.district).trim() : '',
                cidade: s.city != null ? String(s.city).trim() : '',
                estado: s.state != null ? String(s.state).trim().toUpperCase() : '',
                cep: s.zipCode != null ? String(s.zipCode).trim() : ''
            };
        }
        return Object.assign({}, s, { addressSnapshot: snap });
    }

    function apcInferPhysicalDelivery(shipment) {
        if (!shipment || typeof shipment !== 'object') return null;
        var fee = String(shipment.shippingFeeStatus || '').toUpperCase();
        var st = String(shipment.status || '').toUpperCase();
        var freightPaid = fee === 'DEBITADO';
        var tcRaw = shipment.trackingCode ? String(shipment.trackingCode).trim() : '';
        var trackingCode = tcRaw ? tcRaw.slice(0, 80) : null;
        var inTransitStatuses = ['POSTADO', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA'];
        var shipmentUiState = 'FREIGHT_PENDING';
        var productionStarted = false;
        if (fee === 'RECUSADO') {
            shipmentUiState = 'FREIGHT_REFUSED';
        } else if (!freightPaid) {
            shipmentUiState = 'FREIGHT_PENDING';
        } else if (st === 'ENTREGUE') {
            shipmentUiState = 'ENTREGUE';
            productionStarted = true;
        } else if (st === 'DEVOLVIDO') {
            shipmentUiState = 'DEVOLVIDO';
            productionStarted = true;
        } else if (st === 'FALHA_ENTREGA') {
            shipmentUiState = 'FALHA_ENTREGA';
            productionStarted = true;
        } else if (inTransitStatuses.indexOf(st) >= 0) {
            shipmentUiState = 'EM_TRANSITO';
            productionStarted = true;
        } else if (['COBRANCA_CONFIRMADA', 'EM_PRODUCAO'].indexOf(st) >= 0) {
            shipmentUiState = 'PRODUCTION_STARTED_WAITING_SHIPMENT';
            productionStarted = true;
        } else if (st === 'AGUARDANDO_COBRANCA') {
            shipmentUiState = freightPaid ? 'PRODUCTION_STARTED_WAITING_SHIPMENT' : 'FREIGHT_PENDING';
            productionStarted = freightPaid;
        } else {
            shipmentUiState = freightPaid ? 'PRODUCTION_STARTED_WAITING_SHIPMENT' : 'FREIGHT_PENDING';
            productionStarted = freightPaid;
        }
        return {
            freightPaid: freightPaid,
            shipmentUiState: shipmentUiState,
            productionStarted: productionStarted,
            trackingCode: trackingCode,
        };
    }

    function apcStagesNeutralFive(finalLabel) {
        var fl = finalLabel || 'Entregue';
        return [
            { key: 'pagamento', label: 'Pagamento do frete', state: 'future' },
            { key: 'producao', label: 'Em produção', state: 'future' },
            { key: 'transito', label: 'Em trânsito', state: 'future' },
            { key: 'devolvido', label: 'Devolvido ao AgilBank', state: 'future' },
            { key: 'final', label: fl, state: 'future' }
        ];
    }

    function apcStagesFromShipmentOnly(shipment) {
        var status = String(shipment && shipment.status ? shipment.status : '').toUpperCase();
        var finalLabel = status === 'FALHA_ENTREGA' ? 'Entrega não realizada' : 'Entregue';
        var stages = apcStagesNeutralFive(finalLabel);
        if (status === 'AGUARDANDO_COBRANCA') {
            stages[0].state = 'current';
        } else if (status === 'COBRANCA_CONFIRMADA' || status === 'EM_PRODUCAO') {
            stages[0].state = 'complete';
            stages[1].state = 'current';
        } else if (status === 'POSTADO' || status === 'EM_TRANSITO' || status === 'SAIU_PARA_ENTREGA') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'current';
        } else if (status === 'ENTREGUE') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'complete';
            stages[4].state = 'current';
        } else if (status === 'DEVOLVIDO') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'complete';
            stages[3].state = 'problem';
        } else if (status === 'FALHA_ENTREGA') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'complete';
            stages[4].state = 'problem';
        } else {
            stages[0].state = 'current';
        }
        return stages;
    }

    function apcStagesFromDelivery(pd, shipment) {
        var ui = pd && pd.shipmentUiState ? String(pd.shipmentUiState) : '';
        var stages = apcStagesNeutralFive('Entregue');
        if (!pd || ui === 'FREIGHT_PENDING' || ui === 'AWAITING_LOGISTICS_SETUP') {
            stages[0].state = 'current';
            return stages;
        }
        if (ui === 'FREIGHT_REFUSED') {
            stages[0].state = 'problem';
            return stages;
        }
        if (ui === 'PRODUCTION_STARTED_WAITING_SHIPMENT') {
            stages[0].state = 'complete';
            stages[1].state = 'current';
            return stages;
        }
        if (ui === 'EM_TRANSITO') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'current';
            return stages;
        }
        if (ui === 'ENTREGUE') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'complete';
            stages[4].state = 'current';
            return stages;
        }
        if (ui === 'DEVOLVIDO') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'complete';
            stages[3].state = 'problem';
            return stages;
        }
        if (ui === 'FALHA_ENTREGA') {
            stages[0].state = 'complete';
            stages[1].state = 'complete';
            stages[2].state = 'complete';
            stages[4].label = 'Entrega não realizada';
            stages[4].state = 'problem';
            return stages;
        }
        return apcStagesFromShipmentOnly(shipment);
    }

    function apcCopyForStage(key, stageLabel, isProblemFinal) {
        var copy = {
            pagamento: {
                title: 'Pagamento do frete',
                desc: 'Pague o boleto para liberar produção e envio.'
            },
            producao: { title: 'Em produção', desc: 'Frete confirmado. Estamos fabricando seu cartão.' },
            transito: { title: 'Em trânsito', desc: 'Saiu para entrega nos Correios/transportadora.' },
            devolvido: {
                title: 'Devolvido ao AgilBank',
                desc: 'Entrega não concluída. Confira o endereço; haverá nova tentativa se aplicável.'
            },
            final: {
                title: 'Entregue',
                desc: 'Cartão entregue ao titular.'
            }
        };
        if (key === 'final' && (isProblemFinal || String(stageLabel).indexOf('não realizada') >= 0)) {
            return {
                title: stageLabel || 'Entrega não realizada',
                desc: 'Não concluída nesta tentativa. Veja o app ou fale com o suporte.'
            };
        }
        return copy[key] || { title: stageLabel || '', desc: '' };
    }

    function apcResumoText(uiState) {
        var u = String(uiState || '');
        if (u === 'FREIGHT_PENDING' || u === 'AWAITING_LOGISTICS_SETUP') return 'Frete: aguardando pagamento';
        if (u === 'FREIGHT_REFUSED') return 'Frete não confirmado';
        if (u === 'PRODUCTION_STARTED_WAITING_SHIPMENT') return 'Em produção';
        if (u === 'EM_TRANSITO') return 'Em trânsito';
        if (u === 'ENTREGUE') return 'Entregue';
        if (u === 'DEVOLVIDO') return 'Devolvido ao banco';
        if (u === 'FALHA_ENTREGA') return 'Falha na entrega';
        return 'Acompanhe o pedido';
    }

    function apcCardTitle(cardObj) {
        if (!cardObj) return 'Cartão AgilBank';
        var t = String(cardObj.type || cardObj.tipo || 'credit').toLowerCase();
        if (t === 'credit' || t === 'credito' || t.indexOf('credit') >= 0) return 'Cartão de crédito AgilBank';
        if (t === 'debit' || t === 'debito') return 'Cartão de débito AgilBank';
        return 'Cartão AgilBank';
    }

    function apcCardLast4(cardObj) {
        if (!cardObj || cardObj.last4 == null) return '•••• •••• •••• ••••';
        var l4 = String(cardObj.last4).replace(/\D/g, '').slice(-4).padStart(4, '0');
        return '•••• •••• •••• ' + l4;
    }

    function apcHasConsolidated(shipment, pd) {
        if (shipment && shipment.id != null && String(shipment.id).trim()) return true;
        if (pd && typeof pd === 'object' && pd.shipmentUiState) return true;
        return false;
    }

    function apcEnderecoLinha(shipment, pedidoPreview) {
        if (shipment && shipment.addressSnapshot && typeof shipment.addressSnapshot === 'object') {
            var t = apcAddressText(shipment.addressSnapshot);
            if (t) return t;
        }
        var snapPv = apcSnapshotFromPedidoPreview(pedidoPreview);
        if (snapPv) return apcAddressText(snapPv);
        return '';
    }

    async function apcFetchJson(path, options, timeoutMs) {
        if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
            throw new Error('Cliente de API indisponível.');
        }
        var controller = new AbortController();
        var timer = setTimeout(function () {
            controller.abort();
        }, timeoutMs || 15000);
        try {
            var reqOpts = Object.assign({}, options || {}, { signal: controller.signal });
            var response = await window.AgilBank.api.request(path, reqOpts);
            var body = await response.json().catch(function () {
                return null;
            });
            return { response: response, body: body };
        } finally {
            clearTimeout(timer);
        }
    }

    async function apcFetchStatus() {
        var token = getToken();
        if (!token) {
            return { ok: false, error: 'Sessão expirada. Faça login novamente.', reason: 'no_auth' };
        }
        try {
            var res = await apcFetchJson(
                'cards/status',
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                },
                15000
            );
            if (!res.response.ok) {
                var msg =
                    (res.body && (res.body.message || res.body.error)) ||
                    'Não foi possível carregar o status do cartão.';
                return { ok: false, error: String(msg), status: res.response.status };
            }
            if (!res.body || res.body.success !== true || !res.body.data) {
                return { ok: false, error: 'Resposta inválida do servidor.', reason: 'shape' };
            }
            return { ok: true, data: res.body.data };
        } catch (e) {
            if (e && e.name === 'AbortError') {
                return { ok: false, error: 'Tempo esgotado. Verifique sua conexão.', reason: 'timeout' };
            }
            return { ok: false, error: (e && e.message) || 'Erro de conexão.', reason: 'network' };
        }
    }

    async function apcFetchShipment(cardId) {
        try {
            var res = await apcFetchJson(
                'cards/' + encodeURIComponent(cardId) + '/shipment',
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                },
                15000
            );
            return res;
        } catch (e) {
            return { response: { ok: false, status: 0 }, body: null, networkError: e };
        }
    }

    function apcRenderTimeline(host, stages) {
        host.innerHTML = '';
        for (var i = 0; i < stages.length; i++) {
            var st = stages[i];
            var klass = 'apc-tl-item';
            if (st.state === 'complete') klass += ' is-complete';
            else if (st.state === 'current') klass += ' is-current';
            else if (st.state === 'problem') klass += ' is-problem';
            else klass += ' is-future';
            var isProblemFinal = st.key === 'final' && st.state === 'problem';
            var meta = apcCopyForStage(st.key, st.label, isProblemFinal);
            var titleText = meta.title || st.label;
            var row = document.createElement('div');
            row.className = klass;
            row.innerHTML =
                '<div class="apc-tl-dot" aria-hidden="true"></div>' +
                '<p class="apc-tl-title"></p>' +
                '<p class="apc-tl-desc"></p>';
            row.querySelector('.apc-tl-title').textContent = titleText;
            row.querySelector('.apc-tl-desc').textContent = meta.desc || '';
            host.appendChild(row);
        }
    }

    function apcRenderEvents(wrap, listHost, timeline) {
        var evs = Array.isArray(timeline) ? timeline : [];
        listHost.innerHTML = '';
        if (!evs.length) {
            wrap.hidden = true;
            return;
        }
        wrap.hidden = false;
        for (var i = 0; i < Math.min(evs.length, 12); i++) {
            var ev = evs[i];
            var row = document.createElement('div');
            row.className = 'apc-event-row';
            var when = apcFormatDate(ev && ev.eventAt);
            var label = document.createElement('strong');
            label.textContent = ev && ev.eventType ? String(ev.eventType) : 'Evento';
            row.appendChild(label);
            row.appendChild(document.createTextNode(' · ' + when));
            if (ev && ev.description) {
                var br = document.createElement('br');
                var desc = document.createElement('span');
                desc.textContent = String(ev.description);
                row.appendChild(br);
                row.appendChild(desc);
            }
            listHost.appendChild(row);
        }
    }

    var state = {
        shipmentDetailNote: ''
    };

    async function apcLoad() {
        var elLoad = document.getElementById('apcLoading');
        var elErr = document.getElementById('apcError');
        var elContent = document.getElementById('apcContent');
        var elErrText = document.getElementById('apcErrorText');

        elLoad.hidden = false;
        elErr.hidden = true;
        elContent.hidden = true;

        var snap = await apcFetchStatus();
        if (!snap.ok) {
            elLoad.hidden = true;
            elErr.hidden = false;
            elErrText.textContent = snap.error || 'Não foi possível carregar.';
            return;
        }

        var data = snap.data;
        var cardApi = data.card || {};
        var pedidoPreview =
            cardApi.pedidoPreview && typeof cardApi.pedidoPreview === 'object' ? cardApi.pedidoPreview : null;

        var shipmentFromStatus = data.shipment ? apcNormalizeShipment(data.shipment) : null;
        var pdApi = data.physicalDelivery && typeof data.physicalDelivery === 'object' ? data.physicalDelivery : null;

        var cardId = cardApi.id != null ? String(cardApi.id).trim() : '';
        var storedId = '';
        try {
            storedId = String(sessionStorage.getItem(STORAGE_CARD_ID) || '').trim();
        } catch (e1) {
            storedId = '';
        }

        if (storedId && cardId && storedId !== cardId) {
            /* Mantém consolidado do status (cartão representativo). */
        }

        var pd = pdApi;
        if (!pd && shipmentFromStatus) {
            pd = apcInferPhysicalDelivery(shipmentFromStatus);
        }

        var tipo = String(cardApi.type || '').toLowerCase();
        if (tipo === 'debit') {
            elLoad.hidden = true;
            elErr.hidden = false;
            elErrText.textContent = 'Este fluxo acompanha o cartão físico de crédito. Use o app principal para o cartão de débito.';
            return;
        }

        if (!data.hasCard) {
            elLoad.hidden = true;
            elErr.hidden = false;
            elErrText.textContent = 'Nenhum cartão encontrado para esta conta.';
            return;
        }

        var shipment = shipmentFromStatus;
        var timeline = [];
        state.shipmentDetailNote = '';

        if (cardId && apcHasConsolidated(shipment, pd)) {
            var shRes = await apcFetchShipment(cardId);
            if (shRes.response && shRes.response.ok && shRes.body && shRes.body.success && shRes.body.data) {
                var sh = shRes.body.data.shipment;
                if (sh) {
                    shipment = apcNormalizeShipment(sh);
                    if (!pd && shipment) pd = apcInferPhysicalDelivery(shipment);
                }
                timeline = Array.isArray(shRes.body.data.timeline) ? shRes.body.data.timeline : [];
            } else if (apcHasConsolidated(shipmentFromStatus, pdApi)) {
                shipment = shipmentFromStatus;
                state.shipmentDetailNote =
                    'Detalhe da remessa indisponível; exibindo o status consolidado do cartão.';
            }
        }

        if (!shipment && (!pd || String(pd.shipmentUiState || '') === 'AWAITING_LOGISTICS_SETUP')) {
            /* Sem linha de remessa: ainda não há envio rastreado */
        }

        elLoad.hidden = true;
        elContent.hidden = false;

        document.getElementById('apcCardTitle').textContent = apcCardTitle(cardApi);
        document.getElementById('apcCardLast4').textContent = apcCardLast4(cardApi);

        var uiState = pd && pd.shipmentUiState ? String(pd.shipmentUiState) : '';
        var temRemessa = !!(shipment && shipment.id != null && String(shipment.id).trim());
        if (pd && String(pd.freightStatus || '').toUpperCase() === 'NAO_APLICAVEL') {
            document.getElementById('apcResumoStatusText').textContent =
                'Remessa física não se aplica a este tipo de cartão neste fluxo.';
        } else if (!temRemessa) {
            document.getElementById('apcResumoStatusText').textContent =
                'Ainda sem remessa. Assim que registrarmos o envio, o andamento aparece aqui.';
        } else {
            document.getElementById('apcResumoStatusText').textContent = apcResumoText(uiState);
        }

        var addr = apcEnderecoLinha(shipment, pedidoPreview);
        document.getElementById('apcEndereco').textContent = addr ||
            'Endereço não confirmado. Atualize seu cadastro para concluir o envio.';

        var prevEl = document.getElementById('apcPrevisao');
        var prevRaw =
            shipment && shipment.estimatedDeliveryAt != null && String(shipment.estimatedDeliveryAt).trim()
                ? shipment.estimatedDeliveryAt
                : null;
        if (prevRaw && apcFormatDate(prevRaw)) {
            prevEl.textContent = 'Entrega prevista: ' + apcFormatDate(prevRaw) + '.';
        } else {
            prevEl.textContent = 'Sem previsão até confirmarmos o envio.';
        }

        var stages = apcStagesFromDelivery(pd, shipment);
        apcRenderTimeline(document.getElementById('apcTimeline'), stages);

        var noteAfterTimeline = state.shipmentDetailNote;
        if (noteAfterTimeline) {
            var p = document.createElement('p');
            p.className = 'apc-previsao';
            p.style.marginTop = '10px';
            p.style.fontSize = '12.5px';
            p.textContent = noteAfterTimeline;
            document.getElementById('apcTimeline').appendChild(p);
        }

        apcRenderEvents(document.getElementById('apcEventsWrap'), document.getElementById('apcEventsList'), timeline);

        var feePend =
            temRemessa &&
            shipment &&
            String(shipment.shippingFeeStatus || '').toUpperCase() === 'PENDENTE';
        var btnPay = document.getElementById('apcBtnPagarFrete');
        btnPay.hidden = !feePend;
        btnPay.onclick = function () {
            /* Fluxo de cobrança vive no index — função global só existe lá. */
            if (typeof window.levarboletoContainer === 'function') {
                try {
                    window.levarboletoContainer();
                } catch (e2) {
                    window.location.href = './index.html';
                }
            } else {
                window.location.href = './index.html';
            }
        };
    }

    function apcNavigateBack() {
        try {
            var ret = sessionStorage.getItem(STORAGE_RETURN);
            if (ret === 'index') {
                sessionStorage.removeItem(STORAGE_RETURN);
                window.location.replace('./index.html');
                return;
            }
        } catch (e0) {
            /* ignore */
        }
        try {
            var ref = document.referrer || '';
            if (
                ref.indexOf('/banco/index.html') >= 0 ||
                ref.indexOf('%2Fbanco%2Findex.html') >= 0 ||
                /\/banco\/index\.html(\?|$)/.test(ref) ||
                ref.endsWith('/banco/') ||
                ref.endsWith('/banco')
            ) {
                window.location.replace('./index.html');
                return;
            }
        } catch (e1) {
            /* ignore */
        }
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.replace('./index.html');
    }

    function apcInit() {
        document.getElementById('apcBtnVoltar').addEventListener('click', function () {
            apcNavigateBack();
        });
        document.getElementById('apcBtnAjuda').addEventListener('click', function () {
            window.alert('Dúvidas sobre a entrega? Acesse o Internet Banking (início) e use suporte ou ajuda.');
        });
        document.getElementById('apcBtnAtualizar').addEventListener('click', function () {
            apcLoad();
        });
        document.getElementById('apcBtnRetry').addEventListener('click', function () {
            apcLoad();
        });
        apcLoad();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apcInit);
    } else {
        apcInit();
    }
})();
