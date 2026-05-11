/**
 * Fase N-PROD.1 — smoke HTTP (produção controlada).
 * Uso: railway run node scripts/nprod1-operational-pix-check.js
 * Não imprime JWT, senhas, certificado nem pixCopiaECola completo.
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const BASE = String(process.env.AGILBANK_NPROD1_BASE_URL || 'https://aggibank-production.up.railway.app').replace(/\/$/, '');

function signSmokeJwt(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET ausente');
  return jwt.sign({ userId }, secret, { expiresIn: '10m' });
}

function redactBr(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return `${t.slice(0, 12)}…len=${t.length}`;
}

async function httpJson(method, path, token, bodyObj) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (bodyObj != null) opts.body = JSON.stringify(bodyObj);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _parseError: true, rawLen: text.length };
  }
  return { status: res.status, json };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const lic = await prisma.loanInsuranceCharge.findFirst({
      where: { status: 'pendente' },
      include: { user: { select: { id: true, isVerificado: true, saldoAtual: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!lic || !lic.user || !lic.user.isVerificado) {
      console.log(JSON.stringify({ ok: false, code: 'NO_PENDING_VERIFIED_LIC' }));
      process.exit(2);
    }

    const userId = lic.userId;
    const saldoBefore = String(lic.user.saldoAtual);
    const token = signSmokeJwt(userId);

    const chargesRes = await httpJson('GET', '/api/charges', token, null);
    console.log(
      JSON.stringify({
        step: 'GET_CHARGES',
        httpStatus: chargesRes.status,
        success: !!(chargesRes.json && chargesRes.json.success),
        count: chargesRes.json && chargesRes.json.data && chargesRes.json.data.charges
          ? chargesRes.json.data.charges.length
          : null,
      }),
    );

    const chargeId = `lic_${lic.id}`;
    const amount = Number(lic.amount);

    const pixRes = await httpJson('POST', `/api/charges/${encodeURIComponent(chargeId)}/pix`, token, {});
    const d = pixRes.json && pixRes.json.data;
    console.log(
      JSON.stringify({
        step: 'POST_PIX',
        httpStatus: pixRes.status,
        success: !!(pixRes.json && pixRes.json.success),
        code: pixRes.json && pixRes.json.code,
        message: pixRes.json && pixRes.json.message,
        source: d && d.source,
        txid: d && d.txid,
        pixCopiaECola_redacted: d && d.pixCopiaECola ? redactBr(d.pixCopiaECola) : null,
        hasQrCodePix: !!(d && d.qrCodePix),
        pixStatus: d && d.pixStatus,
        expiresAt: d && d.expiresAt,
        providerReference: d && d.providerReference,
      }),
    );

    if (!pixRes.json || !pixRes.json.success || !d || d.source !== 'efi' || !d.txid) {
      console.log(JSON.stringify({ ok: false, code: 'POST_PIX_FAILED' }));
      process.exit(1);
    }

    const row = await prisma.pixCobranca.findFirst({
      where: { userId, linkedEntityType: 'loan_insurance', linkedEntityId: lic.id, txid: d.txid },
      select: { id: true, txid: true, status: true, amount: true, providerReference: true },
    });

    const licAfter = await prisma.loanInsuranceCharge.findUnique({
      where: { id: lic.id },
      select: { status: true, paidAt: true },
    });
    const userAfter = await prisma.user.findUnique({
      where: { id: userId },
      select: { saldoAtual: true },
    });

    console.log(
      JSON.stringify({
        step: 'DB_PIX_COBRANCA',
        rowFound: !!row,
        rowId: row ? row.id : null,
        rowStatus: row ? row.status : null,
        rowAmount: row ? String(row.amount) : null,
        providerReference: row ? row.providerReference : null,
      }),
    );

    const saldoAfter = userAfter ? String(userAfter.saldoAtual) : null;
    console.log(
      JSON.stringify({
        step: 'SAFETY',
        saldoUnchanged: saldoAfter === saldoBefore,
        loanInsuranceStatusUnchanged: licAfter && licAfter.status === 'pendente',
        loanInsurancePaidAtStillNull: licAfter && licAfter.paidAt == null,
      }),
    );

    if (!row) {
      console.log(JSON.stringify({ ok: false, code: 'PIX_ROW_MISSING' }));
      process.exit(1);
    }

    console.log(JSON.stringify({ ok: true, code: 'NPROD1_PARTIAL_APPROVAL' }));
    process.exit(0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, code: 'SCRIPT_ERROR', message: e.message }));
  process.exit(1);
});
