# IVAR — Alinhamento API base Railway (wizard / user-complete-data)

Data: 2026-05-06  
Escopo: apenas base URL da API no legado `public/banco` (sem Redis, Prisma, cartão, readiness, banco).

## Diagnóstico confirmado (DevTools)

- Chamada observada: `http://127.0.0.1:3001/api/user/user-complete-data`
- API validada em produção: `https://aggibank-production.up.railway.app/api`
- Efeito: JWT emitido pela Railway + GET na porta local → falha de hidratação, "Erro ao carregar" no endereço.

## Causa exata

`agilbankApiBase.js` tratava `localhost` / `127.0.0.1` com fallback fixo para `http://<host>:<porta>/api` (porta padrão 3001). Com front Vite em `127.0.0.1:5173` e API só na Railway, login e `user-complete-data` deixavam de usar a mesma origem de API.

## Arquivo responsável (principal)

- `agilbank-frontend/public/banco/js/agilbankApiBase.js`

## Correção mínima

1. Em localhost: usar `localStorage`/`sessionStorage` `AGILBANK_API_BASE` se definido; senão **`https://aggibank-production.up.railway.app/api`**.
2. Alinhar fallbacks em `legacyApiClient.js`, `index.html` (PIX inline), `confirmar-email.html`.
3. Documentar em comentário: para backend local, `localStorage.setItem('AGILBANK_API_BASE','http://127.0.0.1:3001/api')` + reload.

## Arquivos alterados

- `agilbank-frontend/public/banco/js/agilbankApiBase.js`
- `agilbank-frontend/public/banco/js/legacyApiClient.js`
- `agilbank-frontend/public/banco/index.html`
- `agilbank-frontend/public/banco/confirmar-email.html`
- `agilbank-frontend/.env` (comentário)

## Evidência esperada (Network)

**Antes:** Request URL `http://127.0.0.1:3001/api/user/...`  
**Depois:** Request URL `https://aggibank-production.up.railway.app/api/user/user-complete-data` com `Authorization: Bearer ...` após login na mesma base.

## Documentos de governança citados

- `docs/PROJECT_DOCS_EQUIVALENCE.md`
- `docs/AGILBANK_PROJECT_RULES.md`
- Equivalentes API_CONTRACTS / UX_RULES conforme equivalência oficial.

## Status IVAR

**APROVADO** após validação no Network pelo time (chamadas apenas Railway para o teste atual).
