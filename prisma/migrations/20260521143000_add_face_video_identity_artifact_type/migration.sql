-- ADR-KYC-001 Fatia 1 — adiciona valor FACE_VIDEO ao enum IdentityArtifactType (aditivo).
-- Não altera obrigatoriedade nem fluxo de submit (3 artefatos permanecem até fatias posteriores).

ALTER TYPE "IdentityArtifactType" ADD VALUE IF NOT EXISTS 'FACE_VIDEO';
