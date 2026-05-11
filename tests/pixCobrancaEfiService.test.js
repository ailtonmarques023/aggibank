'use strict';

const { prisma } = require('../src/config/database');
const efiPixClient = require('../src/services/efiPixClient');
const {
  getOrCreateEfiPixForCharge,
  EfiPixClientError,
} = require('../src/services/pixCobrancaEfiService');

describe('pixCobrancaEfiService.getOrCreateEfiPixForCharge', () => {
  beforeEach(() => {
    jest.spyOn(efiPixClient, 'isEfiPixConfigured').mockReturnValue(true);
    jest.spyOn(efiPixClient, 'createImmediateCob').mockResolvedValue({
      txid: 'txidFromEfiMockUnitTest0001',
      pixCopiaECola: '00020101021226840014BR.GOV.BCB.PIX2564UNITMOCK',
      qrCodePix: null,
      status: 'ATIVA',
      providerReference: '100',
      expiresAt: new Date(Date.now() + 3600000),
      raw: { status: 'ATIVA' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retorna cobrança ativa existente sem chamar a Efí de novo', async () => {
    const existing = {
      id: 'row1',
      userId: 'u1',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'lic1',
      amount: 39.9,
      status: 'ATIVA',
      txid: 'existingTxidUnitTestCharge0001',
      providerReference: '1',
      pixCopiaECola: '000201existing',
      qrCodePix: null,
      expiresAt: new Date(Date.now() + 86400000),
      paidAt: null,
      idempotencyKey: 'k',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.pixCobranca.findFirst.mockResolvedValue(existing);

    const out = await getOrCreateEfiPixForCharge({
      userId: 'u1',
      chargeKind: 'loan_insurance',
      linkedEntityId: 'lic1',
      amount: 39.9,
      debtorCpf: '09516717008',
      debtorName: 'Teste',
    });

    expect(efiPixClient.createImmediateCob).not.toHaveBeenCalled();
    expect(out.txid).toBe('existingTxidUnitTestCharge0001');
    expect(out.pixCopiaECola).toBe('000201existing');
    expect(out.source).toBe('efi');
    expect(out.provider).toBe('EFI');
  });

  it('cria na Efí e persiste quando não há cobrança ativa', async () => {
    prisma.pixCobranca.findFirst.mockResolvedValue(null);
    const created = {
      id: 'new1',
      userId: 'u1',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'lic1',
      amount: 39.9,
      status: 'ATIVA',
      txid: 'txidFromEfiMockUnitTest0001',
      providerReference: '100',
      pixCopiaECola: '00020101021226840014BR.GOV.BCB.PIX2564UNITMOCK',
      qrCodePix: null,
      expiresAt: new Date(Date.now() + 3600000),
      paidAt: null,
      idempotencyKey: 'efi_emit:loan_insurance:lic1:txidFromEfiMockUnitTest0001',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.pixCobranca.create.mockResolvedValue(created);

    const out = await getOrCreateEfiPixForCharge({
      userId: 'u1',
      chargeKind: 'loan_insurance',
      linkedEntityId: 'lic1',
      amount: 39.9,
      debtorCpf: '09516717008',
      debtorName: 'Teste',
    });

    expect(efiPixClient.createImmediateCob).toHaveBeenCalled();
    expect(prisma.pixCobranca.create).toHaveBeenCalled();
    const createArg = prisma.pixCobranca.create.mock.calls[0][0];
    expect(createArg.data.provider).toBe('EFI');
    expect(out.txid).toBe('txidFromEfiMockUnitTest0001');
    expect(out.pixCopiaECola).toContain('000201');
  });

  it('lança quando Efí não está configurada', async () => {
    jest.spyOn(efiPixClient, 'isEfiPixConfigured').mockReturnValue(false);
    await expect(
      getOrCreateEfiPixForCharge({
        userId: 'u1',
        chargeKind: 'loan_insurance',
        linkedEntityId: 'lic1',
        amount: 39.9,
        debtorCpf: '09516717008',
        debtorName: 'Teste',
      }),
    ).rejects.toBeInstanceOf(EfiPixClientError);
  });
});
