# AgilBank — Reauditoria final (Ivar)

**Data:** 2026-05-01  
**Escopo:** verificação pós-Ragna (schema, migration `20260501152812_init`, auth, cartões, auditoria, testes, ambiente), sem alteração de código, sem deploy, sem nova migration.  
**Referências:** `docs/AGILBANK-AGENTS-GUIDE.md`, relatórios Ivar/Ragna anteriores, `docs/reports/AGILBANK-RAGNA-BACKEND-SCHEMA-ALIGNMENT.md`.

---

## Conclusão final

**Classificação:** **aprovado com ressalvas** para **demo/staging**.

O conjunto **schema + migration inicial + auth/cartões + AuditLog mínimo + Jest (AgilBank)** está **alinhado** com os bloqueadores que motivaram as auditorias anteriores (sem CVV/PAN integral no modelo de cartão, refresh persistido como hash, tabela de auditoria, migration versionada). Porém **não** há bloqueador único que justifique **reprovado** para uma demo controlada, desde que as ressalvas abaixo sejam aceitas no ambiente de staging (CORS, hash com segredo forte, política de banco, uso futuro de idempotência nas rotas financeiras).

---

## 1. Schema — verificação

| Critério | Status |
|----------|--------|
| `Cartao` sem CVV | **OK** — modelo só `maskedNumber`, `last4`, `validade`, `bandeira`, `cardToken?`, etc. |
| Sem PAN / número completo de cartão | **OK** — não há campo `numero` em `Cartao`. |
| Campos seguros equivalentes | **OK** — `maskedNumber`, `last4`, `cardToken` opcional único. |
| `Token` com `tokenHash`, não segredo em claro | **OK** — `tokenHash String @unique`; sem `token` plaintext. |
| `AuditLog` | **OK** — modelo `AuditLog` + relação `User.auditLogs`. |
| `TransacaoPix` / `Pagamento` / `Movimentacao` — rastreio e idempotência (MVP demo) | **Parcial** — schema inclui `idempotencyKey`, `providerReference`, `environment`, `referenceType`/`referenceId` em movimentação; **as rotas em `src/routes` não referenciam ainda `idempotencyKey`/`referenceType`** (grep sem ocorrências). Capacidade no modelo: **suficiente**; uso na API: **pendente**. |

---

## 2. Migration `20260501152812_init`

| Critério | Status |
|----------|--------|
| Coerência com `schema.prisma` | **OK** — tabelas e colunas revisadas (incl. `cartoes` com `maskedNumber`/`last4`, `tokens.tokenHash`, `audit_logs`, Pix/pagamento com colunas novas, índices únicos de idempotência/hash). |
| Sem `cvv` ou número integral de cartão em `cartoes` | **OK**. |
| Adequada para **banco vazio** | **OK** — script é criação completa (`CreateTable` + FKs + índices). |
| **Não** aplicar em banco com schema antigo | **Alerta crítico de operação:** bases que já tenham tabelas/colunas legadas (`token`, `numero`, `cvv`) **não** devem receber este arquivo como “primeira migration” sem baseline ou migration incremental. Risco de conflito ou perda de dados. |
| Nota: `enderecos.numero` | Endereço continua com coluna `numero` (logradouro) — **não** é PAN; esperado. |

---

## 3. Backend Auth

| Critério | Status |
|----------|--------|
| Refresh salvo como hash | **OK** — `hashRefreshToken` (HMAC-SHA256 com `JWT_REFRESH_SECRET` ou `JWT_SECRET`) e `prisma.token.create({ tokenHash })`. |
| Refresh compara corpo com hash | **OK** — `hashRefreshToken(refreshToken)` + `findFirst({ tokenHash, userId: decoded.userId, ... })`. |
| Logout e `req.user` | **OK** — `router.post('/logout', authenticateToken, ...)`. |
| Sem `Token.token` em claro no Prisma | **OK** — uso apenas `tokenHash` nos writes/queries de refresh. |
| `AuditLog` mínimo | **OK** — `auth.login_success`, `auth.refresh_used`, `auth.logout`. |
| Ressalva | Se `JWT_REFRESH_SECRET` e `JWT_SECRET` estiverem vazios, HMAC usa string vazia — **fraco**; staging deve usar segredos fortes (`env.example` já orienta placeholders, não segredos reais). |

---

## 4. Backend Cartões

