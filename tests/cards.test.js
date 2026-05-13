const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const emailUtils = require('../src/utils/email');
const { sendCardApprovedEmailIfNeeded } = require('../src/services/cardApprovedEmailService');

function flushDeferred() {
  return new Promise((resolve) => setImmediate(resolve));
}

const BEARER = `Bearer ${global.testToken}`;

function authUser(overrides = {}) {
  return { ...global.testUser, ...overrides };
}

/** Campos que nunca podem aparecer no JSON público de cartão. */
const FORBIDDEN_CARD_KEYS = [
  'dadosSolicitacao',
  'lgpdConsentAt',
  'lgpdConsentVersion',
  'cardToken',
  'senha',
  'pin',
  'cvv',
  'pan',
  'password',
];

const FORBIDDEN_VIRTUAL_CARD_KEYS = [
  'cardToken',
  'cvvHash',
  'cvv',
  'pan',
  'senha',
  'pin',
  'password',
];

function expectPublicCartaoShape(cartao) {
  expect(cartao).toBeDefined();
  FORBIDDEN_CARD_KEYS.forEach((k) => {
    expect(cartao).not.toHaveProperty(k);
  });
}

function expectPublicCartaoVirtualShape(cartaoVirtual) {
  expect(cartaoVirtual).toBeDefined();
  FORBIDDEN_VIRTUAL_CARD_KEYS.forEach((k) => {
    expect(cartaoVirtual).not.toHaveProperty(k);
  });
}

/** Perfil mínimo exigido pela aprovação interna de cartão (renda em BRL no modelo Prisma). */
function usuarioPerfilCartaoCompleto(overrides = {}) {
  return authUser({
    endereco: {
      cep: '01001-000',
      logradouro: 'Rua Teste',
      numero: '100',
      bairro: 'Centro',
      cidade: 'São Paulo',
      estado: 'SP',
    },
    dadosProfissionais: {
      rendaMensal: 5000,
      profissao: 'Analista',
      empresa: 'Empresa SA',
    },
    ...overrides,
  });
}

