/**
 * Testes do polling promocional (Fatia 7 — frontend).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROMO_ID = 'promo-test-1';
const TRACKED = ['gru_1', 'lic_2'];

function loadPollingSandbox(extra) {
  const pollingPath = path.resolve(
    __dirname,
    '../agilbank-frontend/public/banco/js/chargePromotionPolling.js'
  );
  const pollingCode = fs.readFileSync(pollingPath, 'utf8');
  const sandbox = {
    window: {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    document: {
      addEventListener: function () {},
      getElementById: function (id) {
        if (id === 'containerGerarBoletoPix' || id === 'chargePromotionOverlay') {
          return { style: { display: 'block' } };
        }
        return null;
      },
    },
    ChargePromotionApi: null,
    ...(extra || {}),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(pollingCode, sandbox);
  return sandbox;
}

function loadPollingTestHelpers() {
  return loadPollingSandbox().ChargePromotionPolling._test;
}

function activePromotionBody() {
  return {
    success: true,
    data: {
      promotion: {
        id: PROMO_ID,
        status: 'ACTIVE',
        items: TRACKED.map((id) => ({ publicChargeId: id })),
      },
    },
  };
}

function chargesBody(charges) {
  return {
    success: true,
    data: { charges: charges || [] },
  };
}

describe('chargePromotionPolling frontend helpers', () => {
  const t = loadPollingTestHelpers();

  test('detecta cobranças da promoção ainda abertas', () => {
    expect(
      t.areAnyPromotionChargesStillOpen(TRACKED, [
        { id: 'gru_1', amount: 10 },
        { id: 'other', amount: 5 },
      ])
    ).toBe(true);
    expect(
      t.areAnyPromotionChargesStillOpen(TRACKED, [{ id: 'other', amount: 5 }])
    ).toBe(false);
  });

  test('avalia status da promoção vinculada ao promotionId', () => {
    expect(t.evaluatePromotion(null, PROMO_ID)).toBe('null');
    expect(t.evaluatePromotion({ id: 'other', status: 'ACTIVE' }, PROMO_ID)).toBe(
      'different'
    );
    expect(t.evaluatePromotion({ id: PROMO_ID, status: 'ACTIVE' }, PROMO_ID)).toBe(
      'active'
    );
    expect(t.evaluatePromotion({ id: PROMO_ID, status: 'EXPIRED' }, PROMO_ID)).toBe(
      'expired'
    );
    expect(t.evaluatePromotion({ id: PROMO_ID, status: 'PAID' }, PROMO_ID)).toBe('paid');
  });

  test('extrai publicChargeId dos itens da promoção', () => {
    expect(
      t.getTrackedChargeIds([
        { publicChargeId: 'gru_10' },
        { publicChargeId: '' },
        { publicChargeId: 'csh_3' },
      ])
    ).toEqual(['gru_10', 'csh_3']);
  });
});

describe('chargePromotionPolling decideTickOutcome — falhas GET', () => {
  const t = loadPollingTestHelpers();
  const baseOpts = {
    attempt: 1,
    maxAttempts: 24,
    trackedChargeIds: TRACKED,
    promotionId: PROMO_ID,
  };

  const promoActive = {
    res: { ok: true },
    body: activePromotionBody(),
  };

  test('fetchCharges rejeitado/falho com promo ACTIVE não confirma — agenda retry', () => {
    const outcome = t.decideTickOutcome({
      ...baseOpts,
      promoResult: promoActive,
      chargesResult: null,
    });
    expect(outcome.action).toBe('retry');
    expect(outcome.chargesList).toBeUndefined();
  });

  test('fetchCharges HTTP 500 não confirma — agenda retry', () => {
    const outcome = t.decideTickOutcome({
      ...baseOpts,
      promoResult: promoActive,
      chargesResult: {
        res: { ok: false, status: 500 },
        body: { success: false, message: 'Erro interno' },
      },
    });
    expect(outcome.action).toBe('retry');
  });

  test('fetchCharges falho na última tentativa resulta em timeout, não confirmed', () => {
    const outcome = t.decideTickOutcome({
      ...baseOpts,
      attempt: 24,
      maxAttempts: 24,
      promoResult: promoActive,
      chargesResult: null,
    });
    expect(outcome.action).toBe('timeout');
  });

  test('fetchCurrentPromotion falho não trata como promotion null — retry', () => {
    const outcome = t.decideTickOutcome({
      ...baseOpts,
      promoResult: null,
      chargesResult: {
        res: { ok: true },
        body: chargesBody([{ id: 'gru_1' }, { id: 'lic_2' }]),
      },
    });
    expect(outcome.action).toBe('retry');
  });

  test('somente fetchCharges OK sem publicChargeId rastreados confirma pagamento', () => {
    const outcome = t.decideTickOutcome({
      ...baseOpts,
      promoResult: promoActive,
      chargesResult: {
        res: { ok: true },
        body: chargesBody([{ id: 'outra_cobranca' }]),
      },
    });
    expect(outcome.action).toBe('confirmed');
    expect(outcome.chargesList).toEqual([{ id: 'outra_cobranca' }]);
  });
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('chargePromotionPolling runTick integrado — callbacks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function startWithMocks(fetchPromotion, fetchCharges, callbacks) {
    const sandbox = loadPollingSandbox({
      ChargePromotionApi: {
        fetchCurrentPromotion: fetchPromotion,
        fetchCharges: fetchCharges,
      },
    });
    const polling = sandbox.ChargePromotionPolling;
    polling.start({
      promotionId: PROMO_ID,
      promotionItems: TRACKED.map((id) => ({ publicChargeId: id })),
      pixCopiaECola: '00020126580014br.gov.bcb.pix',
      callbacks,
    });
    return polling;
  }

  test('fetchCharges rejeita e promo ACTIVE: não chama onConfirmed; reagenda', async () => {
    const onConfirmed = jest.fn();
    const onTimeout = jest.fn();
    const fetchCharges = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        res: { ok: true },
        body: chargesBody([{ id: 'gru_1' }]),
      });

    const polling = startWithMocks(
      jest.fn().mockResolvedValue({
        res: { ok: true },
        body: activePromotionBody(),
      }),
      fetchCharges,
      { onConfirmed, onTimeout }
    );

    await jest.advanceTimersByTimeAsync(5000);
    await flushPromises();

    expect(onConfirmed).not.toHaveBeenCalled();
    expect(polling.isActive()).toBe(true);
    expect(fetchCharges).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5000);
    await flushPromises();

    expect(fetchCharges).toHaveBeenCalledTimes(2);
    expect(onConfirmed).not.toHaveBeenCalled();
    polling.stop();
  });

  test('fetchCharges retorna 500: não chama onConfirmed', async () => {
    const onConfirmed = jest.fn();
    const fetchCharges = jest.fn().mockResolvedValue({
      res: { ok: false, status: 500 },
      body: { success: false },
    });

    const polling = startWithMocks(
      jest.fn().mockResolvedValue({
        res: { ok: true },
        body: activePromotionBody(),
      }),
      fetchCharges,
      { onConfirmed }
    );

    await jest.advanceTimersByTimeAsync(5000);
    await flushPromises();

    expect(onConfirmed).not.toHaveBeenCalled();
    expect(polling.isActive()).toBe(true);
    polling.stop();
  });

  test('fetchCharges OK sem cobranças rastreadas chama onConfirmed', async () => {
    const onConfirmed = jest.fn();
    const fetchCharges = jest.fn().mockResolvedValue({
      res: { ok: true },
      body: chargesBody([]),
    });

    const polling = startWithMocks(
      jest.fn().mockResolvedValue({
        res: { ok: true },
        body: activePromotionBody(),
      }),
      fetchCharges,
      { onConfirmed }
    );

    await jest.advanceTimersByTimeAsync(5000);
    await flushPromises();

    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(polling.isActive()).toBe(false);
  });
});
