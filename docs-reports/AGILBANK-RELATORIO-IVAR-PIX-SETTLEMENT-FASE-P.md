# AGILBANK — Relatório IVAR — Fase P — Settlement após Pix Efí (PixCobranca PAGA)

**Data:** 2026-05-11  
**Escopo:** implementação backend de settlement idempotente vinculado a `linkedEntityType` / `linkedEntityId`; integração pós-`PAGA` no fluxo do webhook Efí; notificações in-app; auditoria. Sem `migrate deploy` em produção, sem Pix real, sem UI nova.

**Cópia versionada no git:** `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-FASE-P.md`  
**Espelho local:** `docs/reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-FASE-P.md`

---

## 1. Fluxo real identificado

1. PSP Efí envia `POST` com corpo contendo `pix[]` (txid, endToEndId, valor, horário).  
2. `pixProviderService` / `pixEfiWebhookService.processEfiPixWebhookBody` valida idempotência (`PixWebhookEvent`), confere valor com `PixCobranca`, atualiza `PixCobranca` para **PAGA** na mesma transação Prisma.  
3. **`settlePaidPixCobrancaInTx`** (`src/services/pixSettlementService.js`) executa na mesma transação: carrega regra por `linkedEntityType` (`loan_insurance`, `card_shipment`, `boleto`), valida estado e valores, aplica efeito de negócio, grava `AuditLog`.  
4. Após commit, **`postCommit`** dispara notificações in-app (sem bloquear consistência do ledger; falha de notificação é auditável).  
5. Cliente autenticado continua vendo estado atualizado via APIs existentes (`GET /api/charges`, empréstimos, cartões, boletos) — sem novo botão de settlement.

---

## 2. Problema encontrado

Antes da Fase P, o webhook marcava apenas `PixCobranca` como **PAGA**, sem baixa automática de `LoanInsuranceCharge`, sem avanço de `CardShipment`/`CardShipmentEvent` e sem quitação de `Boleto`, gerando divergência entre “Pix pago” e “negócio quitado”.

---

## 3. Causa

Separação intencional nas fases O/N entre confirmação de pagamento Pix e efeitos contábeis/operacionais; faltava orquestrador de settlement com idempotência e uso exclusivo do ledger para movimentação de saldo.

---

## 4. Impacto no sistema

- **Positivo:** alinhamento entre confirmação Pix e estados de negócio (seguro, frete, boleto); liberação de principal via `registrarCreditoLiberadoDeBloqueado` sem débito de taxa em `saldoAtual` quando o seguro foi pago por Pix externo.  
- **Risco mitigado:** `LedgerError` na liberação de seguro **repropaga** → rollback da transação do webhook (incluindo volta de `PixCobranca` para estado anterior ao commit), permitindo retry seguro do PSP.  
- **Contrato HTTP:** resposta de processamento interna do webhook pode incluir `settlementResult` por item (`SETTLED`, `ALREADY_SETTLED`, `UNSUPPORTED_ENTITY`, `INVALID_STATE`, `AMOUNT_MISMATCH`, etc.); rotas públicas documentadas não foram quebradas.

---

## 5. Ação da RAGNA

- Novo serviço `src/services/pixSettlementService.js` com `settlePaidPixCobrancaInTx`.  
- Handlers: **loan_insurance** (marca charge paga, atualiza `Emprestimo`, libera principal com idempotência `loan_insurance_release_pix:<pixCobrancaId>`), **card_shipment** e **boleto** + frete vinculado (`CARD_SHIPMENT` em `Boleto.solicitacaoTipo`) sem `registrarDebitoSaldoAtual` para taxa/frete.  
- Integração em `src/services/pixEfiWebhookService.js` após `efi.pix.webhook.paid`.  
- Ajustes em `src/services/inAppNotificationService.js` (mensagens Pix externo; `notifyCardShipmentFreightPixSettled`).  
- Testes: `tests/pixSettlementService.test.js`; ajuste `tests/pixEfiWebhookService.test.js` (mock de settlement + `beforeEach` por `clearAllMocks` global).  
- `tests/setup.js`: `updateMany` em mocks de `boleto` e `cardShipment`.

---

## 6. Ação da LARGETHA

Não houve refatoração de UI. O estado exibido passa a refletir persistência backend após webhook + settlement (cobranças, empréstimos, remessas, boletos), desde que as telas já consumam as APIs de listagem/detalhe existentes.

---

## 7. Auditoria do IVAR

| Critério | Evidência |
| --- | --- |
| Settlement só com `PixCobranca` **PAGA** | `settlePaidPixCobrancaInTx` valida `status === 'PAGA'` antes de ramificar. |
| Idempotência seguro | Chave `loan_insurance_release_pix:<pixCobrancaId>` + `movimentacao.findUnique`; evento webhook continua idempotente por `endToEndId`. |
| Sem débito indevido em `saldoAtual` | Frete/seguro Pix externo: sem `registrarDebitoSaldoAtual`; seguro: só liberação bloqueado → disponível. |
| Frete | `shippingFeeMovementId: null`, `FRETE_COBRADO` com descrição explícita de Pix externo. |
| Boleto + frete | Após marcar `Boleto` pago, chama o mesmo fluxo de frete sem segundo débito ledger. |
| Tipo desconhecido | `UNSUPPORTED_ENTITY` + `pix.settlement.unsupported_entity` em `AuditLog`. |
| Segredos em log | Não há log de BR Code completo, JWT ou certificado no settlement. |

---

## 8. Relatório gerado

- `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-FASE-P.md`  
- `docs/reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-FASE-P.md`

---

## 9. Validação

| Passo | Resultado |
| --- | --- |
| `npx prisma validate` | OK |
| `npx prisma generate` | OK |
| `npx jest` | OK (suite completa) |

Cobertura direta dos cenários P nos testes unitários de `pixSettlementService` (incl. mismatch, idempotência por movimentação, boleto + `CARD_SHIPMENT`, propagação de `LedgerError`).

---

## 10. Status final

**APROVADO** — settlement idempotente e rastreável; saldo de principal alterado apenas via ledger; ausência de débito de taxa/frete em `saldoAtual` para Pix externo; webhook integrado com `settlementResult` opcional e `postCommit` para notificações.

**Pendências opcionais:** teste de integração com banco real para `LedgerError` raro pós-quitação; smoke autenticado em `GET /api/charges/:id` após webhook em staging.
