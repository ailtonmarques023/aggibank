'use strict';

const request = require('supertest');
const app = require('../src/server');
const pixSvc = require('../src/services/pixEfiWebhookService');

describe('POST /api/internal/efi/pix/webhook', () => {
  const prev = process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY;
  let spy;

  beforeEach(() => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'test-internal-webhook-key-fase-o';
    spy = jest.spyOn(pixSvc, 'processEfiPixWebhookBody').mockResolvedValue({
      ok: true,
      code: 'OK',
      results: [{ txid: 't1', endToEndId: 'E1', result: 'PROCESSED' }],
    });
  });

  afterEach(() => {
    spy.mockRestore();
    if (prev !== undefined) process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = prev;
    else delete process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY;
  });

  it('retorna 503 quando chave interna não configurada', async () => {
    delete process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY;
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'x')
      .send({ pix: [] });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('INTERNAL_OPERATION_UNAVAILABLE');
  });

  it('retorna 403 quando x-internal-key inválida', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'wrong')
      .send({ pix: [] });
    expect(res.status).toBe(403);
  });

  it('retorna 200 e repassa resultado do serviço', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'secret-webhook-o')
      .send({ pix: [{ endToEndId: 'E1', txid: 't1', valor: '1.00' }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results[0].result).toBe('PROCESSED');
    expect(spy).toHaveBeenCalled();
  });

  it('retorna 400 quando serviço sinaliza corpo inválido', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    spy.mockResolvedValueOnce({ ok: false, code: 'INVALID_BODY', results: [] });
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'secret-webhook-o')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
  });
});
