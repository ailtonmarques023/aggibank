const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

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

describe('Cards API — POST decisão e GET segurança', () => {
  const INTERNAL_APPROVE_KEY = 'internal-approve-test-key';

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(authUser({ scoreCredito: 750 }));
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

    it('renda 2000 sem limite → aprovado e limite 600', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 2000 },
        })
        .expect(201);

      expect(res.body.data.cartao.status).toBe('aprovado');
      expect(Number(res.body.data.cartao.limite)).toBe(600);
      expect(res.body.data.cartao.dataAprovacao).toBeDefined();
      expectPublicCartaoShape(res.body.data.cartao);
      const arg = prisma.cartao.create.mock.calls[0][0];
      expect(arg.data.dataAprovacao).toBeInstanceOf(Date);
    });

    it('renda 5000 sem limite → limite 1500 e aprovado', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 5000 },
        })
        .expect(201);

      expect(res.body.data.cartao.status).toBe('aprovado');
      expect(Number(res.body.data.cartao.limite)).toBe(1500);
      expectPublicCartaoShape(res.body.data.cartao);
    });

    it('renda muito alta sem limite → limite máximo 10000', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', BEARER)
        .send({
          tipo: 'credito',
          dadosAnalise: { rendaMensalDeclarada: 1_000_000 },
        })
        .expect(201);

      expect(Number(res.body.data.cartao.limite)).toBe(10000);
      expect(res.body.data.cartao.status).toBe('aprovado');
      expectPublicCartaoShape(res.body.data.cartao);
    });

    it('respeita limite enviado pelo cliente quando válido', async () => {
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
      expect(res.body.data.cartao.status).toBe('aprovado');
      expectPublicCartaoShape(res.body.data.cartao);
      const arg = prisma.cartao.create.mock.calls[0][0];
      expect(arg.data.dadosSolicitacao.decisaoAutomatica.limiteFonte).toBe('cliente');
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

  describe('POST /api/cards — CARD_ALREADY_EXISTS', () => {
    it('retorna 400 e não cria cartão quando já existe pendente do mesmo tipo', async () => {
      prisma.cartao.findFirst.mockResolvedValue({
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

      expect(res.body.code).toBe('CARD_ALREADY_EXISTS');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

    it('retorna 400 e não cria cartão quando já existe aprovado do mesmo tipo', async () => {
      prisma.cartao.findFirst.mockResolvedValue({
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

      expect(res.body.code).toBe('CARD_ALREADY_EXISTS');
      expect(prisma.cartao.create).not.toHaveBeenCalled();
    });

    it('retorna 400 e não cria cartão quando já existe ativo do mesmo tipo', async () => {
      prisma.cartao.findFirst.mockResolvedValue({
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

      expect(res.body.code).toBe('CARD_ALREADY_EXISTS');
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

    function mockFindFirstPostThenApprove(pendingCard) {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w && w.tipo && w.status && Array.isArray(w.status.in)) {
          return null;
        }
        if (w && w.id === pendingCard.id && w.status === 'pendente') {
          return pendingCard;
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

    it('aprova cartão pendente: status aprovado, dataAprovacao, resposta sem campos sensíveis', async () => {
      mockFindFirstPostThenApprove(pendingBase);
      const dataApr = new Date('2026-06-01T12:00:00.000Z');
      prisma.cartao.update.mockResolvedValue({
        ...pendingBase,
        status: 'aprovado',
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
      expectPublicCartaoShape(res.body.data.cartao);
      expect(prisma.cartao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ap1' },
          data: expect.objectContaining({
            status: 'aprovado',
            dataAprovacao: expect.any(Date),
          }),
        }),
      );
    });

    it('404 quando cartão não existe (id inválido)', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w && w.tipo && w.status && Array.isArray(w.status.in)) {
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
    });

    it('404 quando não há linha pendente para o utilizador (equiv. cartão inexistente ou de outro utilizador)', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w && w.tipo && w.status && Array.isArray(w.status.in)) {
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
    });

    it('404 ao aprovar cartão já aprovado (rota só considera status pendente)', async () => {
      prisma.cartao.findFirst.mockImplementation((opts) => {
        const w = opts && opts.where;
        if (w && w.tipo && w.status && Array.isArray(w.status.in)) {
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