| Critério | Status |
|----------|--------|
| Sem `numero` / `cvv` em `cards.js` | **OK** — criação com `maskedNumber`, `last4`, `cardToken`, etc. |
| API não expõe `cardToken` | **OK** — `publicCard()` remove `cardToken` nas respostas; listagem nem seleciona `cardToken`. |
| Respostas com `maskedNumber` / `last4` / `bandeira` / status / limites / validade | **OK**. |
| `cardToken` só interno (DB) | **OK**. |
| Fluxos demo (solicitar, aprovar, bloquear, desbloquear, limite) | **Coerentes para demo** — rotas e estados mantidos; **ressalva de produto:** aprovação ainda é por rota acessível ao usuário autenticado (não há papel admin separado no trecho auditado), o que o guia já sinalizava como ponto de regra de negócio. |

---

## 5. Testes

| Critério | Status |
|----------|--------|
| Jest ignora `gov.br1` | **OK** — `testPathIgnorePatterns` em `jest.config.js`. |
| Testes de auth | **OK** — relatório Ragna e histórico: suite `tests/auth.test.js` verde (10 testes); fixtures com senha `123456` alinhada à validação atual. |
| Banco real / SMTP / provider real nos testes | **Parcial** — Prisma e e-mail estão **mockados** nas queries usadas pelos testes de auth; porém o **servidor sobe** e o log indica **conexão Prisma real** no bootstrap. Para CI “puro offline”, ideal isolar `server` ou usar `DATABASE_URL` de teste inalcançável com falha tratada — **ressalva de robustez**, não de segredo nos testes. |
| Segredos em docs/testes | **OK** nos arquivos citados — apenas placeholders em `env.example`; testes usam segredos fictícios de Jest. |

---

## 6. Segurança de ambiente

| Critério | Status |
|----------|--------|
| `.env` não commitado | **OK** — `.gitignore` inclui `.env` e `.env.*`. |
| `env.example` | **OK** — sem credencial real; apenas placeholders e chaves a trocar. |
| Segredos novos em documentação desta rodada | **Nenhum** identificado na revisão estática dos artefatos listados. |

---

## 7. O que foi aprovado (síntese)

- Modelo de dados e migration inicial para **banco novo**, sem campos proibidos de cartão/refresh inseguros.
- Implementação de **refresh com hash** e **logout autenticado**.
- **Cartões demo** sem CVV/PAN persistidos e sem vazamento de `cardToken` na API.
- **AuditLog** persistido nos fluxos de auth e cartão conforme relatório Ragna.
- **Jest** focado no AgilBank, sem varrer `gov.br1`.

---

## 8. Ressalvas (não bloqueiam demo se conscientes)

1. **Rotas Pix/pagamento/movimentação** ainda não populam `idempotencyKey` / `referenceType` no código — risco de duplicidade só mitigado quando Ragna implementar.
2. **Migration init** apenas para **schema greenfield**; bancos legados exigem plano apartado.
3. **Aprovação de cartão** sem segregação admin explícita no código revisado.
4. **Testes** iniciam servidor com tendência a conectar DB real — endurecer CI opcionalmente.
5. **Registro** com violação de unicidade ainda pode resultar em **500** genérico (já documentado pelo Ragna).

---

## 9. Bloqueios

**Nenhum bloqueador crítico** adicional em relação ao critério “demo/staging seguro e coerente com o guia”, desde que:

- não se aplique a migration `init` em banco já populado com schema antigo sem migração planejada, e  
- segredos JWT reais sejam configurados no ambiente.

---

## 10. Checklist rápido vs. `AGILBANK-AGENTS-GUIDE.md`

| Regra / objetivo | Situação |
|------------------|----------|
| Não salvar CVV | **Atendido** (schema + `cards.js`). |
| Refresh não em claro no banco | **Atendido** (`tokenHash`). |
| Auditoria em operações críticas | **Parcial** — auth + cartão; Pix/boletos/pagamentos a expandir. |
| Migrations versionadas | **Atendido** (pasta com `init`). |
| Demo/sandbox explícito | **Parcial** — `environment` no schema; rotas devem preencher/contrato UI. |
| Não prometer banco regulado | Fora do escopo deste diff; depende de copy/deploy. |

---

*Ivar — reauditoria final registrada; nenhuma alteração feita no repositório além deste arquivo.*
