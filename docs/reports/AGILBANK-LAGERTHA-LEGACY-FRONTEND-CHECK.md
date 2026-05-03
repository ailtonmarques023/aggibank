# AGILBANK - Lagertha Legacy Frontend Check

Data: 2026-05-01

## Escopo

Validacao frontend da tela bancaria legada publicada em `agilbank-frontend/public/banco/`, com foco em rotas de entrada, ausencia de referencias bloqueadas, endpoints de login/cadastro e build do `agilbank-frontend`.

Nao foram feitos commit, push, alteracoes em `.env` ou alteracoes de deploy.

## Arquivos revisados

- `agilbank-frontend/vercel.json`
- `agilbank-frontend/package.json`
- `agilbank-frontend/vite.config.js`
- Todos os 51 arquivos publicados em `agilbank-frontend/public/banco/`
- `agilbank-frontend/public/banco/index.html`
- `agilbank-frontend/public/banco/js/login.js`
- `agilbank-frontend/public/banco/js/formulario-conta.js`
- `agilbank-frontend/public/banco/js/userDataManager.js`
- `agilbank-frontend/public/banco/pages/formularioCadastrodeConta.html`
- Artefatos gerados pelo build em `agilbank-frontend/dist/banco/`

## Validacoes feitas

- Verificada a pasta `agilbank-frontend/public/banco/`.
- Verificada a ausencia de `gov.br`, `govbr`, `localhost`, `127.0.0.1` e `/auth/me` nos arquivos publicados.
- Verificado que `agilbank-frontend/vercel.json` reescreve `/` para `/banco/index.html`.
- Verificado que `agilbank-frontend/vercel.json` reescreve `/banco` para `/banco/index.html`.
- Verificado que `agilbank-frontend/public/banco/index.html` existe.
- Verificado que `npm run build` gera `agilbank-frontend/dist/banco/index.html`.
- Verificado que o login envia para `https://aggibank-production.up.railway.app/api/auth/login`.
- Verificado que o cadastro principal envia para `https://aggibank-production.up.railway.app/api/auth/register`.
- Corrigido o formulario separado publicado em `js/formulario-conta.js`, que ainda apontava para `https://aggibank-production.up.railway.app/api/usuarios/criar`, para usar `https://aggibank-production.up.railway.app/api/auth/register`.
- Removidos logs diretos de valores sensiveis nos trechos alterados ou revisados criticamente.

## Evidencia de ausencia de referencias bloqueadas

Busca executada sobre `agilbank-frontend/public/banco/` para:

- `gov.br`
- `govbr`
- `localhost`
- `127.0.0.1`
- `/auth/me`

Resultado: nenhuma ocorrencia encontrada nos arquivos publicados.

Observacao: a mesma estrutura foi copiada pelo build para `agilbank-frontend/dist/banco/`, e `dist/banco/index.html` foi lido apos o build para confirmar a presenca do legado no artefato final.

## Rotas de entrada

`agilbank-frontend/vercel.json`:

- `/` -> `/banco/index.html`
- `/banco` -> `/banco/index.html`

Status: aprovado. As duas rotas esperadas apontam para a tela antiga.

## Endpoints Railway

Cadastro:

- `agilbank-frontend/public/banco/index.html` usa `https://aggibank-production.up.railway.app/api/auth/register`.
- `agilbank-frontend/public/banco/js/formulario-conta.js` foi alinhado para `https://aggibank-production.up.railway.app/api/auth/register`.

Login:

- `agilbank-frontend/public/banco/index.html` usa `https://aggibank-production.up.railway.app/api/auth/login`.
- `agilbank-frontend/public/banco/js/login.js` usa `this.apiBase = https://aggibank-production.up.railway.app/api` e envia para `${this.apiBase}/auth/login`, resultando em `https://aggibank-production.up.railway.app/api/auth/login`.

Status: aprovado. Nao ha retorno para `localhost`.

## Comandos executados

Comando:

```powershell
npm run build
```

Diretorio:

```text
C:\Users\gordi\concurso\agilbank-frontend
```

Resultado:

- Exit code: 0
- `vite v7.1.7 building for production`
- `762 modules transformed`
- `dist/index.html`
- `dist/assets/index-D3S4LcZ4.css`
- `dist/assets/index-DqQv9VqI.js`
- `built in 2.91s`

Avisos nao bloqueantes:

- `baseline-browser-mapping` desatualizado.
- `caniuse-lite` desatualizado.

## Correcoes pequenas aplicadas

- `agilbank-frontend/public/banco/js/formulario-conta.js`
  - Endpoint de cadastro alterado de `/api/usuarios/criar` para `/api/auth/register`.
  - Payload ajustado ao contrato existente de `POST /api/auth/register`: `nomeCompleto`, `email`, `cpf`, `telefone`, `dataNascimento`, `senha`, `endereco` e `dadosProfissionais`.
  - Removidos logs de dados completos e senha.
- `agilbank-frontend/public/banco/js/login.js`
  - Removidos logs que imprimiam senha ou valores dos campos de senha.
- `agilbank-frontend/public/banco/js/userDataManager.js`
  - Removidos logs de objeto completo de usuario.
- `agilbank-frontend/public/banco/index.html`
  - Removidos logs diretos de dados de login, token parcial, CPF e dados pessoais em trechos criticos.
- `agilbank-frontend/public/banco/pages/formularioCadastrodeConta.html`
  - Removidos logs diretos de CPF digitado e referencias de elementos de senha com potencial de expor valor.

## Pendencias reais

- O build emite avisos de dependencias auxiliares de browsers desatualizadas (`baseline-browser-mapping` e `caniuse-lite`). Nao bloqueia deploy.
- A tela legada ainda possui muitos scripts inline e codigo duplicado entre `index.html` e arquivos JS separados. Nao bloqueia a validacao atual, mas aumenta risco de manutencao.
- A validacao foi estatica e por build; nao foi feito teste real contra a API Railway com credenciais ou dados reais.

## Resultado frontend

Aprovado para subir online do ponto de vista desta validacao frontend.

Motivos:

- `/` e `/banco` apontam para a tela bancaria antiga.
- `public/banco/index.html` existe e `dist/banco/index.html` e gerado no build.
- Login e cadastro usam endpoints Railway esperados.
- Nao foram encontradas referencias bloqueadas nos arquivos publicados.
- `npm run build` finalizou com sucesso.
