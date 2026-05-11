# AGILBANK — Relatório IVAR — Efí Pix — Hardening e auditoria final (Fase S)

**Data:** 2026-05-11  
**Escopo:** Segurança do webhook, logs, idempotência, ledger, taxas PSP, falhas/retries, abstração de provider, scripts operacionais, contratos de API, UI de cobranças/Pix.  
**Restrições respeitadas:** Sem nova feature de produto, sem nova cobrança Pix real, sem pagamento Pix real, sem `UPDATE`/`DELETE` manual no banco, sem `migrate deploy`, sem expor segredos neste documento.

---

## 1. FLUXO REAL IDENTIFICADO

**UI → Evento → JS → API → Backend → Banco → API → UI**

1. **UI (`agilbank-frontend/public/banco/index.html`):** usuário autenticado abre cobrança; pode solicitar Pix via `POST /api/charges/:id/pix` (cliente legado); detalhe usa `GET /api/charges/:id` e exibe “Pago” apenas quando `pixStatus === 'PAGA'` e `pixPaidAt` vêm do backend; cópia de código Pix não usa `codigoBarras` do boleto (linha digitável fica em campo de boleto separado).
2. **Backend criação:** `charges.js` + `pixCobrancaEfiService` / `efiPixClient` → `PixCobranca` (Efí como provider padrão).
3. **Webhook Efí:** `POST /api/internal/efi/pix/webhook` ou `.../webhook/pix` → `requireEfiPixWebhookAuth` → `pixProviderService.processChargeWebhookBody` → `efiPixProvider` → `pixEfiWebhookService.processEfiPixWebhookBody` → transação Prisma: idempotência por `PixWebhookEvent.idempotencyKey` (`efi:e2e:{endToEndId}`), localiza `PixCobranca` por `txid`, valida valor, marca `PAGA`, cria evento, chama `pixSettlementService.settlePaidPixCobrancaInTx` (seguro empréstimo / frete cartão / boleto).
4. **Pós-commit:** notificações in-app apenas quando `settlementResult === 'SETTLED'` e existe `postCommit` (fora da transação; falha não reverte commit).

---

## 2. PROBLEMA ENCONTRADO (classificação)

| Severidade | Achado |
|------------|--------|
| **ALTO** | **`morgan` registra `:url` completo** (`src/server.js`), incluindo query string. Webhooks cadastrados com `?efiwk=` podem fazer o **token de callback** aparecer em **logs de acesso HTTP**. Scripts O1 já redacionam `efiwk` em payloads de debug; o servidor ainda não redaciona na linha de log padrão. |
| **MÉDIO** | **Persistência `PixWebhookEvent.processingResult = 'PROCESSED'`** é gravada **antes** do settlement concluir. Se `settlePaidPixCobrancaInTx` retornar `AMOUNT_MISMATCH`, `INVALID_STATE`, `UNSUPPORTED_ENTITY`, etc. **sem** `throw`, a transação commita **cobrança Pix PAGA** + evento **PROCESSED**, embora o settlement **não** tenha efetuado liberação/baixa. O campo `processingResult` no banco **não** reflete falhas de settlement; `settlementResult` aparece na **resposta HTTP** do webhook (`data.results[]`). Risco operacional de diagnóstico e reconciliação. |
| **MÉDIO** | **Token na URL (`efiwk`)** como mecanismo de auth para o PSP: risco estrutural (Referer, histórico, proxies, logs) — aceitável apenas com **uso controlado** + mitigações futuras. |
| **BAIXO** | Respostas **500** genéricas no catch do webhook (`INTERNAL_ERROR`) sem código de correlação adicional no body (há `requestId` em logs estruturados). |
| **MELHORIA FUTURA** | **Taxas Efí:** `PixCobranca` não possui `grossAmount`, `netAmount`, `providerFeeAmount` (schema com comentário de evolução). Modelo sugerido: `grossAmount`, `providerFeeAmount`, `netAmount`, `providerFeeCurrency` + preenchimento quando a API PSP for fonte confiável; **sem desconto automático** nesta fase. |
| **MELHORIA FUTURA** | IP allowlist, **mTLS** real com Efí, rotação periódica do token de callback, token dedicado só em header (se contrato PSP permitir). |

**Não** foi identificado, nesta revisão de código + testes: duplicidade financeira no caminho feliz; débito indevido de `saldoAtual` por Pix externo nos fluxos de settlement implementados; webhook público **sem** camada de autenticação (há 403/503 conforme env).

---

## 3. CAUSA

- **Logs com `efiwk`:** uso do token `:url` do `morgan` sem sanitização de query.
- **PROCESSED vs settlement:** ordem de escrita do evento e desenho atual que trata settlement como fase subsequente na mesma transação, sem atualizar `processingResult` conforme o resultado de `settlePaidPixCobrancaInTx`.
- **Token na URL:** exigência operacional documentada (Efí + path `/pix`) já tratada em O.2 com `?ignorar=&efiwk=`; mitigação de infraestrutura ainda incompleta nos access logs.

