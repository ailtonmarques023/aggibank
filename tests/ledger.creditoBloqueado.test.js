'use strict';

const {
  LedgerError,
  registrarCreditoSaldoBloqueado,
} = require('../src/services/ledgerService');

describe('ledgerService.registrarCreditoSaldoBloqueado', () => {
  function makeTx(overrides = {}) {
    const state = {
      movByKey: new Map(),
      user: { id: 'u1', saldoAtual: 100, saldoBloqueado: 50 },
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
        findUnique: jest.fn(async () => state.user),
        update: jest.fn(async ({ data }) => {
          if (data.saldoBloqueado && data.saldoBloqueado.increment != null) {
            state.user = {
              ...state.user,
              saldoBloqueado: Number(state.user.saldoBloqueado) + data.saldoBloqueado.increment,
            };
          }
          if (typeof data.saldoAtual === 'number') {
            state.user = { ...state.user, saldoAtual: data.saldoAtual };
          }
          return state.user;
        }),
      },
    };
    return { tx, state };
  }

  it('incrementa apenas saldoBloqueado e cria movimentacao informativa', async () => {
    const { tx, state } = makeTx();
    const mov = await registrarCreditoSaldoBloqueado(tx, {
      userId: 'u1',
      valorBloqueado: 200,
      descricao: 'Crédito bloqueado teste',
      referenceId: 'loan-x',
      idempotencyKey: 'loan_blocked_funds:loan-x',
    });

    expect(state.user.saldoBloqueado).toBe(250);
    expect(state.user.saldoAtual).toBe(100);
    expect(mov.valor).toBe(200);
    expect(mov.saldoAnterior).toBe(100);
    expect(mov.saldoAtual).toBe(100);
    expect(mov.tipo).toBe('credito_bloqueado');
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { saldoBloqueado: { increment: 200 } },
    });
  });

  it('na segunda chamada com mesma idempotencyKey nao incrementa nem cria de novo', async () => {
    const { tx, state } = makeTx();
    const first = await registrarCreditoSaldoBloqueado(tx, {
      userId: 'u1',
      valorBloqueado: 80,
      descricao: 'Bloqueio',
      referenceId: 'loan-y',
      idempotencyKey: 'loan_blocked_funds:loan-y',
    });
    const createCallsAfterFirst = tx.movimentacao.create.mock.calls.length;
    const updateCallsAfterFirst = tx.user.update.mock.calls.length;

    const second = await registrarCreditoSaldoBloqueado(tx, {
      userId: 'u1',
      valorBloqueado: 80,
      descricao: 'Bloqueio',
      referenceId: 'loan-y',
      idempotencyKey: 'loan_blocked_funds:loan-y',
    });

    expect(second.id).toBe(first.id);
    expect(state.user.saldoBloqueado).toBe(130);
    expect(tx.movimentacao.create.mock.calls.length).toBe(createCallsAfterFirst);
    expect(tx.user.update.mock.calls.length).toBe(updateCallsAfterFirst);
  });

  it('rejeita tipo diferente de credito_bloqueado', async () => {
    const { tx } = makeTx();
    await expect(
      registrarCreditoSaldoBloqueado(tx, {
        userId: 'u1',
        valorBloqueado: 10,
        tipo: 'credito',
        descricao: 'x',
        referenceId: 'loan-z',
        idempotencyKey: 'loan_blocked_funds:loan-z',
      }),
    ).rejects.toThrow(LedgerError);
  });

  it('rejeita idempotencyKey de outro userId', async () => {
    const { tx, state } = makeTx();
    state.movByKey.set('loan_blocked_funds:loan-z', {
      id: 'm1',
      userId: 'outro',
      idempotencyKey: 'loan_blocked_funds:loan-z',
    });
    await expect(
      registrarCreditoSaldoBloqueado(tx, {
        userId: 'u1',
        valorBloqueado: 10,
        descricao: 'x',
        referenceId: 'loan-z',
        idempotencyKey: 'loan_blocked_funds:loan-z',
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_IDEMPOTENCY_CONFLICT' });
  });
});
