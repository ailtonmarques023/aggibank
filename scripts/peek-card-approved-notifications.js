/**
 * Somente leitura: últimas notificações card_approved.
 * node scripts/peek-card-approved-notifications.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notificacoes'
  `;
  const names = new Set(cols.map((c) => String(c.column_name)));

  const want = ['id', 'userId', 'tipo', 'metadata', 'createdAt', 'dedupeKey'];
  const pick = want.filter((c) => names.has(c));
  if (!pick.length) {
    console.log(JSON.stringify({ error: 'tabela notificacoes sem colunas esperadas', columns: [...names] }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const selectList = pick.map((c) => `"${c}"`).join(', ');
  const countAll = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM notificacoes`);
  const tipos = await prisma.$queryRawUnsafe(
    `SELECT tipo, COUNT(*)::int AS c FROM notificacoes GROUP BY tipo ORDER BY c DESC LIMIT 15`,
  );

  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${selectList} FROM notificacoes WHERE tipo = 'card_approved' ORDER BY "createdAt" DESC LIMIT 10`,
  );

  console.log(JSON.stringify({ columnsUsed: pick, countNotificacoes: countAll[0], tipos }, null, 2));

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, nomeCompleto: true },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  const out = rows.map((r) => {
    const u = byId[r.userId];
    const email = u && u.email ? String(u.email) : null;
    const masked = email ? email.replace(/(^.).*(@.*$)/, '$1***$2') : null;
    return {
      ...r,
      userEmailMasked: masked,
      dedupeKeyMatchesCardApprovedPattern: /^card_approved:.+/.test(String(r.dedupeKey || '')),
      emailSentAt: r.metadata && r.metadata.emailSentAt ? r.metadata.emailSentAt : null,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
