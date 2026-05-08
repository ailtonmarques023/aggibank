-- Estados logísticos adicionais: remessa, pós-entrega e cancelamento.
-- PostgreSQL: novos valores do enum usado pela coluna status de card_shipments.

ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'REMESSA_CRIADA';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_DESBLOQUEIO';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'DESBLOQUEADO';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'CANCELADO';
