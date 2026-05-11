# AGILBANK — Relatório IVAR — Efí Pix — Conciliação financeira (Fase S.4)

**Data:** 2026-05-11  
**Objetivo:** preencher `providerFeeAmount` e `netAmount` em `PixCobranca` com **fonte confiável da Efí**, sem alterar saldo do usuário, settlement ou ledger.

---

## 1. FLUXO REAL IDENTIFICADO

**UI → Evento → JS → API → Backend → Banco → API → UI**

1. **Webhook Pix (S.3):** `grossAmount` preenchido com `valor` do PSP; `providerFeeAmount`/`netAmount` em geral `null` (API Pix `/v2/cob` / `/v2/pix` não traz taxa).
2. **Webhook com configuração Efí (opcional):** se a conta tiver `PUT /v2/gn/config` com `notificacao.tarifa`, a Efí pode enviar `gnExtras.tarifa` no item do webhook → **persistência imediata** de taxa/líquido em `pixEfiWebhookService` com `providerFeeSource = efi_pix_webhook_gn_extras`.
3. **Conciliação retroativa / extrato (S.4):** script operacional `scripts/efi-reconcile-provider-fees.js`:
   - chama `POST /v2/gn/relatorios/extrato-conciliacao` com `dataMovimento` (dia de movimento, fuso **America/Sao_Paulo** derivado de `paidAt`);
   - aguarda e baixa CSV via `GET /v2/gn/relatorios/:id` (`efiPixClient.downloadRelatorioById`);
   - cruza linhas **PR** (Pix recebido) e **TPR** (Tarifa Pix recebido) conforme layout **v4.0** do PDF oficial da Efí;
   - em `--apply`, atualiza apenas `providerFeeAmount`, `netAmount`, `providerFeeCurrency`, `providerFeeSource`, `providerFeeCapturedAt` (`providerFeeSource = efi_financial_report`).

**Contratos públicos:** nenhuma rota nova; operação interna via script.

---

## 2. PROBLEMA ENCONTRADO

- Após S.3, `grossAmount` existe, mas **taxa PSP** e **líquido** permanecem `null` na maioria dos casos (API Pix não retorna tarifa).
- Operação financeira da plataforma (ex.: R$ 0,43 sobre R$ 39,90) não ficava auditável no banco sem extrato ou `gnExtras`.

---

## 3. CAUSA

- Tarifa é informada pela Efí em canais **fora** do payload mínimo do webhook Pix padrão: **extrato de conciliação** (`/v2/gn/relatorios/*`) e/ou **gnExtras** no webhook quando habilitado na conta.

---

## 4. IMPACTO NO SISTEMA

- **Positivo:** conciliação **auditável** (bruto + tarifa + líquido) quando o CSV ou `gnExtras` estiver disponível.
- **Neutro:** nenhum impacto em `saldoAtual` / `saldoBloqueado` / settlement / ledger.
- **Operacional:** exige escopos `gn.reports.write` e `gn.reports.read` na aplicação Efí e **produção** habilitada (`EFI_PIX_ENABLE_PRODUCTION=true`); sandbox não é suportado para extrato nesta rotina.

---

## 5. AÇÃO DA RAGNA

### Investigação — fonte confiável Efí

| Fonte | Conteúdo | Uso no AgilBank |
|--------|-----------|-----------------|
| **Extrato de conciliação** | `POST /v2/gn/relatorios/extrato-conciliacao` + `GET /v2/gn/relatorios/:id` → CSV v4.0 | Parser `src/utils/efiExtratoConciliacaoCsv.js` — linhas **PR** (`Pix recebido`) e **TPR** (`Tarifa Pix recebido`) conforme PDF *Extrato_conciliacao_API_Pix_v4.0* |
| **gnExtras no webhook** | `gnExtras.tarifa` quando habilitado em `/v2/gn/config` | `pixEfiWebhookService` preenche fee + net quando presente |

### Implementação

- `src/services/efiPixClient.js`: `postExtratoConciliacao`, `downloadRelatorioById` (polling 202 → CSV).
- `src/utils/efiExtratoConciliacaoCsv.js`: `matchPrAndTprForCob`, `extractGrossFeeNetFromMatch`.
- `scripts/efi-reconcile-provider-fees.js`: `--dry-run` padrão; `--apply` explícito; `--date=`, `--txid=`, `--limit=`; não imprime segredos; mascaramento de `txid` em log JSON.
- `src/services/pixEfiWebhookService.js`: leitura opcional de `gnExtras.tarifa`.
- `package.json`: script `efi:s4:reconcile-fees`.
- `env.example`: instruções S.4.

