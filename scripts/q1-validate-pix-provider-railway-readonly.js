#!/usr/bin/env node
/**
 * Fase Q.1 — Somente leitura: última PixCobranca (provider, etc.).
 * Uso: railway run node scripts/q1-validate-pix-provider-railway-readonly.js
 */
'use strict';

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const row = await prisma.pixCobranca.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        txid: true,
        status: true,
        provider: true,
        linkedEntityType: true,
        linkedEntityId: true,
        createdAt: true,
      },
    });
    console.log(JSON.stringify({ lastPixCobranca: row }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: e.message }));
  process.exit(1);
});
