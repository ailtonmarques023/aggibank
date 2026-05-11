# AGILBANK — Relatório IVAR — Efí Pix — Persistência settlementResult (Fase S.2)

**Data:** 2026-05-11  
**Objetivo:** persistir explicitamente o `settlementResult` do Pix Efí associado ao mesmo webhook `endToEndId`, eliminando a ressalva de observabilidade da Fase S.

---

## 1. FLUXO REAL IDENTIFICADO

**UI → Evento → JS → API → Backend → Banco → API → UI**

1. **Webhook Efí:** `POST /api/internal/efi/pix/webhook[/pix]`
2. **Auth + classificação:** `requireEfiPixWebhookAuth` e `internalEfiPix.js`
3. **Processamento core:** `pixEfiWebhookService.processEfiPixWebhookBody`
4. **Settlement de negócio:** `pixSettlementService.settlePaidPixCobrancaInTx`
5. **Novo requisito S.2:** após settlement retornar `settlementResult`, persistir esse resultado em `PixWebhookEvent` dentro do mesmo `$transaction`.

---

## 2. PROBLEMA ENCONTRADO

- Na Fase S, **`PixWebhookEvent.processingResult`** podia ser **`PROCESSED`** enquanto o resultado de settlement era observável apenas via resposta HTTP e/ou auditorias.
- Isso dificultava auditoria, suporte e conciliação operacional.

---

## 3. CAUSA

- `pixEfiWebhookService` criava `PixWebhookEvent` com `processingResult` e depois chamava `settlePaidPixCobrancaInTx`, mas **não persistia** o `settlementResult` no banco no evento do webhook.

---

## 4. IMPACTO NO SISTEMA

- **MÉDIO (operacional):** suporte e conciliação exigiam correlação manual entre logs/resposta HTTP e eventos do webhook.
- **Risco de erro humano:** interpretar “PROCESSED” sem ver o resultado do settlement.

---

## 5. AÇÃO DA RAGNA

Mudança mínima e segura (sem alteração financeira / ledger):

1. **Schema (Prisma):** adicionados campos opcionais ao modelo `PixWebhookEvent`:
   - `settlementResult String?`
   - `settlementAt DateTime?`
2. **Persistência no webhook:** em `src/services/pixEfiWebhookService.js`, após `settlePaidPixCobrancaInTx(...)` retornar:
   - foi executado `tx.pixWebhookEvent.update({ id: ev.id, data: { settlementResult, settlementAt } })`
   - a atualização ocorre **dentro** da mesma `$transaction`.

**Garantias:**

- Se `settlePaidPixCobrancaInTx` lançar erro e a transação fizer rollback, o evento parcial **não** é persistido.
- `postCommit` continua após o commit; falhas de notificação não alteram settlementResult.
- Duplicata (idempotência por `idempotencyKey`) continua retornando `DUPLICATE` sem sobrescrever.
- Não altera `saldo`, não altera `ledgerService`, não libera empréstimo/cartão fora do que o settlement já faz.

---

## 6. AÇÃO DA LARGETHA

- Não aplicável (mudança exclusiva de observabilidade backend; UI não depende desses campos internos).

---

## 7. AUDITORIA DO IVAR

**Arquivos alterados (rastreabilidade):**

- `prisma/schema.prisma` (novos campos opcionais em `PixWebhookEvent`)
- `src/services/pixEfiWebhookService.js` (persistência de `settlementResult` no evento)
- `tests/pixEfiWebhookService.test.js` (cobertura de persistência)

**Endpoints/contratos públicos preservados:**

- Webhook interno continua retornando `data.results[].settlementResult` como antes.
- Nenhum endpoint público foi alterado.

**Validação esperada (cov) — coberta por testes unitários:**

1. `SETTLED` persiste `settlementResult=SETTLED` no `PixWebhookEvent` (ver teste “PROCESSED … SETTLED”).
2. `ALREADY_SETTLED` persiste `settlementResult=ALREADY_SETTLED` (ver teste “PROCESSED … ALREADY_SETTLED”).
3. `UNSUPPORTED_ENTITY` persiste `settlementResult=UNSUPPORTED_ENTITY` (teste existente atualizado).
4. `AMOUNT_MISMATCH` não chama `pixWebhookEvent.update` e não marca `PAGA` (teste existente + nova asserção).
5. `ALREADY_PAID` não chama `pixWebhookEvent.update` (teste existente + nova asserção).
6. Duplicata mantém comportamento (não há sobrescrita).

**Observação operacional (necessária em produção):**

- Como adiciona colunas no banco, é necessário executar `prisma migrate deploy`/migração correspondente em produção antes de ativar o código com o banco real.

---

## 8. RELATÓRIO GERADO

- `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-SETTLEMENT-RESULT-FASE-S2.md`

---

## 9. VALIDAÇÃO

- `npx prisma validate`: OK
- `npx prisma generate`: OK
- `npx jest --no-cache`: **24** suites / **255** testes passando

---

## 10. STATUS FINAL

**APROVADO**

**Justificativa:** persistência de `settlementResult` adicionada como observabilidade, sem alterar comportamento financeiro/ledger, sem alterar saldo e com testes cobrindo `SETTLED/ALREADY_SETTLED/UNSUPPORTED_ENTITY` e ausência de persistência em `AMOUNT_MISMATCH/ALREADY_PAID`.  
**Ressalva operacional:** aplicar migração no banco de produção antes do deploy efetivo.

