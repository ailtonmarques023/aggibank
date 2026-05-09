const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;
const INTERNAL_SHIPMENT_KEY = 'internal-shipment-test-key';

function makeCard(overrides = {}) {
  return {
    id: 'card-shipment-1',
    userId: 'test-user-id',
    status: 'aprovado',
    ...overrides,
  };
}

function makeShipment(overrides = {}) {
  return {
    id: 'shipment-1',
    cardId: 'card-shipment-1',
    userId: 'test-user-id',
    status: 'COBRANCA_CONFIRMADA',
    shippingFeeAmount: 39.9,
    shippingFeeStatus: 'DEBITADO',
    shippingFeeMovementId: 'mov-1',
    carrierCode: null,
    carrierName: null,
    trackingCode: null,
    trackingUrl: null,
    estimatedDeliveryAt: null,
    postedAt: null,
    deliveredAt: null,
    returnedAt: null,
    deliveryAttempts: 0,
    isSecondIssue: false,
    originShipmentId: null,
    addressSnapshot: {
      cep: '01001000',
      logradouro: 'Praca da Se',
      numero: '100',
      bairro: 'Se',
      cidade: 'Sao Paulo',
      estado: 'SP',
    },
    createdAt: new Date('2026-05-08T10:00:00.000Z'),
    updatedAt: new Date('2026-05-08T10:00:00.000Z'),
    ...overrides,
  };
}

function makeAddressPayload() {
  return {
    cep: '01001000',
    logradouro: 'Praca da Se',
    numero: '100',
    bairro: 'Se',
    cidade: 'Sao Paulo',
    estado: 'SP',
  };
}