### Regras de segurança

- **Não inventar** taxa: sem linha **TPR** para o **mesmo `endToEndId`** do **PR** casado → `NO_FEE_ROW` (sem `apply`).
- **Match ambíguo** (`AMBIGUOUS_PR` / `AMBIGUOUS_TPR`) → **não aplica** (`AMBIGUOUS_MATCH`).
- **Validação de bruto:** valor na linha **PR** deve bater com `grossAmount` ou `amount` da cobrança (centavos); senão `GROSS_MISMATCH` → não aplica.

---

## 6. AÇÃO DA LARGETHA

- Sem alteração de UI; taxa continua custo operacional da plataforma, não exibida ao usuário final nesta fase.

---

## 7. AUDITORIA DO IVAR

**Arquivos alterados / criados**

- `src/services/efiPixClient.js`
- `src/utils/efiExtratoConciliacaoCsv.js` (novo)
- `scripts/efi-reconcile-provider-fees.js` (novo)
- `src/services/pixEfiWebhookService.js`
- `tests/efiExtratoConciliacaoCsv.test.js` (novo)
- `tests/pixEfiWebhookService.test.js`
- `package.json`, `env.example`

**Endpoints públicos:** nenhum novo.

### Perguntas obrigatórias (respostas)

1. **Existe API Efí acessível com taxa/liquidação?** Sim: **Extrato de conciliação** (`/v2/gn/relatorios/extrato-conciliacao` + download) com linhas **TPR**; e opcionalmente **`gnExtras.tarifa`** no webhook se habilitado na conta.
2. **O identificador financeiro cruza com txid/endToEndId?** Sim: linha **PR** contém `txid` e `endToEndId` (e2e); **TPR** amarra pela **mesma e2e** do **PR** casado.
3. **É possível preencher `providerFeeAmount` com confiança?** Sim, **somente** se houver **exatamente um** **PR** e **no máximo um** **TPR** para o e2e e valores coerentes; caso contrário o script **não aplica**.
4. **O dry-run encontrou match único?** Depende do ambiente: smoke local sem credenciais Efí retorna `EFI_NOT_CONFIGURED` (esperado). Em produção com escopos e CSV do dia, o dry-run lista `wouldSet` por cobrança elegível.
5. **Match ambíguo?** Resultado `AMBIGUOUS_MATCH` — **sem** `UPDATE` no banco.
6. **A taxa altera saldo do usuário?** **Não.**
7. **A taxa altera settlement?** **Não.**
8. **Outro provider?** Parser/ script são específicos do layout Efí CSV v4.0; outro PSP exigiria adapter + layout próprio; campos `PixCobranca` permanecem genéricos.
9. **O que fica `null`?** Quando não há **TPR** no extrato, ou webhook sem `gnExtras.tarifa`, ou escopos ausentes / sandbox — taxa e líquido permanecem `null` até nova conciliação ou habilitação na Efí.
10. **Próximo passo operacional?** Habilitar escopos `gn.reports.*` na app Efí; rodar `npm run efi:s4:reconcile-fees -- --dry-run --date=AAAA-MM-DD`; validar JSON; só então `--apply` com autorização; opcionalmente habilitar `gnExtras.tarifa` no `/v2/gn/config` para novos pagamentos.

---

## 8. RELATÓRIO GERADO

- `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-CONCILIACAO-FINANCEIRA-FASE-S4.md`
- `docs/reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-CONCILIACAO-FINANCEIRA-FASE-S4.md`

---

## 9. VALIDAÇÃO

| Comando | Resultado |
|---------|------------|
| `npx prisma validate` | OK |
| `npx prisma generate` | OK |
| `npx jest --no-cache` | **25** suites, **259** testes passando |
| `node scripts/efi-reconcile-provider-fees.js --dry-run` (ambiente local sem Efí completo) | Exit **1**, `EFI_NOT_CONFIGURED` (esperado sem credenciais) |

---

## 10. STATUS FINAL

**APROVADO**

**Justificativa:** existe **fonte confiável** documentada pela Efí (CSV do extrato de conciliação + opcional `gnExtras.tarifa`); o código **não inventa** taxa; **não aplica** em caso ambíguo ou ausência de **TPR**; **não altera** saldo, settlement nem ledger; script opera em **dry-run** por padrão com `--apply` explícito; suíte de testes verde.

---

*IVAR — Fase S.4 — Conciliação financeira Efí Pix — AgilBank*