describe('Cards API — POST decisão e GET segurança', () => {
  const INTERNAL_APPROVE_KEY = 'internal-approve-test-key';

  beforeEach(() => {
    // Perfil incompleto por padrão: evita autoaprovação em POST /api/cards nos testes que esperam "pendente".
    prisma.user.findUnique.mockResolvedValue(
      authUser({ scoreCredito: 750, endereco: null, dadosProfissionais: null }),
    );
    prisma.cartao.findFirst.mockResolvedValue(null);
    prisma.cartao.findMany.mockResolvedValue([]);
    process.env.CARD_APPROVAL_INTERNAL_KEY = INTERNAL_APPROVE_KEY;
    prisma.cartao.create.mockImplementation(async ({ data }) => ({
      id: 'cartao-test-id',
      userId: data.userId,
      maskedNumber: data.maskedNumber,
      last4: data.last4,
      validade: data.validade,
      limite: data.limite,
      saldoUtilizado: data.saldoUtilizado ?? 0,
      status: data.status,
      tipo: data.tipo,
      bandeira: data.bandeira,
      dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
      dataAprovacao: data.dataAprovacao ?? null,
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
      updatedAt: new Date('2026-05-01T12:00:00.000Z'),
      cardToken: data.cardToken,
      dadosSolicitacao: data.dadosSolicitacao,
      lgpdConsentAt: data.lgpdConsentAt,
      lgpdConsentVersion: data.lgpdConsentVersion,
    }));
    prisma.cartaoVirtual.findFirst.mockResolvedValue(null);
    prisma.cartaoVirtual.create.mockImplementation(async ({ data }) => ({
      id: 'cv1',
      cartaoId: data.cartaoId,
      userId: data.userId,
      maskedNumber: data.maskedNumber,
      last4: data.last4,
      validade: data.validade,
      bandeira: data.bandeira,
      cardToken: data.cardToken,
      cvvHash: data.cvvHash,
      status: data.status ?? 'ativo',
      dataBloqueio: data.dataBloqueio ?? null,
      dataCancelado: data.dataCancelado ?? null,
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
      updatedAt: new Date('2026-05-01T12:00:00.000Z'),
    }));
    prisma.notificacao.findUnique.mockResolvedValue(null);
    prisma.notificacao.create.mockResolvedValue({
      id: 'notif-default',
      userId: 'test-user-id',
      metadata: {},
    });
    prisma.notificacao.update.mockResolvedValue({});
    prisma.cardShipment.findFirst.mockResolvedValue(null);
  });

  describe('POST /api/cards', () => {
    it('aceita POST legado { tipo: credito, limite: 5000 } e retorna pendente sem renda', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({ tipo: 'credito', limite: 5000 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.cartao.limite)).toBe(5000);
      expect(res.body.data.cartao.status).toBe('pendente');
      expectPublicCartaoShape(res.body.data.cartao);
      expect(prisma.cartao.create).toHaveBeenCalled();
      const arg = prisma.cartao.create.mock.calls[0][0];
      expect(arg.data.status).toBe('pendente');
      expect(Number(arg.data.limite)).toBe(5000);
      await flushDeferred();
      expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
      expect(prisma.notificacao.create).not.toHaveBeenCalled();
    });

    it('sem renda válida (só tipo) usa limite por score e fica pendente', async () => {
      prisma.user.findUnique.mockResolvedValue(authUser({ scoreCredito: 600 }));
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({ tipo: 'credito' })
        .expect(201);

      expect(res.body.data.cartao.status).toBe('pendente');
      expect(Number(res.body.data.cartao.limite)).toBe(2000);
      expectPublicCartaoShape(res.body.data.cartao);
    });

    it('renda 1500 sem limite → pendente e limite 450', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 1500 },
        })
        .expect(201);

      expect(res.body.data.cartao.status).toBe('pendente');
      expect(Number(res.body.data.cartao.limite)).toBe(450);
      expectPublicCartaoShape(res.body.data.cartao);
    });

    it('renda 2000 sem limite → sempre pendente; limite provisório 600 (30% renda form)', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 2000 },
        })
        .expect(201);

      expect(res.body.data.cartao.status).toBe('pendente');
      expect(Number(res.body.data.cartao.limite)).toBe(600);
      expect(res.body.data.cartao.dataAprovacao).toBeNull();
      expectPublicCartaoShape(res.body.data.cartao);
      const arg = prisma.cartao.create.mock.calls[0][0];
      expect(arg.data.dataAprovacao).toBeNull();
    });

    it('renda 5000 sem limite → pendente e limite provisório 1500', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 5000 },
        })
        .expect(201);

      expect(res.body.data.cartao.status).toBe('pendente');
      expect(Number(res.body.data.cartao.limite)).toBe(1500);
      expectPublicCartaoShape(res.body.data.cartao);
    });

    it('renda muito alta sem limite → pendente e limite provisório máximo 10000', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 1_000_000 },
        })
        .expect(201);

      expect(Number(res.body.data.cartao.limite)).toBe(10000);
      expect(res.body.data.cartao.status).toBe('pendente');
      expectPublicCartaoShape(res.body.data.cartao);
    });

    it('respeita limite enviado pelo cliente quando válido (status continua pendente)', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          limite: 4200,
          dadosAnalise: { rendaMensalDeclarada: 8000 },
        })
        .expect(201);

      expect(Number(res.body.data.cartao.limite)).toBe(4200);
      expect(res.body.data.cartao.status).toBe('pendente');
      expectPublicCartaoShape(res.body.data.cartao);
      const arg = prisma.cartao.create.mock.calls[0][0];
      expect(arg.data.dadosSolicitacao.decisaoAutomatica.limiteFonte).toBe('cliente');
    });

    describe('POST /api/cards — auto-aprovação (perfil elegível)', () => {
      let __postAutoNotifByDedupeKey;

      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue(usuarioPerfilCartaoCompleto({ scoreCredito: 750 }));
        __postAutoNotifByDedupeKey = Object.create(null);
        prisma.notificacao.findUnique.mockImplementation(async ({ where }) => {
          if (!where || !where.dedupeKey) return null;
          return __postAutoNotifByDedupeKey[where.dedupeKey] || null;
        });
        prisma.notificacao.create.mockImplementation(async ({ data }) => {
          const row = {
            id: 'notif-post-auto',
            ...data,
            dataEnvio: new Date('2026-05-09T12:00:00.000Z'),
            createdAt: new Date('2026-05-09T12:00:00.000Z'),
            isLida: false,
            readAt: null,
          };
          if (data.dedupeKey) {
            __postAutoNotifByDedupeKey[data.dedupeKey] = {
              id: row.id,
              userId: row.userId,
              metadata:
                row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
                  ? { ...row.metadata }
                  : {},
            };
          }
          return row;
        });
        prisma.notificacao.update.mockImplementation(async ({ where, data }) => {
          const entry = Object.values(__postAutoNotifByDedupeKey).find((v) => v.id === where.id);
          if (entry && data.metadata) {
            entry.metadata = { ...entry.metadata, ...data.metadata };
          }
          return { id: where.id, ...data };
        });
        prisma.cartao.update.mockImplementation(({ where, data }) => ({
          id: where.id,
          userId: 'test-user-id',
          maskedNumber: '**** **** **** 1111',
          last4: '1111',
          validade: '01/2030',
          limite: data.limite,
          saldoUtilizado: 0,
          status: data.status,
          tipo: 'credito',
          bandeira: 'elo',
          dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
          dataAprovacao: data.dataAprovacao,
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          updatedAt: new Date('2026-05-01T12:00:00.000Z'),
        }));

        let __autoShipmentRow = null;
        prisma.endereco.findUnique.mockResolvedValue({
          userId: 'test-user-id',
          cep: '01001-000',
          logradouro: 'Rua Teste',
          numero: '100',
          bairro: 'Centro',
          cidade: 'São Paulo',
          estado: 'SP',
          complemento: null,
        });
        prisma.cardShipment.findFirst.mockImplementation(async () => __autoShipmentRow);
        prisma.cardShipment.create.mockImplementation(async ({ data }) => {
          __autoShipmentRow = {
            id: 'ship-auto-1',
            cardId: data.cardId,
            userId: data.userId,
            status: data.status,
            shippingFeeAmount: data.shippingFeeAmount,
            shippingFeeStatus: data.shippingFeeStatus,
            shippingFeeMovementId: data.shippingFeeMovementId ?? null,
            createdAt: new Date('2026-05-01T12:00:00.000Z'),
            updatedAt: new Date('2026-05-01T12:00:00.000Z'),
          };
          return __autoShipmentRow;
        });
        prisma.cardShipmentEvent.create.mockResolvedValue({ id: 'ev-auto' });
      });

      it('autoaprova com limite renda×1,8, cria notificação card_approved e agenda e-mail', async () => {
        const res = await request(app)
          .post('/api/cards')
          .set('Authorization', BEARER)
          .send({ tipo: 'credito', limite: 2000 })
          .expect(201);

        expect(res.body.data.cartao.status).toBe('aprovado');
        expect(Number(res.body.data.cartao.limite)).toBe(9000);
        expect(res.body.data.proximosPassos).toBeDefined();
        expect(res.body.data.proximosPassos.envioFisico).toBeDefined();
        expect(res.body.data.proximosPassos.envioFisico.valorFretePadraoBrl).toBe(39.9);
        expect(prisma.cartao.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'cartao-test-id' },
            data: expect.objectContaining({
              status: 'aprovado',
              limite: 9000,
              dataAprovacao: expect.any(Date),
            }),
          }),
        );
        expect(prisma.notificacao.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tipo: 'card_approved',
              dedupeKey: 'card_approved:cartao-test-id',
              metadata: { cardId: 'cartao-test-id', action: 'view_card' },
            }),
          }),
        );
        await flushDeferred();
        expect(emailUtils.sendCardApprovedEmail).toHaveBeenCalledWith(
          { email: global.testUser.email, nomeCompleto: global.testUser.nomeCompleto },
          expect.objectContaining({ limite: 9000, status: 'aprovado' }),
        );
        expect(prisma.cardShipment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              cardId: 'cartao-test-id',
              userId: 'test-user-id',
              status: 'AGUARDANDO_COBRANCA',
              shippingFeeStatus: 'PENDENTE',
              idempotencyKeyCharge: 'auto-card-shipment:cartao-test-id',
              addressSnapshot: {
                cep: '01001-000',
                logradouro: 'Rua Teste',
                numero: '100',
                complemento: null,
                bairro: 'Centro',
                cidade: 'São Paulo',
                estado: 'SP',
              },
            }),
          }),
        );
        expect(res.body.data.proximosPassos.envioFisico.temRemessa).toBe(true);
      });

      it('falha no e-mail não impede 201 na autoaprovação', async () => {
        emailUtils.sendCardApprovedEmail.mockRejectedValueOnce(new Error('provider_down'));
        const res = await request(app)
          .post('/api/cards')
          .set('Authorization', BEARER)
          .send({ tipo: 'credito' })
          .expect(201);
        expect(res.body.data.cartao.status).toBe('aprovado');
        expect(Number(res.body.data.cartao.limite)).toBe(9000);
        await flushDeferred();
        expect(emailUtils.sendCardApprovedEmail).toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/cards', () => {
    it('não expõe dadosSolicitacao, LGPD interno, cardToken nem campos de pagamento sensíveis', async () => {
      prisma.cartao.findMany.mockResolvedValue([
        {
          id: 'c1',
          maskedNumber: '**** **** **** 4242',
          last4: '4242',
          validade: '12/2031',
          limite: 3000,
          saldoUtilizado: 0,
          status: 'aprovado',
          tipo: 'credito',
          bandeira: 'visa',
          dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
          dataAprovacao: new Date('2026-05-02T12:00:00.000Z'),
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          // Se viessem da BD (mock permissivo), não podem vazar no JSON público
          dadosSolicitacao: { leak: true },
          lgpdConsentAt: new Date(),
          lgpdConsentVersion: 'v9',
          cardToken: 'tok-leak',
          senha: 'leak',
          pin: 'leak',
          cvv: 'leak',
          pan: 'leak',
          password: 'leak',
        },
      ]);

      const res = await request(app)
        .get('/api/cards')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.cartoes)).toBe(true);
      expect(res.body.data.cartoes.length).toBe(1);
      const c = res.body.data.cartoes[0];
      expectPublicCartaoShape(c);
      expect(c.id).toBe('c1');
      expect(c.maskedNumber).toContain('****');
    });
  });

  describe('GET /api/cards/status', () => {
    it('401 sem token', async () => {
      await request(app).get('/api/cards/status').expect(401);
    });

    it('hasCard false quando não há cartões', async () => {
      prisma.cartao.findMany.mockResolvedValueOnce([]);
      const res = await request(app)
        .get('/api/cards/status')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.hasCard).toBe(false);
      expect(res.body.data.card).toBeNull();
      expect(res.body.data.shipment).toBeNull();
      expect(res.body.data.physicalDelivery).toBeNull();
    });

    it('crédito aprovado com remessa e frete PENDENTE → FREIGHT_PENDING (frete não pago mesmo com código futuro cancelado)', async () => {
      prisma.cartao.findMany.mockResolvedValueOnce([
        {
          id: 'c-rem',
          userId: 'test-user-id',
          tipo: 'credito',
          bandeira: 'VISA',
          status: 'aprovado',
          last4: '9614',
          maskedNumber: '**** **** **** 9614',
          dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
          dataAprovacao: new Date('2026-05-03T12:00:00.000Z'),
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          dadosSolicitacao: {
            dadosAnalise: {
              rendaMensalDeclarada: 5000,
              endereco: {
                rua: 'Rua Pedido X',
                bairro: 'Bairro P',
                cidade: 'Campinas',
                estado: 'SP',
                cep: '13000-000',
              },
            },
            cpf: 'nao-devolve',
          },
        },
      ]);

      prisma.cardShipment.findFirst.mockResolvedValueOnce({
        id: 'ship-x',
        cardId: 'c-rem',
        userId: 'test-user-id',
        status: 'AGUARDANDO_COBRANCA',
        shippingFeeAmount: 39.9,
        shippingFeeStatus: 'PENDENTE',
        shippingFeeMovementId: null,
        carrierCode: null,
        carrierName: null,
        trackingCode: null,
        trackingUrl: null,
        estimatedDeliveryAt: new Date('2026-06-01T12:00:00.000Z'),
        postedAt: null,
        deliveredAt: null,
        returnedAt: null,
        deliveryAttempts: 0,
        isSecondIssue: false,
        originShipmentId: null,
        addressSnapshot: {
          cep: '01001-000',
          logradouro: 'Rua Remessa Oficial',
          numero: '10',
          complemento: 'Sala 1',
          bairro: 'Centro',
          cidade: 'São Paulo',
          estado: 'SP',
        },
        createdAt: new Date('2026-05-03T13:00:00.000Z'),
        updatedAt: new Date('2026-05-03T13:00:00.000Z'),
        user: { endereco: {} },
      });

      const res = await request(app)
        .get('/api/cards/status')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.hasCard).toBe(true);
      expect(res.body.data.card.last4).toBe('9614');
      expect(res.body.data.card.holderName).toBe(global.testUser.nomeCompleto);
      expect(res.body.data.card.type).toBe('credit');
      expect(res.body.data.card.brand).toBe('VISA');
      expect(res.body.data.shipment).toBeTruthy();

      expect(res.body.data.physicalDelivery).toBeTruthy();
      expect(res.body.data.physicalDelivery.freightPaid).toBe(false);
      expect(res.body.data.physicalDelivery.freightStatus).toBe('PENDENTE');
      expect(res.body.data.physicalDelivery.shipmentUiState).toBe('FREIGHT_PENDING');

      expect(res.body.data.card).not.toHaveProperty('dadosSolicitacao');
      expect(JSON.stringify(res.body)).not.toContain('nao-devolve');

      FORBIDDEN_CARD_KEYS.forEach((k) => {
        expect(res.body.data.card).not.toHaveProperty(k);
      });
    });

    it('frete DEBITADO sem postagem → PRODUCTION_STARTED_WAITING_SHIPMENT', async () => {
      prisma.cartao.findMany.mockResolvedValueOnce([
        {
          id: 'c-prod',
          userId: 'test-user-id',
          tipo: 'credito',
          bandeira: 'VISA',
          status: 'aprovado',
          last4: '2222',
          maskedNumber: '**** **** **** 2222',
          dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
          dataAprovacao: new Date('2026-05-03T12:00:00.000Z'),
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          dadosSolicitacao: null,
        },
      ]);

      prisma.cardShipment.findFirst.mockResolvedValueOnce({
        id: 'ship-prod',
        cardId: 'c-prod',
        userId: 'test-user-id',
        status: 'COBRANCA_CONFIRMADA',
        shippingFeeAmount: 39.9,
        shippingFeeStatus: 'DEBITADO',
        shippingFeeMovementId: 'mov-1',
        trackingCode: null,
        carrierName: null,
        addressSnapshot: {},
        createdAt: new Date('2026-05-03T13:00:00.000Z'),
        updatedAt: new Date('2026-05-03T13:00:00.000Z'),
        user: { endereco: {} },
      });

      const res = await request(app)
        .get('/api/cards/status')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.data.physicalDelivery.freightPaid).toBe(true);
      expect(res.body.data.physicalDelivery.freightStatus).toBe('PAGO');
      expect(res.body.data.physicalDelivery.productionStarted).toBe(true);
      expect(res.body.data.physicalDelivery.shipmentUiState).toBe('PRODUCTION_STARTED_WAITING_SHIPMENT');
    });

    it('frete pago + POSTADO → EM_TRANSITO', async () => {
      prisma.cartao.findMany.mockResolvedValueOnce([
        {
          id: 'c-tr',
          userId: 'test-user-id',
          tipo: 'credito',
          bandeira: 'VISA',
          status: 'ativo',
          last4: '3333',
          maskedNumber: '**** **** **** 3333',
          dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
          dataAprovacao: new Date('2026-05-03T12:00:00.000Z'),
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          dadosSolicitacao: null,
        },
      ]);

      prisma.cardShipment.findFirst.mockResolvedValueOnce({
        id: 'ship-tr',
        cardId: 'c-tr',
        userId: 'test-user-id',
        status: 'POSTADO',
        shippingFeeAmount: 39.9,
        shippingFeeStatus: 'DEBITADO',
        shippingFeeMovementId: 'mov-2',
        trackingCode: 'BR123456789BR',
        carrierName: 'Correios',
        addressSnapshot: {},
        createdAt: new Date('2026-05-03T13:00:00.000Z'),
        updatedAt: new Date('2026-05-03T13:00:00.000Z'),
        user: { endereco: {} },
      });

      const res = await request(app)
        .get('/api/cards/status')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.data.physicalDelivery.shipmentUiState).toBe('EM_TRANSITO');
      expect(res.body.data.physicalDelivery.trackingCode).toBe('BR123456789BR');
    });

    it('frete pago + ENTREGUE → ENTREGUE', async () => {
      prisma.cartao.findMany.mockResolvedValueOnce([
        {
          id: 'c-done',
          userId: 'test-user-id',
          tipo: 'credito',
          bandeira: 'VISA',
          status: 'ativo',
          last4: '4444',
          maskedNumber: '**** **** **** 4444',
          dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
          dataAprovacao: new Date('2026-05-03T12:00:00.000Z'),
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          dadosSolicitacao: null,
        },
      ]);

      prisma.cardShipment.findFirst.mockResolvedValueOnce({
        id: 'ship-done',
        cardId: 'c-done',
        userId: 'test-user-id',
        status: 'ENTREGUE',
        shippingFeeAmount: 39.9,
        shippingFeeStatus: 'DEBITADO',
        shippingFeeMovementId: 'mov-3',
        trackingCode: 'TRK99',
        deliveredAt: new Date('2026-05-10T15:00:00.000Z'),
        addressSnapshot: {},
        createdAt: new Date('2026-05-03T13:00:00.000Z'),
        updatedAt: new Date('2026-05-10T15:00:00.000Z'),
        user: { endereco: {} },
      });

      const res = await request(app)
        .get('/api/cards/status')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.data.physicalDelivery.shipmentUiState).toBe('ENTREGUE');
    });

    it('crédito sem linha CardShipment → AWAITING_LOGISTICS_SETUP', async () => {
      prisma.cartao.findMany.mockResolvedValueOnce([
        {
          id: 'c-no-ship',
          userId: 'test-user-id',
          tipo: 'credito',
          bandeira: 'VISA',
          status: 'aprovado',
          last4: '5555',
          maskedNumber: '**** **** **** 5555',
          dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
          dataAprovacao: new Date('2026-05-03T12:00:00.000Z'),
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          dadosSolicitacao: null,
        },
      ]);

      prisma.cardShipment.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/cards/status')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.data.shipment).toBeNull();
      expect(res.body.data.physicalDelivery.shipmentUiState).toBe('AWAITING_LOGISTICS_SETUP');
      expect(res.body.data.physicalDelivery.freightPaid).toBe(false);
    });
    it('cartão de débito ativo não consulta nem retorna shipment', async () => {
      prisma.cartao.findMany.mockResolvedValueOnce([
        {
          id: 'c-db',
          userId: 'test-user-id',
          tipo: 'debito',
          bandeira: 'elo',
          status: 'ativo',
          last4: '4444',
          maskedNumber: '**** **** **** 4444',
          dataSolicitacao: new Date('2026-05-02T12:00:00.000Z'),
          dataAprovacao: new Date('2026-05-03T12:00:00.000Z'),
          createdAt: new Date('2026-05-02T12:00:00.000Z'),
          dadosSolicitacao: null,
        },
      ]);

      const res = await request(app)
        .get('/api/cards/status')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.data.hasCard).toBe(true);
      expect(res.body.data.card.type).toBe('debit');
      expect(res.body.data.shipment).toBeNull();
      expect(res.body.data.physicalDelivery.freightStatus).toBe('NAO_APLICAVEL');
      expect(res.body.data.physicalDelivery.freightPaid).toBe(false);
      expect(res.body.data.physicalDelivery.shipmentUiState).toBeNull();
      expect(prisma.cardShipment.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/cards — duplicidade', () => {
    it('retorna 400 CARD_PENDING_ALREADY_EXISTS quando já existe pendente do mesmo tipo', async () => {
      prisma.cartao.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'existing-pend',
          userId: 'test-user-id',
          tipo: 'credito',
          status: 'pendente',
        });
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({ tipo: 'credito', limite: 3000 })
        .expect(400);

      expect(res.body.code).toBe('CARD_PENDING_ALREADY_EXISTS');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

    it('retorna 400 CARD_ACTIVE_ALREADY_EXISTS quando já existe aprovado do mesmo tipo', async () => {
      prisma.cartao.findFirst.mockResolvedValueOnce({
        id: 'existing-apr',
        userId: 'test-user-id',
        tipo: 'credito',
        status: 'aprovado',
      });
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({ tipo: 'credito', limite: 2000 })
        .expect(400);

      expect(res.body.code).toBe('CARD_ACTIVE_ALREADY_EXISTS');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

    it('retorna 400 CARD_ACTIVE_ALREADY_EXISTS quando já existe ativo do mesmo tipo', async () => {
      prisma.cartao.findFirst.mockResolvedValueOnce({
        id: 'existing-ativo',
        userId: 'test-user-id',
        tipo: 'credito',
        status: 'ativo',
      });
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({ tipo: 'credito', limite: 2000 })
        .expect(400);

      expect(res.body.code).toBe('CARD_ACTIVE_ALREADY_EXISTS');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/cards/:id/approve', () => {
    const pendingBase = {
      id: 'ap1',
      userId: 'test-user-id',
      status: 'pendente',
      tipo: 'credito',
      limite: 2500,
      bandeira: 'elo',
      maskedNumber: '**** **** **** 1111',
      last4: '1111',
      validade: '01/2030',
      saldoUtilizado: 0,
      dataSolicitacao: new Date('2026-05-01T12:00:00.000Z'),
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
      updatedAt: new Date('2026-05-01T12:00:00.000Z'),
    };

    let __cardNotifByDedupeKey;

    beforeEach(() => {
      __cardNotifByDedupeKey = Object.create(null);
      let __approveShipmentRow = null;
      prisma.endereco.findUnique.mockResolvedValue({
        userId: 'test-user-id',
        cep: '01001-000',
        logradouro: 'Rua Teste',
        numero: '100',
        bairro: 'Centro',
        cidade: 'São Paulo',
        estado: 'SP',
        complemento: null,
      });
      prisma.cardShipment.findFirst.mockImplementation(async () => __approveShipmentRow);
      prisma.cardShipment.create.mockImplementation(async ({ data }) => {
        __approveShipmentRow = {
          id: 'ship-approve-1',
          cardId: data.cardId,
          userId: data.userId,
          status: data.status,
          shippingFeeAmount: data.shippingFeeAmount,
          shippingFeeStatus: data.shippingFeeStatus,
          shippingFeeMovementId: data.shippingFeeMovementId ?? null,
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          updatedAt: new Date('2026-05-01T12:00:00.000Z'),
        };
        return __approveShipmentRow;
      });
      prisma.cardShipmentEvent.create.mockResolvedValue({ id: 'ev-approve' });
      prisma.notificacao.findUnique.mockImplementation(async ({ where }) => {
        if (!where || !where.dedupeKey) return null;
        return __cardNotifByDedupeKey[where.dedupeKey] || null;
      });
      prisma.notificacao.create.mockImplementation(async ({ data }) => {
        const row = {
          id: 'notif-card-test',
          ...data,
          dataEnvio: new Date('2026-05-09T12:00:00.000Z'),
          createdAt: new Date('2026-05-09T12:00:00.000Z'),
          isLida: false,
          readAt: null,
        };
        if (data.dedupeKey) {
          __cardNotifByDedupeKey[data.dedupeKey] = {
            id: row.id,
            userId: row.userId,
            metadata:
              row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
                ? { ...row.metadata }
                : {},
          };
        }
        return row;
      });
      prisma.notificacao.update.mockImplementation(async ({ where, data }) => {
        const entry = Object.values(__cardNotifByDedupeKey).find((v) => v.id === where.id);
        if (entry && data.metadata) {
          entry.metadata = { ...entry.metadata, ...data.metadata };
        }
        return { id: where.id, ...data };
      });
    });

    function mockFindFirstPostThenApprove(pendingCard) {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (!w) return null;
        if (w.userId && w.tipo && Array.isArray(w.status && w.status.in) && !w.id) {
          return null;
        }
        if (w.userId && w.tipo && w.status === 'pendente' && !w.id) {
          return null;
        }
        if (w.id === pendingCard.id && w.status === 'pendente' && Object.keys(w).length === 2) {
          return pendingCard;
        }
        if (w.userId && w.id && w.id.not && Array.isArray(w.status && w.status.in)) {
          return null;
        }
        if (w.userId && w.id && w.id.not && w.status === 'pendente') {
          return null;
        }
        return null;
      });
    }

    it('retorna 403 para usuário comum sem credencial interna', async () => {
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .expect(403);

      expect(res.body.code).toBe('ACCESS_DENIED');
      expect(prisma.cartao.update).not.toHaveBeenCalled();
    });

    it('aprova cartão pendente: status aprovado, limite = renda perfil × 1,8, dataAprovacao', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({ dadosProfissionais: { rendaMensal: 2500, profissao: 'Dev', empresa: 'ACME' } }),
      );
      const dataApr = new Date('2026-06-01T12:00:00.000Z');
      prisma.cartao.update.mockResolvedValue({
        ...pendingBase,
        status: 'aprovado',
        limite: 4500,
        dataAprovacao: dataApr,
        dadosSolicitacao: { x: 1 },
        cardToken: 'secret-token',
        lgpdConsentAt: new Date(),
        lgpdConsentVersion: 'v1',
      });

      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cartao.status).toBe('aprovado');
      expect(res.body.data.cartao.dataAprovacao).toBeDefined();
      expect(Number(res.body.data.cartao.limite)).toBe(4500);
      expectPublicCartaoShape(res.body.data.cartao);
      expect(prisma.cartao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ap1' },
          data: expect.objectContaining({
            status: 'aprovado',
            limite: 4500,
            dataAprovacao: expect.any(Date),
          }),
        }),
      );
      expect(prisma.notificacao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'test-user-id',
            tipo: 'card_approved',
            titulo: 'Cartão aprovado',
            dedupeKey: 'card_approved:ap1',
            metadata: { cardId: 'ap1', action: 'view_card' },
          }),
        }),
      );
      expect(String(prisma.notificacao.create.mock.calls[0][0].data.mensagem)).toContain('4.500,00');
      await flushDeferred();
      expect(emailUtils.sendCardApprovedEmail).toHaveBeenCalledTimes(1);
      expect(emailUtils.sendCardApprovedEmail).toHaveBeenCalledWith(
        { email: global.testUser.email, nomeCompleto: global.testUser.nomeCompleto },
        expect.objectContaining({ limite: 4500, status: 'aprovado' }),
      );
    });

    it('404 quando cartão não existe (id inválido)', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w.userId && w.tipo && Array.isArray(w.status && w.status.in) && !w.id) {
          return null;
        }
        if (w.userId && w.tipo && w.status === 'pendente' && !w.id) {
          return null;
        }
        return null;
      });

      const res = await request(app)
        .post('/api/cards/id-inexistente/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(404);

      expect(res.body.code).toBe('CARD_NOT_FOUND');
      expect(prisma.cartao.update).not.toHaveBeenCalled();
      await flushDeferred();
      expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
      expect(prisma.notificacao.create).not.toHaveBeenCalled();
    });

    it('404 quando não há linha pendente (id desconhecido)', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w.userId && w.tipo && Array.isArray(w.status && w.status.in) && !w.id) {
          return null;
        }
        if (w.userId && w.tipo && w.status === 'pendente' && !w.id) {
          return null;
        }
        return null;
      });

      const res = await request(app)
        .post('/api/cards/outro-user-card-uuid/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(404);

      expect(res.body.code).toBe('CARD_NOT_FOUND');
      expect(prisma.cartao.update).not.toHaveBeenCalled();
      await flushDeferred();
      expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
      expect(prisma.notificacao.create).not.toHaveBeenCalled();
    });

    it('404 ao aprovar cartão já aprovado (rota só considera status pendente)', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w.userId && w.tipo && Array.isArray(w.status && w.status.in) && !w.id) {
          return null;
        }
        if (w.userId && w.tipo && w.status === 'pendente' && !w.id) {
          return null;
        }
        if (w && w.id === 'already-approved-id' && w.status === 'pendente') {
          return null;
        }
        return null;
      });

      const res = await request(app)
        .post('/api/cards/already-approved-id/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(404);

      expect(res.body.code).toBe('CARD_NOT_FOUND');
      expect(res.body.message).toMatch(/não encontrado|já processado/i);
      expect(prisma.cartao.update).not.toHaveBeenCalled();
    });

    it('400 CARD_INCOME_NOT_ELIGIBLE quando renda perfil < 1000', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({
          dadosProfissionais: { rendaMensal: 999.99, profissao: 'Dev', empresa: 'ACME' },
        }),
      );
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(400);
      expect(res.body.code).toBe('CARD_INCOME_NOT_ELIGIBLE');
      expect(prisma.cartao.update).not.toHaveBeenCalled();
      await flushDeferred();
      expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
      expect(prisma.notificacao.create).not.toHaveBeenCalled();
    });

    it('aprova com renda 1000 → limite 1800', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({
          dadosProfissionais: { rendaMensal: 1000, profissao: 'Dev', empresa: 'ACME' },
        }),
      );
      prisma.cartao.update.mockResolvedValue({
        ...pendingBase,
        status: 'aprovado',
        limite: 1800,
        dataAprovacao: new Date(),
      });
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(200);
      expect(Number(res.body.data.cartao.limite)).toBe(1800);
      expect(prisma.cartao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ limite: 1800, status: 'aprovado' }),
        }),
      );
    });

    it('aprova com renda 1200 → limite 2160', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({
          dadosProfissionais: { rendaMensal: 1200, profissao: 'Dev', empresa: 'ACME' },
        }),
      );
      prisma.cartao.update.mockResolvedValue({
        ...pendingBase,
        status: 'aprovado',
        limite: 2160,
        dataAprovacao: new Date(),
      });
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(200);
      expect(Number(res.body.data.cartao.limite)).toBe(2160);
    });

    it('aprova com renda 2000 → limite 3600', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({
          dadosProfissionais: { rendaMensal: 2000, profissao: 'Dev', empresa: 'ACME' },
        }),
      );
      prisma.cartao.update.mockResolvedValue({
        ...pendingBase,
        status: 'aprovado',
        limite: 3600,
        dataAprovacao: new Date(),
      });
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(200);
      expect(Number(res.body.data.cartao.limite)).toBe(3600);
    });

    it('falha no envio de e-mail não impede 200 na aprovação', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({
          dadosProfissionais: { rendaMensal: 1000, profissao: 'Dev', empresa: 'ACME' },
        }),
      );
      prisma.cartao.update.mockResolvedValue({
        ...pendingBase,
        status: 'aprovado',
        limite: 1800,
        dataAprovacao: new Date(),
      });
      emailUtils.sendCardApprovedEmail.mockRejectedValueOnce(new Error('resend_down'));
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(200);
      expect(res.body.success).toBe(true);
      await flushDeferred();
      expect(prisma.notificacao.create).toHaveBeenCalled();
      expect(emailUtils.sendCardApprovedEmail).toHaveBeenCalled();
    });

    it('não reenvia e-mail para o mesmo cardId após primeiro envio (idempotência)', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({
          dadosProfissionais: { rendaMensal: 1000, profissao: 'Dev', empresa: 'ACME' },
        }),
      );
      prisma.cartao.update.mockResolvedValue({
        ...pendingBase,
        status: 'aprovado',
        limite: 1800,
        dataAprovacao: new Date(),
      });
      await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(200);
      await flushDeferred();
      expect(emailUtils.sendCardApprovedEmail).toHaveBeenCalledTimes(1);
      emailUtils.sendCardApprovedEmail.mockClear();
      await sendCardApprovedEmailIfNeeded({
        cardId: 'ap1',
        userId: 'test-user-id',
        limiteAprovado: 1800,
        status: 'aprovado',
      });
      expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
    });

    it('403 ACCOUNT_NOT_VERIFIED quando titular não verificado', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({ isVerificado: false }),
      );
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_NOT_VERIFIED');
      expect(prisma.cartao.update).not.toHaveBeenCalled();
    });

    it('400 CARD_PROFILE_INCOMPLETE sem endereço', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({ endereco: null }),
      );
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(400);
      expect(res.body.code).toBe('CARD_PROFILE_INCOMPLETE');
      expect(prisma.cartao.update).not.toHaveBeenCalled();
    });

    it('400 CARD_PROFILE_INCOMPLETE sem dados profissionais completos', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.user.findUnique.mockResolvedValue(
        usuarioPerfilCartaoCompleto({ dadosProfissionais: { rendaMensal: 3000, profissao: '', empresa: 'X' } }),
      );
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(400);
      expect(res.body.code).toBe('CARD_PROFILE_INCOMPLETE');
    });

    it('400 CARD_ACTIVE_ALREADY_EXISTS se já há outro cartão aprovado do mesmo tipo', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w.userId && w.tipo && Array.isArray(w.status && w.status.in) && !w.id) {
          return null;
        }
        if (w.userId && w.tipo && w.status === 'pendente' && !w.id) {
          return null;
        }
        if (w.id === pendingBase.id && w.status === 'pendente' && Object.keys(w).length === 2) {
          return pendingBase;
        }
        if (w.userId && w.id && w.id.not && Array.isArray(w.status && w.status.in)) {
          return { id: 'outro', status: 'aprovado', userId: 'test-user-id', tipo: 'credito' };
        }
        if (w.userId && w.id && w.id.not && w.status === 'pendente') {
          return null;
        }
        return null;
      });
      prisma.user.findUnique.mockResolvedValue(usuarioPerfilCartaoCompleto());
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(400);
      expect(res.body.code).toBe('CARD_ACTIVE_ALREADY_EXISTS');
      expect(prisma.cartao.update).not.toHaveBeenCalled();
    });

    it('400 CARD_PENDING_ALREADY_EXISTS se há outra solicitação pendente do mesmo tipo', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w.userId && w.tipo && Array.isArray(w.status && w.status.in) && !w.id) {
          return null;
        }
        if (w.userId && w.tipo && w.status === 'pendente' && !w.id) {
          return null;
        }
        if (w.id === pendingBase.id && w.status === 'pendente' && Object.keys(w).length === 2) {
          return pendingBase;
        }
        if (w.userId && w.id && w.id.not && Array.isArray(w.status && w.status.in)) {
          return null;
        }
        if (w.userId && w.id && w.id.not && w.status === 'pendente') {
          return { id: 'outro-pend', status: 'pendente', userId: 'test-user-id', tipo: 'credito' };
        }
        return null;
      });
      prisma.user.findUnique.mockResolvedValue(usuarioPerfilCartaoCompleto());
      const res = await request(app)
        .post('/api/cards/ap1/approve')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(400);
      expect(res.body.code).toBe('CARD_PENDING_ALREADY_EXISTS');
    });

    it('POST /api/cards/:id/reject (interno) → status rejeitado + analysisReason/analysisMessage', async () => {
      mockFindFirstPostThenApprove({
        ...pendingBase,
        dadosSolicitacao: { schemaVersion: 1 },
      });
      prisma.cartao.update.mockImplementation(({ data }) => ({
        ...pendingBase,
        ...data,
        dadosSolicitacao: data.dadosSolicitacao,
      }));
      const res = await request(app)
        .post('/api/cards/ap1/reject')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .send({ analysisReason: 'INCOME_BELOW_MINIMUM' })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cartao.status).toBe('rejeitado');
      expect(res.body.data.cartao.analysisReason).toBe('INCOME_BELOW_MINIMUM');
      expect(res.body.data.cartao.analysisMessage).toBe(
        'A renda mensal informada ainda não permite aprovação do cartão de crédito.',
      );
      await flushDeferred();
      expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
      expect(prisma.notificacao.create).not.toHaveBeenCalled();
      expect(prisma.cartao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ap1' },
          data: expect.objectContaining({
            status: 'rejeitado',
            dataAprovacao: null,
            dadosSolicitacao: expect.objectContaining({
              decisaoRejeicao: expect.objectContaining({
                code: 'INCOME_BELOW_MINIMUM',
                message: 'A renda mensal informada ainda não permite aprovação do cartão de crédito.',
              }),
            }),
          }),
        }),
      );
    });

    it('POST /api/cards/:id/reject sem body → MANUAL_REJECTION e mensagem padrão', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      prisma.cartao.update.mockImplementation(({ data }) => ({
        ...pendingBase,
        ...data,
        dadosSolicitacao: data.dadosSolicitacao,
      }));
      const res = await request(app)
        .post('/api/cards/ap1/reject')
        .set('Authorization', BEARER)
        .set('x-internal-key', INTERNAL_APPROVE_KEY)
        .expect(200);
      expect(res.body.data.cartao.analysisReason).toBe('MANUAL_REJECTION');
      expect(res.body.data.cartao.analysisMessage).toContain('Solicitação não aprovada');
    });
  });

  describe('Cartão virtual — contrato backend real', () => {
    const baseCardApproved = {
      id: 'base-approved',
      userId: 'test-user-id',
      status: 'aprovado',
      tipo: 'credito',
      bandeira: 'visa',
    };

    it('cria cartão virtual para cartão base aprovado', async () => {
      prisma.cartao.findFirst.mockResolvedValue(baseCardApproved);

      const res = await request(app)
        .post('/api/cards/base-approved/virtual')
        .set('Authorization', BEARER)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cartaoVirtual.status).toBe('ativo');
      expect(res.body.data.cartaoVirtual.maskedNumber).toContain('****');
      expectPublicCartaoVirtualShape(res.body.data.cartaoVirtual);
      expect(prisma.cartaoVirtual.create).toHaveBeenCalled();
      const createData = prisma.cartaoVirtual.create.mock.calls[0][0].data;
      expect(createData.cvvHash).toBeDefined();
      expect(createData.cvvHash).not.toEqual('');
    });

    it('impede criação de virtual para cartão pendente/bloqueado', async () => {
      prisma.cartao.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/cards/base-pendente/virtual')
        .set('Authorization', BEARER)
        .expect(400);

      expect(res.body.code).toBe('BASE_CARD_NOT_ELIGIBLE');
      expect(prisma.cartaoVirtual.create).not.toHaveBeenCalled();
    });

    it('impede acesso de terceiro no GET do cartão virtual', async () => {
      prisma.cartao.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/cards/card-terceiro/virtual')
        .set('Authorization', BEARER)
        .expect(404);

      expect(res.body.code).toBe('CARD_NOT_FOUND');
      expect(prisma.cartaoVirtual.findFirst).not.toHaveBeenCalled();
    });

    it('bloqueia e desbloqueia cartão virtual existente', async () => {
      prisma.cartaoVirtual.findFirst
        .mockResolvedValueOnce({
          id: 'cv1',
          cartaoId: 'base-approved',
          userId: 'test-user-id',
          status: 'ativo',
        })
        .mockResolvedValueOnce({
          id: 'cv1',
          cartaoId: 'base-approved',
          userId: 'test-user-id',
          status: 'bloqueado',
        });

      prisma.cartaoVirtual.update
        .mockResolvedValueOnce({
          id: 'cv1',
          cartaoId: 'base-approved',
          userId: 'test-user-id',
          maskedNumber: '**** **** **** 4321',
          last4: '4321',
          validade: '10/2031',
          bandeira: 'visa',
          cardToken: 'secret',
          cvvHash: 'secret-hash',
          status: 'bloqueado',
          dataBloqueio: new Date('2026-05-01T13:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 'cv1',
          cartaoId: 'base-approved',
          userId: 'test-user-id',
          maskedNumber: '**** **** **** 4321',
          last4: '4321',
          validade: '10/2031',
          bandeira: 'visa',
          cardToken: 'secret',
          cvvHash: 'secret-hash',
          status: 'ativo',
          dataBloqueio: null,
        });

      prisma.cartao.findFirst.mockResolvedValue({
        id: 'base-approved',
        userId: 'test-user-id',
        status: 'aprovado',
      });

      const blockRes = await request(app)
        .post('/api/cards/base-approved/virtual/block')
        .set('Authorization', BEARER)
        .expect(200);

      expect(blockRes.body.data.cartaoVirtual.status).toBe('bloqueado');
      expectPublicCartaoVirtualShape(blockRes.body.data.cartaoVirtual);

      const unblockRes = await request(app)
        .post('/api/cards/base-approved/virtual/unblock')
        .set('Authorization', BEARER)
        .expect(200);

      expect(unblockRes.body.data.cartaoVirtual.status).toBe('ativo');
      expectPublicCartaoVirtualShape(unblockRes.body.data.cartaoVirtual);
    });

    it('GET não vaza token/hash sensível do cartão virtual', async () => {
      prisma.cartao.findFirst.mockResolvedValue({ id: 'base-approved' });
      prisma.cartaoVirtual.findFirst.mockResolvedValue({
        id: 'cv1',
        cartaoId: 'base-approved',
        userId: 'test-user-id',
        maskedNumber: '**** **** **** 4321',
        last4: '4321',
        validade: '10/2031',
        bandeira: 'visa',
        status: 'ativo',
        cardToken: 'token-interno',
        cvvHash: 'hash-interno',
      });

      const res = await request(app)
        .get('/api/cards/base-approved/virtual')
        .set('Authorization', BEARER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expectPublicCartaoVirtualShape(res.body.data.cartaoVirtual);
      expect(res.body.data.cartaoVirtual.maskedNumber).toContain('****');
    });
  });

  describe('POST /api/cards — validação dadosAnalise / lgpd', () => {
    it('400 quando rendaMensalDeclarada não é número finito', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 'não-é-número' },
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

    it('400 quando rendaMensalDeclarada é negativa', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: -10 },
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

    it('400 quando empresa excede 200 caracteres', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { empresa: 'x'.repeat(201) },
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

    it('400 quando lgpd é enviado com aceito false', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          limite: 5000,
          lgpd: { versao: 'wizard-v1', aceito: false },
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

  });

  describe.each(['pin', 'cvv', 'pan', 'senha', 'password'])(
    'POST /api/cards — dadosAnalise com campo proibido (%s)',
    (campoProibido) => {
      it('400 FORBIDDEN_FIELD e não chama create', async () => {
        const res = await request(app)
          .post('/api/cards')
          .set('Authorization', BEARER)
          .send({
            tipo: 'credito',
            dadosAnalise: {
              rendaMensalDeclarada: 3000,
              [campoProibido]: 'valor-proibido',
            },
          })
          .expect(400);

        expect(res.body.code).toBe('FORBIDDEN_FIELD');
        expect(prisma.cartao.create).not.toHaveBeenCalled();
      });
    },
  );

  describe.each(['pin', 'cvv', 'pan', 'senha', 'password'])(
    'POST /api/cards — campo proibido no root (%s)',
    (campoProibido) => {
      it('400 FORBIDDEN_FIELD e não chama create', async () => {
        const res = await request(app)
          .post('/api/cards')
          .set('Authorization', BEARER)
          .send({
            tipo: 'credito',
            limite: 5000,
            [campoProibido]: 'valor-proibido',
          })
          .expect(400);

        expect(res.body.code).toBe('FORBIDDEN_FIELD');
        expect(prisma.cartao.create).not.toHaveBeenCalled();
      });
    },
  );
});
