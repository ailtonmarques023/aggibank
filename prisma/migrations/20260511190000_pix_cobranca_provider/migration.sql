-- Fase Q: PSP emissor da cobrança Pix (substituível; default EFI para linhas existentes).
ALTER TABLE "pix_cobrancas" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'EFI';
