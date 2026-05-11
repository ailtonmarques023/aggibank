'use strict';

const pixProviderService = require('../src/services/pix/pixProviderService');
const registry = require('../src/services/pix/pixProviderRegistry');
const { PIX_PROVIDER_ID } = require('../src/services/pix/pixProviderTypes');
const pixEfiWebhookService = require('../src/services/pixEfiWebhookService');

describe('pixProviderService (Fase Q)', () => {
  it('resolve provedor padrão EFI', () => {
    expect(registry.getChargePixProviderId()).toBe(PIX_PROVIDER_ID.EFI);
  });

  it('processChargeWebhookBody delega ao serviço de webhook do adaptador EFI', async () => {
    const spy = jest.spyOn(pixEfiWebhookService, 'processEfiPixWebhookBody').mockResolvedValue({
      ok: true,
      code: 'OK',
      results: [],
    });
    const out = await pixProviderService.processChargeWebhookBody({ pix: [] }, { requestId: 'r1' });
    expect(out.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith({ pix: [] }, { requestId: 'r1' });
    spy.mockRestore();
  });
});
