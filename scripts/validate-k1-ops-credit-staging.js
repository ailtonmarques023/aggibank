#!/usr/bin/env node
'use strict';

/**
 * Fase K.1 — Validação operacional do crédito de homologação (staging).
 *
 * NÃO usar com URL de produção. O script aborta se /api/health reportar environment=production.
 *
 * Variáveis:
 *   K1_STAGING_BASE_URL          — ex.: https://api-staging.seudominio.com (sem barra final)
 *   K1_I_CONFIRM_STAGING_NOT_PRODUCTION=yes — confirmação explícita
 *   OPS_CREDIT_INTERNAL_KEY      — mesma chave configurada no servidor staging
 *   K1_TEST_EMAIL, K1_TEST_PASSWORD — conta de teste no banco de staging
 *   K1_REF_OPERADOR              — opcional (default: k1-script)
 *   K1_IDEMPOTENCY_KEY           — opcional (default: timestamp)
 *
 * Uso: npm run validate:k1-ops-credit
 */

require('dotenv').config();
const axios = require('axios');

function fail(msg, details) {
  console.error('[K1.1] FALHA:', msg);
  if (details !== undefined) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function numSaldo(body) {
  const v = body?.data?.saldoAtual;
  return Number(v);
}

async function main() {
  if (process.env.K1_I_CONFIRM_STAGING_NOT_PRODUCTION !== 'yes') {
    fail(
      'Defina K1_I_CONFIRM_STAGING_NOT_PRODUCTION=yes para confirmar que o alvo é homologação/staging (não produção).',
    );
  }

  const baseURL = (process.env.K1_STAGING_BASE_URL || '').replace(/\/$/, '');
  if (!baseURL) {
    fail('K1_STAGING_BASE_URL é obrigatória.');
  }

  const opsKey = process.env.OPS_CREDIT_INTERNAL_KEY;
  if (!opsKey) {
    fail('OPS_CREDIT_INTERNAL_KEY é obrigatória no ambiente local do script (mesmo valor do servidor staging).');
  }

  const email = process.env.K1_TEST_EMAIL;
  const senha = process.env.K1_TEST_PASSWORD;
  if (!email || !senha) {
    fail('K1_TEST_EMAIL e K1_TEST_PASSWORD são obrigatórias.');
  }

  const client = axios.create({
    baseURL,
    timeout: 120000,
    validateStatus: () => true,
  });

  // 1–2) Health + NODE_ENV no servidor
  const health = await client.get('/api/health');
  if (health.status !== 200) {
    fail('GET /api/health falhou', { status: health.status, data: health.data });
  }
  const serverEnv = health.data?.environment;
  console.log('[K1.1] Servidor reporta environment:', serverEnv);
  if (serverEnv === 'production') {
    fail(
      'Ambiente do servidor é production. Abortando: não execute este script contra produção.',
      { baseURL },
    );
  }
  if (!serverEnv) {
    console.warn('[K1.1] AVISO: health não retornou environment; prossiga apenas se tiver certeza do alvo.');
  }

  // Chave interna: não dá para validar só por HTTP; operador confere no painel (checklist 2).
  console.log('[K1.1] OPS_CREDIT_INTERNAL_KEY: definida localmente (comparar com secrets do staging).');

  // 3–4) Login + saldo antes
  const loginRes = await client.post('/api/auth/login', { email, senha });
  if (loginRes.status !== 200 || !loginRes.data?.data?.token) {
    fail('Login falhou', { status: loginRes.status, body: loginRes.data });
  }
  const token = loginRes.data.data.token;
  const userId = loginRes.data.data.user.id;
  const authHeader = { Authorization: `Bearer ${token}` };

  const balBeforeRes = await client.get('/api/user/balance', { headers: authHeader });
  if (balBeforeRes.status !== 200) {
    fail('GET /api/user/balance (antes) falhou', { status: balBeforeRes.status, data: balBeforeRes.data });
  }
  const saldoAntes = numSaldo(balBeforeRes.data);
  if (!Number.isFinite(saldoAntes)) {
    fail('saldoAtual antes inválido', balBeforeRes.data);
  }
  console.log('[K1.1] saldoAtual antes:', saldoAntes);

  // 5–7) Crédito R$ 50
  const idem = process.env.K1_IDEMPOTENCY_KEY || `k1-1-${Date.now()}`;
  const referenciaOperador = process.env.K1_REF_OPERADOR || 'k1-script';

  const creditRes = await client.post(
    '/api/internal/ops/credit-test-balance',
    {
      userId,
      valor: 50,
      motivo: 'Fase K.1 validação operacional',
      idempotencyKey: idem,
      referenciaOperador,
    },
    { headers: { 'x-internal-key': opsKey } },
  );

  if (creditRes.status !== 200) {
    fail('POST /api/internal/ops/credit-test-balance esperava 200', {
      status: creditRes.status,
      body: creditRes.data,
      rota: '/api/internal/ops/credit-test-balance',
    });
  }
  const payload = creditRes.data?.data;
  if (!payload?.movimentacao || payload.saldoAtual == null) {
    fail('Resposta sem data.movimentacao / data.saldoAtual', creditRes.data);
  }
  console.log('[K1.1] Crédito OK; saldoAtual na resposta:', payload.saldoAtual);

  const balAfterRes = await client.get('/api/user/balance', { headers: authHeader });
  if (balAfterRes.status !== 200) {
    fail('GET /api/user/balance (depois) falhou', balAfterRes.data);
  }
  const saldoDepois = numSaldo(balAfterRes.data);
  const delta = Math.round((saldoDepois - saldoAntes) * 100) / 100;
  if (delta !== 50) {
    fail('saldoAtual não aumentou exatamente R$50', { saldoAntes, saldoDepois, delta });
  }
  console.log('[K1.1] saldoAtual depois:', saldoDepois, '(delta +50)');

  // 9–10) Extrato CREDITO / AJUSTE
  const stmtRes = await client.get('/api/user/statement?limit=30', { headers: authHeader });
  if (stmtRes.status !== 200) {
    fail('GET /api/user/statement falhou', stmtRes.data);
  }
  const items = stmtRes.data?.items || [];
  const found = items.find(
    (i) =>
      i.tipo === 'CREDITO' &&
      i.origem === 'AJUSTE' &&
      (String(i.referenciaId || '') === idem || String(i.descricao || '').includes('Homologação')),
  );
  if (!found) {
    fail('Extrato sem linha CREDITO/AJUSTE esperada para esta operação', {
      itemsPreview: items.slice(0, 5),
    });
  }
  console.log('[K1.1] Extrato: encontrada linha CREDITO / AJUSTE id=', found.id);

  // 11–12) Idempotência
  const dupRes = await client.post(
    '/api/internal/ops/credit-test-balance',
    {
      userId,
      valor: 999,
      motivo: 'repetição idempotente',
      idempotencyKey: idem,
      referenciaOperador: `${referenciaOperador}-dup`,
    },
    { headers: { 'x-internal-key': opsKey } },
  );
  if (dupRes.status !== 200) {
    fail('Segunda chamada com mesma idempotencyKey deveria retornar 200 (idempotente)', dupRes.data);
  }
  const balFinalRes = await client.get('/api/user/balance', { headers: authHeader });
  const saldoFinal = numSaldo(balFinalRes.data);
  if (Math.abs(saldoFinal - saldoDepois) > 0.005) {
    fail('Saldo duplicou após retry idempotente', { saldoDepois, saldoFinal });
  }
  console.log('[K1.1] Idempotência OK; saldo inalterado:', saldoFinal);

  console.log('');
  console.log('[K1.1] --- Checklist HTTP concluído com sucesso ---');
  console.log('[K1.1] Item 13 (auditoria): no banco de staging, consulte AuditLog onde action = ops.staging_credit_available');
  console.log('[K1.1] Item 14 (403 em production): validação automatizada — rode: npx jest tests/internalOpsCredit.test.js -t production');
  console.log(JSON.stringify({ baseURL, userId, saldoAntes, saldoDepois, idempotencyKey: idem }, null, 2));
}

main().catch((e) => fail(e.message, { stack: e.stack }));
