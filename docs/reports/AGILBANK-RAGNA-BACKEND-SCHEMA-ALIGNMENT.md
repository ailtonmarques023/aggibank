# AgilBank — Alinhamento backend ao schema (Ragna)

**Data:** 2026-05-01  
**Contexto:** reauditoria Ivar (`docs/reports/AGILBANK-IVAR-REAUDIT.md`) — schema correto, API desalinhada.  
**Escopo:** alinhar rotas/helpers ao `prisma/schema.prisma` atual, sem provider real, sem Pix real, sem reintroduzir CVV/PAN integral ou refresh em claro no banco.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/middleware/auth.js` | `hashRefreshToken()` via HMAC-SHA256 com `JWT_REFRESH_SECRET` ou `JWT_SECRET`; export do helper. |
| `src/routes/auth.js` | Login grava `tokenHash`; refresh busca por `tokenHash` + `userId` do JWT; `logout` usa `authenticateToken` e invalida refresh; `recordAudit` em login, refresh e logout. |
| `src/utils/auditLog.js` | **Novo** — `recordAudit()` com try/catch (falha só loga, não quebra fluxo). |
| `src/routes/cards.js` | Cartão demo: `maskedNumber`, `last4`, `cardToken` (`demo_<uuid>`), sem CVV/PAN; `publicCard()` remove `cardToken` das respostas; auditoria em solicitar/aprovar/bloquear/desbloquear/limite. |
| `src/config/database.js` | `cleanTestData`: `auditLog.deleteMany()` antes dos demais deletes. |
| `src/config/swagger.js` | Schema `Card`: `maskedNumber`, `last4`; removido `numero`; nota demo. |
| `tests/setup.js` | `auditLog` no mock Prisma; `user.findFirst`; `beforeEach` restaura `jwt.sign`/`jwt.verify` (compatível com `resetMocks`); |
| `tests/auth.test.js` | Import `prisma` de `../src/config/database`; refresh mock com `tokenHash`; senhas de teste `123456` (regra de validação atual); registro duplicado vira teste de erro `P2002` → 500. |
| `jest.config.js` | `testPathIgnorePatterns` inclui `gov.br1` (guia AgilBank — Jest não entra no subprojeto). |
| `prisma/migrations/20260501152812_init/migration.sql` | **Migration inicial** gerada (ver secção Migrations). |

---

## Campos antigos removidos do uso

- **`Token.token`** — substituído por **`tokenHash`** em `create` / `findFirst`.
- **`Cartao.numero`**, **`Cartao.cvv`** — removidos de creates, selects e helpers; não há geração nem persistência de CVV.

---

## Implementação de `tokenHash`

- Função **`hashRefreshToken(refreshToken)`** em `src/middleware/auth.js`:  
  `crypto.createHmac('sha256', JWT_REFRESH_SECRET || JWT_SECRET).update(refreshToken).digest('hex')`
- **Login:** gera JWT de refresh para o cliente; persiste apenas o HMAC no banco.
- **Refresh:** valida JWT com `verifyRefreshToken`, calcula o mesmo HMAC do body e consulta `prisma.token.findFirst({ where: { tokenHash, userId: decoded.userId, ... } })`.
- **Logout:** exige Bearer válido (`authenticateToken`); `updateMany` desativa refresh do usuário.

---

## Cartão demo seguro

- **`generateDemoCardFields()`:** `last4` aleatório (4 dígitos), `maskedNumber` = `**** **** **** {last4}`, `bandeira` aleatória (`visa` / `mastercard` / `elo`), `validade` MM/AAAA, `cardToken` = `demo_<uuid>`.
- Nenhum fluxo retorna **CVV**; PAN completo não é construído nem salvo.
- Respostas JSON usam **`publicCard()`** para omitir **`cardToken`** (fica só no banco para correlação demo).

---

## Onde `AuditLog` foi usado

| Ação | `action` (sugestão semântica) |
|------|--------------------------------|
| Login OK | `auth.login_success` |
| Refresh OK | `auth.refresh_used` |
| Logout | `auth.logout` |
| Solicitar cartão | `card.requested` |
| Aprovar cartão | `card.approved` |
| Bloquear | `card.blocked` |
| Desbloquear | `card.unblocked` |
| Alterar limite | `card.limit_changed` |

Entidade `entity` / `entityId` preenchidos; IP e `User-Agent` quando disponíveis; `metadata` opcional (ex.: tipo/bandeira no pedido de cartão).

---

## Comandos executados

```bash
npx prisma validate   # OK
npx prisma generate   # OK (também via npm run build)
npm run build         # OK
npx jest tests/auth.test.js --forceExit   # OK — 10/10
npx prisma migrate dev --name init --create-only   # gerou pasta de migration (ver abaixo)
```

---

## Resultado

| Verificação | Status |
|-------------|--------|
| `npx prisma validate` | **Passou** |
| `npm run build` / `prisma generate` | **Passou** |
| Testes `tests/auth.test.js` | **Passou** (10 testes) |
| Backend sem `Token.token` / `Cartao.numero` / `Cartao.cvv` nas rotas alinhadas | **Sim** |

---

## Migrations

- **Criada** migration inicial: `prisma/migrations/20260501152812_init/migration.sql` (estado “from empty” do Prisma para o schema atual).
- **Atenção:** o comando `migrate dev` **conecta** ao `DATABASE_URL` do `.env`. Não aplicar em **produção** sem revisão. Bancos que já tinham tabelas antigas (`token`, `numero`, `cvv`) **não** devem aplicar este SQL cegamente — exige migration de **alteração** ou baseline explícito.
- **Não** foi garantido neste relatório que a migration foi aplicada ao Neon; apenas que o arquivo foi gerado.

---

## Pendências reais

1. **Banco existente:** se já houver dados com colunas antigas, Ragna/Ivar precisam de migration incremental (drop/rename/colunas novas + estratégia para tokens e cartões legados).
2. **Registro com e-mail duplicado:** a rota ainda não trata `P2002` com mensagem amigável — teste cobre 500 genérico; melhoria opcional de produto.
3. **Frontend / outros clientes:** consumidores que esperavam `numero` de cartão ou campo `token` na tabela `tokens` precisam atualizar.
4. **Auditoria:** expandir `recordAudit` para Pix, pagamentos, saldo, quando essas rotas forem priorizadas.
5. **Swagger / exemplos** em outros arquivos podem ainda mencionar payloads antigos fora de `Card`.

---

## Pronto para Ivar revisar?

**Sim** — código alinhado ao schema; `validate` e `build` ok; testes de auth verdes; migration inicial versionada para bases novas. Ivar deve validar política de deploy em banco já existente e ausência de segredos em logs.

---

*Ragna — alinhamento backend/schema concluído neste ciclo.*
