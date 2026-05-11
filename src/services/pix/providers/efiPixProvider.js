'use strict';

/**
 * Adaptador Efí → contrato genérico de emissão/consulta de cobrança Pix (Fase Q).
 * Regras de API HTTP e payload bruto permanecem em `efiPixClient`; persistência em `pixCobrancaEfiService`.
 */
const efiPixClient = require('../../efiPixClient');
const pixCobrancaEfiService = require('../../pixCobrancaEfiService');

module.exports = {
  id: 'EFI',

  isConfigured() {
    return efiPixClient.isEfiPixConfigured();
  },

  async createOrGetPixCharge(params) {
    return pixCobrancaEfiService.getOrCreateEfiPixForCharge(params);
  },

  /** Webhook no formato do PSP atual (Efí); normalização futura no serviço de domínio. */
  async processWebhookBody(body, ctx) {
    const pixEfiWebhookService = require('../../pixEfiWebhookService');
    return pixEfiWebhookService.processEfiPixWebhookBody(body, ctx);
  },
};