---

## 4. IMPACTO NO SISTEMA

- **ALTO (logs):** exposição do segredo de callback em logs pode permitir **reenvio de webhooks** se alguém obtiver o token e souber o formato do body — escopo de abuso depende de hardening de rede e rotação de credencial.
- **MÉDIO (observabilidade):** estados “Pix PAGA + evento PROCESSED” com settlement não-SETTLED exigem **playbook operacional** (auditoria `pix.settlement.*`, conciliação R, correção de dados de origem).
- **MÉDIO (token URL):** superfície de vazamento ampliada vs. header-only.
- **Melhorias futuras:** conciliação financeira líquida/bruta e defesa em profundidade (mTLS/IP).

---

## 5. AÇÃO DA RAGNA (auditoria técnica)

**A. Segurança do webhook**

- `requireEfiPixWebhookAuth` (`src/middleware/auth.js`): comparação com **`crypto.timingSafeEqual`** sobre **SHA-256** de `x-internal-key` e/ou `efiwk` (não compara string em claro).
- Sem chaves configuradas: **503** `INTERNAL_OPERATION_UNAVAILABLE` (teste em `tests/internalEfiPixWebhook.test.js`).
- Chave inválida sem `efiwk` válido: **403**.
- Ping / validação (corpo vazio ou sem `pix`): **200** `EFI_WEBHOOK_VALIDATION_OK`.
- `pix` inválido (não array): **400** `INVALID_BODY`.
- **`efiwk` em logs de aplicação estruturados:** não foi encontrado log explícito do valor bruto do token nos serviços Pix revisados; **risco principal** é **`morgan` + `:url`**.

**B. Idempotência**

- **Webhook:** `PixWebhookEvent` único por `idempotencyKey` (`efi:e2e:{endToEndId}`); duplicata → `DUPLICATE`; corrida → `P2002` tratado como `DUPLICATE`.
- **Settlement empréstimo (seguro):** `Movimentacao` com `idempotencyKey` `loan_insurance_release_pix:{pixCobrancaId}`; se já existe movimento → `ALREADY_SETTLED` sem nova liberação.
- **Boleto / frete:** `updateMany` com condição de estado → idempotência por contagem de linhas afetadas.
- **Conciliação R:** reutiliza `processEfiPixWebhookBody`; mesmo `endToEndId` → não duplica evento.

**C. Ledger**

- Liberação de crédito do empréstimo após seguro: **`registrarCreditoLiberadoDeBloqueado`** com `idempotencyKey` estável (`pixSettlementService.js`).
- **`LedgerError`:** relançado dentro da transação do webhook → **rollback** de `PixCobranca` PAGA + evento PROCESSED (não commit parcial nesse caso).
- Pix externo (fluxos comentados no settlement): **frete** documentado como sem débito em `saldoAtual`; seguro usa liberação de bloqueado via ledger; boletos usam flags/notificações sem movimento de débito de conta corrente no trecho revisado.

**D. Taxas Efí**

- Não persistidas hoje; ver **MELHORIA FUTURA** acima.

**E. Falhas e retries**

| Cenário | Comportamento |
|---------|----------------|
| Settlement falha com **throw** (`LedgerError`, erro inesperado) | Rollback da transação do item do webhook; log `efi_pix_webhook_transaction_failed`; Efí pode retentar. |
| Settlement retorna **código** sem throw (`AMOUNT_MISMATCH`, `UNSUPPORTED_ENTITY`, etc.) | **Commit** com `PixCobranca` **PAGA** e evento **PROCESSED**; `settlementResult` na resposta HTTP. |
| `txid` desconhecido | `ORPHAN_TXID`, evento persistido, auditoria `efi.pix.webhook.orphan_txid`. |
| Valor webhook ≠ valor cobrança | `AMOUNT_MISMATCH` no webhook, evento dedicado, sem marcar PAGA. |
| `PixCobranca` já **PAGA** (novo `endToEndId`?) | Ramo `ALREADY_PAID`, novo evento. |
| `linkedEntityType` desconhecido | `UNSUPPORTED_ENTITY`, auditoria `pix.settlement.unsupported_entity`. |
| Notificação falha após commit | `postCommit` englobado em `try/catch`; log + auditoria `pix.settlement.post_commit_failed`; **estado de negócio já persistido**. |

**F. Provider**

- `pixProviderRegistry` + `pixProviderService` + `efiPixProvider`: Efí isolada; regra de negócio principal em `pixEfiWebhookService` / `pixSettlementService` (nomes genéricos de entidade).

**G. Scripts**

- `efi-reconcile-received-pix.js`: **dry-run padrão**; `--apply` explícito; sem PUT cob.
- `efi-o1-register-pix-webhook.js`: redação de `efiwk` em logs de payload.
- Demais scripts da lista: revisão estática alinhada à documentação em cabeçalhos (não executados nesta fase além de testes).

