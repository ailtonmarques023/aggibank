'use strict';

const { PIX_PROVIDER_ID } = require('./pixProviderTypes');

/**
 * Provedor Pix para emissão de cobrança vinculada a `charges`.
 * `PIX_CHARGE_PROVIDER` (default EFI) — futuro: STONE, PAGSEGURO, etc.
 */
function getChargePixProviderId() {
  const raw = String(process.env.PIX_CHARGE_PROVIDER || process.env.PIX_PROVIDER || 'EFI')
    .trim()
    .toUpperCase();
  if (raw === 'EFI' || raw === 'EFÍ') return PIX_PROVIDER_ID.EFI;
  return PIX_PROVIDER_ID.EFI;
}

function getChargePixAdapter(providerId) {
  if (providerId === PIX_PROVIDER_ID.EFI) {
    return require('./providers/efiPixProvider');
  }
  return require('./providers/efiPixProvider');
}

module.exports = {
  getChargePixProviderId,
  getChargePixAdapter,
};
