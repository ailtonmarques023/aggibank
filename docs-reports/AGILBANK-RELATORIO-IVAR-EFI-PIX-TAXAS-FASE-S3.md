# AGILBANK — Relatório IVAR — Efí Pix — Taxas do Provedor (Fase S.3)

**Data:** 2026-05-11  
**Objetivo:** registrar observabilidade financeira do provedor Efí (grossAmount, providerFeeAmount, netAmount) sem alterar regra de cobrança do usuário, saldo ou settlement.

---

## 1. FLUXO REAL IDENTIFICADO

**UI → Evento → JS → API → Backend → Banco → API → UI**

1. **Webhook Efí** envia `{ pix: [{ endToEndId, txid, valor, horario }] }` para `POST /api/internal/efi/pix/webhook[/pix]`.
2. `pixEfiWebhookService.processEfiPixWebhookBody` valida valor, marca `PixCobranca` como `PAGA`.
3. **Fase S.3 (novo):** ao marcar `PAGA`, o serviço preenche:
   - `grossAmount` = `valor` do webhook (valor bruto confirmado pelo PSP);
   - `providerFeeAmount` = `null` (Efí não fornece taxa no payload Pix);
   - `netAmount` = `null` (consequência de fee null);
   - `providerFeeSource` = `'efi_pix_payload'`;
   - `providerFeeCurrency` = `'BRL'`;
   - `providerFeeCapturedAt` = `paidAt`.
4. `pixSettlementService.settlePaidPixCobrancaInTx` continua sem alteração (usa `cobAmount`, não `grossAmount`).
5. `settlementResult` persistido em `PixWebhookEvent` (Fase S.2) — sem mudança nesta fase.

---

## 2. PROBLEMA ENCONTRADO

- `PixCobranca` não possuía campos para registrar valor bruto pago, taxa PSP e valor líquido.
- Impossível auditar diferença bruto/líquido sem acesso ao extrato financeiro Efí externo.

---

## 3. CAUSA

- Fases anteriores priorizaram o fluxo de negócio (cobrança, webhook, settlement); campos financeiros do provedor foram deixados como **MELHORIA FUTURA** na Fase S.

---

## 4. IMPACTO NO SISTEMA

- **Positivo:** `PixCobranca` passa a registrar `grossAmount` (valor bruto pago, confirmado pelo PSP) desde o webhook.
- **Neutro:** `providerFeeAmount`/`netAmount` ficam `null` até fonte confiável (extrato Efí ou relatório financeiro).
- **Sem impacto financeiro:** nenhum saldo alterado; nenhuma taxa debitada do usuário; settlement não alterado.

---

## 5. AÇÃO DA RAGNA

### Investigação da API Efí

**Payload do webhook Efí (`pix[]`):**
```json
{
  "endToEndId": "E...",
  "txid": "...",
  "valor": "39.90",
  "horario": "2026-05-11T15:00:00.000Z"
}
```
**Campos de taxa disponíveis:** nenhum — API Pix Efí (BACEN SPI) **não retorna taxa de PSP no payload Pix**.

**`GET /v2/cob/:txid` → `pix[]`:** mesmos campos acima — sem tarifa.

**`GET /v2/pix` (lista):** mesmos campos — sem tarifa.

**Conclusão:** taxa Efí é conciliada externamente via extrato/relatório financeiro Efí (não via API Pix). `providerFeeAmount` **não deve ser inventado**.

### Schema adicionado em `PixCobranca` (Prisma)

| Campo | Tipo | Comportamento |
|-------|------|---------------|
| `grossAmount` | `Decimal?` | Preenchido no webhook com `valor` confirmado pelo PSP |
| `providerFeeAmount` | `Decimal?` | `null` até extrato/relatório financeiro Efí |
| `netAmount` | `Decimal?` | `null` enquanto `providerFeeAmount` for `null` |
| `providerFeeCurrency` | `String?` | `'BRL'` quando `grossAmount` é preenchido |
| `providerFeeSource` | `String?` | `'efi_pix_payload'` quando webhook confirma; futuramente `'efi_financial_report'` |
| `providerFeeCapturedAt` | `DateTime?` | `paidAt` quando `grossAmount` é preenchido |

### Migração criada

`prisma/migrations/20260511200000_pix_provider_fee_and_settlement_result/migration.sql`

Inclui campos de S.2 (`pix_webhook_events`) e S.3 (`pix_cobrancas`) em uma única migração cumulativa.

### Regras de não-alteração confirmadas

- `ledgerService`: **não tocado**.
- `pixSettlementService`: **não tocado** (usa `cobAmount` original da cobrança).
- `saldoAtual`/`saldoBloqueado`: **não alterados**.
- `UI`: **não alterada** — taxa não exposta ao usuário final.

---

## 6. AÇÃO DA LARGETHA

