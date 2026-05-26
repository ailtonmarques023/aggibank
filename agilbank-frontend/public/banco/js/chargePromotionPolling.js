/**
 * Polling seguro pós-Pix promocional (Fatia 7).
 * Apenas GET; não marca cobrança como paga nem persiste Pix.
 */
(function (global) {
  'use strict';

  var INTERVAL_MS = 5000;
  var MAX_ATTEMPTS = 24;

  var api = null;
  var active = false;
  var timerId = null;
  var attempt = 0;
  var ctx = {
    promotionId: null,
    trackedChargeIds: [],
    callbacks: null,
  };

  function getApiModule() {
    return global.ChargePromotionApi;
  }

  function isSuccessfulApiPayload(result) {
    return !!(
      result &&
      result.res &&
      result.res.ok &&
      result.body &&
      result.body.success === true
    );
  }

  function extractChargesList(body) {
    if (!body || !body.success) return [];
    return body.data && body.data.charges ? body.data.charges : [];
  }

  function extractPromotion(body) {
    if (!body || !body.success) return null;
    return body.data ? body.data.promotion : null;
  }

  function getTrackedChargeIds(items) {
    return (items || [])
      .map(function (it) {
        return String(it.publicChargeId || '').trim();
      })
      .filter(Boolean);
  }

  function areAnyPromotionChargesStillOpen(trackedIds, chargesList) {
    if (!trackedIds.length) return false;
    var openIds = {};
    (chargesList || []).forEach(function (ch) {
      openIds[String(ch.id || '')] = true;
    });
    return trackedIds.some(function (id) {
      return !!openIds[id];
    });
  }

  function evaluatePromotion(promotion, trackedPromotionId) {
    if (!promotion) return 'null';
    if (String(promotion.id || '') !== String(trackedPromotionId || '')) {
      return 'different';
    }
    var status = String(promotion.status || '').toUpperCase();
    if (status === 'PAID') return 'paid';
    if (status === 'EXPIRED') return 'expired';
    if (status === 'ACTIVE') return 'active';
    return 'other';
  }

  /**
   * Decide próximo passo do polling com base em respostas GET válidas.
   * Falha de rede ou HTTP/body inválido nunca confirma pagamento.
   *
   * @returns {{ action: 'confirmed'|'expired'|'unavailable'|'timeout'|'retry', chargesList?: object[] }}
   */
  function decideTickOutcome(opts) {
    var attemptNum = opts.attempt;
    var maxAttempts = opts.maxAttempts;
    var trackedIds = opts.trackedChargeIds || [];
    var promotionId = opts.promotionId;
    var promoResult = opts.promoResult;
    var chargesResult = opts.chargesResult;

    if (attemptNum > maxAttempts) {
      return { action: 'timeout' };
    }

    var chargesOk = isSuccessfulApiPayload(chargesResult);
    if (!chargesOk) {
      return { action: attemptNum >= maxAttempts ? 'timeout' : 'retry' };
    }

    var chargesList = extractChargesList(chargesResult.body);
    var stillOpen = areAnyPromotionChargesStillOpen(trackedIds, chargesList);

    if (!stillOpen && trackedIds.length) {
      return { action: 'confirmed', chargesList: chargesList };
    }

    var promoOk = isSuccessfulApiPayload(promoResult);
    if (!promoOk) {
      return { action: attemptNum >= maxAttempts ? 'timeout' : 'retry' };
    }

    var promotion = extractPromotion(promoResult.body);
    var evalKind = evaluatePromotion(promotion, promotionId);

    if (evalKind === 'expired') {
      return { action: 'expired', chargesList: chargesList };
    }

    if (evalKind === 'paid' && !stillOpen && trackedIds.length) {
      return { action: 'confirmed', chargesList: chargesList };
    }

    if (evalKind === 'null' || evalKind === 'different') {
      if (!stillOpen && trackedIds.length) {
        return { action: 'confirmed', chargesList: chargesList };
      }
      return { action: 'unavailable', chargesList: chargesList };
    }

    return {
      action: attemptNum >= maxAttempts ? 'timeout' : 'retry',
      chargesList: chargesList,
    };
  }

  function isPollingContextVisible() {
    var container = document.getElementById('containerGerarBoletoPix');
    var overlay = document.getElementById('chargePromotionOverlay');
    if (!container || container.style.display === 'none') return false;
    if (!overlay || overlay.style.display === 'none') return false;
    return true;
  }

  function clearTimer() {
    if (timerId != null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function stop() {
    active = false;
    clearTimer();
    attempt = 0;
    ctx.promotionId = null;
    ctx.trackedChargeIds = [];
    ctx.callbacks = null;
  }

  function isActive() {
    return active;
  }

  function scheduleNext() {
    clearTimer();
    if (!active) return;
    timerId = setTimeout(function () {
      void runTick();
    }, INTERVAL_MS);
  }

  function finish(kind, chargesList) {
    var callbacks = ctx.callbacks;
    var promotionId = ctx.promotionId;
    stop();
    if (!callbacks) return;
    if (kind === 'confirmed' && typeof callbacks.onConfirmed === 'function') {
      callbacks.onConfirmed({ chargesList: chargesList || [] });
      return;
    }
    if (kind === 'expired' && typeof callbacks.onExpired === 'function') {
      callbacks.onExpired({ promotionId: promotionId });
      return;
    }
    if (kind === 'timeout' && typeof callbacks.onTimeout === 'function') {
      callbacks.onTimeout({ promotionId: promotionId });
      return;
    }
    if (
      kind === 'unavailable' &&
      typeof callbacks.onPromotionUnavailable === 'function'
    ) {
      callbacks.onPromotionUnavailable({ chargesList: chargesList || [] });
    }
  }

  function applyTickOutcome(outcome) {
    if (!outcome || !active) return;
    if (outcome.action === 'confirmed') {
      finish('confirmed', outcome.chargesList);
      return;
    }
    if (outcome.action === 'expired') {
      finish('expired', outcome.chargesList);
      return;
    }
    if (outcome.action === 'unavailable') {
      finish('unavailable', outcome.chargesList);
      return;
    }
    if (outcome.action === 'timeout') {
      finish('timeout', outcome.chargesList);
      return;
    }
    scheduleNext();
  }

  function runTick() {
    if (!active) return;

    if (!isPollingContextVisible()) {
      stop();
      return;
    }

    attempt += 1;
    if (attempt > MAX_ATTEMPTS) {
      finish('timeout');
      return;
    }

    var apiMod = api || getApiModule();
    if (!apiMod) {
      applyTickOutcome({
        action: attempt >= MAX_ATTEMPTS ? 'timeout' : 'retry',
      });
      return;
    }

    Promise.all([
      apiMod.fetchCurrentPromotion().catch(function () {
        return { res: { ok: false }, body: { success: false } };
      }),
      apiMod.fetchCharges().catch(function () {
        return { res: { ok: false }, body: { success: false } };
      }),
    ])
      .then(function (results) {
        if (!active) return;

        var outcome = decideTickOutcome({
          attempt: attempt,
          maxAttempts: MAX_ATTEMPTS,
          trackedChargeIds: ctx.trackedChargeIds,
          promotionId: ctx.promotionId,
          promoResult: results[0],
          chargesResult: results[1],
        });

        if (isSuccessfulApiPayload(results[1])) {
          global.__agilbankChargesList = extractChargesList(results[1].body);
        }

        applyTickOutcome(outcome);
      })
      .catch(function () {
        if (!active) return;
        applyTickOutcome({
          action: attempt >= MAX_ATTEMPTS ? 'timeout' : 'retry',
        });
      });
  }

  /**
   * @param {{ promotionId: string, promotionItems: object[], callbacks: object }} options
   */
  function start(options) {
    var opts = options || {};
    var promotionId = String(opts.promotionId || '').trim();
    var items = opts.promotionItems || [];
    var tracked = getTrackedChargeIds(items);

    if (!promotionId || !tracked.length) return false;

    var hasPix =
      opts.pixCopiaECola && String(opts.pixCopiaECola).trim().length > 0;
    var hasTxid = opts.txid && String(opts.txid).trim().length > 0;
    if (!hasPix && !hasTxid) return false;

    stop();

    api = getApiModule();
    active = true;
    attempt = 0;
    ctx.promotionId = promotionId;
    ctx.trackedChargeIds = tracked;
    ctx.callbacks = opts.callbacks || {};

    timerId = setTimeout(function () {
      void runTick();
    }, INTERVAL_MS);

    return true;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && active) {
        stop();
      }
    });
  }

  global.ChargePromotionPolling = {
    start: start,
    stop: stop,
    isActive: isActive,
    INTERVAL_MS: INTERVAL_MS,
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    _test: {
      getTrackedChargeIds: getTrackedChargeIds,
      areAnyPromotionChargesStillOpen: areAnyPromotionChargesStillOpen,
      evaluatePromotion: evaluatePromotion,
      isSuccessfulApiPayload: isSuccessfulApiPayload,
      decideTickOutcome: decideTickOutcome,
      extractChargesList: extractChargesList,
    },
  };
})(typeof window !== 'undefined' ? window : global);
