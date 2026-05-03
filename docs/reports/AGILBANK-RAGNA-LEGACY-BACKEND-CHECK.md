# AgilBank - Ragna legacy backend check

**Data:** 2026-05-01  
**Escopo:** validar backend para tela bancaria antiga publicada em `agilbank-frontend/public/banco/`, com foco em compatibilidade de login, cadastro, dashboard e rota `GET /api/user/user-complete-data`.

## Arquivos revisados

- `src/routes/user.js`
- `src/routes/auth.js`
- `src/middleware/auth.js`
- `src/server.js`
- `tests/auth.test.js`
- `tests/setup.js`
- `package.json`

## Validacoes feitas

- Revisei `src/routes/user.js` e confirmei que todas as rotas de usuario continuam atras de `router.use(authenticateToken)`.
- Confirmei que `GET /api/user/user-complete-data` usa o mesmo Bearer token das demais rotas de usuario.
- Confirmei que `GET /api/user/profile` permanece com contrato existente: request sem body, autenticado por Bearer, response `success/message/data.user`.
- Confirmei que `POST /api/auth/login` permanece em `src/routes/auth.js`, sem depender da rota legacy.
- Confirmei que `POST /api/auth/register` permanece em `src/routes/auth.js`, sem depender da rota legacy.
- Executei build e testes obrigatorios na raiz do repositorio.
- Executei validacao isolada com `supertest`, token Bearer sintetico e mocks locais para `GET /api/user/user-complete-data` e `GET /api/user/profile`. O token nao foi impresso.

## Comandos executados e resultados

```bash
npm run build
```

Resultado: **PASSOU**. `prisma generate` concluiu com sucesso e gerou Prisma Client.

```bash
npm test -- --runInBand --forceExit
```

Resultado: **PASSOU**. `tests/auth.test.js` executou 13 testes com sucesso:

- `POST /api/auth/register`: 3/3 passou.
- `POST /api/auth/login`: 6/6 passou.
- `POST /api/auth/refresh`: 2/2 passou.
- `POST /api/auth/verify-email`: 2/2 passou.

Observacao: houve aviso informativo de dependencia `baseline-browser-mapping` desatualizada e logs de teste do servidor. Nao houve falha.

```bash
# Validacao isolada via node + supertest, sem persistir arquivo e sem imprimir token
GET /api/user/user-complete-data com Authorization: Bearer <token sintetico>
GET /api/user/profile com Authorization: Bearer <token sintetico>
```

Resultado: **PASSOU**.

- `GET /api/user/user-complete-data`: HTTP 200, `success=true`, response com `user_data.usuario`, `data.user` e `data.user_data.usuario`.
- `GET /api/user/profile`: HTTP 200, `success=true`, response com `data.user`.
- `prisma.user.findUnique` foi chamado 4 vezes no fluxo isolado: autenticacao + handler de cada endpoint.

## Evidencia sobre `/api/user/user-complete-data` com Bearer token

`src/server.js` monta `userRoutes` em `/api/user`. Em `src/routes/user.js`, `router.use(authenticateToken)` e aplicado antes de `router.get('/user-complete-data', ...)`.

Impacto de contrato:

- **Request:** exige `Authorization: Bearer <token>` como as demais rotas de usuario. Nao exige body.
- **Response:** retorna `success`, `message`, `user_data.usuario` e tambem aliases em `data.user` / `data.user_data.usuario` para compatibilidade.
- **Erro:** herda erros do middleware Bearer (`TOKEN_REQUIRED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `ACCOUNT_DEACTIVATED`) e tem erros proprios `USER_NOT_FOUND` (404) e `INTERNAL_ERROR` (500).

Conclusao: a rota funciona com Bearer token e nao altera o contrato das rotas existentes.

## Impacto em `/api/user/profile`

Impacto de contrato:

- **Request:** inalterado, `GET` autenticado por Bearer, sem body.
- **Response:** inalterado, `success/message/data.user`.
- **Erro:** inalterado, usa os mesmos erros de autenticacao e `INTERNAL_ERROR` do handler.

Resultado: **sem quebra identificada**. A validacao isolada retornou HTTP 200 com `success=true`.

## Impacto em `/api/auth/login`

Impacto de contrato:

- **Request:** inalterado. Continua aceitando login por `email` ou `identificador`; CPF numerico de 11 digitos tambem e tratado como CPF.
- **Response:** inalterado. Sucesso retorna `success/message/data.user/data.token/data.refreshToken`.
- **Erro:** inalterado. Testes cobrem credenciais invalidas, conta inexistente e conta desativada.

Resultado: **sem quebra identificada**. Testes obrigatorios passaram para login por email, por CPF em `identificador`, por CPF no campo `email` e cenarios de erro.

## Impacto em `/api/auth/register`

Impacto de contrato:

- **Request:** inalterado. Continua validando dados obrigatorios de cadastro.
- **Response:** inalterado. Sucesso retorna HTTP 201 com `success/message/data.user`.
- **Erro:** inalterado. Testes cobrem dados invalidos e conflito de e-mail/CPF (`ACCOUNT_ALREADY_EXISTS`).

Resultado: **sem quebra identificada**. Testes obrigatorios passaram para cadastro com sucesso, validacao e duplicidade.

## Pendencias reais

- Nao ha teste versionado especifico para `GET /api/user/user-complete-data`; a evidencia deste ciclo veio de validacao isolada com `supertest`.
- A suite de testes inicia o servidor em `src/server.js` e depende de `--forceExit`; isso nao bloqueou a validacao, mas e uma melhoria tecnica futura para testes mais limpos.
- O aviso de `baseline-browser-mapping` desatualizado nao bloqueia backend.

## Aprovacao backend

**Aprovado.**

O backend esta pronto para o escopo validado: `GET /api/user/user-complete-data` funciona com Bearer token, e nao foi identificada quebra em `/api/user/profile`, `/api/auth/login` ou `/api/auth/register`. Nenhuma alteracao de contrato foi aplicada neste ciclo.

