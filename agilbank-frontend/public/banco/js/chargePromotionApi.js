/**
 * API de promoção de cobranças (Fatia 6 — frontend).
 * Usa legacyApiClient; não calcula valores nem elegibilidade.
 */
(function (global) {
  'use strict';

  function getApi() {
    return global.legacyApiClient || (global.AgilBank && global.AgilBank.api);
  }

  function parseJsonResponse(res) {
    return res.json().then(function (body) {
      return { res: res, body: body || {} };
    });
  }

  /**
   * @returns {Promise<{ res: Response, body: object }>}
   */
  function fetchCurrentPromotion() {
    var api = getApi();
    if (!api || typeof api.request !== 'function') {
      return Promise.reject(new Error('API_UNAVAILABLE'));
    }
    return api
      .request('charges/promotions/current', { method: 'GET' })
      .then(parseJsonResponse);
  }

  /**
   * @param {string} promotionId
   * @returns {Promise<{ res: Response, body: object }>}
   */
  function emitPromotionPix(promotionId) {
    var api = getApi();
    if (!api || typeof api.request !== 'function') {
      return Promise.reject(new Error('API_UNAVAILABLE'));
    }
    var id = String(promotionId || '').trim();
    if (!id) {
      return Promise.reject(new Error('PROMOTION_ID_REQUIRED'));
    }
    return api
      .request('charges/promotions/' + encodeURIComponent(id) + '/pix', {
        method: 'POST',
        body: '{}',
      })
      .then(parseJsonResponse);
  }

  global.ChargePromotionApi = {
    fetchCurrentPromotion: fetchCurrentPromotion,
    emitPromotionPix: emitPromotionPix,
  };
})(typeof window !== 'undefined' ? window : global);