describe('Shipment API — frete e rastreamento de cartão físico', () => {
  beforeEach(() => {
    process.env.SHIPMENT_INTERNAL_API_KEY = INTERNAL_SHIPMENT_KEY;
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  });

  it('cria remessa e debita frete com rastreabilidade financeira', async () => {
    prisma.cardShipment.findUnique.mockResolvedValue(null);
    prisma.cartao.findFirst
      .mockResolvedValueOnce(makeCard())
      .mockResolvedValueOnce(makeCard({ id: 'card-shipment-1' }));
    prisma.cardShipment.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce(global.testUser)
      .mockResolvedValueOnce({ saldoAtual: 1000 });
    prisma.movimentacao.create.mockResolvedValue({
      id: 'mov-1',
      userId: 'test-user-id',
      tipo: 'tarifa',
      categoria: 'cartao_fisico_frete',
      valor: -39.9,
      saldoAnterior: 1000,
      saldoAtual: 960.1,
    });
    prisma.user.update.mockResolvedValue({ id: 'test-user-id', saldoAtual: 960.1 });
    prisma.cardShipment.create.mockResolvedValue(makeShipment());
    prisma.movimentacao.update.mockResolvedValue({ id: 'mov-1', referenceId: 'shipment-1' });
    prisma.cardShipmentEvent.create
      .mockResolvedValueOnce({
        id: 'ev-1',
        shipmentId: 'shipment-1',
        eventType: 'SHIPMENT_CREATED',
        shipmentStatus: 'AGUARDANDO_COBRANCA',
      })
      .mockResolvedValueOnce({
        id: 'ev-2',
        shipmentId: 'shipment-1',
        eventType: 'FRETE_COBRADO',
        shipmentStatus: 'COBRANCA_CONFIRMADA',
      });

    const res = await request(app)
      .post('/api/cards/card-shipment-1/shipment')
      .set('Authorization', BEARER)
      .send({
        idempotencyKey: 'idem-shipment-001',
        deliveryAddressSnapshot: makeAddressPayload(),
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.financial.movementId).toBe('mov-1');
    expect(res.body.data.financial.category).toBe('cartao_fisico_frete');
    expect(res.body.data.shipment.status).toBe('COBRANCA_CONFIRMADA');
    expect(prisma.movimentacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        categoria: 'cartao_fisico_frete',
        valor: -39.9,
      }),
    }));
  });

  it('retorna 200 idempotente sem duplicar cobrança', async () => {
    const shipment = makeShipment();
    prisma.cardShipment.findUnique.mockResolvedValue({
      ...shipment,
      events: [{ id: 'ev-1', eventType: 'FRETE_COBRADO' }],
    });

    const res = await request(app)
      .post('/api/cards/card-shipment-1/shipment')
      .set('Authorization', BEARER)
      .send({
        idempotencyKey: 'idem-shipment-002',
        deliveryAddressSnapshot: makeAddressPayload(),
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.idempotent).toBe(true);
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
    expect(prisma.cardShipment.create).not.toHaveBeenCalled();
  });

  it('retoma remessa automática com frete PENDENTE e debita sem criar segunda remessa', async () => {
    prisma.cardShipment.findUnique.mockResolvedValue(null);
    prisma.cartao.findFirst.mockResolvedValue(makeCard());
    const pendingAuto = makeShipment({
      id: 'shipment-pend-auto',
      status: 'AGUARDANDO_COBRANCA',
      shippingFeeStatus: 'PENDENTE',
      shippingFeeMovementId: null,
      idempotencyKeyCharge: 'auto-card-shipment:card-shipment-1',
    });
    prisma.cardShipment.findFirst.mockResolvedValue(pendingAuto);
    prisma.user.findUnique
      .mockResolvedValueOnce(global.testUser)
      .mockResolvedValueOnce({ saldoAtual: 1000 });
    prisma.movimentacao.create.mockResolvedValue({
      id: 'mov-resume',
      userId: 'test-user-id',
      tipo: 'tarifa',
      categoria: 'cartao_fisico_frete',
      valor: -39.9,
      saldoAnterior: 1000,
      saldoAtual: 960.1,
    });
    prisma.user.update.mockResolvedValue({ id: 'test-user-id', saldoAtual: 960.1 });
    prisma.cardShipment.update.mockResolvedValue({
      ...pendingAuto,
      status: 'COBRANCA_CONFIRMADA',
      shippingFeeStatus: 'DEBITADO',
      shippingFeeMovementId: 'mov-resume',
    });
    prisma.movimentacao.update.mockResolvedValue({ id: 'mov-resume', referenceId: 'shipment-pend-auto' });
    prisma.cardShipmentEvent.create.mockResolvedValue({
      id: 'ev-resume',
      shipmentId: 'shipment-pend-auto',
      eventType: 'FRETE_COBRADO',
      shipmentStatus: 'COBRANCA_CONFIRMADA',
    });

    const res = await request(app)
      .post('/api/cards/card-shipment-1/shipment')
      .set('Authorization', BEARER)
      .send({
        idempotencyKey: 'idem-resume-pendente-001',
        deliveryAddressSnapshot: makeAddressPayload(),
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(prisma.cardShipment.create).not.toHaveBeenCalled();
    expect(prisma.cardShipment.update).toHaveBeenCalled();
    expect(prisma.movimentacao.create).toHaveBeenCalled();
  });

  it('retorna 402 quando saldo insuficiente e mantém trilha logística', async () => {
    prisma.cardShipment.findUnique.mockResolvedValue(null);
    prisma.cartao.findFirst.mockResolvedValue(makeCard());
    prisma.cardShipment.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce(global.testUser)
      .mockResolvedValueOnce({ saldoAtual: 10 });
    prisma.cardShipment.create.mockResolvedValue(makeShipment({
      status: 'AGUARDANDO_COBRANCA',
      shippingFeeStatus: 'RECUSADO',
      shippingFeeMovementId: null,
    }));
    prisma.cardShipmentEvent.create.mockResolvedValue({
      id: 'ev-fail',
      shipmentId: 'shipment-1',
      eventType: 'FRETE_RECUSADO',
      shipmentStatus: 'AGUARDANDO_COBRANCA',
    });

    const res = await request(app)
      .post('/api/cards/card-shipment-1/shipment')
      .set('Authorization', BEARER)
      .send({
        idempotencyKey: 'idem-shipment-003',
        deliveryAddressSnapshot: makeAddressPayload(),
      })
      .expect(402);

    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(res.body.data.shipment.shippingFeeStatus).toBe('RECUSADO');
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
  });

  it('consulta status e timeline da remessa para o dono do cartão', async () => {
    prisma.cartao.findFirst.mockResolvedValue(makeCard());
    prisma.cardShipment.findFirst
      .mockResolvedValueOnce({
        ...makeShipment(),
        events: [{ id: 'ev-10', eventType: 'FRETE_COBRADO', eventAt: new Date('2026-05-08T10:00:00.000Z') }],
      })
      .mockResolvedValueOnce({ id: 'shipment-1' });
    prisma.cardShipmentEvent.findMany.mockResolvedValue([
      { id: 'ev-10', shipmentId: 'shipment-1', eventType: 'FRETE_COBRADO', eventAt: new Date('2026-05-08T10:00:00.000Z') },
    ]);
    prisma.cardShipmentEvent.count.mockResolvedValue(1);

    const statusRes = await request(app)
      .get('/api/cards/card-shipment-1/shipment')
      .set('Authorization', BEARER)
      .expect(200);

    expect(statusRes.body.data.shipment.id).toBe('shipment-1');

    const timelineRes = await request(app)
      .get('/api/cards/card-shipment-1/shipment/timeline?page=1&limit=20')
      .set('Authorization', BEARER)
      .expect(200);

    expect(Array.isArray(timelineRes.body.data.timeline)).toBe(true);
    expect(timelineRes.body.data.pagination.total).toBe(1);
  });

  it('registra evento logístico interno com chave interna', async () => {
    prisma.cardShipment.findUnique.mockResolvedValue(makeShipment());
    prisma.cardShipment.update.mockResolvedValue(makeShipment({
      status: 'EM_TRANSITO',
      carrierCode: 'CTT',
      carrierName: 'Correios Teste',
      trackingCode: 'BR123456789',
      trackingUrl: 'https://tracking.example/BR123456789',
    }));
    prisma.cardShipmentEvent.create.mockResolvedValue({
      id: 'ev-int-1',
      shipmentId: 'shipment-1',
      eventType: 'STATUS_ATUALIZADO',
      shipmentStatus: 'EM_TRANSITO',
    });

    const res = await request(app)
      .post('/api/internal/shipments/shipment-1/events')
      .set('Authorization', BEARER)
      .set('x-internal-key', INTERNAL_SHIPMENT_KEY)
      .send({
        eventType: 'STATUS_ATUALIZADO',
        status: 'EM_TRANSITO',
        carrierCode: 'CTT',
        carrierName: 'Correios Teste',
        trackingCode: 'BR123456789',
        trackingUrl: 'https://tracking.example/BR123456789',
        description: 'Objeto em trânsito para unidade de destino',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.shipment.status).toBe('EM_TRANSITO');
    expect(res.body.data.event.eventType).toBe('STATUS_ATUALIZADO');
  });
});
