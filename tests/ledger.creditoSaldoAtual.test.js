'use strict';

const { registrarCreditoSaldoAtual } = require('../src/services/ledgerService');

describe('ledgerService.registrarCreditoSaldoAtual', () => {
  function makeTx(overrides = {}) {
    const state = {
      movByKey: new Map(),
      user: { id: 'u1', saldoAtual: 100 },
      ...overrides,
    };
    const tx = {
      movimentacao: {
        findUnique: jest.fn(async ({ where }) => {
          if (!where || !where.idempotencyKey) return null;
          return state.movByKey.get(where.idempotencyKey) || null;
        }),
        create: jest.fn(async ({ data }) => {
          const row = { id: `mov-${state.movByKey.size + 1}`, ...data };
          if (data.idempotencyKey) state.movByKey.set(data.idempotencyKey, row);
          return row;
        }),
      },
      user: {
        findUnique: jest.fn(async ({ where }) => {
          if (!where || where.id !== state.user.id) return null;
          return { saldoAtual: state.user.saldoAtual };
        }),
        update: jest.fn(async ({ where, data }) => {
          if (where.id === state.user.id && typeof data.saldoAtual === 'number') {
            state.user = { ...state.user, saldoAtual: data.saldoAtual };
          }
          return state.user;
        }),
      },
    };
    return { tx, state };
  }

  it('credita saldoAtual e cria movimentacao positiva', async () => {
    const { tx, state } = makeTx();
    const mov = await registrarCreditoSaldoAtual(tx, {
      userId: 'u1',
      valorCredito: 25.5,
      tipo: 'credito',
      descricao: 'Crédito teste',
      categoria: 'ajuste_operacional_staging',
      referenceType: 'operational_credit_staging',
      referenceId: 'idem-1',
      idempotencyKey: 'idem-1',
    });
    expect(mov.valor).toBe(25.5);
    expect(mov.saldoAnterior).toBe(100);
    expect(mov.saldoAtual).toBe(125.5);
    expect(state.user.saldoAtual).toBe(125.5);
  });

  it('exige idempotencyKey', async () => {
    const { tx } = makeTx();
    await expect(
      registrarCreditoSaldoAtual(tx, {
        userId: 'u1',
        valorCredito: 10,
        tipo: 'credito',
        descricao: 'x',
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_FIELDS_REQUIRED' });
  });

  it('retorna movimentacao existente para mesma chave e mesmo usuario', async () => {
    const { tx, state } = makeTx();
    state.movByKey.set('k1', {
      id: 'existing',
      userId: 'u1',
      valor: 10,
      idempotencyKey: 'k1',
    });
    const mov = await registrarCreditoSaldoAtual(tx, {
      userId: 'u1',
      valorCredito: 99,
      tipo: 'credito',
      descricao: 'não deve aplicar',
      idempotencyKey: 'k1',
    });
    expect(mov.id).toBe('existing');
    expect(state.user.saldoAtual).toBe(100);
  });

  it('LEDGER_IDEMPOTENCY_CONFLICT quando chave pertence a outro usuario', async () => {
    const { tx, state } = makeTx();
    state.movByKey.set('k-shared', {
      id: 'm-other',
      userId: 'u-other',
      idempotencyKey: 'k-shared',
    });
    await expect(
      registrarCreditoSaldoAtual(tx, {
        userId: 'u1',
        valorCredito: 10,
        tipo: 'credito',
        descricao: 'x',
        idempotencyKey: 'k-shared',
      }),
    ).rejects.toMatchObject({
      code: 'LEDGER_IDEMPOTENCY_CONFLICT',
      httpStatus: 409,
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('LEDGER_USER_NOT_FOUND', async () => {
    const { tx } = makeTx({ user: { id: 'other', saldoAtual: 0 } });
    await expect(
      registrarCreditoSaldoAtual(tx, {
        userId: 'u1',
        valorCredito: 10,
        tipo: 'credito',
        descricao: 'x',
        idempotencyKey: 'k2',
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_USER_NOT_FOUND' });
  });

  it('LEDGER_INVALID_AMOUNT para valor não positivo', async () => {
    const { tx } = makeTx();
    await expect(
      registrarCreditoSaldoAtual(tx, {
        userId: 'u1',
        valorCredito: 0,
        tipo: 'credito',
        descricao: 'x',
        idempotencyKey: 'k3',
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_INVALID_AMOUNT' });
  });
});
