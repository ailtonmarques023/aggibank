# AGILBANK — Relatório IVAR — Efí Pix — Sanitização de logs do webhook (Fase S.1)

**Data:** 2026-05-11  
**Objetivo:** impedir vazamento de `efiwk` (e outros segredos) em logs HTTP/access logs.  
**Restrições respeitadas:** sem alteração de regra financeira, settlement, saldo, webhook de negócio; sem execução destrutiva em produção; sem expor segredos.

---

## 1. FLUXO REAL IDENTIFICADO

**UI → Evento → JS → API → Backend → Banco → API → UI**

- **Efí → Webhook:** `POST /api/internal/efi/pix/webhook[/pix]` chega no backend e passa por `morgan` (access log).
- **Ponto de risco anterior:** `morgan(':method :url ...')` logava `:url` completo, que inclui query string → risco de logar `?efiwk=TOKEN`.
- **Correção S.1:** `morgan` passa a logar `:safe-url`, derivado de `req.originalUrl` com query **sanitizada**.

---

## 2. PROBLEMA ENCONTRADO

- **Achado (Fase S):** `:url` em `src/server.js` podia registrar `efiwk` bruto em access logs.

---

## 3. CAUSA

- Configuração padrão do `morgan` estava usando `:url` (inclui query) sem sanitização.

---

## 4. IMPACTO NO SISTEMA

- **Segurança:** vazamento do token de callback (`efiwk`) em logs pode permitir replays/abuso de webhook se o token cair em mãos erradas.
- **Operação:** aumenta a superfície de exposição (logs, agregadores, dumps, suporte).

---

## 5. AÇÃO DA RAGNA

- Implementado sanitizador `sanitizeUrlForAccessLog` em `src/utils/logSanitizer.js`, com hardening para chaves:
  - `efiwk=***`
  - `token=***`
  - `client_secret=***`
  - `authorization` removido se aparecer na query
  - defesa em profundidade para `base64` / `certificate` / `cert*` / `*secret*`
- Ajustado `src/server.js` para trocar `:url` por `:safe-url` no `morgan`.

**Comportamento exigido (confirmado em testes):**

- `/api/internal/efi/pix/webhook/pix?ignorar=&efiwk=abc` → loga como  
  `/api/internal/efi/pix/webhook/pix?ignorar=&efiwk=***`

---

## 6. AÇÃO DA LARGETHA

- Não aplicável (mudança exclusiva de backend logging; sem alterações em UI).

---

## 7. AUDITORIA DO IVAR

**Arquivos alterados (rastreabilidade):**

- `src/server.js` (morgan agora usa `:safe-url`)
- `src/utils/logSanitizer.js` (sanitizador)
- `tests/logSanitizer.test.js` (testes unitários do sanitizador)

**Contrato/API impactado:**

- Nenhum endpoint/payload/response foi alterado. Apenas logging.

**Risco residual:**

- Se outro logger (fora do `morgan`) imprimir `req.originalUrl` ou strings de URL sem sanitização, ainda pode vazar. Nesta fase, o escopo foi o access log do `morgan` (achado ALTO).

---

## 8. RELATÓRIO GERADO

- `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-LOG-SANITIZATION-FASE-S1.md`

---

## 9. VALIDAÇÃO

- `npx prisma validate`: OK  
- `npx prisma generate`: OK  
- `npx jest --no-cache`: **24** suites, **253** testes passando (inclui `tests/logSanitizer.test.js`)

---

## 10. STATUS FINAL

**APROVADO**

**Critério atendido:** `efiwk` não é mais logado em bruto no access log do `morgan` (sanitização aplicada e testada) e suíte de testes passou.

