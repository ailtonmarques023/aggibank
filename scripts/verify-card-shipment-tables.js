/**
 * One-shot: list card_shipment tables from DB (uses DATABASE_URL from env).
 * Usage: railway run node scripts/verify-card-shipment-tables.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('card_shipments', 'card_shipment_events')
    ORDER BY table_name
  `;
  console.log(JSON.stringify(rows, null, 2));
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'card_shipments'
    ORDER BY ordinal_position
  `;
  console.log('card_shipments columns:', JSON.stringify(cols, null, 2));
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
