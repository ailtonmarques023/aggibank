# AgilBank - Revisao Final Login por E-mail ou CPF (Ivar)

**Data:** 2026-05-01  
**Escopo:** revisao final apos alteracoes de Ragna (backend) e Lagertha (frontend) para login com e-mail cadastrado ou CPF cadastrado com 11 digitos, mantendo senha de 6 digitos.  
**Restricoes observadas:** sem commit, sem deploy, sem alteracao de env.

---

## Veredito

**Aprovado para commit/push/redeploy**, com a observacao operacional de que o redeploy deve seguir o fluxo normal do projeto e usar a configuracao ja existente de staging/demo.

Foram encontrados e corrigidos ajustes minimos de alinhamento no frontend/documentacao durante a revisao:

- `agilbank-frontend/src/services/authService.js` agora normaliza a resposta do backend sem mudar o contrato da API.
- `agilbank-frontend/src/pages/Login.jsx`, `agilbank-frontend/src/App-simple-working.jsx`, `agilbank-frontend/src/hooks/useAuth.jsx` e `agilbank-frontend/src/App-working.jsx` nao registram mais objeto de erro de login com risco de carregar CPF/senha em falhas de rede.
- `src/config/swagger.js` documenta o login com e-mail ou CPF, mantendo o campo `email` como compatibilidade e incluindo `identificador`.

---

## Arquivos revisados/alterados relevantes

### Backend

- `src/routes/auth.js`
- `src/middleware/validation.js`
- `src/config/swagger.js`
- `tests/auth.test.js`
- `prisma/schema.prisma`
- `prisma/migrations/20260501152812_init/migration.sql`

### Frontend

- `agilbank-frontend/src/main.jsx`
- `agilbank-frontend/src/App-simple-working.jsx`
- `agilbank-frontend/src/pages/Login.jsx`
- `agilbank-frontend/src/services/api.js`
- `agilbank-frontend/src/services/authService.js`
- `agilbank-frontend/src/hooks/useAuth.jsx`
- `agilbank-frontend/src/App-working.jsx`

---

## O que foi validado

- Login por e-mail continua coberto por teste backend e busca `prisma.user.findUnique({ where: { email } })`.
- Login por CPF funciona com `identificador` e tambem com CPF enviado no campo `email`, preservando compatibilidade com frontend existente.
- Senha errada retorna `401` com mensagem `Senha incorreta. Confira os 6 dígitos.`
- Conta inexistente retorna `401` com mensagem `Conta não encontrada. Abra sua conta AgilBank.`
- Senha segue validada como exatamente 6 digitos numericos.
- CPF de login segue validado como exatamente 11 digitos.
- O response de sucesso do backend permanece no formato existente: `success`, `message`, `data.user`, `data.token`, `data.refreshToken`.
- O frontend ativo (`agilbank-frontend/src/main.jsx`) usa `App-simple-working.jsx`, que usa `pages/Login.jsx` e `authService.login`.
- O frontend nao usa `localhost` nem `127.0.0.1`; `api.js` usa `import.meta.env.VITE_API_URL || '/api'`.
- Nao houve migration nova para esta tarefa; a pasta de migrations contem apenas a migration inicial existente e `migration_lock.toml`.
- Logs de validacao do backend redigem CPF/senha/token em erro de validacao.

---

## Contrato request/response/erros

### Request

O endpoint `POST /api/auth/login` aceita:

- `{ "email": "<email cadastrado>", "senha": "123456" }`
- `{ "email": "<cpf com 11 digitos>", "senha": "123456" }`
- `{ "identificador": "<email ou cpf>", "senha": "123456" }`

Impacto: expansao compativel do contrato. O campo `email` continua funcionando para e-mail e agora tambem aceita CPF de 11 digitos.

### Response

Sem quebra no response de sucesso. Backend continua retornando:

- `success: true`
- `message: "Login realizado com sucesso"`
- `data.user`
- `data.token`
- `data.refreshToken`

O frontend foi ajustado para ler corretamente `response.data.data` sem exigir mudanca no backend.

### Erros

O status e o `code` de credenciais invalidas permanecem `401` e `INVALID_CREDENTIALS`. As mensagens ficaram especificas, conforme a tarefa:

- Senha errada: `Senha incorreta. Confira os 6 dígitos.`
- Conta inexistente: `Conta não encontrada. Abra sua conta AgilBank.`

Impacto: frontend/backend estao alinhados pelas mensagens atuais. O `code` ainda e generico para os dois casos, mas isso nao bloqueia a tarefa porque o frontend usa a mensagem retornada como fallback.

---

## Comandos executados e resultados

### Backend

`npm test`

- Resultado: **passou**
- Evidencia: `PASS tests/auth.test.js`
- Testes: **13 passed, 13 total**
- Cobertura relevante:
  - login por e-mail com credenciais validas
  - login por CPF com `identificador`
  - login por CPF enviado no campo `email`
  - senha errada com mensagem correta
  - conta inexistente com mensagem correta

`npm run build`

- Resultado: **passou**
- Evidencia: `prisma generate` concluiu com Prisma Client gerado.

### Frontend

`npm run build` dentro de `agilbank-frontend`

- Resultado: **passou**
- Evidencia: Vite concluiu `✓ built`.
- Artefatos gerados pelo build: `dist/index.html`, `dist/assets/index-Cb5Ml4Xv.css`, `dist/assets/index-C64-RQo7.js` e source map.

### Observacoes de comandos

- Os comandos exibiram avisos de dependencias de dados de browsers/baseline desatualizados; nao bloquearam teste nem build.
- O `npm test` ainda encerra com aviso do Jest sobre handles abertos; nao falhou a suite.

---

## Migration/schema

Confirmado que `prisma/schema.prisma` ja possui `User.email @unique` e `User.cpf @unique`.

Nao foi criada migration para esta tarefa. A pasta `prisma/migrations` contem:

- `20260501152812_init/migration.sql`
- `migration_lock.toml`

Conclusao: **nao houve migration desnecessaria** para login por CPF/e-mail.

---

## Localhost no frontend

Busca em `agilbank-frontend` por `localhost` e `127.0.0.1`: **sem ocorrencias**.

O endpoint base do frontend permanece:

- `import.meta.env.VITE_API_URL || '/api'`

Conclusao: **nao voltou localhost no frontend**.

---

## Riscos/pendencias reais

- O `code` backend para senha errada e conta inexistente continua generico (`INVALID_CREDENTIALS`). As mensagens estao corretas e testadas, mas se o produto quiser diferenciacao programatica futura, sera melhor criar codes especificos com estrategia explicita de contrato.
- O build do frontend gera arquivos em `dist`; esses artefatos devem ser tratados conforme a politica do repositorio antes do commit.
- Existem avisos de browserslist/baseline desatualizados e aviso de Jest sobre handles abertos. Nao bloqueiam esta tarefa, mas merecem limpeza tecnica separada.

---

## Status final

**Aprovado por Ivar para commit/push/redeploy.**

Nao fiz commit, nao alterei deploy/env e nao expus CPF, senha ou tokens em logs novos.
