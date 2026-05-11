# AGILBANK — Relatório IVAR — Smoke operacional — Settlement Pix Efí — Fase P.1 (final pós-conciliação)

**Data da verificação final:** 2026-05-11  
**Modo:** somente leitura (`findUnique` / `findMany` / `count`). Nenhum `UPDATE`/`DELETE`, nenhuma nova cobrança, nenhum reenvio de webhook, nenhuma alteração manual de banco.

**Ambiente:** Railway — projeto `grand-appreciation`, serviço `aggibank`, ambiente `production` (`railway run` com `DATABASE_URL` do serviço).

**Contexto:** execuções anteriores deste smoke (mesmo arquivo) resultaram **REPROVADO** / **PENDENTE** por ausência de `PixCobranca` **PAGA**. Após **Fase R** (conciliação Efi aplicada), esta rodada valida um **`txid`** específico.

**`txid` validado:** `mOjeTK3Ba2OEQnuKRmBSa4pjkZ5s`

**Nota — `settlementResult`:** não há coluna em `pix_webhook_events`; settlement confirmado via **`audit_logs`** (`pix.settlement.*`).

**Cópia versionada no git:** `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-SMOKE-PROD-FASE-P1.md`

---

## 1. Fluxo real identificado

1. `railway run node tmp/p1-final-readonly-by-txid.js` (script efêmero; não versionado como produto).  
2. Leitura em cadeia: `PixCobranca` por `txid` → `PixWebhookEvent` → `AuditLog` (settlement) → `LoanInsuranceCharge` → `Emprestimo` → `Movimentacao` (`idempotencyKey` de liberação Pix) → `User` (saldos) → `Notificacao` (dedupe) → contagens de duplicidade.

---

## 2. Problema encontrado

Nenhum bloqueio nesta verificação: o `txid` informado existe, está **PAGA** e a cadeia seguro + ledger + notificação aparece consistente nas leituras.

---

## 3. Causa

N/A para falha — verificação pós-conciliação bem-sucedida no ambiente consultado.

---

## 4. Impacto no sistema

Nenhuma mutação realizada nesta sessão. Confirma-se que o negócio (seguro + liberação) e a rastreabilidade (`PixWebhookEvent`, `AuditLog`, `Movimentacao`, `Notificacao`) estão alinhados ao Pix **PAGA** para o `txid` analisado.

---

## 5. Ação da RAGNA

- Script read-only por `txid` (execução única via `tmp/`, removível).  
- Evidências consolidadas na tabela do §7.

---

## 6. Ação da LARGETHA

Não aplicável nesta verificação (somente leitura). Telas que consomem `GET /api/charges` / empréstimos / extrato devem refletir os mesmos estados persistidos.

---

## 7. Auditoria do IVAR — checklist para `mOjeTK3Ba2OEQnuKRmBSa4pjkZ5s`

| # | Critério | Resultado | Evidência (read-only) |
| --- | --- | --- | --- |
| 1 | `PixCobranca` **PAGA** | **OK** | `status: PAGA`, `paidAt` preenchido, `endToEndId` preenchido, `provider: EFI`, `linkedEntityType: loan_insurance`, id `cmp1f8mve0005qt0pdsdhd18e` |
| 2 | `PixWebhookEvent` **PROCESSED** | **OK** | Evento `cmp1iobtg0001i940yob77lto`, `processingResult: PROCESSED` |
| 3 | `AuditLog` settlement | **OK** | `pix.settlement.loan_insurance`, id `cmp1iod4w0007i9403r7ims4e` |
| 4 | `LoanInsuranceCharge` pago | **OK** | `cmoymt1m5000nn00pnz2c1cfx`, `status: pago` |
| 5 | `Emprestimo` liberado / `fundsStatus` | **OK** | `fundsStatus: disponivel`, `insuranceChargeStatus: pago` |
| 6 | `saldoBloqueado` (usuário) diminuiu | **OK (snapshot)** | `User.saldoBloqueado: 0` — coerente com liberação do principal após seguro |
| 7 | `saldoAtual` aumentou via ledger | **OK (indireto)** | `User.saldoAtual: 20000` + `Movimentacao` de crédito `20000` (`emprestimo_desbloqueio`); *delta temporal absoluto não calculável sem estado anterior, mas linha de ledger comprova crédito.* |
| 8 | `Movimentacao` de liberação | **OK** | `idempotencyKey` `loan_insurance_release_pix:cmp1f8mve0005qt0pdsdhd18e`, `categoria: emprestimo_desbloqueio`, `valor: 20000`, id `cmp1iocyc0005i940lfsh1t0v` |
| 9 | `Notificacao` | **OK** | Dedupe `loan_insurance_settled:<loanId>`, tipo `loan_insurance_settled`, id `cmp1iodcw0009i940tshkhahj` |
| 10 | Sem duplicidade | **OK** | `PixWebhookEvent` com mesmo `endToEndId`: **count = 1**; `Movimentacao` com mesma `idempotencyKey` de release: **count = 1** |

**JSON resumido da execução (sem segredos, sem BR Code):**

```json
{
  "txid": "mOjeTK3Ba2OEQnuKRmBSa4pjkZ5s",
  "ok": true,
  "checks": {
    "item1_pixPaga": true,
    "item2_processed": true,
    "item3_settlementAudit": true,
    "item4_chargePago": true,
    "item5_fundsLiberado": true,
    "item8_movLiberacao": true,
    "item9_notificacao": true,
    "item10_webhookCountByE2e": 1,
    "item10_movCountByReleaseKey": 1,
    "resumoAprovacaoParcial": true
  }
}
```

---

## 8. Relatório gerado

- `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-SMOKE-PROD-FASE-P1.md` (este arquivo, atualizado)

---

## 9. Validação

| Passo | Resultado |
| --- | --- |
| `railway run node tmp/p1-final-readonly-by-txid.js` | OK — JSON acima |
| Conectividade Prisma / Postgres | OK |

---

## 10. Status final

**APROVADO OPERACIONALMENTE PARCIAL** — settlement de **seguro** (`loan_insurance`) **confirmado** para o `txid` `mOjeTK3Ba2OEQnuKRmBSa4pjkZ5s`: **PAGA**, webhook **PROCESSED**, audit de settlement, charge **pago**, empréstimo **disponivel** / seguro **pago**, movimentação de liberação idempotente, notificação presente, **sem duplicidade** de webhook nem de movimentação por chave de release.

**Observação:** itens 6–7 são atestados por **snapshot + linha de ledger**; auditoria completa de delta histórico exigiria estado anterior armazenado (fora do escopo desta leitura única).
