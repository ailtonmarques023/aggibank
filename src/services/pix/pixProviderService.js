'use strict';

/**
 * Fachada de provedor Pix para o domínio AgilBank (Fase Q).
 * Rotas e regras de negócio devem depender deste módulo, não do cliente Efí diretamente.
 */
const registry = require('./pixProviderRegistry');

function isPixChargeProviderConfigured() {
  const id = registry.getChargePixProviderId();
  const adapter = registry.getChargePixAdapter(id);
  return adapter.isConfigured();
}

async function createOrGetPixChargeForCharge(params) {
  const id = registry.getChargePixProviderId();
  const adapter = registry.getChargePixAdapter(id);
  return adapter.createOrGetPixCharge(params);
}

async function processChargeWebhookBody(body, ctx) {
  const id = registry.getChargePixProviderId();
  const adapter = registry.getChargePixAdapter(id);
  if (typeof adapter.processWebhookBody !== 'function') {
    throw new Error('PIX_PROVIDER_WEBHOOK_NOT_SUPPORTED');
  }
  return adapter.processWebhookBody(body, ctx);
}

module.exports = {
  isPixChargeProviderConfigured,
  createOrGetPixChargeForCharge,
  processChargeWebhookBody,
};