---

## 6. AÇÃO DA LARGETHA (UI)

- Exibição “Pago” condicionada a **`pixStatus` + `pixPaidAt`** do backend (`agilbankChargesPopulateDetailFromPayload`).
- **Sem** botão “já paguei” ou equivalente que liquide cobrança no cliente (busca por padrões não encontrou).
- Label de provedor: `agilbankPixProviderLabel` usa `pixProvider` / `provider` / `source` de forma genérica.
- **Pós-PAGA:** painel de payload Pix é ocultado; texto de status não quebra o fluxo analisado.

---

## 7. AUDITORIA DO IVAR

- Contratos públicos `POST/GET /api/charges/:id` e criação Pix: preservados na análise estática; webhook interno retorna `data.results[]` com `settlementResult` opcional — documentado para operação.
- Rastreabilidade: auditorias `efi.pix.*`, `pix.settlement.*` cobrem divergências e falhas de `postCommit`.
- **Perguntas obrigatórias:**

1. **Webhook seguro para estágio atual?** **Sim, com ressalvas:** auth forte (timing-safe + hash), mas **uso controlado** deve incluir **proteção de logs** (mascarar `efiwk`) e governança de acesso aos logs.  
2. **`efiwk` aparece em logs?** **Sim — potencialmente em logs HTTP** via `morgan :url` (`src/server.js`). **Correção:** token Morgan customizado que mascare `efiwk` (ou logar só `path`), ou desabilitar URL completa em produção.  
3. **Idempotência webhook + conciliação + settlement?** **Sim** para duplicidade de evento e de movimento de ledger nos caminhos implementados; **ressalva** na semântica **PROCESSED** vs falha de settlement não lançada.  
4. **Saldo fora do ledger?** Não evidenciado para liberação de empréstimo; demais entidades revisadas não debitam `saldoAtual` por Pix externo nos trechos de settlement analisados.  
5. **Pix externo debita `saldoAtual` indevidamente?** **Não** nos fluxos `loan_insurance` / `card_shipment` / `boleto` conforme implementação e comentários de domínio.  
6. **Evento duplicado Efí?** Mesmo `endToEndId` → `DUPLICATE` / `P2002`.  
7. **Amount mismatch?** Entre PSP e cobrança → evento `AMOUNT_MISMATCH`, cob **não** vai a PAGA. Entre cobrança e entidade ligada **após** marcar PAGA → settlement retorna código; **estado misto** possível (ver MÉDIO).  
8. **`txid` órfão?** `ORPHAN_TXID` + auditoria.  
9. **Notificação falha?** Não reverte transação; log + auditoria; usuário pode não ver notificação imediata.  
10. **Produção mais robusta?** mTLS/IP allowlist; logs sem segredo; persistir resultado de settlement no evento ou tabela auxiliar; taxas PSP; alertas métricos.  
11. **Taxa Efí futura?** Campos sugeridos na seção 2 + ingestão quando API confiável.  
12. **Trocar Efí por outro provider?** Arquitetura de registry/fachada permite novo adapter; ajustar webhook e mapeamento de payload.  
13. **Riscos remanescentes?** Token em URL + logs; estado PROCESSED vs settlement; dependência de retentativas Efí em erro 5xx.  
14. **Próximas fases?** Sanitização de access log; persistência explícita de `settlementResult`; taxas; mTLS/IP; métricas SLO webhook/settlement.

---

## 8. RELATÓRIO GERADO

- **Este arquivo:** `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-HARDENING-FASE-S.md`  
- **Espelho:** `docs/reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-HARDENING-FASE-S.md`

---

## 9. VALIDAÇÃO

| Comando | Resultado |
|---------|-----------|
| `npx prisma validate` | OK (exit 0) |
| `npx prisma generate` | OK (exit 0) |
| `npx jest --no-cache` | **23** suites, **248** testes passando (incl. `internalEfiPixWebhook`, charges, loans, boletos, shipment conforme suítes do repositório) |

---

## 10. STATUS FINAL

**APROVADO COM RESSALVAS**

**Motivo:** Fluxo ponta a ponta está **alinhado ao uso controlado** com autenticação de webhook sólida, idempotência por `endToEndId` e chaves de ledger, rollback em **`LedgerError`**, scripts de conciliação com dry-run padrão, testes de contrato do webhook e suíte Jest verde. **Ressalvas obrigatórias:** (1) tratar **urgentemente** a exposição potencial de **`efiwk` em access logs**; (2) documentar e operar o caso **Pix PAGA + PROCESSED** com **`settlementResult` ≠ `SETTLED`** até evolução do modelo de persistência do resultado de settlement.

**Não REPROVADO:** não há evidência nesta fase de vazamento de Client Secret/certificado/JWT completo em código de produção revisado, nem de duplicidade de crédito no caminho idempotente do ledger, nem de webhook totalmente aberto sem auth.

---

*IVAR — Fase S — Hardening Efí Pix — AgilBank*
