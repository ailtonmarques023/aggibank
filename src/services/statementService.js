'use strict';

/**
 * Extrato unificado a partir da tabela Movimentacao (somente leitura).
 */

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * CREDITO / DEBITO — respeita `tipo` persistido quando é debito/credito (ex.: seguro com valor positivo).
 */
function toStatementTipo(row) {
  const rawTipo = String(row.tipo || '').toLowerCase();
  if (rawTipo === 'debito') return 'DEBITO';
  if (rawTipo === 'credito' || rawTipo === 'credito_bloqueado') return 'CREDITO';
  const v = Number(row.valor);
  if (v < 0) return 'DEBITO';
  if (v > 0) return 'CREDITO';
  return 'DEBITO';
}

/**
 * Origem agregada para o contrato do extrato (PIX | BOLETO | EMPRESTIMO | CARTAO | FRETE | AJUSTE).
 */
function mapOrigem(row) {
  const ref = String(row.referenceType || '').toLowerCase();
  const cat = String(row.categoria || '').toLowerCase();
  const tipo = String(row.tipo || '').toLowerCase();

  if (ref === 'pix' || tipo === 'pix') return 'PIX';
  if (tipo === 'boleto') return 'BOLETO';
  if (cat === 'cartao_fisico_frete' || ref === 'card_shipment') return 'FRETE';
  if (
    ref === 'emprestimo' ||
    ref === 'loan_insurance_charge' ||
    cat === 'emprestimo' ||
    cat === 'seguro_emprestimo' ||
    cat === 'emprestimo_desbloqueio' ||
    tipo === 'credito_bloqueado'
  ) {
    return 'EMPRESTIMO';
  }
  if (cat === 'pagamento') {
    if (tipo === 'pix') return 'PIX';
    if (tipo === 'boleto') return 'BOLETO';
    return 'BOLETO';
  }
  if (tipo === 'tarifa') return 'CARTAO';
  return 'AJUSTE';
}

function toPublicItem(row) {
  const valorAbs = roundMoney(Math.abs(Number(row.valor)));
  const occurredAt = row.dataMovimentacao || row.createdAt;
  return {
    id: row.id,
    tipo: toStatementTipo(row),
    valor: valorAbs,
    descricao: row.descricao,
    status: 'CONCLUIDO',
    origem: mapOrigem(row),
    data: occurredAt instanceof Date ? occurredAt.toISOString() : new Date(occurredAt).toISOString(),
    saldoAnterior: roundMoney(row.saldoAnterior),
    saldoAtual: roundMoney(row.saldoAtual),
    referenciaId: row.referenceId != null ? String(row.referenceId) : null,
  };
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {Record<string, string>} query req.query
 */
async function listStatementForUser(prisma, userId, query) {
  const { page, limit, skip } = parsePagination(query);

  const where = { userId };

  const [rows, total] = await Promise.all([
    prisma.movimentacao.findMany({
      where,
      orderBy: { dataMovimentacao: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        tipo: true,
        descricao: true,
        valor: true,
        saldoAnterior: true,
        saldoAtual: true,
        categoria: true,
        referenceType: true,
        referenceId: true,
        dataMovimentacao: true,
        createdAt: true,
      },
    }),
    prisma.movimentacao.count({ where }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    items: rows.map(toPublicItem),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

module.exports = {
  listStatementForUser,
  toStatementTipo,
  mapOrigem,
  toPublicItem,
  parsePagination,
};
