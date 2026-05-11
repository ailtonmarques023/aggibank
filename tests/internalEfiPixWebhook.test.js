'use strict';

const request = require('supertest');
const app = require('../src/server');
const pixSvc = require('../src/services/pixEfiWebhookService');

describe('POST /api/internal/efi/pix/webhook', () => {
  const prevInternal = process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY;
  const prevCallback = process.env.EFI_PIX_WEBHOOK_CALLBACK_TOKEN;
  let spy;

  beforeEach(() => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'test-internal-webhook-key-fase-o';
    delete process.env.EFI_PIX_WEBHOOK_CALLBACK_TOKEN;
    spy = jest.spyOn(pixSvc, 'processEfiPixWebhookBody').mockResolvedValue({
      ok: true,
      code: 'OK',
      results: [{ txid: 't1', endToEndId: 'E1', result: 'PROCESSED' }],
    });
  });

  afterEach(() => {
    spy.mockRestore();
    if (prevInternal !== undefined) process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = prevInternal;
    else delete process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY;
    if (prevCallback !== undefined) process.env.EFI_PIX_WEBHOOK_CALLBACK_TOKEN = prevCallback;
    else delete process.env.EFI_PIX_WEBHOOK_CALLBACK_TOKEN;
  });

  it('retorna 503 quando nenhuma chave de webhook está configurada', async () => {
    delete process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY;
    delete process.env.EFI_PIX_WEBHOOK_CALLBACK_TOKEN;
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'x')
      .send({ pix: [] });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('INTERNAL_OPERATION_UNAVAILABLE');
  });

  it('retorna 403 quando x-internal-key inválida e sem efiwk', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'wrong')
      .send({ pix: [] });
    expect(res.status).toBe(403);
  });

  it('POST autenticado com corpo vazio retorna 200 EFI_WEBHOOK_VALIDATION_OK e não chama o serviço', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'secret-webhook-o')
      .set('Content-Type', 'application/json')
      .send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, code: 'EFI_WEBHOOK_VALIDATION_OK' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('POST autenticado com {} retorna 200 EFI_WEBHOOK_VALIDATION_OK e não chama o serviço', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'secret-webhook-o')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, code: 'EFI_WEBHOOK_VALIDATION_OK' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('POST com pix que não é array retorna 400 INVALID_BODY e não chama o serviço', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'secret-webhook-o')
      .send({ pix: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(spy).not.toHaveBeenCalled();
  });

  it('retorna 200 NO_PIX_ITEMS com pix [] sem chamar o serviço', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'secret-webhook-o')
      .send({ pix: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, code: 'NO_PIX_ITEMS' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('retorna 200 e processa quando pix tem itens (chama o serviço)', async () => {
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

  it('retorna 200 com query efiwk quando EFI_PIX_WEBHOOK_CALLBACK_TOKEN está definido', async () => {
    delete process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY;
    process.env.EFI_PIX_WEBHOOK_CALLBACK_TOKEN = 'callback-token-o1';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .query({ efiwk: 'callback-token-o1' })
      .send({ pix: [{ endToEndId: 'E1', txid: 't1', valor: '1.00' }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('POST /webhook/pix aceita o mesmo auth e NO_PIX_ITEMS', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook/pix')
      .set('x-internal-key', 'secret-webhook-o')
      .send({ pix: [] });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('NO_PIX_ITEMS');
    expect(spy).not.toHaveBeenCalled();
  });

  it('retorna 400 quando serviço sinaliza erro após passar na classificação (payload com itens)', async () => {
    process.env.EFI_PIX_WEBHOOK_INTERNAL_KEY = 'secret-webhook-o';
    spy.mockResolvedValueOnce({ ok: false, code: 'INVALID_BODY', results: [] });
    const res = await request(app)
      .post('/api/internal/efi/pix/webhook')
      .set('x-internal-key', 'secret-webhook-o')
      .send({ pix: [{ endToEndId: 'E1', txid: 't1', valor: '1.00' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(spy).toHaveBeenCalled();
  });
});
