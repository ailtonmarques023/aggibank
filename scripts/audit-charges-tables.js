/* One-off audit: counts in DB for freight + insurance (no PII printed). */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function safeCount(label, fn) {
  try {
    const n = await fn();
    return { ok: true, n };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const out = {};
    Object.assign(
      out,
      { card_shipments_total: await safeCount('card_shipments', () => prisma.cardShipment.count()) },
      {
        card_shipments_fee_pendente: await safeCount('card_shipments PENDENTE', () =>
          prisma.cardShipment.count({ where: { shippingFeeStatus: 'PENDENTE' } })
        ),
      },
      {
        loan_insurance_charges_total: await safeCount('loan_insurance_charges', () =>
          prisma.loanInsuranceCharge.count()
        ),
      },
      {
        loan_insurance_charges_pendente: await safeCount('loan_insurance pendente', () =>
          prisma.loanInsuranceCharge.count({ where: { status: 'pendente' } })
        ),
      },
      { boletos_total: await safeCount('boletos', () => prisma.boleto.count()) },
      {
        emprestimos_aprovados_seguro: await safeCount('emprestimos', () =>
          prisma.emprestimo.count({
            where: { status: 'aprovado', insuranceSelected: true },
          })
        ),
      }
    );
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('audit-charges-tables failed:', e.message);
  process.exit(1);
});
