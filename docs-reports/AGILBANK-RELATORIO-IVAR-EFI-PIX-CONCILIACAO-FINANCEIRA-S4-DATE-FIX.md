# IVAR — Fase S.4: correção de `dataMovimento` vs `--date`

**Data:** 2026-05-11  
**Escopo:** script `scripts/efi-reconcile-provider-fees.js` + util `src/utils/efiReconcileFeeExtratoDate.js` + testes `tests/efiReconcileFeeExtratoDate.test.js`

## 1) Fluxo real identificado

`CLI (npm run efi:s4:reconcile-fees)` → `scripts/efi-reconcile-provider-fees.js` → `efiPixClient.postExtratoConciliacao({ dataMovimento })` → Efí extrato CSV → match → (opcional) `PixCobranca` update em `--apply`.

**Não altera:** saldo de conta, settlement inbound, ledger geral — apenas leitura de extrato e, em `--apply`, campos de taxa da cobrança.

## 2) Problema encontrado

Com `--date=AAAA-MM-DD`, o script ainda derivava o dia do extrato a partir de `paidAt` (ex.: 2026-05-11 em SP), gerando POST com `dataMovimento` divergente do informado e erro Efí: *data do extrato deve ser anterior à data corrente* quando o dia efetivo não era válido.

## 3) Causa

Uso único de `movementDateKeySaoPaulo(paidAt)` para `postExtratoConciliacao` e cache, ignorando o argumento `--date` como fonte do `dataMovimento`.

## 4) Impacto no sistema

Conciliação de taxas (S.4) falhava ou consultava o dia errado; operação confusa para quem passava `--date` explicitamente.

## 5) Ação da RAGNA (backend)

- Util centralizado: `resolveDataMovimento({ explicitDate, paidAt })`, `validateDataMovimentoBeforeExtrato` (rejeita `dm >= hoje` em `America/Sao_Paulo` com código `DATE_NOT_AVAILABLE_YET` antes da Efí).
- Script: com `--date`, `dataMovimento` do POST = `--date`; prefetch único do CSV nesse dia; JSON de saída com `dataMovimentoExplicitArg`, `dataMovimentoSentToEfiSummary` e por linha `dataMovimentoUsed` / `paidAtSaoPaulo` / `dataMovimentoResolution`.

## 6) Ação da LARGETHA (frontend)

Não aplicável (CLI / backend).

## 7) Auditoria IVAR

Rastreabilidade: problema (POST com dia errado), fluxo (S.4 extrato), arquivos listados acima, endpoint Efí `POST extrato conciliação` com `dataMovimento` conforme regra acima, sem mudança de contrato HTTP interno AgilBank.

## 8) Relatório gerado

Este arquivo: `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-CONCILIACAO-FINANCEIRA-S4-DATE-FIX.md`.

## 9) Validação

- `npx prisma validate`
- `npx prisma generate`
- `npx jest --no-cache` (inclui `tests/efiReconcileFeeExtratoDate.test.js`)

## 10) Status final

**APROVADO** para o escopo S.4 data fix, após execução bem-sucedida dos comandos de validação acima no ambiente do repositório.