- Sem alteração de UI.
- Taxa é custo operacional da plataforma; não exposta ao usuário final nesta fase.
- `GET /api/charges/:id` pode futuramente retornar `grossAmount`/`providerFeeAmount` para uso admin/auditoria — decisão de produto posterior.

---

## 7. AUDITORIA DO IVAR

**Arquivos alterados:**
- `prisma/schema.prisma` (novos campos opcionais em `PixCobranca`)
- `src/services/pixEfiWebhookService.js` (preenchimento de `grossAmount` no webhook)
- `prisma/migrations/20260511200000_pix_provider_fee_and_settlement_result/migration.sql` (migração cumulativa S.2+S.3)

**Contratos públicos preservados:** nenhum endpoint foi alterado.

### Respostas às 10 perguntas obrigatórias

1. **A Efí retorna taxa no payload Pix usado hoje?**  
   **Não.** O payload webhook e `GET /v2/cob` e `GET /v2/pix` retornam apenas `endToEndId`, `txid`, `valor` e `horario`. Sem campo de tarifa/taxa PSP.

2. **A Efí retorna valor líquido no payload Pix usado hoje?**  
   **Não.** Valor líquido não faz parte da API Pix SPI/DICT. Disponível apenas via extrato/relatório financeiro Efí (fora da API Pix).

3. **Onde o sistema guarda o valor bruto pago?**  
   A partir desta fase, em `PixCobranca.grossAmount` (preenchido no webhook com `valor` confirmado pelo PSP). Antes desta fase: apenas em `PixWebhookEvent.amountReceived` (string) e em `PixCobranca.rawProviderPayload` (JSON sanitizado).

4. **A taxa será descontada do usuário?**  
   **Não nesta fase.** Taxa é custo operacional da plataforma AgilBank.

5. **A taxa altera settlement?**  
   **Não.** Settlement usa `cobAmount` (valor original da cobrança cadastrada). `grossAmount` e `providerFeeAmount` são campos de observabilidade/auditoria, sem efeito no fluxo financeiro.

6. **Como auditar a diferença entre bruto e líquido?**  
   Por enquanto, cruzando `PixCobranca.grossAmount` com extrato financeiro Efí externo. Quando `providerFeeAmount` for preenchido (fase futura), `netAmount = grossAmount - providerFeeAmount` completa a auditoria diretamente no banco.

7. **O que fica para conciliação financeira futura?**  
   - Preenchimento de `providerFeeAmount`, `netAmount` via extrato Efí (script de conciliação financeira, `providerFeeSource = 'efi_financial_report'`).
   - Possível endpoint admin/auditoria expondo esses campos.

8. **O schema escolhido prende o AgilBank à Efí?**  
   **Não.** Os campos são genéricos (`grossAmount`, `providerFeeAmount`, `netAmount`, `providerFeeSource`, `providerFeeCurrency`). `providerFeeSource` usa string descritiva, não enum de PSP. Qualquer provider pode preenchê-los.

9. **Como outro provider/BaaS entraria nesse modelo?**  
   O novo adapter preencheria os mesmos campos com os valores retornados pela sua API. Se retornar taxa, `providerFeeAmount` e `netAmount` podem ser preenchidos imediatamente. Se não retornar, seguem `null` como hoje.

10. **Quais riscos operacionais continuam?**  
    - Taxa não capturada automaticamente (exige extrato externo Efí).
    - Sem alerta automático de divergência bruto/líquido.
    - `providerFeeAmount` null pode confundir relatórios se não documentado.

---

## 8. RELATÓRIO GERADO

- `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-TAXAS-FASE-S3.md`
- `docs/reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-TAXAS-FASE-S3.md`

---

## 9. VALIDAÇÃO

| Comando | Resultado |
|---------|-----------|
| `npx prisma validate` | OK (exit 0) |
| `npx prisma generate` | OK (exit 0) |
| `npx jest --no-cache` | **24** suites, **255** testes passando |

---

## 10. STATUS FINAL

**APROVADO COMO PLANO + IMPLEMENTAÇÃO PARCIAL**

- `grossAmount` implementado e persistido no webhook (único valor financeiro disponível na API Efí Pix).
- `providerFeeAmount`/`netAmount` ficam `null` — correto, pois **a Efí não fornece taxa no payload Pix**; inventar taxa seria violação de dados financeiros.
- Schema genérico, não acoplado ao provider Efí.
- Nenhum saldo alterado; nenhuma taxa debitada; settlement não modificado; testes passando.
- **Próxima fase:** script de conciliação financeira que popula `providerFeeAmount`/`netAmount` via extrato Efí.
- **Ressalva operacional:** executar `prisma migrate deploy` em produção antes do deploy do código.

*IVAR — Fase S.3 — Taxas do Provedor Efí Pix — AgilBank*
