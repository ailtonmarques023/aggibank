/**
 * Modal/card de promoção de cobranças — integração backend (Fatias 6–7).
 * Valores e elegibilidade vêm exclusivamente da API.
 */
(function (global) {
  'use strict';

  var api = global.ChargePromotionApi;
  var timerInterval = null;
  var timerLeft = 0;
  var promoExpired = false;
  var isEmittingPix = false;
  /** @type {'idle'|'waiting'|'timeout'} */
  var pollingUI = 'idle';
  var state = {
    promotion: null,
    charges: [],
    pixPayload: null,
    view: 'hidden',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function centsToBrl(cents) {
    var n = Math.trunc(Number(cents));
    if (!Number.isFinite(n)) return null;
    return n / 100;
  }

  function currencyBrl(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function timerFmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
  }

  function friendlyTitle(publicChargeType, productFallback) {
    var t = String(publicChargeType || '').toLowerCase();
    if (t === 'gru_boleto' || t === 'boleto') return 'Boleto / GRU';
    if (t === 'loan_insurance') return 'Seguro do empréstimo';
    if (t === 'card_shipping' || t === 'card_shipment') return 'Produção e frete do cartão';
    if (productFallback) return String(productFallback);
    return 'Cobrança';
  }

  function promoBannerAmountHtml(amountBrl) {
    var formatted = currencyBrl(amountBrl).replace(/\u00a0/g, ' ');
    var commaIdx = formatted.lastIndexOf(',');
    if (commaIdx === -1) {
      return '<span class="agil-promo-banner-currency">' + esc(formatted) + '</span>';
    }
    var beforeCents = formatted.slice(0, commaIdx);
    var cents = formatted.slice(commaIdx);
    var parts = beforeCents.match(/^(R\$)\s*(.+)$/);
    if (!parts) {
      return '<span class="agil-promo-banner-currency">' + esc(formatted) + '</span>';
    }
    return (
      '<span class="agil-promo-banner-currency">' +
      esc(parts[1]) +
      '&nbsp;</span>' +
      '<span class="agil-promo-banner-number">' +
      esc(parts[2]) +
      '</span>' +
      '<span class="agil-promo-banner-cents">' +
      esc(cents) +
      '</span>'
    );
  }

  function chargeIconClass(type) {
    var t = String(type || '').toUpperCase();
    if (t.indexOf('SHIP') !== -1 || t.indexOf('CARD') !== -1) return 'charge-ico--card';
    if (t.indexOf('INSUR') !== -1 || t.indexOf('LOAN') !== -1) return 'charge-ico--shield';
    return 'charge-ico--doc';
  }

  function chargeIconSvg(type) {
    var t = String(type || '').toUpperCase();
    if (t.indexOf('SHIP') !== -1 || t.indexOf('CARD') !== -1) {
      return '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>';
    }
    if (t.indexOf('INSUR') !== -1 || t.indexOf('LOAN') !== -1) {
      return '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  }

  function mapItemRow(item, chargesList) {
    var pid = String(item.publicChargeId || '');
    var match = (chargesList || []).find(function (ch) {
      return String(ch.id || '') === pid;
    });
    return {
      title: friendlyTitle(item.publicChargeType, match && match.product),
      amount: centsToBrl(item.originalAmountCents),
      type: item.publicChargeType,
    };
  }

  function toast(msg) {
    var el = $('chargePromoToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('show');
    }, 3200);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function refreshTimerUI() {
    var block = $('chargeOfferTimer');
    var labelEl = $('chargeOfferTimerLabel');
    var subEl = $('chargeOfferTimerSub');
    var valueEl = $('chargeOfferTimerValue');
    var hintEl = $('chargeOfferHint');
    var mainBtn = $('chargePromoMainBtn');
    if (!block || !valueEl) return;

    if (promoExpired || timerLeft <= 0) {
      block.classList.add('is-expired');
      if (labelEl) labelEl.textContent = 'Promoção expirada';
      if (subEl) subEl.textContent = '';
      valueEl.textContent = '00:00';
      if (hintEl) hintEl.classList.add('is-hidden');
      if (mainBtn) {
        mainBtn.disabled = true;
        var lbl = mainBtn.querySelector('.btn-main-label');
        if (lbl) lbl.textContent = 'Promoção expirada';
      }
      return;
    }

    block.classList.remove('is-expired');
    if (labelEl) labelEl.textContent = 'Oferta por tempo limitado';
    if (subEl) subEl.textContent = 'Expira em';
    valueEl.textContent = timerFmt(timerLeft);
    if (hintEl) hintEl.classList.remove('is-hidden');
    if (mainBtn && mainBtn.dataset.mode === 'promo' && !isEmittingPix) {
      mainBtn.disabled = false;
      var lbl2 = mainBtn.querySelector('.btn-main-label');
      if (lbl2) lbl2.textContent = 'Aproveitar promoção';
    }
  }

  function startTimer(secs) {
    stopTimer();
    promoExpired = false;
    timerLeft = Math.max(0, Math.floor(Number(secs) || 0));
    refreshTimerUI();
    if (timerLeft <= 0) {
      promoExpired = true;
      refreshTimerUI();
      return;
    }
    timerInterval = setInterval(function () {
      timerLeft -= 1;
      if (timerLeft <= 0) {
        promoExpired = true;
        stopTimer();
        refreshTimerUI();
        void refreshPromotionAndMaybeHide();
      }
      refreshTimerUI();
    }, 1000);
  }

  function setOverlayVisible(visible) {
    var overlay = $('chargePromotionOverlay');
    if (!overlay) return;
    overlay.style.display = visible ? 'flex' : 'none';
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function setGruPanelVisible(visible) {
    if (typeof global.agilbankChargeSetVisible === 'function') {
      global.agilbankChargeSetVisible('gruCobrancasPanel', visible);
    } else {
      var panel = $('gruCobrancasPanel');
      if (panel) panel.style.display = visible ? '' : 'none';
    }
  }

  function stopPromotionPaymentPolling() {
    var pol = global.ChargePromotionPolling;
    if (pol && typeof pol.stop === 'function') {
      pol.stop();
    }
    pollingUI = 'idle';
  }

  function updatePollingStatusUI() {
    var el = $('chargePromoPollingStatus');
    if (!el) return;
    if (pollingUI === 'waiting') {
      el.className = 'charge-promo-polling-status charge-promo-polling-status--waiting';
      el.innerHTML =
        '<span class="charge-promo-polling-dot" aria-hidden="true"></span> Aguardando confirmação do pagamento...';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      return;
    }
    if (pollingUI === 'timeout') {
      el.className = 'charge-promo-polling-status charge-promo-polling-status--timeout';
      el.textContent =
        'Ainda não recebemos a confirmação. Você pode manter esta tela aberta ou voltar mais tarde.';
      el.setAttribute('role', 'status');
      return;
    }
    el.className = 'charge-promo-polling-status is-hidden';
    el.textContent = '';
    el.removeAttribute('role');
    el.removeAttribute('aria-live');
  }

  function startPromotionPaymentPolling() {
    var pol = global.ChargePromotionPolling;
    if (!pol || typeof pol.start !== 'function' || !state.promotion || !state.pixPayload) {
      return;
    }
    var p = state.pixPayload;
    var started = pol.start({
      promotionId: state.promotion.id,
      promotionItems: state.promotion.items,
      pixCopiaECola: p.pixCopiaECola,
      txid: p.txid,
      callbacks: {
        onConfirmed: function () {
          pollingUI = 'idle';
          stopPromotionPaymentPolling();
          hide();
          var refresh = global.agilbankCobrancasRefresh;
          var msg = 'Pagamento confirmado. Suas cobranças foram atualizadas.';
          if (typeof refresh === 'function') {
            void Promise.resolve(refresh()).then(function () {
              showPromotionMessage(msg, 'Cobranças');
            });
          } else {
            showPromotionMessage(msg, 'Cobranças');
          }
        },
        onExpired: function () {
          pollingUI = 'idle';
          stopPromotionPaymentPolling();
          showPromotionMessage(
            'A promoção expirou antes da confirmação do pagamento.',
            'Promoção de cobranças'
          );
          void refreshPromotionAndMaybeHide();
        },
        onTimeout: function () {
          pollingUI = 'timeout';
          updatePollingStatusUI();
        },
        onPromotionUnavailable: function () {
          pollingUI = 'idle';
          stopPromotionPaymentPolling();
          hide();
          if (typeof global.agilbankCobrancasRefresh === 'function') {
            void global.agilbankCobrancasRefresh();
          }
        },
      },
    });
    if (started) {
      pollingUI = 'waiting';
      updatePollingStatusUI();
    }
  }

  function hide() {
    stopPromotionPaymentPolling();
    stopTimer();
    state.view = 'hidden';
    state.pixPayload = null;
    setOverlayVisible(false);
    setGruPanelVisible(true);
  }

  function showPromotionMessage(msg, title) {
    if (typeof global.mostrarAgilbankAviso === 'function') {
      global.mostrarAgilbankAviso(msg, title || 'Promoção de cobranças');
    } else {
      toast(msg);
    }
  }

  function mapPromotionPixError(body, status) {
    var code = body && (body.code || body.error);
    if (code === 'FEATURE_DISABLED' || code === 'PROMOTION_PIX_DISABLED') {
      return 'Promoção temporariamente indisponível. Tente novamente mais tarde.';
    }
    if (code === 'PROMOTION_EXPIRED') return 'EXPIRED';
    if (code === 'PROMOTION_PIX_ALREADY_PAID') {
      return 'O Pix promocional já foi pago ou está em processamento. Aguarde a confirmação.';
    }
    if (code === 'PIX_PROVIDER_NOT_CONFIGURED') {
      return 'Pagamento Pix promocional indisponível no momento. Tente mais tarde.';
    }
    if (code === 'PROMOTION_NOT_PAYABLE' || code === 'PROMOTION_NOT_ACTIVE') {
      return (body && body.message) || 'Promoção não está mais disponível.';
    }
    if (status >= 500 || code === 'INTERNAL_ERROR') {
      return 'Não foi possível gerar o Pix promocional. Tente novamente.';
    }
    return (body && body.message) || 'Não foi possível gerar o Pix promocional.';
  }

  function renderChargeRow(row) {
    return (
      '<div class="charge-row">' +
      '<div class="charge-ico ' +
      chargeIconClass(row.type) +
      '" aria-hidden="true">' +
      chargeIconSvg(row.type) +
      '</div>' +
      '<div class="charge-body">' +
      '<div class="charge-title">' +
      esc(row.title) +
      '</div>' +
      '<div class="charge-status">Em aberto</div>' +
      '</div>' +
      '<div class="charge-amount">' +
      esc(currencyBrl(row.amount)) +
      '</div>' +
      '</div>'
    );
  }

  function renderPixResult() {
    var p = state.pixPayload || {};
    var amount = p.amount != null ? currencyBrl(p.amount) : '—';
    var exp = p.expiresAt ? new Date(p.expiresAt) : null;
    var expTxt =
      exp && !isNaN(exp.getTime()) ? exp.toLocaleString('pt-BR') : '—';
    var h = '';
    h += '<div class="charge-promo-pix-result">';
    h += '<h3 class="charge-promo-pix-title">Pix promocional gerado</h3>';
    h += '<p class="charge-promo-pix-meta">Valor: <strong>' + esc(amount) + '</strong></p>';
    h += '<p class="charge-promo-pix-meta">Validade: ' + esc(expTxt) + '</p>';
    h += '<p class="charge-promo-pix-instr">' + esc(p.instructions || 'Utilize o código Pix abaixo para pagar todas as cobranças da promoção.') + '</p>';
    if (p.qrCodePix) {
      h +=
        '<div class="charge-promo-qr-wrap"><img src="' +
        esc(p.qrCodePix) +
        '" alt="QR Code Pix promocional" class="charge-promo-qr" /></div>';
    }
    h += '<p class="charge-promo-polling-status is-hidden" id="chargePromoPollingStatus"></p>';
    if (p.pixCopiaECola) {
      h += '<label class="charge-promo-pix-label" for="chargePromoPixPayload">Código Pix copia e cola</label>';
      h +=
        '<textarea id="chargePromoPixPayload" class="charge-promo-pix-payload" rows="4" readonly></textarea>';
      h +=
        '<button type="button" class="btn-main charge-promo-copy-btn" id="chargePromoCopyBtn">Copiar código Pix</button>';
    }
    h +=
      '<button type="button" class="btn-separate" id="chargePromoClosePixBtn">Pagar separadamente</button>';
    h += '</div>';
    return h;
  }

  function renderOffer() {
    var promotion = state.promotion;
    if (!promotion) return;

    var items = (promotion.items || []).map(function (it) {
      return mapItemRow(it, state.charges);
    });
    var count = items.length;
    var originalBrl = centsToBrl(promotion.originalAmountCents);
    var promoBrl = centsToBrl(promotion.promotionalAmountCents);
    var discountBrl = centsToBrl(promotion.discountAmountCents);

    var hdrEl = $('chargePromoHdrTitle');
    if (hdrEl) {
      hdrEl.innerHTML =
        count === 1
          ? 'Você tem <strong>1 cobrança</strong> em aberto'
          : 'Você tem <strong>' + count + ' cobranças</strong> em aberto';
    }

    var inner = $('chargePromoCardInner');
    if (!inner) return;

    var h = '';
    h += '<div class="card-header">';
    h += '<div class="card-header-icon" aria-hidden="true">';
    h += '<svg viewBox="0 0 24 24"><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M4 10h16v4H4z"/><path d="M12 2v4"/><path d="M8 6h8"/></svg>';
    h += '</div>';
    h += '<div class="card-header-text"><h2>Oferta especial de regularização</h2>';
    h += '<p>Combine suas cobranças e pague com condição especial.</p></div></div>';

    h += '<div class="charges">';
    items.forEach(function (row) {
      h += renderChargeRow(row);
    });
    h += '</div>';

    h +=
      '<div class="total-row">Total original: <span class="total-strike">' +
      esc(currencyBrl(originalBrl)) +
      '</span></div>';

    if (discountBrl != null && discountBrl > 0) {
      h +=
        '<p class="charge-promo-discount-line">Desconto de ' +
        esc(currencyBrl(discountBrl)) +
        ' (' +
        esc(String(promotion.discountPercent || 15)) +
        '%)</p>';
    }

    h += '<div class="agil-promo-banner" id="chargeOfferCard" role="region" aria-label="Oferta promocional">';
    h += '<div class="agil-promo-banner-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l1.2 4.2 4.2 1.2-4.2 1.2L12 13l-1.2-4.4L6.6 7.4l4.2-1.2L12 2z"/><path d="M19 13.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z"/></svg></div>';
    h += '<div class="agil-promo-banner-copy"><span class="agil-promo-banner-label">Hoje por</span>';
    h +=
      '<span class="agil-promo-banner-amount" id="chargeAgilPromoBannerAmount">' +
      promoBannerAmountHtml(promoBrl) +
      '</span></div></div>';

    h += '<div class="offer-timer agil-promo-timer" id="chargeOfferTimer">';
    h += '<div class="agil-promo-timer-icon offer-timer-icon timer-icon" aria-hidden="true">';
    h += '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>';
    h += '<div class="offer-timer-texts agil-promo-timer-copy timer-copy">';
    h += '<span class="offer-timer-label agil-promo-timer-title timer-title" id="chargeOfferTimerLabel">Oferta por tempo limitado</span>';
    h += '<div class="offer-timer-sublabel agil-promo-timer-subtitle timer-subtitle">';
    h += '<span id="chargeOfferTimerSub">Expira em</span>';
    h +=
      '<span class="offer-timer-value agil-promo-timer-value timer-value" id="chargeOfferTimerValue">--:--</span>';
    h += '</div></div></div>';

    h += '<div class="offer-hint" id="chargeOfferHint">';
    h += '<div class="offer-hint-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg></div>';
    h += '<div class="offer-hint-copy">';
    h +=
      '<p class="offer-hint-title">Quite as ' +
      count +
      ' cobranças com uma condição especial.</p>';
    h +=
      '<p class="offer-hint-sub">Após o pagamento, o status é atualizado automaticamente.</p>';
    h += '</div></div>';

    h += '<div class="actions">';
    h += '<button type="button" class="btn-main" id="chargePromoMainBtn" data-mode="promo">';
    h += '<span class="btn-main-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l1.2 4.2 4.2 1.2-4.2 1.2L12 13l-1.2-4.4L6.6 7.4l4.2-1.2L12 2z"/><path d="M19 13.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z"/></svg></span>';
    h += '<span class="btn-main-label">Aproveitar promoção</span>';
    h += '<span class="btn-main-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>';
    h += '</button>';
    h += '<button type="button" class="btn-separate" id="chargeBtnSeparate">Pagar separadamente &rsaquo;</button>';
    h += '</div>';

    inner.innerHTML = h;
    bindOfferEvents();
    startTimer(promotion.expiresInSeconds);
  }

  function bindOfferEvents() {
    var mainBtn = $('chargePromoMainBtn');
    var sepBtn = $('chargeBtnSeparate');
    if (mainBtn) {
      mainBtn.onclick = function () {
        if (mainBtn.disabled || isEmittingPix) return;
        void onAcceptPromotion();
      };
    }
    if (sepBtn) {
      sepBtn.onclick = function () {
        hide();
      };
    }
  }

  function bindPixResultEvents() {
    var copyBtn = $('chargePromoCopyBtn');
    var closeBtn = $('chargePromoClosePixBtn');
    var ta = $('chargePromoPixPayload');
    if (ta && state.pixPayload && state.pixPayload.pixCopiaECola) {
      ta.value = state.pixPayload.pixCopiaECola;
    }
    if (copyBtn) {
      copyBtn.onclick = function () {
        var text = ta && ta.value ? ta.value : '';
        if (!text) {
          toast('Nada para copiar.');
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(function () {
              toast('Código Pix copiado.');
            })
            .catch(function () {
              toast('Não foi possível copiar.');
            });
        }
      };
    }
    if (closeBtn) {
      closeBtn.onclick = function () {
        hide();
      };
    }
  }

  function renderPixView() {
    var inner = $('chargePromoCardInner');
    if (!inner) return;
    pollingUI = 'idle';
    inner.innerHTML = renderPixResult();
    bindPixResultEvents();
    stopTimer();
    startPromotionPaymentPolling();
  }

  function onAcceptPromotion() {
    if (!api || !state.promotion || !state.promotion.id) return;
    if (isEmittingPix || promoExpired) return;

    stopPromotionPaymentPolling();
    isEmittingPix = true;
    var mainBtn = $('chargePromoMainBtn');
    if (mainBtn) {
      mainBtn.disabled = true;
      var lbl = mainBtn.querySelector('.btn-main-label');
      if (lbl) lbl.textContent = 'Gerando Pix…';
    }

    api
      .emitPromotionPix(state.promotion.id)
      .then(function (result) {
        isEmittingPix = false;
        var res = result.res;
        var body = result.body;

        if (body && body.code === 'PROMOTION_EXPIRED') {
          showPromotionMessage('A promoção expirou. Atualizando oferta…');
          return refreshPromotionAndMaybeHide();
        }

        if (!res.ok || !body || !body.success) {
          var msg = mapPromotionPixError(body, res.status);
          if (msg === 'EXPIRED') {
            return refreshPromotionAndMaybeHide();
          }
          showPromotionMessage(msg);
          if (mainBtn) {
            mainBtn.disabled = promoExpired;
            var lbl2 = mainBtn.querySelector('.btn-main-label');
            if (lbl2 && !promoExpired) lbl2.textContent = 'Aproveitar promoção';
          }
          return;
        }

        state.pixPayload = body.data || {};
        state.view = 'pix';
        renderPixView();
        toast('Pix promocional pronto. Copie o código ou escaneie o QR.');
      })
      .catch(function () {
        isEmittingPix = false;
        showPromotionMessage('Falha de rede ao gerar Pix promocional.');
        if (mainBtn) {
          mainBtn.disabled = false;
          var lbl3 = mainBtn.querySelector('.btn-main-label');
          if (lbl3) lbl3.textContent = 'Aproveitar promoção';
        }
      });
  }

  function shouldShowPromotion(promotion, body) {
    if (!promotion) return false;
    if (body && body.data && body.data.reason === 'FEATURE_DISABLED') return false;
    if (String(promotion.status || '') !== 'ACTIVE') return false;
    if (!promotion.items || promotion.items.length < 1) return false;
    return true;
  }

  function refreshPromotionAndMaybeHide() {
    if (!api) return Promise.resolve();
    return api
      .fetchCurrentPromotion()
      .then(function (result) {
        var body = result.body;
        var promotion =
          body && body.success && body.data ? body.data.promotion : null;
        if (!shouldShowPromotion(promotion, body)) {
          state.promotion = null;
          hide();
          return;
        }
        state.promotion = promotion;
        state.view = 'offer';
        renderOffer();
        setOverlayVisible(true);
        setGruPanelVisible(false);
      })
      .catch(function () {
        hide();
      });
  }

  function show(promotion, chargesList) {
    state.promotion = promotion;
    state.charges = chargesList || [];
    state.pixPayload = null;
    state.view = 'offer';
    promoExpired = false;
    renderOffer();
    setOverlayVisible(true);
    setGruPanelVisible(false);
  }

  function tryShowAfterChargesLoaded(chargesList) {
    if (!api) return Promise.resolve();
    if (global.ChargePromotionPolling && global.ChargePromotionPolling.isActive()) {
      return Promise.resolve();
    }
    if (state.view === 'pix') {
      return Promise.resolve();
    }
    return api
      .fetchCurrentPromotion()
      .then(function (result) {
        var body = result.body;
        if (!result.res.ok || !body || !body.success) {
          hide();
          return;
        }
        var promotion = body.data ? body.data.promotion : null;
        if (!shouldShowPromotion(promotion, body)) {
          hide();
          return;
        }
        show(promotion, chargesList || []);
      })
      .catch(function () {
        hide();
      });
  }

  function handleIndividualPixBlocked(body) {
    var msg =
      (body && body.message) ||
      'Esta cobrança faz parte de uma promoção ativa. Use o Pix promocional agrupado ou aguarde a expiração da promoção.';
    showPromotionMessage(msg, 'Pix promocional');
    if (state.promotion) {
      show(state.promotion, state.charges || global.__agilbankChargesList || []);
    } else {
      void tryShowAfterChargesLoaded(global.__agilbankChargesList || []);
    }
  }

  function init() {
    var overlay = $('chargePromotionOverlay');
    if (!overlay) return;
    var backdrop = overlay.querySelector('.charge-promo-overlay-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        hide();
      });
    }
  }

  global.ChargePromotionModal = {
    init: init,
    hide: hide,
    show: show,
    tryShowAfterChargesLoaded: tryShowAfterChargesLoaded,
    refreshPromotionAndMaybeHide: refreshPromotionAndMaybeHide,
    handleIndividualPixBlocked: handleIndividualPixBlocked,
    getState: function () {
      return state;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : global);
