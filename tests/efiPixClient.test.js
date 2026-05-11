'use strict';

describe('efiPixClient — Fase N / N-PROD', () => {
  const efi = require('../src/services/efiPixClient');

  const keys = [
    'EFI_ENVIRONMENT',
    'EFI_PIX_ENABLE_PRODUCTION',
    'EFI_PIX_PRODUCTION_MAX_ORIGINAL',
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
    delete process.env.EFI_PIX_ENABLE_PRODUCTION;
    delete process.env.EFI_PIX_PRODUCTION_MAX_ORIGINAL;
    process.env.EFI_ENVIRONMENT = 'sandbox';
  });

  it('getBaseUrl usa homologação em sandbox', () => {
    expect(efi.getBaseUrl()).toBe('https://pix-h.api.efipay.com.br');
  });

  it('isEfiPixConfigured é falso em production sem EFI_PIX_ENABLE_PRODUCTION', () => {
    process.env.EFI_ENVIRONMENT = 'production';
    process.env.EFI_CLIENT_ID = 'x';
    process.env.EFI_CLIENT_SECRET = 'y';
    process.env.EFI_PIX_KEY = 'z';
    process.env.EFI_CERTIFICATE_BASE64 = Buffer.from('x').toString('base64');
    expect(efi.isEfiPixConfigured()).toBe(false);
  });

  it('createImmediateCob rejeita production sem opt-in explícito', async () => {
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
    ).rejects.toMatchObject({ code: 'EFI_PRODUCTION_NOT_ENABLED' });
  });

  it('com production + EFI_PIX_ENABLE_PRODUCTION=true, getBaseUrl usa host produção', () => {
    process.env.EFI_ENVIRONMENT = 'production';
    process.env.EFI_PIX_ENABLE_PRODUCTION = 'true';
    expect(efi.getBaseUrl()).toBe('https://api.efipay.com.br');
  });

  it('com production + flag, isEfiPixConfigured verdadeiro quando credenciais completas', () => {
    process.env.EFI_ENVIRONMENT = 'production';
    process.env.EFI_PIX_ENABLE_PRODUCTION = 'true';
    process.env.EFI_CLIENT_ID = 'x';
    process.env.EFI_CLIENT_SECRET = 'y';
    process.env.EFI_PIX_KEY = 'z';
    process.env.EFI_CERTIFICATE_BASE64 = Buffer.from('x').toString('base64');
    expect(efi.isEfiPixConfigured()).toBe(true);
  });

  it('em produção habilitada, respeita EFI_PIX_PRODUCTION_MAX_ORIGINAL', async () => {
    process.env.EFI_ENVIRONMENT = 'production';
    process.env.EFI_PIX_ENABLE_PRODUCTION = 'true';
    process.env.EFI_CLIENT_ID = 'x';
    process.env.EFI_CLIENT_SECRET = 'y';
    process.env.EFI_PIX_KEY = 'z';
    process.env.EFI_CERTIFICATE_BASE64 = Buffer.from('x').toString('base64');
    process.env.EFI_PIX_PRODUCTION_MAX_ORIGINAL = '5.00';
    await expect(
      efi.createImmediateCob({
        txid: 'txidProdCapUnitTestCharge0000001',
        amount: 10,
        debtorCpf: '09516717008',
        debtorName: 'Teste',
      }),
    ).rejects.toMatchObject({ code: 'EFI_AMOUNT_ABOVE_PRODUCTION_CAP' });
  });
});
