# AGILBANK — Relatório IVAR — Fase Q Abstração de provedor Pix e taxas

**Data:** 2026-05-12  
**Escopo:** Camada substituível de PSP para Pix em `charges` + persistência de `provider` em `PixCobranca`; sem novo settlement, sem alteração de saldo, sem nova cobrança real de teste.

**Cópia:** `docs/reports/AGILBANK-RELATORIO-IVAR-PIX-PROVIDER-ABSTRACTION-FASE-Q.md` (pasta `docs/` pode estar no `.gitignore`; esta cópia em `docs-reports/` é versionável).

---

## 1. Fluxo real identificado

`UI → POST /api/charges/:id/pix` → `charges.js` → `pixProviderService` → `pixProviderRegistry` → `efiPixProvider` → `pixCobrancaEfiService` + `efiPixClient` → Prisma `PixCobranca` (com `provider = EFI`).

`Efí → POST /api/internal/efi/pix/webhook` → `internalEfiPix.js` → `pixProviderService.processChargeWebhookBody` → `efiPixProvider.processWebhookBody` → `pixEfiWebhookService.processEfiPixWebhookBody` → Prisma (eventos / atualização de cobrança conforme Fase O).

`GET /api/charges/:id` → mesma leitura de `PixCobranca` com campo opcional `pixProvider` na resposta.

---

## 2. Problema encontrado

O domínio e as rotas públicas acoplavam a decisão “usar Efí” a `efiPixClient.isEfiPixConfigured()` e `pixCobrancaEfiService` diretamente, dificultando troca de PSP/BaaS e misturando marca “Efí” em texto de instrução e UI.

Não havia coluna explícita de **provedor** na tabela de cobrança Pix para auditoria ou roteamento futuro.

---

## 3. Causa

Evolução incremental (Fase N/O) sem camada de **estratégia/registry**; Efí como único emissor real mas codificado como caminho único nas rotas HTTP.

---

## 4. Impacto

**Positivo:** rotas `charges` e webhook interno passam por fachada/registry; novo PSP pode ser adicionado com novo adaptador sem reescrever `charges.js` inteiro.

**Contrato:** `POST /api/charges/:id/pix` ganha campo opcional **`provider`** (ex.: `EFI`) além de **`source: 'efi'`** (mantido). `GET /api/charges/:id` inclui **`pixProvider`** quando há linha `PixCobranca`.

**Banco:** migration adiciona `pix_cobrancas.provider` default `EFI` (linhas existentes preenchidas pelo default).

**Taxas:** não foram adicionadas colunas `grossAmount` / `providerFeeAmount` / `netAmount` — a Efí não fornece taxa confiável na criação de cob analisada; evitar valores inventados. Documentado para **fase futura** quando o PSP expuser valores auditáveis.

---

## 5. Ação da RAGNA

| Área | Entrega |
| --- | --- |
| Fachada | `src/services/pix/pixProviderService.js` — `isPixChargeProviderConfigured`, `createOrGetPixChargeForCharge`, `processChargeWebhookBody` |
| Registry | `src/services/pix/pixProviderRegistry.js` — `PIX_CHARGE_PROVIDER` / `PIX_PROVIDER` (default EFI) |
| Tipos | `src/services/pix/pixProviderTypes.js` — `PIX_PROVIDER_ID.EFI` |
| Adaptador | `src/services/pix/providers/efiPixProvider.js` — delega a `pixCobrancaEfiService` e `pixEfiWebhookService` |
| Rotas | `charges.js` usa `pixProviderService`; `internalEfiPix.js` usa `processChargeWebhookBody` |
| Persistência | `PixCobranca.provider` + migration `20260511190000_pix_cobranca_provider` |
| Serviço Efi | `pixCobrancaEfiService` grava `provider: EFI`, resposta pública com `provider` + instruções genéricas (sem marca no texto) |

---

## 6. Ação da LARGETHA

- `agilbank-frontend/public/banco/index.html`: rótulo **“Pix:”** (sem “Efí” fixo); texto “Pago” usa sufixo opcional a partir de `pixProvider` / `provider` / fallback `source === 'efi'` → rótulo `EFI`.

---

## 7. Auditoria do IVAR

| Pergunta obrigatória | Resposta |
| --- | --- |
| 1. Onde o código dependia diretamente da Efí? | `charges.js` (`efiPixClient` + `pixCobrancaEfiService`); `internalEfiPix` (`pixEfiWebhookService`); serviços `efiPixClient`, `pixCobrancaEfiService`, `pixEfiWebhookService` (mantidos como implementação). |
| 2. O que virou interface genérica? | Ponto de entrada: `pixProviderService` + registry + `efiPixProvider` (substituível). |
| 3. `PixCobranca` já era genérica? | Campos `txid`, `providerReference`, `endToEndId`, `rawProviderPayload` já eram genéricos; faltava **`provider`** explícito — **adicionado**. |
| 4. Como registrar `provider = EFI`? | Default no schema + `create` em `pixCobrancaEfiService` com `PIX_PROVIDER_ID.EFI`. |
| 5. Como registrar taxa do provedor no futuro? | Colunas opcionais sugeridas quando o PSP retornar valores auditáveis (`grossAmount`, `providerFeeAmount`, `netAmount`) + preenchimento só a partir da API; **não** nesta fase. |
| 6. Como evitar settlement dependente da Efí? | Settlement não foi alterado; webhook continua em serviço de domínio; fachada permite trocar **parser** por PSP sem acoplar nome “Efí” em regras de seguro/frete. |
| 7. O que mudar para outro PSP? | Novo arquivo em `providers/`, entrada em `pixProviderRegistry`, variável `PIX_CHARGE_PROVIDER`, implementar `createOrGetPixCharge` + `processWebhookBody` (ou normalizador de evento). |
| 8. O que fica fora desta fase? | Cálculo/desconto de taxa no saldo; novo PSP concreto; normalização completa de payload webhook multi-formato; `migrate deploy` em produção sem autorização explícita. |
| 9. Quais testes garantem contrato? | `tests/charges.test.js`, `tests/internalEfiPixWebhook.test.js`, `tests/pixCobrancaEfiService.test.js`, `tests/pixEfiWebhookService.test.js`, `tests/pixProviderService.test.js`, `tests/efiPixClient.test.js` + suíte `npx jest` completa. |
| 10. A fase alterou saldo ou regra financeira? | **Não.** |

---

## 8. Relatório gerado

- `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-PROVIDER-ABSTRACTION-FASE-Q.md` (este arquivo)
- Espelho de trabalho: `docs/reports/AGILBANK-RELATORIO-IVAR-PIX-PROVIDER-ABSTRACTION-FASE-Q.md`

---

## 9. Validação

| Comando | Resultado |
| --- | --- |
| `npx prisma validate` | OK |
| `npx prisma generate` | OK |
| `npx jest` (suíte completa) | OK |

**Migration:** `prisma/migrations/20260511190000_pix_cobranca_provider/migration.sql` — **não** executado `migrate deploy` em produção nesta sessão.

---

## 10. Status final

**APROVADO** — arquitetura mais genérica com Efí como adaptador **substituível**; contratos `POST/GET` charges preservados com extensões não quebradoras (`provider`, `pixProvider`).

**Pendência:** aplicar migration no ambiente alvo (`prisma migrate deploy`) quando autorizado.
