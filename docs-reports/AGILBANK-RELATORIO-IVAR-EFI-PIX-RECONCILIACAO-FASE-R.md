# AGILBANK — Relatório IVAR — Conciliação / recovery Pix Efí — Fase R

**Data:** 2026-05-11  
**Objetivo:** recuperar pagamento Pix já liquidado na **Efí** quando o webhook do AgilBank falhou (ex.: 403 na URL), **sem** emitir nova cobrança e **sem** marcar `PAGA` sem confirmação do PSP.

**Cópia versionada no git:** `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-RECONCILIACAO-FASE-R.md`

---

## 1. Fluxo real identificado

1. Operador identifica `PixCobranca` ainda **ATIVA**/**CRIADA** com `txid` conhecido (pagamento já feito no mundo real).  
2. Script `scripts/efi-reconcile-received-pix.js` (via `railway run` + env Efi) chama **GET /v2/cob/:txid** (`efiPixClient.getCobByTxid`).  
3. Se a resposta não trouxer `pix[]` compatível, fallback **GET /v2/pix?inicio&fim[&txid]** (`listPixReceived`).  
4. Validação: `endToEndId`, `valor` (centavos alinhados à `PixCobranca.amount`), `txid` quando presente no item.  
5. **Modo `--dry-run`:** apenas JSON com `wouldProcess` / `PENDENTE` — **nenhuma** escrita.  
6. **Modo `--apply`:** monta corpo `{ pix: [{ txid, endToEndId, valor, horario }] }` e chama **`processEfiPixWebhookBody`** — mesma máquina de idempotência (`PixWebhookEvent`), **PAGA**, settlement Fase P, notificações, `AuditLog` de webhook.  
7. Após sucesso (`PROCESSED` / `DUPLICATE` / `ALREADY_PAID`), `AuditLog` adicional `efi.pix.reconcile.apply` (metadados sem segredos).

**Contrato:** rotina **interna/operacional** — **sem** rota HTTP pública para o usuário final (`contrato-api-agilbank`).

---

## 2. Problema encontrado

Webhook com falha histórica deixou **Efí com Pix pago** e **AgilBank com `PixCobranca` ainda ativa**, sem `PixWebhookEvent` / settlement. Era necessário um caminho de **conciliação** que use só a API Efi como fonte de verdade, sem nova tarifa de emissão.

---

## 3. Causa

Dependência exclusiva do webhook síncrono; indisponibilidade ou **403** na URL impede o processamento local mesmo com pagamento confirmado no PSP.

---

## 4. Impacto no sistema

- **Positivo:** recuperação controlada; reutilização de `processEfiPixWebhookBody` + settlement; idempotência herdada (`efi:e2e:<endToEndId>`).  
- **Risco mitigado:** não há `PUT /v2/cob` no script; sem confirmação Efi não há `PAGA`; valor divergente cai em `AMOUNT_MISMATCH` no processador existente.  
- **Operação:** exige escopos **cob.read** e **pix.read** na credencial Efi (além dos já usados para emissão).

---

## 5. Ação da RAGNA

| Entrega | Descrição |
| --- | --- |
| `src/services/efiPixClient.js` | `getCobByTxid`, `listPixReceived` |
| `src/utils/efiReconcilePix.js` | Seleção de item `pix` + `toWebhookPixItem` |
| `scripts/efi-reconcile-received-pix.js` | `--dry-run` (padrão), `--apply`, `--txid=`, `--days=`, `--limit=` |
| `package.json` | `npm run efi:r:reconcile` |
| `env.example` | Comentário Fase R + escopos |
| `tests/efiReconcilePix.test.js` | Testes unitários dos helpers |

---

## 6. Ação da LARGETHA

Nenhuma UI nova; fluxos existentes de cobranças/extrato passam a refletir recuperação após `--apply` bem-sucedido.

---

## 7. Auditoria do IVAR

| Critério | Evidência |
| --- | --- |
| Sem nova cobrança | Script só usa GET; emissão continua só em `createImmediateCob` (PUT). |
| Fonte de verdade Efi | Dados de pagamento apenas de GET cob / GET pix. |
| Sem PAGA sem Efi | Só chama `processEfiPixWebhookBody` com item validado. |
| Idempotência | `PixWebhookEvent` + resultados `DUPLICATE` / `ALREADY_PAID` tratados. |
| Segredos | Script não imprime certificado, `pixCopiaECola`, token ou JWT; saída agregada (`efiSummary` sem BR Code). |
| Rota pública | Não criada. |

---

## 8. Relatório gerado

- `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-RECONCILIACAO-FASE-R.md`

---

## 9. Validação

| Passo | Resultado |
| --- | --- |
| `npx prisma validate` | OK |
| `npx prisma generate` | OK |
| `npx jest` | OK (suite completa) |
| `npm run efi:r:reconcile -- --dry-run` em produção | **Não executado nesta sessão** (credenciais Efi/Railway no ambiente do operador). **Recomendado:** primeiro `railway run npm run efi:r:reconcile -- --dry-run --txid=...`. |

---

## 10. Status final

**APROVADO (implementação e contrato interno)** — código entrega conciliação sem nova cobrança, com dry-run/apply, reaproveitamento do webhook processor + settlement, testes dos helpers e suíte Jest verde.

**PENDENTE (operação real)** — evidência de recuperação de um **txid** real na Efi + `--apply` com `PROCESSED` deve ser obtida pelo operador em `railway run` (não reproduzida aqui).

**Não REPROVADO** — não há criação de cobrança nova, update manual em banco nem processamento sem payload derivado da Efi.
