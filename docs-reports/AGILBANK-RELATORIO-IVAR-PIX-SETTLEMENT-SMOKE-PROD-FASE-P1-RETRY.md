# AGILBANK — Relatório IVAR — Smoke real settlement Pix Efí — Fase P.1-Retry

**Data:** 2026-05-11  
**Escopo:** repetir smoke operacional após correção/cadastro do webhook (`/webhook/pix?ignorar=&efiwk=...`). Objetivo: cobrança Pix real → pagamento → webhook → settlement; validação por **leituras** no Postgres do Railway.

**Restrições cumpridas pelo agente:** nenhum `UPDATE`/`DELETE` manual; nenhum reenvio de webhook; nenhuma marcação manual de `PAGA`; nenhum segredo, token ou BR Code reproduzido neste relatório.

**Cópia versionada no git:** `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-SMOKE-PROD-FASE-P1-RETRY.md`

---

## 1. Fluxo real identificado

**Planejado (titular + Efí + AgilBank):**

1. `GET /api/charges` (JWT) → escolher cobrança pendente.  
2. `POST /api/charges/:id/pix` (JWT) → emissão Efi, `PixCobranca` **ATIVA**/CRIADA, `txid`, `provider` EFI.  
3. Pagamento Pix no app do banco do pagador (fora do AgilBank).  
4. Efí → `POST` webhook AgilBank → transação: `PixCobranca` **PAGA**, `PixWebhookEvent` **PROCESSED**, `settlePaidPixCobrancaInTx`, `AuditLog` `pix.settlement.*`, `Notificacao` (dedupe), negócio atualizado.

**Executado pelo agente (automatizável sem credencial do titular):**

- `curl` anônimo em `GET https://aggibank-production.up.railway.app/api/charges` → **401** (rota protegida; passos 1–2 exigem JWT do usuário real).  
- `railway run node tmp/p1-retry-readonly-verify.js` (script **efêmero**, removido após uso) contra `DATABASE_URL` do serviço **aggibank** / **production**: última `PixCobranca` com `status = 'PAGA'`, cadeia webhook/settlement/notificação.

---

## 2. Problema encontrado

Ainda **não há** `PixCobranca` com `status = 'PAGA'` no banco lido pelo Railway nesta execução. Assim, **não foi possível** validar webhook recebido, `paidAt`/`endToEndId`, `PixWebhookEvent` **PROCESSED**, `AuditLog` de settlement, efeito de negócio nem `Notificacao` para uma cobrança nova paga **após** o retry.

Os passos 1–5 **não foram executados** nesta sessão (ausência de JWT de titular de teste e de ação de pagamento Pix pelo agente).

---

## 3. Causa

- **Dado:** nenhum pagamento concluído persistido como **PAGA** no `DATABASE_URL` consultado no instante do smoke **ou** pagamento ainda não refletido (latência Efí/webhook) **ou** cobrança emitida noutro ambiente/banco.  
- **Processo:** o agente não pode substituir o titular no app do banco nem invocar `POST /api/charges/:id/pix` sem Bearer.

---

## 4. Impacto no sistema

Nenhuma alteração aplicada ao banco ou à aplicação. O smoke read-only **não reprova** a correção do webhook em si; apenas constata **falta de evidência** de ponta a ponta neste momento.

---

## 5. Ação da RAGNA

- Verificação read-only automatizada (Prisma) via `railway run`.  
- Saída JSON resumida:

```json
{
  "ok": false,
  "generatedAt": "2026-05-11T17:34:09.203Z",
  "checks": {
    "lastPaidPixCobranca": null,
    "verdictHint": "PENDENTE_SEM_PIX_PAGA",
    "message": "Nenhuma PixCobranca PAGA no banco — aguardar pagamento + webhook ou confirmar DATABASE_URL."
  }
}
```

- Evidência de contrato: `GET /api/charges` sem autenticação retorna **401** (comportamento esperado).

---

## 6. Ação da LARGETHA

Não aplicável nesta rodada (sem confirmação de Pix paga para confrontar UI com API).

---

## 7. Auditoria do IVAR

| Critério P.1-Retry | Evidência nesta execução |
| --- | --- |
| 1. GET charges + escolha pendente | **Não executado** (401 sem JWT). |
| 2. POST charges/:id/pix | **Não executado**. |
| 3. PixCobranca ATIVA + txid + EFI | **Não verificado** no agente (requer 1–2). |
| 4. Usuário paga Pix | **Fora do escopo do agente**. |
| 5. Webhook aguardado | **Sem `PAGA` no banco** → não comprovado recebimento. |
| 6. Read-only: PAGA, paidAt, e2e, evento, audit settlement, negócio, notificação, duplicidade | **Não aplicável** — ausência de linha **PAGA**. |

**Observação:** `settlementResult: 'SETTLED'` é retorno de processamento HTTP, não coluna SQL; evidência de settlement continua sendo `audit_logs` + estado das entidades vinculadas.

---

## 8. Relatório gerado

- `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-SETTLEMENT-SMOKE-PROD-FASE-P1-RETRY.md`

---

## 9. Validação

| Passo | Resultado |
| --- | --- |
| `railway run` + consulta última `PixCobranca` **PAGA** | **0 registros** |
| `curl` `GET .../api/charges` | **401** |
| Script temporário em `tmp/` | Removido após execução (não versionado como produto) |

---

## 10. Status final

**PENDENTE** — alinhado ao critério explícito: *“PENDENTE se a Efí ainda não chamar webhook”* e, de forma equivalente, **se ainda não existir `PixCobranca` PAGA** no banco após emissão/pagamento. Nesta execução **não** há amostra **PAGA**; **não** se aplica **APROVADO OPERACIONALMENTE PARCIAL** nem **REPROVADO** por falha de settlement (o fluxo pós-pagamento **não pôde ser observado**).

**Checklist para o titular (fora deste relatório):** concluir passos 1–4 com valor controlado; aguardar alguns minutos; rerodar apenas a parte read-only (`railway run` + mesmas consultas) ou repetir o script de verificação equivalente — até aparecer **PAGA** e cadeia completa.
