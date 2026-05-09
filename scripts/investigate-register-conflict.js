/**
 * Somente leitura: localiza CPF/e-mail em conflito com cadastro (P2002).
 * Uso: node scripts/investigate-register-conflict.js
 * Não apaga dados.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EMAIL = 'ailtonmarques023@gmail.com';
const CPF_DIGITS = '09504464408';
const CPF_FORMATTED = '095.044.644-08';

function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

function sanitizeDatabaseUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return { present: false, label: 'DATABASE_URL ausente' };
  try {
    const u = new URL(url);
    const db = (u.pathname || '').replace(/^\//, '').split('?')[0] || '(none)';
    return {
      present: true,
      scheme: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port || '(default)',
      database: db,
      user: u.username ? decodeURIComponent(u.username) : '',
      label: `${u.hostname}:${u.port || '5432'}/${db}`,
    };
  } catch {
    return { present: true, parseError: true, label: 'DATABASE_URL não parseável (mascarada)' };
  }
}

function diagnosisCode({ rowsUsers, chavePixHits, otherTables }) {
  if (rowsUsers.length > 0) {
    return 'CAUSA CONFIRMADA — USUÁRIO AINDA EXISTE';
  }
  if (chavePixHits.length > 0) {
    return 'CAUSA CONFIRMADA — CPF/E-MAIL EM TABELA AUXILIAR';
  }
  if (otherTables && otherTables.length > 0) {
    return 'CAUSA CONFIRMADA — CPF/E-MAIL EM TABELA AUXILIAR';
  }
  return 'CAUSA CONFIRMADA — RESET FOI EM OUTRO BANCO';
}

async function findUsersPostgres() {
  const emailLower = EMAIL.toLowerCase();
  const variants = await prisma.$queryRaw`
    SELECT
      'usuarios (match)' AS origem,
      id,
      id AS "userId",
      "nomeCompleto" AS nome,
      email,
      cpf,
      "numeroConta",
      "isAtivo",
      "isVerificado",
      "createdAt"
    FROM usuarios
    WHERE
      email = ${EMAIL}
      OR lower(email) = ${emailLower}
      OR cpf = ${CPF_DIGITS}
      OR cpf = ${CPF_FORMATTED}
      OR regexp_replace(cpf, '[^0-9]', '', 'g') = ${CPF_DIGITS}
    ORDER BY "createdAt" ASC
  `;
  return Array.isArray(variants) ? variants : [];
}

async function columnsEmailCpf() {
  return prisma.$queryRaw`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('email', 'cpf')
    ORDER BY table_name, column_name
  `;
}

async function scanAuxiliaryTables() {
  const hits = [];
  const pix = await prisma.chavePix.findMany({
    where: {
      OR: [{ valor: EMAIL }, { valor: EMAIL.toLowerCase() }, { valor: CPF_DIGITS }, { valor: CPF_FORMATTED }],
    },
    select: {
      id: true,
      userId: true,
      tipo: true,
      valor: true,
      status: true,
      createdAt: true,
    },
  });
  for (const p of pix) {
    hits.push({
      tabela: 'chaves_pix',
      id: p.id,
      userId: p.userId,
      nome: null,
      email: null,
      cpf: null,
      valorChave: p.valor,
      tipo: p.tipo,
      status: p.status,
      createdAt: p.createdAt,
    });
  }

  const orphanUserIds = [...new Set(pix.map((p) => p.userId))];
  for (const uid of orphanUserIds) {
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, nomeCompleto: true, email: true, cpf: true, createdAt: true, isAtivo: true },
    });
    if (!u) {
      hits.push({
        tabela: 'chaves_pix (órfã)',
        id: uid,
        userId: uid,
        nota: 'userId sem linha em usuarios',
      });
    }
  }

  return hits;
}

async function main() {
  console.log('=== Investigação conflito cadastro (somente leitura) ===\n');

  const dbInfo = sanitizeDatabaseUrl(process.env.DATABASE_URL);
  console.log('DATABASE_URL (este processo / .env na raiz do repo):');
  console.log(JSON.stringify(dbInfo, null, 2));
  console.log('\nAlvos:');
  console.log({ email: EMAIL, cpfDigits: CPF_DIGITS, cpfFormatted: CPF_FORMATTED });

  const rowsUsers = await findUsersPostgres();
  console.log('\n--- usuarios (qualquer variante e-mail/CPF) ---');
  console.log(JSON.stringify(rowsUsers, null, 2));

  const chavePixHits = await scanAuxiliaryTables();
  console.log('\n--- chaves_pix / órfãos ---');
  console.log(JSON.stringify(chavePixHits, null, 2));

  let cols = [];
  try {
    cols = await columnsEmailCpf();
  } catch (e) {
    cols = [{ erro: e.message }];
  }
  console.log('\n--- information_schema: colunas email/cpf no schema public ---');
  console.log(JSON.stringify(cols, null, 2));

  const code = diagnosisCode({ rowsUsers, chavePixHits, otherTables: [] });
  console.log('\n=== DIAGNÓSTICO (código) ===');
  console.log(code);

  if (code === 'CAUSA CONFIRMADA — RESET FOI EM OUTRO BANCO') {
    console.log(
      '\nNota: Nenhuma linha em `usuarios` bate com e-mail/CPF neste banco. ' +
        'O backend que serve o app (Vercel/Railway/local) pode estar com outro DATABASE_URL.',
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
