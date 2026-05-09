/**
 * Reset controlado: apaga audit_logs do userId e em seguida o User (cascade).
 * Exige correspondência exata id + CPF antes de apagar.
 * Uso: node scripts/execute-test-user-reset.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CPF_DIGITS = '09504464408';
const USER_ID = 'cmorbdhwo0008qd0p4z5q4sle';

async function assertPreconditions() {
  const user = await prisma.user.findFirst({
    where: { id: USER_ID, cpf: CPF_DIGITS },
    select: { id: true, cpf: true, email: true, nomeCompleto: true, numeroConta: true },
  });
  if (!user) {
    const byId = await prisma.user.findUnique({ where: { id: USER_ID }, select: { id: true, cpf: true } });
    const byCpf = await prisma.user.findUnique({ where: { cpf: CPF_DIGITS }, select: { id: true, cpf: true } });
    throw new Error(
      `Pré-condição falhou: nenhum usuário com id=${USER_ID} E cpf=${CPF_DIGITS}. ` +
        `byId=${JSON.stringify(byId)} byCpf=${JSON.stringify(byCpf)}`,
    );
  }
  return user;
}

async function postValidate(email) {
  const byCpf = await prisma.user.findUnique({ where: { cpf: CPF_DIGITS } });
  const byEmail = await prisma.user.findUnique({ where: { email } });
  const orphan = {
    cartoes: await prisma.cartao.count({ where: { userId: USER_ID } }),
    emprestimos: await prisma.emprestimo.count({ where: { userId: USER_ID } }),
    tokens: await prisma.token.count({ where: { userId: USER_ID } }),
    chavesPix: await prisma.chavePix.count({ where: { userId: USER_ID } }),
    auditLogs: await prisma.auditLog.count({ where: { userId: USER_ID } }),
  };
  return {
    usuarioPorCpf: byCpf,
    usuarioPorEmail: byEmail,
    contagensOrfasPorUserIdAlvo: orphan,
    cpfLivre: !byCpf,
    emailLivre: !byEmail,
    tudoZeroOrfao: Object.values(orphan).every((n) => n === 0),
  };
}

async function main() {
  console.log('--- Reset controlado (escrita) ---');
  const pre = await assertPreconditions();
  console.log('Pré-check OK:', JSON.stringify(pre, null, 2));

  const email = pre.email;

  const [deletedAudits, deletedUser] = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { userId: USER_ID } }),
    prisma.user.delete({ where: { id: USER_ID, cpf: CPF_DIGITS } }),
  ]);

  console.log('Transação concluída:', { deletedAudits: deletedAudits.count, deletedUser: deletedUser.id });

  const post = await postValidate(email);
  console.log('Pós-validação:', JSON.stringify(post, null, 2));

  const ok =
    post.cpfLivre &&
    post.emailLivre &&
    post.tudoZeroOrfao &&
    !post.usuarioPorCpf &&
    !post.usuarioPorEmail;

  if (!ok) {
    console.error('FALHA na pós-validação — revisar manualmente.');
    process.exit(1);
  }
  console.log('Pós-validação OK: CPF e e-mail liberados; sem resíduos para userId alvo.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
