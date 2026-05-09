/**
 * Somente leitura: localiza usuário por CPF e conta registros relacionados.
 * Uso: node scripts/investigate-test-user-reset.js
 * Não apaga dados.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CPF_DIGITS = '09504464408';

function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

async function findUserByCpf() {
  const byExact = await prisma.user.findFirst({
    where: { cpf: CPF_DIGITS },
    select: { id: true, cpf: true, nomeCompleto: true, email: true, numeroConta: true },
  });
  if (byExact) return byExact;

  const rows = await prisma.$queryRaw`
    SELECT id, cpf, "nomeCompleto", email, "numeroConta"
    FROM usuarios
    WHERE regexp_replace(cpf, '[^0-9]', '', 'g') = ${CPF_DIGITS}
    LIMIT 5
  `;
  if (Array.isArray(rows) && rows.length === 1) return rows[0];
  if (Array.isArray(rows) && rows.length > 1) {
    console.error('Múltiplos usuários com mesmo CPF numérico — revisar manualmente:', rows);
    return rows[0];
  }
  return null;
}

async function safeCount(label, fn) {
  try {
    const count = await fn();
    return { label, count };
  } catch (e) {
    if (e.code === 'P2021') {
      return { label, count: null, note: 'tabela ausente neste banco (migration não aplicada?)' };
    }
    throw e;
  }
}

async function countsForUser(userId) {
  const cartoes = await prisma.cartao.findMany({ where: { userId }, select: { id: true } });
  const cardIds = cartoes.map((c) => c.id);

  let shipmentIds = [];
  try {
    const shipments = await prisma.cardShipment.findMany({
      where: { userId },
      select: { id: true },
    });
    shipmentIds = shipments.map((s) => s.id);
  } catch (e) {
    if (e.code !== 'P2021') throw e;
  }

  const emprestimos = await prisma.emprestimo.findMany({ where: { userId }, select: { id: true } });
  const loanIds = emprestimos.map((e) => e.id);

  const results = await Promise.all([
    safeCount('enderecos', () => prisma.endereco.count({ where: { userId } })),
    safeCount('dados_profissionais', () => prisma.dadosProfissionais.count({ where: { userId } })),
    safeCount('configuracoes_usuario', () => prisma.configuracoesUsuario.count({ where: { userId } })),
    safeCount('cartoes', () => prisma.cartao.count({ where: { userId } })),
    safeCount('cartoes_virtuais', () => prisma.cartaoVirtual.count({ where: { userId } })),
    safeCount('emprestimos', () => prisma.emprestimo.count({ where: { userId } })),
    safeCount('loan_insurance_charges', () => prisma.loanInsuranceCharge.count({ where: { userId } })),
    safeCount('movimentacoes', () => prisma.movimentacao.count({ where: { userId } })),
    safeCount('notificacoes', () => prisma.notificacao.count({ where: { userId } })),
    safeCount('transacoes_pix', () => prisma.transacaoPix.count({ where: { userId } })),
    safeCount('chaves_pix', () => prisma.chavePix.count({ where: { userId } })),
    safeCount('boletos', () => prisma.boleto.count({ where: { userId } })),
    safeCount('pagamentos', () => prisma.pagamento.count({ where: { userId } })),
    safeCount('tokens', () => prisma.token.count({ where: { userId } })),
    safeCount('afiliacoes', () => prisma.afiliacoes.count({ where: { userId } })),
    safeCount('campanhas', () => prisma.campanhas.count({ where: { userId } })),
    safeCount('gamificacao_usuario', () => prisma.gamificacao_usuario.count({ where: { userId } })),
    safeCount('audit_logs_com_userId', () => prisma.auditLog.count({ where: { userId } })),
    safeCount('card_shipments', () => prisma.cardShipment.count({ where: { userId } })),
    safeCount('card_shipment_events', () =>
      shipmentIds.length
        ? prisma.cardShipmentEvent.count({
            where: {
              OR: [{ userId }, { shipmentId: { in: shipmentIds } }],
            },
          })
        : prisma.cardShipmentEvent.count({ where: { userId } }),
    ),
  ]);

  const out = {};
  for (const r of results) {
    if (r.note) out[r.label] = { count: r.count, note: r.note };
    else out[r.label] = r.count;
  }

  return {
    ...out,
    _ids: { cardIds, shipmentIds, loanIds },
  };
}

async function main() {
  console.log('--- Investigação reset (somente leitura) ---');
  console.log('CPF alvo (dígitos):', CPF_DIGITS);

  const user = await findUserByCpf();
  if (!user) {
    console.log('RESULTADO: usuário não encontrado com este CPF.');
    process.exit(0);
  }

  console.log('\nUsuário encontrado:');
  console.log(JSON.stringify(user, null, 2));

  const c = await countsForUser(user.id);
  const ids = c._ids;
  delete c._ids;

  console.log('\nQuantidades por tabela (userId =', user.id, '):');
  console.log(JSON.stringify(c, null, 2));
  console.log('\nIDs relacionados (amostra):');
  console.log(JSON.stringify(ids, null, 2));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
