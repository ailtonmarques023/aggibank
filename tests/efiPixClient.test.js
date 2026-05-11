'use strict';

describe('efiPixClient — Fase N sandbox', () => {
  const efi = require('../src/services/efiPixClient');

  const keys = [
    'EFI_ENVIRONMENT',
    'EFI_CLIENT_ID',
    'EFI_CLIENT_SECRET',
    'EFI_PIX_KEY',
    'EFI_CERTIFICATE_BASE64',
    'EFI_CERTIFICATE_PATH',
  ];
  const snapshot = {};

  beforeAll(() => {
    keys.forEach((k) => {
      snapshot[k] = process.env[k];
    });
  });

  afterEach(() => {
    keys.forEach((k) => {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    });
  });

  beforeEach(() => {
    delete process.env.EFI_CLIENT_ID;
    delete process.env.EFI_CLIENT_SECRET;
    delete process.env.EFI_PIX_KEY;
    delete process.env.EFI_CERTIFICATE_BASE64;
    delete process.env.EFI_CERTIFICATE_PATH;
    process.env.EFI_ENVIRONMENT = 'sandbox';
  });

  it('getBaseUrl aponta apenas para homologação Efí', () => {
    expect(efi.getBaseUrl()).toBe('https://pix-h.api.efipay.com.br');
  });

  it('isEfiPixConfigured é falso em EFI_ENVIRONMENT=production', () => {
    process.env.EFI_ENVIRONMENT = 'production';
    process.env.EFI_CLIENT_ID = 'x';
    process.env.EFI_CLIENT_SECRET = 'y';
    process.env.EFI_PIX_KEY = 'z';
    process.env.EFI_CERTIFICATE_BASE64 = Buffer.from('x').toString('base64');
    expect(efi.isEfiPixConfigured()).toBe(false);
  });

  it('createImmediateCob rejeita produção com código dedicado', async () => {
    process.env.EFI_ENVIRONMENT = 'production';
    process.env.EFI_CLIENT_ID = 'x';
    process.env.EFI_CLIENT_SECRET = 'y';
    process.env.EFI_PIX_KEY = 'z';
    process.env.EFI_CERTIFICATE_BASE64 = Buffer.from('x').toString('base64');
    await expect(
      efi.createImmediateCob({
        txid: 'txidProdBlockUnitTestCharge00001',
        amount: 10,
        debtorCpf: '09516717008',
        debtorName: 'Teste',
      }),
    ).rejects.toMatchObject({ code: 'EFI_PRODUCTION_DISABLED' });
  });
});
