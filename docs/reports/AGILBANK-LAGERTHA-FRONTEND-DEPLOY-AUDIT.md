# AgilBank - Auditoria frontend deploy online (Lagertha)

**Data:** 2026-05-01  
**Escopo:** frontend `agilbank-frontend`, sem alteracao no backend e sem editar `.env` real.

## Conclusao

**Aprovado para redeploy do frontend**, desde que a variavel de ambiente de producao esteja configurada como:

```env
VITE_API_URL=https://URL-DO-BACKEND-RAILWAY/api
```

O frontend nao depende mais de `localhost`, `127.0.0.1` ou `:3001` para chamadas de API. A busca no diretorio `agilbank-frontend` nao retornou ocorrencias desses termos apos a correcao.

## Problema encontrado

O login do frontend ainda chamava diretamente:

```txt
http://localhost:3001/api/auth/login
```

Isso quebrava o login quando o frontend era aberto online, porque a requisicao tentava acessar o backend na maquina do usuario em vez do backend publicado.

Tambem havia fallback local em `src/services/api.js`, o que poderia mascarar falta de `VITE_API_URL` e manter dependencia indevida de ambiente local.

## Arquivos analisados

- `docs/AGILBANK-AGENTS-GUIDE.md`
- `docs/reports/AGILBANK-IVAR-FINAL-REAUDIT.md`
- `agilbank-frontend/src/services/api.js`
- `agilbank-frontend/src/pages/Login.jsx`
- `agilbank-frontend/package.json`
- `agilbank-frontend/env.example`
- `agilbank-frontend/src/main.jsx`
- `agilbank-frontend/src/App.jsx`
- `agilbank-frontend/src/App-simple-working.jsx`
- `agilbank-frontend/src/App-working.jsx`
- `agilbank-frontend/src/pages/Register/index.jsx`
- `agilbank-frontend/src/pages/Dashboard/index.jsx`
- `agilbank-frontend/src/pages/Transactions/index.jsx`
- `agilbank-frontend/src/hooks/useAuth.jsx`
- `agilbank-frontend/src/hooks/useApi.jsx`
- `agilbank-frontend/src/services/authService.js`
- `agilbank-frontend/src/services/accountService.js`
- `agilbank-frontend/src/services/transactionsService.js`
- `agilbank-frontend/README.md`
- `agilbank-frontend/SETUP.md`
- `agilbank-frontend/test.html`

## Arquivos alterados

- `agilbank-frontend/src/services/api.js`
- `agilbank-frontend/src/pages/Login.jsx`
- `agilbank-frontend/src/App-simple-working.jsx`
- `agilbank-frontend/src/App-working.jsx`
- `agilbank-frontend/env.example`
- `agilbank-frontend/README.md`
- `agilbank-frontend/SETUP.md`
- `agilbank-frontend/test.html`
- `docs/reports/AGILBANK-LAGERTHA-FRONTEND-DEPLOY-AUDIT.md`

## Chamadas localhost removidas

- `src/pages/Login.jsx`: removido `fetch('http://localhost:3001/api/auth/login')`; login agora usa `authService.login(...)`.
- `src/App-simple-working.jsx`: removido `fetch('http://localhost:3001/api/auth/login')`; fluxo agora usa `authService.login(...)`.
- `src/App-working.jsx`: removido `fetch('http://localhost:3001/api/auth/login')`; fluxo agora usa `authService.login(...)`.
- `src/services/api.js`: removido fallback `http://localhost:3001/api`; fallback atual e relativo (`/api`) quando `VITE_API_URL` nao estiver definido.
- `env.example`, `README.md`, `SETUP.md` e `test.html`: removidas referencias locais para evitar configuracao/documentacao apontando para backend local.

## Variavel correta para deploy

O frontend espera `VITE_API_URL`.

Valor correto em producao/staging:

```env
VITE_API_URL=https://URL-DO-BACKEND-RAILWAY/api
```

Como `VITE_API_URL` ja contem `/api`, as chamadas usam caminhos como `/auth/login`. Assim, o login resolve para:

```txt
https://URL-DO-BACKEND-RAILWAY/api/auth/login
```

Nao foi introduzido `/api/api`.

## Registro, Dashboard, Transactions, services e hooks

- `Register`: usa `useAuth.register` para cadastro e tem apenas `fetch` externo para ViaCEP (`https://viacep.com.br/ws/...`), nao para o backend AgilBank.
- `Dashboard`: usa `accountService` e `transactionsService`, ambos baseados no `api.js`.
- `Transactions`: usa `transactionsService`, baseado no `api.js`.
- `authService`, `accountService`, `transactionsService` e `useApi`: usam o cliente central `api.js`.
- `useAuth`: usa o cliente central `api.js` para login.

## Contrato avaliado

- **Request:** preservado. O login continua enviando `{ email, senha }` para `/auth/login`.
- **Response:** preservado. O frontend continua esperando `success`, `token`, `user` e `message`.
- **Erro:** preservado no formato esperado. Erros retornados pelo backend continuam lidos de `message` quando disponivel; falha de rede/configuracao exibe mensagem de conexao/configuracao.
- **Risco de quebra frontend/backend:** baixo. A mudanca troca apenas a origem da URL e centraliza a chamada no servico existente.

## Comandos e validacoes executadas

```bash
npm run build
```

Resultado final:

```txt
vite v7.1.7 building for production...
755 modules transformed.
dist/index.html                   0.47 kB
dist/assets/index-Cb5Ml4Xv.css   36.01 kB
dist/assets/index-Bw8tNzHH.js   309.67 kB
built in 2.59s
```

Tambem foi validado:

```txt
agilbank-frontend: sem ocorrencias de localhost, 127.0.0.1, :3001 ou http://localhost
src: sem fetch/axios hardcoded para backend local
ReadLints: sem erros nos arquivos de codigo alterados
```

Observacoes do build:

- Aviso nao bloqueante de `baseline-browser-mapping` desatualizado.
- Aviso nao bloqueante de `caniuse-lite`/Browserslist desatualizado.

## Pendencias reais

- Configurar `VITE_API_URL=https://URL-DO-BACKEND-RAILWAY/api` no provedor do frontend antes do redeploy.
- Confirmar CORS do backend permitindo a URL publica do frontend.
- Fazer smoke test online apos redeploy: abrir frontend, fazer login e validar carregamento do dashboard.

## Aprovacao

**Aprovado para commit/push/redeploy do frontend.**  
Nao houve alteracao de contrato de endpoint, payload ou response; a correcao removeu dependencia local e preservou o fluxo de login existente.
