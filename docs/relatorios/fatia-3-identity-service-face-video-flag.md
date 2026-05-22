# Fatia 3 — `identityService` + `FEATURE_KYC_REQUIRE_FACE_VIDEO`

**Data:** 2026-05-21  
**ADR:** [adr-kyc-face-video-agilbank.md](./adr-kyc-face-video-agilbank.md)  
**Status:** Concluída (sem commit)

---

## Objetivo

Domínio KYC reconhece `FACE_VIDEO` de forma **controlada por flag**; presign valida MIME/tamanho por `artifactType`. Sem frontend; flag **default off**.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/services/identityService.js` | `getRequiredArtifactTypes()`, `isFaceVideoRequired()`, status/submit dinâmicos, presign com storage por tipo |
| `tests/identityKycRoutes.test.js` | +9 casos Fatia 3 (flag on/off) |
| `.env.example` | `FEATURE_KYC_REQUIRE_FACE_VIDEO=false` |

**Não alterados:** Prisma, frontend, `identityStorageService.js` (Fatia 2 já entregue), `server.js`, financeiro, `/api/auth/register`.

---

## Comportamento

| `FEATURE_KYC_REQUIRE_FACE_VIDEO` | `requiredArtifacts` | Submit |
|----------------------------------|---------------------|--------|
| `false` (default) | 3 tipos imagem | 3/3 → `READY_FOR_REVIEW` |
| `true` | + `FACE_VIDEO` | 4/4 → OK; 3/3 → `IDENTITY_MISSING_ARTIFACTS` |

**Presign (sempre, independente da flag):**

- `FACE_VIDEO` + `video/webm` / `video/mp4` → OK (objectKey `.webm` / `.mp4`)
- `FACE_VIDEO` + `image/jpeg` → `MIME_NOT_ALLOWED`
- Documento/selfie + vídeo → `MIME_NOT_ALLOWED`

Extensão via `identityStorage.extensionSegmentForMime` (fonte única com Fatia 2).

---

## Validações

| Comando | Resultado |
|---------|-----------|
| `npx jest tests/identityKycRoutes.test.js` | **23/23** |
| `npx jest tests/identityStorageService.test.js` | **25/25** |
| `npx jest tests/auth.test.js` | **34/34** (não-regressão) |
| `npx prisma validate` / `generate` | OK |

---

## `git diff --stat` (Fatia 3)

```
 .env.example                    |   2 +
 src/services/identityService.js |  70 ++++++++-------
 tests/identityKycRoutes.test.js | 186 ++++++++++++++++++++++++++++++++++------
 3 files changed, 203 insertions(+), 55 deletions(-)
```

---

## Próximo passo

**Fatia 4** — UI captura facial (`KycVerification`) + `kycService` (constantes vídeo, passo na máquina de estados).
