# Status da Migracao do Legado AgilBank

Data: 2026-05-03

## Regra de Comunicacao

Todas as proximas comunicacoes tecnicas entre Codex, Cursor, Ivar, Ragnar e Lagertha devem ser registradas neste arquivo ou em relatorios dentro de `docs/reports/`.

Antes de iniciar uma nova fase:

1. Ler este arquivo.
2. Ler `docs/reports/AGILBANK-RELATORIO-MIGRACAO-HTML-UNICO.md`.
3. Ler o diff atual.
4. Registrar plano resumido antes de editar.
5. Registrar validacoes depois de editar.

## Fase 1 - Base Legada

Status: concluida e aprovada por Ivar.

Entregas:

- `legacyAuthStore.js`
- `legacyApiClient.js`
- `legacyNavigation.js`
- Scripts carregados no `index.html`
- Gate inicial usando `AgilBank.auth.getToken()`
- `ocultarTodosContainers()` e `voltarParaPrincipal()` delegando para `AgilBank.nav`
- `window.onload =` substituido por `window.addEventListener('load', ...)`

Validacoes:

- `npm run build`: OK
- `onclick` sem funcao: OK
- `window.onload =`: zero ocorrencias

## Fase 2 - API/Storage Legado

Status: primeira fatia concluida e aprovada por Ivar.

Entregas:

- `openDynamicCardForm()` usando `AgilBank.auth.getToken()`
- `inicializarAplicacao()` aceitando `agilbank_token`, `govbr_token` e `token`
- `GET /health` migrado para `window.AgilBank.api.request('health', { auth: false })`

Validacoes:

- `npm run build`: OK
- `/health` nao aparece mais hardcoded com `127.0.0.1:5000`
- `onclick` sem funcao: OK
- `index.html`: sem erros de lint

## Pendencias Conhecidas

**`127.0.0.1:5000` / `localhost:5000` (codigo ativo, fora de `docs/`):** ver **Auditoria global — URLs legadas 5000 (2026-05-03)** no final deste arquivo.

Resumo:

- `agilbank-frontend/public/banco/index.html` — **zero** ocorrencias `127.0.0.1:5000` e **zero** `localhost:5000` (grep 2026-05-03); auth e recuperacao de senha via `AgilBank.api`.
- `agilbank-frontend/public/banco/js/login.js` — **migrado** para `AgilBank.api` (2026-05-03); ver **Execução — login.js (`AgilBank.api`)**.
- `agilbank-frontend/public/banco/js/userDataManager.js` — **migrado** para `AgilBank.api` + `GET user/profile` (2026-05-03); ver **Execução — userDataManager.js**.
- `agilbank-frontend/public/banco/js/cartao.js` — **migrado** para `AgilBank.api.request('cards', …)` (2026-05-03); ver **Execução — migração `cartao.js` (`AgilBank.api`)**.
- `agilbank-frontend/public/banco/js/formulario-conta.js` — **migrado** para `AgilBank.api.request('auth/register', { auth: false, …})` (2026-05-03); sem segunda chamada de e-mail; ver **Execução — migração `formulario-conta.js` (`AgilBank.api`)**.
- `src/**` — **zero** ocorrencias (backend 3001 nao referencia 5000 no codigo pesquisado).

**Documentacao / README:** podem citar `localhost:5000` como exemplo; **nao** contam como codigo de runtime.

Ainda existem leituras diretas de token para alinhar com `legacyAuthStore`.

## Convencoes

API base deve manter sufixo `/api`.

Storage/token aceitos:

- `agilbank_token`
- `govbr_token`
- `token`

User storage aceito:

- `agilbank_user`
- `govbr_user`

## Proxima Fase Proposta

Fase 2 segunda fatia:

- Mapear chamadas nao transacionais restantes em `index.html`.
- Migrar somente endpoints de usuario/configuracoes para `AgilBank.api`, se Ragnar confirmar contrato.
- Nao mexer em Pix transacional.
- Nao mexer em backend.
- Nao remover funcoes globais.
- Nao remover IDs.

## Registro de Atualizacao - 2026-05-03 12:03

Plano resumido executado:

- Criar este arquivo de status em `docs/reports/`.
- Registrar o estado aprovado das Fases 1 e 2.
- Registrar pendencias, convencoes e proxima fase proposta.
- Nao alterar codigo-fonte, backend, Pix, visual, IDs ou funcoes globais nesta atualizacao.

Validacoes desta atualizacao:

- `docs/reports/AGILBANK-RELATORIO-MIGRACAO-HTML-UNICO.md` lido antes da edicao.
- Diff atual lido antes da edicao.
- Alteracao limitada a documentacao em `docs/reports/AGILBANK-STATUS-MIGRACAO-LEGADO.md`.

## Plano Resumido - Fase 2 Segunda Fatia - 2026-05-03 12:09

Escopo aprovado para execucao:

- Migrar somente chamadas nao transacionais de usuario/configuracoes em `agilbank-frontend/public/banco/index.html`.
- Em `testarAPI()`, trocar token direto por `AgilBank.auth.getToken()` e trocar `GET user/user-complete-data` para `AgilBank.api.request('user/user-complete-data')`, mantendo metodo, headers, credentials e tratamento.
- Em `carregarPerfilUsuario()`, trocar token direto por `AgilBank.auth.getToken()` e trocar `GET user/user-complete-data` para `AgilBank.api.request('user/user-complete-data')`, sem alterar `atualizarInterfacePerfil(profile)`.
- Em `carregarConfiguracoes()`, migrar somente o `GET user/settings` para `AgilBank.api.request('user/settings')`, mantendo estrutura de dados.

Fora do escopo desta fatia:

- `salvarConfiguracoes()` / `PUT user/settings`.
- Chamadas ligadas a cartao/limite.
- Pix transacional.
- `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js`.
- Backend, visual, IDs, funcoes globais, payloads e separacao de telas.

## Registro de Execucao - Fase 2 Segunda Fatia - 2026-05-03 12:09

Status: executada e aprovada por Ivar para o recorte tecnico pedido, com ressalvas.

Alteracoes realizadas:

- `testarAPI()` passou a ler token por `window.AgilBank.auth.getToken()` com fallback legado e a chamar `window.AgilBank.api.request('user/user-complete-data')`.
- `carregarPerfilUsuario()` passou a ler token por `window.AgilBank.auth.getToken()` com fallback legado e a chamar `window.AgilBank.api.request('user/user-complete-data')`.
- `carregarConfiguracoes()` passou a ler token por `window.AgilBank.auth.getToken()` com fallback legado e a chamar `window.AgilBank.api.request('user/settings')` somente para o GET.
- Foram preservados metodo `GET`, headers, `credentials: 'include'` e tratamento atual das respostas.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: OK.
- Varredura de `onclick` sem funcao definida: OK, nenhuma funcao ausente.
- Busca por `window.onload =`: zero ocorrencias.
- Busca por `127.0.0.1:5000`: reduziu apenas nas chamadas migradas; permanecem referencias fora do escopo.
- Lint em `agilbank-frontend/public/banco/index.html`: sem erros.

Pendencias restantes:

- `salvarConfiguracoes()` / `PUT user/settings` ainda usa `http://127.0.0.1:5000/api/user/settings` e token direto `localStorage.getItem('govbr_token')`.
- Chamadas de cartao/limite ainda usam `user/user-complete-data` em `127.0.0.1:5000`, conforme restricao desta fatia.
- Fluxos de auth/reset/cadastro e arquivos `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js` continuam com referencias legadas.
- Ainda existem leituras diretas de token em pontos fora do escopo.

Ressalvas de Ragnar:

- A maior ressalva de contrato e a convivencia de duas bases: `AgilBank.api` usa `http://localhost:3001/api` por padrao, enquanto chamadas remanescentes usam `http://127.0.0.1:5000/api`.
- Se `localhost:3001` e `127.0.0.1:5000` nao forem o mesmo gateway com mesmo contrato e dados, pode haver leitura em uma API e escrita em outra.
- `credentials: 'include'` foi preservado, mas precisa ser validado contra CORS/cookies na base real configurada.
- `GET user/settings` foi migrado, mas `PUT user/settings` continua legado por decisao de escopo; isso evita mudar payload agora, mas mantem risco de divergencia futura.

Ressalvas de Lagertha:

- `carregarConfiguracoes()` parece estar pouco ou nada acionada pela UI atual; impacto regressivo imediato e baixo, mas deve ser testada quando voltar a ser chamada.
- A UI de perfil nao foi alterada; `atualizarInterfacePerfil(profile)` foi preservada.
- `verificarLoginExistente()` ainda usa `localStorage.getItem('govbr_token')` e pode divergir da politica nova de token em cenarios com apenas `agilbank_token` ou `token`.
- Falhas das chamadas migradas tendem a aparecer como dados padrao ou campos incompletos, nao como mudanca visual direta.

Ressalvas de Ivar:

- Ivar aprovou o recorte tecnico desta fatia: os GETs migrados usam `window.AgilBank.api.request(...)`, token via `getToken()` com fallback, `PUT user/settings` permaneceu legado, cartao/limite ficou fora, Pix transacional nao foi alterado nesta fatia e a documentacao foi atualizada.
- Ressalva alta: `AgilBank.api` usa `http://localhost:3001/api` por padrao enquanto chamadas remanescentes usam `http://127.0.0.1:5000/api`; Ragnar precisa garantir paridade de contrato/dados ou configurar gateway/base unica.
- Bloqueio de merge como "fatia limpa" se alteracoes em `login.js`, `authStorage.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js` ou backend entrarem no mesmo pacote desta fatia sem revisao explicita.

## Registro de Execucao - Fase 2 Terceira Fatia - 2026-05-03

Status: executada em recorte minimo.

Objetivo:

- Alinhar `verificarLoginExistente()` com a politica nova de token.
- Nao alterar API, Pix, cartao, backend, visual, IDs ou funcoes globais.

Alteracao realizada:

- `verificarLoginExistente()` deixou de depender somente de `localStorage.getItem('govbr_token')`.
- A funcao agora usa `window.AgilBank.auth.getToken()` com fallback para `getAuthToken()`, aceitando `agilbank_token`, `govbr_token` e `token`.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: OK.
- Varredura de `onclick` sem funcao definida: OK, nenhuma funcao ausente.
- Busca por `window.onload =`: zero ocorrencias.
- Busca por `127.0.0.1:5000`: sem mudanca esperada nesta fatia, permanecem referencias fora do escopo.

Pendencias restantes:

- `salvarConfiguracoes()` / `PUT user/settings` ainda usa `http://127.0.0.1:5000/api/user/settings` e token direto.
- Fluxos de auth/login/register/reset ainda usam referencias legadas.
- Chamadas de cartao/limite ainda usam `user/user-complete-data` em `127.0.0.1:5000`.
- Arquivos `login.js`, `userDataManager.js`, `cartao.js` e `formulario-conta.js` ainda precisam de fatias separadas.

## Auditoria Estrutural de IDs e Funcoes - 2026-05-03

Relatorio criado:

- `docs/reports/AGILBANK-AUDITORIA-ESTRUTURAL-IDS-FUNCOES.md`

Escopo:

- Auditar IDs duplicados, IDs referenciados mas inexistentes, funcao possivelmente ausente e arquivo referenciado inexistente.
- Nao editar codigo, visual, backend, IDs, funcoes globais ou JS.

Resumo dos achados:

- `valorLiberado`, `limiteProgressFill`, `numeroCartao`, `validadeCartao`, `titularCartao` sao necessarios, mas duplicados e perigosos para `getElementById`.
- `novaSenha`, `confirmarSenha` e `redefinirSenhaForm` pertencem ao fluxo de reset de senha e devem ficar ate refatoracao coordenada.
- `cartaoContainer` e usado no JS, mas nao existe como `id` no HTML; pode causar erro em fluxos que acessam `.style` diretamente.
- `vantagensContainer` e usado por `levarParaVantagens()`, mas nao existia como `id`; a funcao parecia sem caller ativo. Corrigido em 2026-05-03 (ver secao Correcao Estrutural `vantagensContainer`).
- `mostrarTermosCondicoes()` era chamada por `onclick`, mas a definicao estava apenas em `containerEmprestimo.js` (comentado). Corrigida em 2026-05-03 (ver secao `mostrarTermosCondicoes()`). O fechamento do modal `termosModaEmprestimo` foi corrigido na mesma linha de trabalho (ver secao Fechamento `termosModaEmprestimo`).
- `dynamic_card_form_conta_style.html` e referenciado por fluxos de cartao, mas nao foi encontrado no workspace.

Decisao Ivar:

- Corrigir primeiro `cartaoContainer`, depois `vantagensContainer`, `mostrarTermosCondicoes()`, IDs duplicados de limite/cartao, `btnBloquear`, destino do formulario de cartao e por ultimo `movimentacoesLista`.
- Nao remover nem renomear nada antes de teste manual por tela/fluxo.

## Plano Resumido - Correcao Estrutural `cartaoContainer` - 2026-05-03

Escopo aprovado para execucao:

- Corrigir somente o problema estrutural de `cartaoContainer` inexistente no DOM.
- Preservar visual, IDs existentes, funcoes globais, Pix, backend, API, endpoints e payloads.
- Nao alterar `login.js`, `userDataManager.js`, `cartao.js` ou `formulario-conta.js`.

Plano tecnico aprovado por Ivar:

- Em `agilbank-frontend/public/banco/index.html`, manter o nome legado `cartaoContainer`, mas fazer o handle JS apontar para `cartaoGerenciamentoContainer` quando `cartaoContainer` nao existir.
- Em `agilbank-frontend/public/banco/js/legacyNavigation.js`, alinhar a chave `cartao` para `cartaoGerenciamentoContainer`, que e o container real da tela de cartoes hoje.

Pareceres:

- Ragnar confirmou que a correcao nao depende de backend/API e nao altera endpoint, payload, response ou contrato de cartao.
- Lagertha confirmou que `cartaoGerenciamentoContainer` e a tela real atual para Cartoes no HTML legado.
- Ivar aprovou a correcao minima, com validacao obrigatoria de build, busca por `cartaoContainer`, `onclick` sem funcao ausente e carregamento de `/banco/index.html`.

## Registro de Execucao - Correcao Estrutural `cartaoContainer` - 2026-05-03

Status: executada e aprovada por Ivar, com ressalvas.

Alteracoes realizadas:

- Em `agilbank-frontend/public/banco/index.html`, o handle legado `cartaoContainer` passou a usar `document.getElementById('cartaoContainer') || cartaoGerenciamentoContainer`.
- Em `agilbank-frontend/public/banco/js/legacyNavigation.js`, a chave `cartao` passou a apontar para `cartaoGerenciamentoContainer`.
- Nenhum ID existente foi removido ou renomeado.
- Nenhuma funcao global foi removida.
- Nao houve alteracao de Pix, backend, API, endpoints, payloads, visual, `login.js`, `userDataManager.js`, `cartao.js` ou `formulario-conta.js`.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: OK.
- Busca por `cartaoContainer`: mostra alias novo e literais legados remanescentes em listas de fallback.
- Varredura de `onclick` sem funcao global ausente: OK.
- Busca por `window.onload =`: zero ocorrencias.
- Verificacao estatica de `/banco/index.html`: `public/banco/index.html` e `dist/banco/index.html` existem apos build.
- Lint em `index.html`, `legacyNavigation.js` e este status: sem erros.

Decisao Ivar:

- Aprovou a correcao minima.
- Ressalva: ainda existem literais `'cartaoContainer'` em listas de fallback, especialmente fluxos como `abrirPerfilSimples` / `abrirConfiguracoesSimples`; eles ficam como pendencia de UX e teste manual.
- Proxima correcao estrutural deve tratar esses literais remanescentes ou testar manualmente os fluxos antes de alterar.

## Plano Resumido - Literais `cartaoContainer` em Listas de Fallback - 2026-05-03

Escopo aprovado para execucao:

- Corrigir somente os literais remanescentes `'cartaoContainer'` em listas de navegacao/fallback dentro de `agilbank-frontend/public/banco/index.html`.
- Manter o alias `const cartaoContainer = document.getElementById('cartaoContainer') || cartaoGerenciamentoContainer`.
- Manter usos da variavel `cartaoContainer`.
- Nao criar novo container, nao remover IDs existentes, nao alterar visual, Pix, backend, API, endpoints, payloads, `login.js`, `userDataManager.js`, `cartao.js` ou `formulario-conta.js`.

Plano tecnico aprovado por Ivar:

- Trocar `'cartaoContainer'` por `'cartaoGerenciamentoContainer'` nas listas de fallback que ainda nao continham o container real.
- Remover `'cartaoContainer'` das listas que ja continham `'cartaoGerenciamentoContainer'`, onde o literal legado era no-op.

Pareceres:

- Ragnar confirmou que a alteracao e apenas DOM/frontend e nao depende de backend/API.
- Lagertha confirmou que as quatro listas de fallback devem apontar para `cartaoGerenciamentoContainer` e que duas listas de modal ja contem o id real.
- Ivar aprovou a mudanca por ser segura, sem impacto em contrato/API/Pix/backend, desde que limitada aos literais em listas.

## Registro de Execucao - Literais `cartaoContainer` em Listas de Fallback - 2026-05-03

Status: executada e aprovada por Ivar.

Alteracoes realizadas:

- Em `agilbank-frontend/public/banco/index.html`, quatro listas de fallback que usavam `'cartaoContainer'` passaram a usar `'cartaoGerenciamentoContainer'`.
- Em duas listas `elementsToHide` que ja continham `'cartaoGerenciamentoContainer'`, o literal redundante `'cartaoContainer'` foi removido.
- O alias `const cartaoContainer = document.getElementById('cartaoContainer') || cartaoGerenciamentoContainer` foi preservado.
- Usos da variavel `cartaoContainer` foram preservados.
- Nenhum container novo foi criado.
- Nenhum ID existente foi removido ou renomeado.
- Nenhuma funcao global foi removida.
- Nao houve alteracao de Pix, backend, API, endpoints, payloads, visual, `login.js`, `userDataManager.js`, `cartao.js` ou `formulario-conta.js`.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: OK.
- Busca por `cartaoContainer` em `agilbank-frontend/public/banco/index.html`: restam apenas o alias `getElementById('cartaoContainer')` e usos da variavel `cartaoContainer`; nao restam literais em listas de fallback.
- Varredura de `onclick` sem funcao global ausente: OK, nenhuma funcao ausente.
- Busca por `window.onload =`: zero ocorrencias.
- Lint em `agilbank-frontend/public/banco/index.html` e neste status: sem erros.

Decisao Ivar:

- Aprovou a correcao por estar alinhada ao DOM real (`cartaoGerenciamentoContainer`) e ao `legacyNavigation.js`.
- Confirmou que nao ha impacto em Pix, backend, API, endpoints, payloads, IDs existentes, funcoes globais ou visual.
- Ressalva: `ocultarTodosContainers()` ainda contem redundancia entre `cartaoContainer.style` e `cartaoGerenciamentoContainer.style`, mas isso nao e incorreto com o alias atual e ficou fora do escopo desta fatia.
- Pendencias antigas de API/token e referencias a `127.0.0.1:5000` permanecem fora desta correcao.

## Plano Resumido - Correcao Estrutural `vantagensContainer` - 2026-05-03

Escopo aprovado para execucao:

- Corrigir somente o problema estrutural de `vantagensContainer` referenciado em `levarParaVantagens()` sem `id` correspondente no HTML.
- Nao remover a funcao `levarParaVantagens()`.
- Nao alterar visual (CSS/layout), Pix, backend, API, endpoints, payloads.
- Nao renomear IDs existentes; apenas acrescentar `id` onde a secao ja existe.
- Nao mexer em `login.js`, `userDataManager.js`, `cartao.js` ou `formulario-conta.js`.

Auditoria (Lagertha):

- Uso unico de `vantagensContainer`: dentro de `levarParaVantagens()` em `agilbank-frontend/public/banco/index.html`.
- Secao visual real: `<div class="vantagens-container">` dentro de `id="creditoContainer"` (tela Crédito Pessoal).
- Callers: nenhum `onclick` nem outra referencia a `levarParaVantagens()` no workspace; funcao potencialmente inativa hoje, mas quebraria com `TypeError` se chamada.

Ragnar:

- Alteracao exclusivamente DOM/navegacao client-side; sem dependencia de backend/API.

Correcao minima proposta e aprovada por Ivar:

- Acrescentar `id="vantagensContainer"` ao elemento existente `.vantagens-container` (sem mudar classes nem estrutura).
- Em `levarParaVantagens()`, apos `ocultarTodosContainers()`, exibir `creditoContainer` com checagem de existencia antes de tocar em `vantagensContainer`, pois a secao de vantagens fica dentro do pai que `ocultarTodosContainers()` oculta; sem isso, apenas `vantagensContainer.style` nao tornaria a tela visivel.
- Usar `getElementById` com guards (`if (creditoEl)`, `if (vantagensEl)`) para evitar erro se o DOM mudar.

## Registro de Execucao - Correcao Estrutural `vantagensContainer` - 2026-05-03

Status: executada e aprovada por Ivar.

Alteracoes realizadas:

- `agilbank-frontend/public/banco/index.html`: `id="vantagensContainer"` adicionado ao bloco existente `.vantagens-container`.
- `levarParaVantagens()` atualizada para exibir `creditoContainer` e `vantagensContainer` com guards, preservando `ocultarTodosContainers()` e `mostrarAnimacaoGovBr()`.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: OK.
- Busca por `vantagensContainer`: aparece no markup (um id) e no `getElementById` da funcao.
- Busca por `levarParaVantagens`: unica definicao; sem callers adicionais no repo.
- Varredura de `onclick` sem funcao global ausente: OK.
- Busca por `window.onload =` em `public/banco`: zero ocorrencias.
- Lint em `index.html`: sem erros.

Decisao Ivar:

- Aprovou a correcao minima: alinha o JS ao DOM real, evita `null.style` se a funcao for invocada e garante que a tela de credito (onde estao as vantagens) fique visivel apos o hide global.
- Nao ha impacto em Pix, backend, API ou contratos HTTP.
- Ressalva: `levarParaVantagens()` segue sem caller no HTML atual; recomenda-se teste manual se algum fluxo externo passar a chama-la.

## Plano Resumido - `mostrarTermosCondicoes()` no script ativo - 2026-05-03

Escopo aprovado para execucao:

- Corrigir somente a funcao global `mostrarTermosCondicoes()` referenciada no `onclick` do fluxo de emprestimo em `agilbank-frontend/public/banco/index.html`, sem alterar markup, IDs, CSS, Pix, cartao, backend, API ou scripts externos listados como fora de escopo.

Auditoria (Lagertha):

- Callers: `onclick` no checkbox `aceitarTermos` e no link dos termos no mesmo bloco (~linhas 3227-3229).
- Modal real: `id="termosModaEmprestimo"` (classe `termos-modal-emprestimo`; CSS abre com `display: flex` como em `containerEmprestimo.js`).
- Definicao anterior apenas em `js/containerEmprestimo.js` (script comentado no `index.html`).
- `ContainerConfiguraçoes.js` expoe `fecharModalTermos()` para `modalTermosUso` (telas de configuracoes), nao para o modal de emprestimo. `fecharModalTermos1()` so existia em `containerEmprestimo.js` — fora desta fatia.

Ragnar:

- Apenas manipulacao de `style.display` no cliente; sem dependencia de backend/API.

Correcao minima (Ivar):

- Definir `mostrarTermosCondicoes()` no script principal do `index.html` como wrapper que localiza `termosModaEmprestimo` e define `display = 'flex'` se o elemento existir.

Comportamento:

- O trecho comentado em `containerEmprestimo.js` so abria o modal com checkbox ja marcado; o wrapper atual abre ao clicar para permitir leitura pelo link e elimina `ReferenceError`.

## Registro de Execucao - `mostrarTermosCondicoes()` - 2026-05-03

Status: executada e aprovada por Ivar.

Alteracoes:

- `agilbank-frontend/public/banco/index.html`: inclusao de `mostrarTermosCondicoes()` apos `solicitarEmprestimo()`.

Validacoes:

- `npm run build` em `agilbank-frontend`: OK.
- Busca por `mostrarTermosCondicoes`: uma definicao e dois `onclick` no mesmo arquivo.
- Termos/modais relacionados revisados (`termosModaEmprestimo`, `fecharModalTermos`, `fecharModalTermos1`, `modalTermosUso`, `termsModal`); sem mudanca nas funcoes de fechamento nesta fatia.
- Varredura de `onclick` sem funcao global ausente: OK.
- `window.onload =` em `public/banco`: zero.
- Lint em `index.html`: sem erros.

Decisao Ivar:

- Aprovou o wrapper: resolve `ReferenceError` no fluxo de termos do emprestimo sem alterar visual nem contratos.
- O fechamento do modal (X, Aceitar, Recusar) foi tratado na fatia seguinte; ver secao Fechamento `termosModaEmprestimo`.

## Plano Resumido - Fechamento `termosModaEmprestimo` - 2026-05-03

Escopo:

- Corrigir somente o fechamento do modal de termos de empréstimo `id="termosModaEmprestimo"` em `agilbank-frontend/public/banco/index.html`.
- Preservar `fecharModalTermos()` de `ContainerConfiguraçoes.js` ligada a `modalTermosUso` (onclick em configuracoes permanece inalterado).
- Nao alterar texto dos termos, layout/CSS, Pix, cartao, backend, API, arquivos proibidos, IDs ou remover funcoes globais existentes.

Mapeamento (Lagertha):

- `fecharModalTermos()`: definida em `js/ContainerConfiguraçoes.js` → fecha `modalTermosUso`. Callers no `index.html`: botoes do bloco configuracoes (~4904, ~4972). Tambem estava incorretamente nos botoes X e Recusar do modal de emprestimo (~3236, ~3277).
- `fecharModalTermos1()`: existia apenas em `containerEmprestimo.js` (nao carregado). Caller: botao Aceitar do modal de emprestimo (~3276).
- `termosModaEmprestimo`: markup do overlay de emprestimo; `modalTermosUso`: modal embutido na tela de configuracoes.

Ragnar:

- Somente manipulacao de `display` e checkbox no cliente; sem backend/API.

Correcao aprovada (Ivar):

- Introduzir `fecharModalTermos1()` no bloco de script apos `login.js`: esconde `termosModaEmprestimo` e marca `aceitarTermos` quando Aceitar.
- Introduzir `fecharModalTermosEmprestimo()` (fechar X) e `recusarModalTermosEmprestimo()` (Recusar: fecha e desmarca `aceitarTermos`).
- Ajustar apenas os dois `onclick` do modal de emprestimo que usavam `fecharModalTermos()` para as novas funcoes. `fecharModalTermos()` em configuracoes intocada.

## Registro de Execucao - Fechamento `termosModaEmprestimo` - 2026-05-03

Status: executada e aprovada por Ivar.

Alteracoes:

- `index.html`: `onclick` do X e de Recusar do modal de empréstimo passam a `fecharModalTermosEmprestimo()` e `recusarModalTermosEmprestimo()`.
- `index.html`: apos carregar `login.js`, definicao de `fecharModalTermos1()`, `fecharModalTermosEmprestimo()`, `recusarModalTermosEmprestimo()`.

Validacoes:

- `npm run build` em `agilbank-frontend`: OK.
- Busca por `fecharModalTermos`: definicao em `ContainerConfiguraçoes.js`; callers no `index.html` incluem apenas configuracoes (~4904, ~4972) e nao mais o modal de emprestimo.
- Busca por `fecharModalTermos1`: uma definicao ativa no `index.html` + onclick Aceitar do emprestimo.
- Busca por `termosModaEmprestimo` e `modalTermosUso`: sem alteracao de IDs ou texto.
- Varredura de `onclick` sem funcao global ausente: OK.
- `window.onload =` em `public/banco`: zero.
- Lint: sem erros nos arquivos tocados.

Decisao Ivar:

- Aprovou: elimina colisao entre fechamento de configuracoes e de emprestimo; `fecharModalTermos1` passa a existir no runtime correto.
- Nao foram reintroduzidos `alert()` do legado comentado (wrapper minimo).
- Ressalva: `containerEmprestimo.js` ainda contem funcoes mortas com os mesmos nomes; arquivo continua comentado no HTML.

## Auditoria - `valorLiberado` (somente mapeamento) - 2026-05-03

Escopo desta etapa: documentacao e decisao Ivar. Nenhuma alteracao de codigo nesta fase.

### Validacoes da auditoria

- Busca `id="valorLiberado"` em `agilbank-frontend/public/banco/index.html`: **8** ocorrencias.
- Busca `valorLiberado` no mesmo arquivo: **25** ocorrencias (inclui JS inline e comentarios proximos).
- Busca `valorLiberado` em `agilbank-frontend/public/banco/js/`: **2** arquivos (`cartao.js`, `containerEmprestimo.js`).

### Mapa das ocorrencias de `id="valorLiberado"` no HTML

| # | Linha (aprox.) | Container / tela | Contexto no DOM |
|---|----------------|------------------|-----------------|
| 1 | ~3093 | `emprestimoLiberado` dentro de `emprestimo` | Bloco `infoBoxs-Dados`: rotulo **"Crédito Disponivel"** (pos-score) |
| 2 | ~3139 | `emprestimoLiberado` | Secao **"Dados do Emprestimo"** / `emprestimo-liberado-content`: rotulo **"Valor Liberado:"** |
| 3 | ~4088 | `opcoesLimiteContainer` | Card "Seu Limite Atual" - valor principal (`div.limite-valor`) |
| 4 | ~4096 | `opcoesLimiteContainer` | Mesmo card - detalhes em `.limite-details` (segundo span) |
| 5 | ~4195 | `cartaoVirtualContainer` | Bloco limite: header "Limite Disponivel" (`span.limite-valor`) |
| 6 | ~4203 | `cartaoVirtualContainer` | `.limite-labels` - segundo span (total/disponivel na linha) |
| 7 | ~4277 | `cartaoFisicoContainer` | Igual virtual: header limite |
| 8 | ~4287 | `cartaoFisicoContainer` | `.limite-labels` - segundo span |

Observacao HTML: **oito elementos com o mesmo `id` invalida o modelo de ID unico**; o navegador tolera, mas `getElementById` retorna so o **primeiro** na arvore (no fluxo atual, o primeiro e o da tela **emprestimo liberado** ~3093).

### Uso em JavaScript (mapeamento)

**`agilbank-frontend/public/banco/index.html` (inline)**

| Trecho | Mecanismo | Comportamento | Origem dos dados (Ragnar) |
|--------|-----------|---------------|---------------------------|
| `atualizarInterfacePerfil` (~6525-6530) | `querySelectorAll('#valorLiberado')` + `forEach` | Escreve `limite_cartao` em **todos** os 8 nos | Perfil vindo de `GET user/user-complete-data` (via `carregarPerfilUsuario` / `AgilBank.api.request` conforme migracao) — campo `user_data.usuario.limite_cartao` / fallbacks no objeto `profile` |
| Bloco ~6652-6657 | idem | idem | `profile.limite_cartao` apos atualizar interface de perfil |
| `carregarDadosCartaoVirtual` (~7309-7314) | `querySelectorAll('#valorLiberado')` | Atualiza todos com limite do usuario | `fetch` legado `GET .../user/user-complete-data` (~7257) — `user_data.usuario.limite_cartao` |
| Mesma funcao (~7324-7328) | `cartaoVirtualContainer.querySelector('#valorLiberado')` | Atualiza **no maximo o primeiro** `#valorLiberado` dentro do virtual | Mesma fonte |
| `updateCardLimitEverywhere` (~10728-10734) | `querySelectorAll('#valorLiberado')` | Atualiza todos com `newLimit` | Parametro da funcao (chamada com dados ja carregados / `user_data`) |

**`agilbank-frontend/public/banco/js/cartao.js` (fora desta fase de edicao)**

| Linha ~211 | `getElementById('valorLiberado')` | So atinge o **primeiro** elemento no documento — hoje o bloco de **emprestimo liberado**, nao necessariamente o cartao em exibicao | Resposta de `POST /api/cards` (`result.limite`) em URL legada `127.0.0.1:5000` |

**`agilbank-frontend/public/banco/js/containerEmprestimo.js`**

| `atualizarValorLiberado` (~387-392) | `querySelectorAll('#valorLiberado')` + `formatMoney` | Atualiza todos (coerente com "espelhar" valor) se o script estivesse carregado | Parametro `valor` da funcao (fluxo emprestimo). **Arquivo comentado no `index.html`** — funcao morta no runtime atual salvo outra pagina incluir o script |

### Necessidade por contexto (Lagertha)

- **Emprestimo liberado (2 nos):** semanticamente **valor de credito/emprestimo** ou resumo; nao e o mesmo conceito que **limite de cartao**.
- **Opcoes de limite + cartoes (6 nos):** semanticamente **limite de cartao** (valor exibido em varios pontos do mesmo painel).
- **Conflito:** qualquer rotina que joga `limite_cartao` em `querySelectorAll('#valorLiberado')` **iguala emprestimo e limite de cartao** nas telas onde ambos existem no DOM (mesmo valor nos 8 pontos), o que pode ser **incorreto** para os dois primeiros nos se o negocio distinguir "valor liberado do emprestimo" de "limite do cartao".

### Riscos por ocorrencia (Ivar)

| Faixa / tela | Risco | Motivo |
|--------------|------|--------|
| Emprestimo `infoBoxs-Dados` + "Valor Liberado" | **Alto (semantico)** | Podem ser preenchidos com `limite_cartao` por engano; `cartao.js` com `getElementById` prioriza o primeiro `id`, reforcando escrita no emprestimo. |
| `opcoesLimiteContainer` (2 nos) | Medio | Duplicata no mesmo card: dois nos sempre iguais se `querySelectorAll` rodar — coerente entre si, mas fragil se um devesse mostrar "usado" e outro "total". |
| Cartao virtual / fisico (4 nos) | Medio | Duplicata por tela; `querySelectorAll` mantem consistencia, mas impede IDs unicos e confunde ferramentas/acessibilidade. |

### Ragnar (backend/API)

- **`limite_cartao`:** utilizado no cliente a partir de **`GET user/user-complete-data`** (e estruturas derivadas no perfil / `user_data`). Nao e obrigatorio mudar backend para **corrigir duplicidade de ID**; o problema e **modelo de DOM + JS**.
- Esta **auditoria nao exige** alteracao de endpoint, payload ou contrato; eventual fatia futura pode ser **100% frontend** (escopos/IDs), desde que o produto alinhe o significado de cada campo exibido.

### Proposta de correcao segura (nao executada; aguarda aprovacao)

1. **Separar semantica antes de codificar:** definir se os dois campos em `emprestimoLiberado` devem mostrar (a) limite de cartao, (b) valor do emprestimo liberado, ou (c) cada um um dado distinto da API.
2. **Fatia recomendada A — so `index.html`:** substituir atualizacoes globais `querySelectorAll('#valorLiberado')` por **consultas escopadas** (ex.: dentro de `#cartaoVirtualContainer`, `#cartaoFisicoContainer`, `#opcoesLimiteContainer`, `#emprestimoLiberado`) e, se necessario, **adicionar** `id` ou `data-*` **novos** nos nos de emprestimo **sem remover** os atuais na primeira PR (compatibilidade).
3. **Fatia B — `cartao.js`:** trocar `getElementById('valorLiberado')` por seletor **escopado ao container do fluxo de solicitacao de cartao** (quando houver root conhecido) ou alinhar com o mesmo mapa de IDs da fatia A. **Exclusao explicita desta fase de auditoria** para edicao; apenas planejado.
4. **`containerEmprestimo.js`:** se o script voltar a ser carregado, revisar `atualizarValorLiberado` junto com o mapa de IDs para nao reintroduzir escrita cega em 8 nos misturando dominios.

### Decisao Ivar (auditoria)

- **Mapa e riscos aprovados para registro.**
- **Proxima fase de correcao:** **bloqueada** ate plano explicito por tela (emprestimo vs limite cartao) e aceite de que **nao ha mudanca de contrato API** nesta linha de trabalho.
- **Condicoes para desbloquear:** checklist manual minimo (emprestimo liberado, opcoes de limite, cartao virtual/fisico, perfil carregado) e definicao se `querySelectorAll` atual e aceitavel ou se exige IDs unicos por contexto.
- **Nao executar** remocao/renomeacao de `valorLiberado` nem editar `cartao.js`/`login.js`/etc. sem nova ordem explicita.

## Plano tecnico - correcao `valorLiberado` por tela (somente planejamento) - 2026-05-03

Escopo: plano e decisoes documentais. **Nenhuma alteracao** de HTML, JS, backend, API ou payloads nesta entrega.

### Perguntas obrigatorias — decisao semantica proposta (produto + alinhamento backend)

| # | Pergunta | Decisao proposta | Fundamento |
|---|----------|------------------|------------|
| 1 | Os dois campos de emprestimo devem mostrar **valor de empréstimo liberado** ou **limite do cartao**? | **Valor relacionado ao empréstimo**, nao `limite_cartao`. (a) ~3093 "Crédito Disponivel" = **linha/resumo de credito da proposta** (p.ex. valor aprovado ou teto usado na simulacao). (b) ~3139 "Valor Liberado:" = **valor liberado/contratado do empréstimo** exibido naquela tela. | Rotulos e fluxo `emprestimoLiberado` referem emprestimo, nao produto cartao. |
| 2 | Os seis campos cartao/limite devem mostrar sempre `limite_cartao`? | **Sim**, para o **modelo de dados atual** do `GET /user/user-complete-data` principal: unico campo numerico consolidado exposto e `user_data.usuario.limite_cartao` (e alias `limiteCartao`). | Ver Ragnar abaixo: resposta Prisma atual nao inclui quebra usado/disponivel por cartao no mesmo endpoint. |
| 3 | Algum dos oito deveria mostrar **usado / total / disponivel** distintos? | **Curto prazo (sem mudar contrato):** manter **mesmo valor numerico** nos dois nos de cada par (header + segunda linha), como hoje quando o JS iguala tudo. **Evolucao futura:** separar "Usado" (ja ha texto estático em `.limite-labels`) via campo de API ou calculo local — **fora** da primeira fatia se exigir novo contrato. | Nao alterar copy/layout na primeira fatia. |
| 4 | Qual funcao deve atualizar **emprestimo**? | **Grupo A — empresitimo:** nova rotina dedicada (ex. `atualizarExibicaoEmprestimoLiberado(dados)`) chamada pelos fluxos que **calculam ou recebem** valor da proposta (`emprestimo_refatorado.js`, handlers de liberacao, ou estado em memoria apos simulacao). **`atualizarInterfacePerfil` nao** deve mais escrever nos nos de emprestimo quando estes tiverem ids/`data-*` proprios. | `limite_cartao` do usuario nao representa "valor liberado do empréstimo" no dominio de negocio. |
| 5 | Qual funcao deve atualizar **cartao/limite**? | **Grupo B — cartao/limite:** `atualizarInterfacePerfil`, bloco de limite em `carregarDadosCartaoVirtual` (apos alinhar base URL), `updateCardLimitEverywhere`, e qualquer outro que hoje usa `querySelectorAll('#valorLiberado')` **restrito** aos roots `#opcoesLimiteContainer`, `#cartaoVirtualContainer`, `#cartaoFisicoContainer`. | Elimina escrita cruzada no emprestimo. |

### Ragnar — contrato `GET /api/user/user-complete-data` (fonte: `src/routes/user.js`)

Resposta atual (Node/Prisma principal do repo):

- **`user_data.usuario.limite_cartao`** e **`limiteCartao`**: número derivado de `user.limiteCartao` no banco, ou **`null`** se ausente/não numérico (**sem** fallback `4300` desde 2026-05-03 — Fase 1 dados reais).
- **Campos presentes** relacionados a saldo: `saldo_atual` / `saldoAtual`; limites Pix: `limite_pix_diario`, `limite_pix_mensal`; **nao** ha, neste handler, array `emprestimos`, `valor_aprovado`, `valor_solicitado` ou "credito liberado" de empréstimo.
- O modelo Prisma possui `Emprestimo` com `valorAprovado`, etc., mas **nao** esta incluido na resposta deste endpoint hoje.

Consequencia para o plano **sem mudar API**:

- Preencher os **dois** nos de empréstimo com dados **reais** de contrato exije, em algum momento, **ampliar** o contrato de `user-complete-data` ou consumir **outro** endpoint de empréstimo — isso seria **nova fase** com revisao explicita de contrato (fora do recorte "so frontend").
- Ate la, a correcao estrutural (IDs escopados + JS) pode **parar de injetar `limite_cartao`** nos rotulos de empréstimo e usar **valores ja calculados no fluxo client-side** (simulacao/liberacao) ou placeholders, **sem** alterar texto visual.

Outro backend no monorepo (`gov.br1/...`) pode expor `emprestimos` em uma variante de `user-complete-data`; o dashboard legado migrado deve **assumir uma unica fonte** por ambiente — Ragnar deve validar qual base o **build atual** usa (3001 vs 5000) antes da implementacao.

### Lagertha — mapa de destino no frontend (sugestao)

**Compatibilidade:** na **primeira fatia de implementacao**, **manter** os oito `id="valorLiberado"` no HTML (nao remover) e **adicionar** em cada no:

- `data-agilbank-metric="limite-cartao"` nos **seis** nos do grupo cartao/limite, **ou**
- novos `id` unicos (preferivel para testes e acessibilidade futura), por exemplo:

| Tela | Elemento (papel) | ID sugerido (novo) |
|------|-------------------|-------------------|
| Emprestimo | Credito disponivel resumo | `emprestimoCreditoDisponivelValor` |
| Emprestimo | Valor liberado contrato | `emprestimoValorLiberadoValor` |
| Opcoes limite | Valor principal card | `limiteOpcoesValorPrincipal` |
| Opcoes limite | Detalhe / segunda linha | `limiteOpcoesValorDetalhe` |
| Cartao virtual | Header limite | `limiteCartaoVirtualHeader` |
| Cartao virtual | Segundo span labels | `limiteCartaoVirtualRodape` |
| Cartao fisico | Header limite | `limiteCartaoFisicoHeader` |
| Cartao fisico | Segundo span labels | `limiteCartaoFisicoRodape` |

O JS novo deve **preferir** os ids/`data-*` novos; opcionalmente, na mesma fatia, **espelhar** ainda em `valorLiberado` por compatibilidade com scripts nao migrados (decisao de duplicacao de texto — sem mudar layout).

**Funcoes — divisao de responsabilidade (apos implementacao)**

| Grupo | Funcoes que **devem** atualizar | Mecanismo |
|-------|---------------------------------|-----------|
| Emprestimo | `atualizarExibicaoEmprestimoLiberado` (+ chamadas desde fluxo emprestimo) | `getElementById` nos dois ids de emprestimo; **sem** `querySelectorAll('#valorLiberado')` global |
| Cartao/Limite | `atualizarInterfacePerfil`, `updateCardLimitEverywhere`, `carregarDadosCartaoVirtual` (trechos de limite) | `querySelectorAll` **dentro** de cada root de container **ou** lista explicita de novos ids |
| Legado comentado | `containerEmprestimo.js` `atualizarValorLiberado` | Rever se script for reativado; alinhar ao mapa novo |

### Arquivos candidatos a alteracao (somente na proxima fase executora)

1. **`agilbank-frontend/public/banco/index.html`** — acrescentar ids ou `data-*`; refatorar trechos inline listados na auditoria (`atualizarInterfacePerfil`, `carregarDadosCartaoVirtual`, `updateCardLimitEverywhere`).
2. **`agilbank-frontend/public/banco/js/emprestimo_refatorado.js`** (e/ou funcoes globais do fluxo emprestimo) — calcular/passar objeto para `atualizarExibicaoEmprestimoLiberado` quando nao houver campo em API.
3. **Futuro / fora do escopo imediato do usuario anterior:** `cartao.js` — substituir `getElementById('valorLiberado')` por alvo escopado ou novo id.
4. **Backend (opcional, fase separada):** enriquecer `user-complete-data` com ultimo emprestimo aprovado — **altera contrato**; exige parecer Ragnar + RULE-8.

### Riscos (Ivar, por tela)

| Tela | Risco | Mitigacao no plano |
|------|-------|---------------------|
| Emprestimo liberado | Campos vazios ou desatualizados se so remover injecao de `limite_cartao` sem fonte alternativa | Definir fonte: estado client-side do fluxo **ou** acordo para fase 2 de API |
| Perfil / dashboard | Regressao se algum codigo ainda assumir oito nos iguais | Testes manuais + busca por `valorLiberado` apos patch |
| Cartao virtual | `carregarDadosCartaoVirtual` ainda usa URL legada 5000 em trecho antigo | Alinhar base numa fatia de API (nao misturar com esta decisao semantica) |
| Duplicidade temporaria id antigo + novo | Dois valores divergirem se espelhamento mal feito | Uma funcao unica "write" por grupo ou teste de consistencia |

### Testes manuais obrigatorios (apos implementacao futura)

1. **Emprestimo liberado:** abrir tela com proposta liberada; conferir se "Credito Disponivel" e "Valor Liberado" refletem **fluxo de empréstimo**, nao limite de cartao (conferir contra regra de negocio / simulacao).
2. **Opcoes de limite:** valores consistentes entre os dois nos do card.
3. **Cartao virtual / fisico:** limite igual ao esperado de `limite_cartao` (ou dado de perfil); barra/progresso nao regressar.
4. **Configuracoes / perfil:** carregar perfil e confirmar que limite no header/componentes corretos **nao** some.
5. **Regressao:** buscar `querySelectorAll('#valorLiberado')` = zero em codigo ativo ou justificativa documentada.

### Decisao Ivar (planejamento)

- **Aprovado para registro** o plano semantico e a separacao **emprestimo vs limite_cartao**, alinhado ao contrato atual de `user-complete-data` (sem campos de emprestimo na resposta).
- **Proxima fase de implementacao:** **desbloqueada em principio** desde que: (1) **nao** altere textos nem CSS visivel; (2) **nao** altere contrato API nesta fatia (emprestimo via client-side ou IDs mortos ate API); (3) **nao** editar `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js` se o escopo aprovado continuar a exclui-los; (4) executar bateria de testes manuais acima.
- **Bloqueio:** qualquer mudanca que **exija** novos campos de API sem RFC/parecer Ragnar e aceite explicito de contrato.

## Plano Resumido - Fatia 1 correcao `valorLiberado` (somente `index.html`) - 2026-05-03

Escopo aprovado para execucao:

- Em `agilbank-frontend/public/banco/index.html`, separar semanticamente nos de **emprestimo** vs **cartao/limite** para que `limite_cartao` nao atualize os dois primeiros.
- Introduzir oito **IDs unicos** nos oito nos mapeados na auditoria; refatorar o JS inline ativo que usava `querySelectorAll('#valorLiberado')` para uma lista explicita / helper dos **seis** nos de limite.
- Preservar visual, classes, copy e layout; nao alterar Pix, backend, API, endpoints, payloads.
- Fora do escopo: `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js`, `containerEmprestimo.js`.

IDs novos aplicados:

- `emprestimoCreditoDisponivelValor`, `emprestimoValorLiberadoValor`
- `limiteOpcoesValorPrincipal`, `limiteOpcoesValorDetalhe`
- `limiteCartaoVirtualHeader`, `limiteCartaoVirtualRodape`
- `limiteCartaoFisicoHeader`, `limiteCartaoFisicoRodape`

## Registro de Execucao - Fatia 1 correcao `valorLiberado` - 2026-05-03

Status: **executada e aprovada por Ivar** para o recorte pedido, com decisao explicita sobre `id="valorLiberado"`.

Alteracoes realizadas (Lagertha):

- Markup: os oito elementos que antes repetiam `id="valorLiberado"` passaram a usar os oito IDs unicos listados acima; **texto inicial** permanece `R$ 0,00` onde ja era assim; nenhuma mudanca de classe, estilo inline nem estrutura ao redor.
- Helper `aplicarLimiteCartaoNosSeisElementos(textoFormatado)` no script principal: faz `getElementById` nos seis IDs de limite/cartao e define `textContent`.
- Substituicoes de escopo: `atualizarInterfacePerfil` (bloco `limite_cartao`), bloco `profile.limite_cartao` apos atualizar perfil, `carregarDadosCartaoVirtual` (quando `limiteDisponivel > 0`) e `updateCardLimitEverywhere` passaram a usar o helper em vez de `querySelectorAll('#valorLiberado')`.
- Os dois IDs de emprestimo **nao** sao atualizados por essas rotinas; nenhum dado novo de API foi inventado para preenchê-los nesta fatia.

Ragnar (contrato / API):

- **Nenhuma** alteracao de endpoint, request, response, payload ou erro; somente selecao de nos no DOM e formato de exibicao ja existente (`R$ ...` com virgula decimal, alinhado ao codigo anterior).

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: **OK**.
- Busca por `id="valorLiberado"` em `public/banco/index.html`: **zero** ocorrencias (ver decisao Ivar abaixo).
- Busca por cada um dos oito IDs novos no atributo `id=`: **uma** ocorrencia cada no HTML.
- Busca por `querySelectorAll('#valorLiberado')` em `public/banco/index.html`: **zero** ocorrencias (substituido pelo helper).
- Busca por `window.onload =` em `public/banco/index.html`: **zero** ocorrencias.
- Varredura de `onclick`: callees definidos em scripts externos continuam fora do escopo desta fatia; nenhuma alteracao nesta fatia em handlers; comportamento alinhado às auditorias anteriores.

Decisao Ivar:

- **Aprovado** o objetivo da fatia: parar de propagar `limite_cartao` para os rotulos de emprestimo liberado e usar IDs semanticamente corretos no limite/cartao.
- **Desvio formal registrado:** o pedido original pedia manter oito ocorrencias de `id="valorLiberado"` e acrescentar IDs novos; no HTML **valido** cada elemento so pode ter **um** `id`, portanto a implementacao **substituiu** o id duplicado pelos IDs unicos. Contar oito vezes `id="valorLiberado"` deixa de ser possivel sem violar o modelo de documento; a validacao correta passa a ser **oito nos distintos** com os oito novos IDs e **zero** `querySelectorAll` global no legado inline.
- **Bloqueio nao aplicado** a Pix, backend, API, scripts proibidos ou mudanca visual: nenhuma ocorreu nesta fatia.
- **Ressalva (historica):** na fatia 1, `cartao.js` ainda referia `getElementById('valorLiberado')`; **corrigido na fatia 2** (secao seguinte). `containerEmprestimo.js` permanece comentado no HTML.

Pendencias:

- Preencher `emprestimoCreditoDisponivelValor` e `emprestimoValorLiberadoValor` com dados reais quando houver fonte acordada (client-side do fluxo ou mudanca de contrato com parecer Ragnar).
- `cartao.js`: **corrigido na fatia 2** (ver secao seguinte). `containerEmprestimo.js` ainda contem `querySelectorAll('#valorLiberado')` com script comentado no HTML — fatia futura se reativar o arquivo.

## Plano Resumido - Fatia 2 `cartao.js` alinhado aos IDs de limite - 2026-05-03

Escopo aprovado para execucao:

- Corrigir somente a referencia morta `document.getElementById('valorLiberado')` em `agilbank-frontend/public/banco/js/cartao.js` apos sucesso do `POST /api/cards` (fluxo de solicitacao de cartao).
- Manter request, response e tratamento de erro inalterados.
- Atualizar os **seis** nos de limite/cartao com o mesmo texto formatado usado no `index.html` (`R$` + duas casas, virgula decimal), preferindo `window.aplicarLimiteCartaoNosSeisElementos` quando existir, com fallback pela mesma lista de IDs.
- Nao alterar PIX, backend, API, payloads, `login.js`, `userDataManager.js`, `formulario-conta.js`, IDs novos no HTML nem funcoes globais removidas.

## Registro de Execucao - Fatia 2 `cartao.js` - 2026-05-03

Status: **executada e aprovada por Ivar** para o recorte pedido.

Contexto (Lagertha):

- Trecho: apos `response.ok` em envio de `cardData`, o cliente guarda `result` e deve refletir `result.limite` na UI de **limite de cartao** (mesma semantica dos seis elementos do dashboard, nao emprestimo).

Alteracao realizada:

- Substituicao de `getElementById('valorLiberado')` por chamada condicional a `window.aplicarLimiteCartaoNosSeisElementos(textoLimite)` e, se ausente, loop seguro nos seis IDs (`limiteOpcoesValorPrincipal`, `limiteOpcoesValorDetalhe`, `limiteCartaoVirtualHeader`, `limiteCartaoVirtualRodape`, `limiteCartaoFisicoHeader`, `limiteCartaoFisicoRodape`) com `getElementById` e guard `if (el)`.

Ragnar (contrato / API):

- **Nenhuma** mudanca de endpoint, metodo, headers, corpo da requisicao, interpretacao de `result` ou contrato de `POST /api/cards`; apenas onde o valor ja existente `result.limite` e escrito no DOM.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: **OK**.
- Busca por `valorLiberado` em `public/banco/index.html`: **zero** ocorrencias.
- Busca por `valorLiberado` em `public/banco/js/cartao.js`: **zero** ocorrencias.
- Busca pelos oito IDs novos (`emprestimoCreditoDisponivelValor`, etc.) em `public/banco/index.html`: **uma** ocorrencia cada no markup (inalterado nesta fatia).
- Busca por `window.onload =` em `public/banco/index.html`: **zero** ocorrencias.
- Varredura de `onclick`: nenhuma alteracao nesta fatia; callees em scripts externos inalterados.
- Nota: `public/banco/js/containerEmprestimo.js` ainda contem `valorLiberado` (script nao carregado no HTML atual); **fora** do escopo desta correcao.

Decisao Ivar:

- **Aprovado:** escopo limitado a alvo DOM em `cartao.js`, com fallback defensivo e alinhamento ao helper global do `index.html` quando disponivel.
- **Bloqueio nao aplicado:** nenhuma mudanca de visual (classes/CSS), Pix, backend ou arquivos proibidos.
- **Ressalva:** formatacao exibida nos seis nos passa a usar o mesmo padrao `R$ …` do restante do app (antes uma linha usava `toLocaleString` sem prefixo `R$` sobre um id inexistente); comportamento efetivo na UI fica coerente com os demais atualizadores de limite.

## Auditoria `limiteProgressFill` (somente mapeamento) - 2026-05-03

Escopo desta etapa: documentacao, riscos e decisao Ivar. **Nenhuma alteracao** de codigo HTML/JS, backend, API, endpoints, payloads, renomeacao ou remocao de IDs.

### Validacoes da auditoria

- Busca por `id="limiteProgressFill"` em `agilbank-frontend/public/banco/index.html`: **4** ocorrencias.
- Busca por `limiteProgressFill` em `agilbank-frontend/public/banco/`: ocorrencias no HTML listadas abaixo + **1** em `js/containerEmprestimo.js` (script **nao** carregado no `index.html` atual).
- Busca por `querySelectorAll` / `querySelector('#limiteProgressFill')` em `public/banco`: **nenhuma**; uso via `getElementById` ou classe `.limite-progress-fill` escopada.

### Mapa das ocorrencias de `id="limiteProgressFill"` no DOM

Ordem de aparicao no HTML (define qual no ganha `getElementById` no runtime):

| # | Linha (aprox.) | Container / `id` ancestral | Tela / dominio |
|---|----------------|----------------------------|----------------|
| 1 | ~2153 | `div#limiteCartaoContainer` (`.limite-cartao-container`), dentro de `div#container` (area principal / saldo) | **Limite de cartao** — painel “Limite Cartao Disponivel” ao lado do fluxo principal |
| 2 | ~3286 | `div#emprestimoLiberado` (`.emprestimo-liberado`) | **Empréstimo liberado** — barra generica apos bloco de termos (semantica de fluxo de emprestimo, nao limite de cartao) |
| 3 | ~4199 | `div#cartaoVirtualContainer` > `.cartao-limite-info` | **Limite de cartao** — cartao virtual |
| 4 | ~4282 | `div#cartaoFisicoContainer` > `.cartao-limite-info` | **Limite de cartao** — cartao fisico |

Observacao: em `opcoesLimiteContainer` (~4091) a barra usa classe **`progress-fill`** dentro de `.limite-progress-bar`, **sem** `id="limiteProgressFill"` — evitar confundir com estas quatro.

### Uso em JavaScript (mapeamento)

**`agilbank-frontend/public/banco/index.html` (inline)**

| Funcao / trecho | Mecanismo | Alvo efetivo com ID duplicado | Origem do “usado” e do denominador |
|-----------------|-----------|----------------------------------|-------------------------------------|
| `updateCardLimitEverywhere(newLimit)` (~10676-10694) | `getElementById('limiteProgressFill')` junto com `limiteCartaoContainer`, `limiteValorHeader`, `limiteUsado`, `limiteTotal` | **Somente o primeiro no no documento** = barra do `#limiteCartaoContainer` (~2153) | `limiteUsadoValor` fixo **0**; denominador `newLimit` (parametro, tipicamente `limite_cartao` de dados em memoria / localStorage). `percentualUsado = (0 / newLimit) * 100` → **0%** salvo divisao por zero se `newLimit === 0`. |
| `updateRealTimeData()` (~10761-10767) | `getElementById('limiteProgressFill')` com `limiteUsado`, `limiteTotal` | **Mesmo primeiro no** (~2153) | `limiteTotal` de `GET user/user-complete-data` → `user_data.usuario.limite_cartao`; `limiteUsado` e `percentualUsado` fixos **0** no trecho atual. |
| `carregarDadosCartaoVirtual()` (~7327-7332) | `cartaoVirtualContainer.querySelector('.limite-progress-fill')` | **Correto:** apenas a barra **dentro** de `#cartaoVirtualContainer` | `limiteDisponivel` de `user_data.usuario.limite_cartao`; `limiteUsado` **0** → barra em 0%. |

**`agilbank-frontend/public/banco/js/containerEmprestimo.js` (fora do runtime padrao)**

| Trecho | Mecanismo | Intencao |
|--------|-----------|----------|
| Apos animacao de liberacao (~532-535) | `getElementById('limiteProgressFill')` | Definir largura **100%** na barra do fluxo de **emprestimo liberado**. Com `getElementById`, **na pratica atinge o primeiro** `limiteProgressFill` do documento (~2153), **nao** necessariamente a barra dentro de `#emprestimoLiberado`, salvo se o script fosse carregado com DOM onde o primeiro no difere — **bug potencial** se o script for reativado sem correcao. |

Nenhum uso em `cartao.js`, `login.js`, `userDataManager.js` ou `formulario-conta.js` encontrado nesta auditoria.

### Ragnar (backend / API)

- A **altura/largura percentual** da barra no codigo ativo depende de calculo **no cliente**: `(limiteUsado / limiteTotalOuDisponivel) * 100` (ou valor fixo 0 / 100 em trechos especificos).
- **`limiteTotal` / denominador** alinhado ao campo de perfil **`limite_cartao`** (ex.: `user_data.usuario.limite_cartao` em `user-complete-data`, ou `newLimit` propagado a partir do mesmo conceito).
- **Uso real do cartao** (“limite usado”) **nao** vem de um campo distinto explorado nestes trechos: permanece literal **0** ou comentario “por enquanto, sem uso”. Enriquecer a barra com dado real de “usado” **pode** exigir novo campo ou fonte na API — seria **outra fase** com revisao de contrato (RULE-8).
- **Esta auditoria nao exige** mudanca de backend nem de endpoint; o problema levantado e **DOM com ID duplicado + selecao pelo primeiro elemento**.

### Semantica por tela (Lagertha)

| Bloco | Representa limite de cartao? | Observacao |
|-------|------------------------------|------------|
| `limiteCartaoContainer` | Sim | Barra ligada a textos `limiteUsado` / `limiteTotal` / `limiteValorHeader`. |
| `cartaoVirtualContainer` / `cartaoFisicoContainer` | Sim | Mesmo padrao visual “limite disponivel”; atualizacao de largura correta hoje so garantida no virtual via `querySelector` no container. |
| `emprestimoLiberado` | **Nao** (emprestimo) | Barra decorativa/progresso da jornada de liberacao; `containerEmprestimo.js` espera 100% ao concluir animacao. |

### Riscos (Ivar)

| Risco | Detalhe |
|-------|---------|
| **Alto (comportamento)** | `getElementById('limiteProgressFill')` em `updateCardLimitEverywhere` e `updateRealTimeData` **só atualiza a barra do dashboard** (~2153). As barras duplicadas em **cartao virtual** (~4199) e **cartao fisico** (~4282) **nao** recebem essa escrita; a do virtual pode ser atualizada por `carregarDadosCartaoVirtual`, mas a do fisico **nao** tem trecho analogo nesta auditoria. |
| **Alto (semantico cruzado)** | Se `containerEmprestimo.js` for carregado, `getElementById` pode animar a **barra errada** (dashboard em vez de emprestimo liberado). |
| **Medio** | Com `limiteUsado === 0` em quase todos os fluxos, varias barras permanecem em 0% — mascara regressoes ate haver dado real de uso. |
| **Baixo** | `opcoesLimiteContainer` nao usa este ID; risco de confusao apenas humana entre barras. |

### Proposta para fase futura de implementacao (nao executada)

Liberada apenas apos plano **por tela** e aceite Ivar:

1. **IDs unicos adicionais** (sem remover os atuais nesta linha, se a politica for compatibilidade: na pratica HTML permite um `id` por elemento — a decisao de produto pode ser duplicar padrao da fatia `valorLiberado`: um id semantico por no, mais migracao de JS escopado).
2. **Ou** manter `id` legado onde necessario e **obrigar** atualizacoes via **container**: ex. `document.querySelector('#limiteCartaoContainer .limite-progress-fill')`, `#cartaoVirtualContainer .limite-progress-fill`, `#cartaoFisicoContainer .limite-progress-fill`, `#emprestimoLiberado .limite-progress-fill`.
3. **Helper** opcional: `aplicarPercentualLimiteCartaoNosContainers(pct)` que atualiza tres barras de cartao (dashboard, virtual, fisico) com a mesma regra, e funcao separada para barra de emprestimo.
4. Revalidar `containerEmprestimo.js` se o script voltar ao HTML.

### Decisao Ivar (auditoria)

- **Mapa e riscos aprovados para registro.**
- **Implementacao bloqueada** ate existir plano explicito **por tela** (dashboard vs virtual vs fisico vs emprestimo liberado), checklist manual e definicao se barra de emprestimo e cartao devem compartilhar mecanismo ou ficar isoladas.
- **Nenhuma mudanca de contrato API** requerida so por esta auditoria; evolucao da barra com “limite usado” real depende de decisao de dados (Ragnar / produto) em fase separada.

## Plano tecnico - correcao `limiteProgressFill` por tela (somente planejamento) - 2026-05-03

Escopo desta entrega: **decisao por tela**, plano de correcao futuro, arquivos candidatos, riscos, testes manuais e decisao Ivar. **Nenhuma** alteracao de codigo, HTML, JS, backend, API, endpoints ou payloads nesta fase.

### Perguntas obrigatorias — respostas propostas

| # | Pergunta | Decisao proposta | Fundamento |
|---|----------|------------------|------------|
| 1 | Dashboard, virtual e fisico devem usar a **mesma porcentagem** de limite de cartao? | **Sim**, enquanto os tres representarem o **mesmo conceito** (utilizacao do **limite de cartao** do usuario) e a regra de calculo for a mesma (`usado / total` com o mesmo numerador e denominador). | Mantem coerencia entre telas; espelha o comportamento desejado quando houver dado real de “usado”. |
| 2 | A barra de **emprestimo liberado** deve ser isolada? | **Sim.** Controlada **apenas** por fluxos de emprestimo (animacao, confirmacao, estado em memoria), **sem** `updateCardLimitEverywhere` / `updateRealTimeData` / helpers de limite de cartao. | Dominio de negocio distinto; evita que `getElementById` no primeiro no “pinte” o dashboard quando o fluxo quer a barra da tela de emprestimo. |
| 3 | Como tratar `limiteUsado` hoje (**0** fixo)? | **Curto prazo (sem mudar contrato):** manter **numerador 0** e percentual **0%** (ou tratar divisao por zero se limite for 0), **igual ao comportamento atual efetivo**. **Medio prazo:** se produto exigir barra proporcional a uso real, **ou** consumir campo/derivacao ja existente em alguma variante de API (ex. cartoes com `saldoUtilizado` em outro backend do monorepo), **ou** RFC com Ragnar (RULE-8). | Hoje nao ha `limite_usado` agregado no handler principal documentado em `src/routes/user.js` para `user-complete-data`. |
| 4 | Plano: **IDs unicos** ou **seletores escopados**? | **Recomendacao Lagertha (implementacao futura):** **priorizar seletores escopados por container** (`#limiteCartaoContainer .limite-progress-fill`, `#cartaoVirtualContainer ...`, `#cartaoFisicoContainer ...`, `#emprestimoLiberado ...`) para eliminar dependencia do primeiro `id` duplicado **sem** precisar renomear na primeira linha — **ou**, se a politica do projeto for a mesma da fatia `valorLiberado`, **substituir** os quatro `id="limiteProgressFill"` por **quatro IDs semanticos unicos** e migrar JS + eventual `containerEmprestimo.js`. **Nao executar agora.** | HTML valido exige um id por elemento; duplicata so “funciona” por acidente. Seletores escopados minimizam risco de tocar na barra errada na mesma PR de logica. |
| 5 | Qual **helper** atualiza barras de **cartao** sem tocar na de **emprestimo**? | Nome sugerido: `aplicarPercentualLimiteCartaoNosTresContainers(percentual)` (0–100), que atualiza **somente** as barras `.limite-progress-fill` dentro de `#limiteCartaoContainer`, `#cartaoVirtualContainer` e `#cartaoFisicoContainer`, com `style.width` e, se necessario, `style.background` alinhado ao trecho atual de `updateRealTimeData`. Barra de emprestimo: helper **separado**, ex. `aplicarPercentualBarraEmprestimoLiberado(percentual)`, escopado a `#emprestimoLiberado .limite-progress-fill`. | Um unico `getElementById('limiteProgressFill')` nao pode servir para quatro contextos; o helper de cartao **nao** deve incluir o root de emprestimo. |

### Ragnar — contrato e “limite usado”

- No handler **principal** referenciado no repo (`src/routes/user.js`, `GET .../user-complete-data`), o objeto `user_data.usuario` expoe **`limite_cartao`** (e alias `limiteCartao`) mas **nao** expoe um campo agregado **`limite_usado` / utilizado do cartao** para alimentar a barra.
- Em **outra** base do monorepo (`gov.br1/.../user.js`), a resposta pode incluir **cartoes** com `limite`, `saldoUtilizado` e `limite_disponivel` derivado — o frontend legado pode estar apontando para **uma** base por ambiente; a correcao de DOM **nao** resolve qual campo usar ate o gateway estar alinhado.
- **Correcao 100% frontend** e **suficiente** para: parar de usar `getElementById` duplicado, isolar barra de emprestimo e atualizar as tres barras de cartao com a **mesma regra atual** (percentual com numerador 0 ou valor ja calculado no cliente).
- **Nao** e obrigatorio mudar backend neste plano; introduzir percentual “verdadeiro” a partir de API **e** opcional e **exige** parecer de contrato se novos campos forem necessarios na mesma rota consumida pelo build.

### Lagertha — refino de estrategia (implementacao futura)

1. **Substituir** em `updateCardLimitEverywhere` e `updateRealTimeData` o par `getElementById('limiteProgressFill')` por chamada ao helper de **tres containers** (ou por tres querySelector escopados inline na mesma funcao, se nao quiser funcao global extra).
2. **Manter** `carregarDadosCartaoVirtual` usando root `#cartaoVirtualContainer` — ja escopado; alinhar formato de percentual com o helper para uma unica fonte de verdade.
3. **Implementar** no fluxo de emprestimo (inline ou `containerEmprestimo.js` se recarregado) apenas `aplicarPercentualBarraEmprestimoLiberado`, nunca o helper de cartao.
4. Se optar por **IDs unicos** numa fatia posterior: nomes sugestivos `limiteProgressFillDashboard`, `limiteProgressFillEmprestimoLiberado`, `limiteProgressFillCartaoVirtual`, `limiteProgressFillCartaoFisico` — **planejamento apenas**; alinhar com politica de nao remover acidentalmente consumidores.

### Arquivos que seriam alterados (futuro; nao nesta fase)

| Arquivo | Motivo |
|---------|--------|
| `agilbank-frontend/public/banco/index.html` | Definir helpers inline; ajustar `updateCardLimitEverywhere`, `updateRealTimeData`, `carregarDadosCartaoVirtual` (coerencia); **opcionalmente** markup com IDs unicos. |
| `agilbank-frontend/public/banco/js/containerEmprestimo.js` | Se o script voltar a ser incluido: trocar `getElementById('limiteProgressFill')` por escopo `#emprestimoLiberado`. |

**Fora do escopo** das proximas fatias se mantida a regra atual do projeto: `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js`, Pix, backend.

### Riscos

| Risco | Mitigacao no plano |
|-------|---------------------|
| Regressao visual (largura/cor da barra) | Nao alterar classes/CSS; apenas trocar **alvo** e centralizar logica de `width`/`background` no helper. |
| Barra fisica continuar desatualizada vs virtual | Helper deve incluir **explicitamente** `#cartaoFisicoContainer`. |
| Emprestimo dispara helper de cartao | Revisar todos os call sites apos grep por `limiteProgressFill` e por `.limite-progress-fill`. |
| Divisao por zero com limite 0 | Manter guard `if (newLimit > 0)` como hoje ou definir percentual 0. |

### Testes manuais obrigatorios (apos implementacao futura)

1. Dashboard: com `limite_cartao` > 0 carregado, abrir tela principal; barra do `#limiteCartaoContainer` reflete a mesma regra de percentual que antes (0% com usado 0).
2. Cartao virtual: abrir `#cartaoVirtualContainer`; barra acompanha a mesma logica; labels “Usado” / total coerentes com o codigo existente.
3. Cartao fisico: abrir `#cartaoFisicoContainer`; barra **e** atualizada quando o limite e propagado (hoje pode estar estagnada — o teste valida a correcao).
4. Emprestimo liberado: simular fluxo ate `#emprestimoLiberado`; barra de emprestimo muda **sem** alterar barras de cartao (teste de isolamento).
5. Regressao: busca por `getElementById('limiteProgressFill')` = **zero** ou justificativa documentada com escopo unico restante.

### Decisao Ivar (planejamento)

- **Aprovado para registro** o plano por tela: **tres barras de cartao compartilham a mesma regra de percentual**; **barra de emprestimo liberado isolada**; **sem mudanca de contrato API** na primeira fatia de implementacao que apenas corrige alvos DOM e helpers.
- **Proxima implementacao desbloqueada em principio** quando: checklist acima acordado; diff limitado aos arquivos listados; nenhuma alteracao de payload/request em rotas existentes; visual (classes, textos fixos) preservado.
- **Bloqueio:** misturar atualizacao de barra de emprestimo com `updateCardLimitEverywhere` sem helper separado; ou introduzir campo de API sem RFC Ragnar na mesma PR sem aviso explicito.

## Registro de Execucao - Fatia 1 correcao `limiteProgressFill` (`index.html`) - 2026-05-03

Status: **executada e aprovada por Ivar** para o recorte pedido.

Escopo cumprido:

- Helpers criados no script principal de `agilbank-frontend/public/banco/index.html`:
  - `aplicarPercentualLimiteCartaoNosTresContainers(percentual)` — atualiza apenas `.limite-progress-fill` dentro de `#limiteCartaoContainer`, `#cartaoVirtualContainer` e `#cartaoFisicoContainer`.
  - `aplicarPercentualBarraEmprestimoLiberado(percentual)` — atualiza apenas `.limite-progress-fill` dentro de `#emprestimoLiberado` (isolada da logica de cartao; **nenhum** caller novo nesta fatia — `containerEmprestimo.js` permanece fora do escopo).
- `updateCardLimitEverywhere`: removido `getElementById('limiteProgressFill')`; barra de cartao via helper dos tres containers. Condicao do `if` passou a exigir apenas `limiteCartaoContainer` + labels; **limite usado** segue **0** e percentual **0** quando `newLimit > 0` com mesma formula; se `newLimit === 0`, percentual **0** (evita `NaN` da divisao).
- `updateRealTimeData`: removido `getElementById('limiteProgressFill')` e aplicacao de `background` via JS; larguras via helper. O fill do dashboard mantem gradiente do **markup** inline existente; demais barras inalteradas em classes/CSS.
- `carregarDadosCartaoVirtual`: alinhado ao mesmo helper para os tres containers (mudanca minima; regra `limiteUsado` / percentual inalterada).

Ragnar:

- **Nenhuma** alteracao de endpoint, payload, response ou contrato HTTP.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: **OK**.
- `getElementById('limiteProgressFill')` em `public/banco/index.html`: **zero** ocorrencias.
- Busca por `limiteProgressFill` no mesmo arquivo: **apenas** os quatro `id=` duplicados no markup (inalterados nesta fatia; JS nao depende mais deles).
- Busca por `window.onload =` em `public/banco/index.html`: **zero**.
- Varredura de `onclick`: nenhuma alteracao nesta fatia.

Decisao Ivar:

- **Aprovado:** escopo limitado a `index.html`, alvos DOM corrigidos, cartao fisico incluido no helper, barra de emprestimo isolada em helper dedicado sem ser acionada pelos fluxos de limite de cartao.
- **Ressalva:** `aplicarPercentualBarraEmprestimoLiberado` fica **preparada** para fluxo de emprestimo; integracao com animacao legada em `containerEmprestimo.js` — **fatia futura**.
- **Ressalva:** `containerEmprestimo.js` ainda usa `getElementById('limiteProgressFill')` (fora do escopo); comportamento ao reativar o script permanece dependente de revisao.

## Registro de Execucao - IDs de cartao virtual/fisico (`numeroValidadeTitularBloquear`) - 2026-05-03

Status: **executada e aprovada por Ivar** para o recorte pedido.

Objetivo:

- Eliminar IDs duplicados entre `#cartaoVirtualContainer` e `#cartaoFisicoContainer` para numero, titular, validade e botao Bloquear; ajustar JS para mirar o cartao correto.

Alteracoes realizadas (Lagertha):

- `agilbank-frontend/public/banco/index.html` (apenas atributos `id` e argumentos em `onclick` de copiar; classes, textos e layout inalterados):
  - Virtual: `numeroCartaoVirtual`, `titularCartaoVirtual`, `validadeCartaoVirtual`, `btnBloquearCartaoVirtual`; `onclick="copiarDadosCartao('virtual')"`.
  - Fisico: `numeroCartaoFisico`, `titularCartaoFisico`, `validadeCartaoFisico`, `btnBloquearCartaoFisico`; `onclick="copiarDadosCartao('fisico')"`.
- `copiarDadosCartao(tipo)`: aceita `'virtual' | 'fisico'`; se omitido, **deteccao** por visibilidade de `#cartaoVirtualContainer` vs `#cartaoFisicoContainer` com fallback `Virtual`.
- `agilbank-frontend/public/banco/js/cartao.js`: `atualizarInformacoesCartao` preenche **ambos** os pares de nos (virtual e fisico) quando existirem, mantendo o mesmo dado mascarado em ambas as telas.

Ragnar:

- **Nenhuma** alteracao de endpoint, payload, response ou contrato HTTP.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: **OK**.
- IDs listados acima: **uma** ocorrencia cada no markup; **zero** ocorrencias remanescentes de `id="numeroCartao"`, `id="titularCartao"`, `id="validadeCartao"`, `id="btnBloquear"` no `public/banco/index.html`.
- Busca por `window.onload =` em `public/banco/index.html`: **zero**.
- `onclick` / funcoes globais: stubs `bloquearCartao` e demais inalterados em comportamento; `copiarDadosCartao` permanece global com assinatura estendida compativel com chamadas com string.
- Nota: outras duplicidades de ID no HTML (ex. historico `movimentacoesLista` / `limiteProgressFill`) **nao** fazem parte desta fatia.

Decisao Ivar:

- **Aprovado:** escopo DOM/frontend + `cartao.js` apenas para seletores; Pix, backend, API e visual (copy, classes, layout) preservados.
- **Bloqueio nao aplicado:** nenhuma mudanca fora do escopo identificada no diff.
- **Ressalva:** chamadas externas a `copiarDadosCartao()` sem argumento dependem da heuristica de visibilidade; telas com ambos os containers visiveis simultaneamente faz fallback para **virtual** — cenário a validar manualmente se ocorrer.

## Plano tecnico - proxima fase estrutural (somente auditoria/planejamento) - 2026-05-03

Escopo: **documentacao e decisao.** Nenhuma alteracao de codigo, HTML, JS, backend, API, visual ou remocao de IDs nesta entrega.

### Arquivos afetados em fases futuras (candidatos)

| Arquivo | Motivo |
|---------|--------|
| `agilbank-frontend/public/banco/index.html` | ~~Referencias `dynamic_card_form_conta_style.html`~~ **corrigidas em 2026-05-03**; IDs duplicados `movimentacoesLista` e `limiteProgressFill`; comentario de script `containerEmprestimo.js`. |
| Novo HTML ou rota (opcional) | Substituto real para formulario de cartao, **se** produto exigir pagina separada. |
| `agilbank-frontend/public/banco/js/containerEmprestimo.js` | Apenas **se** script for reativado: alinhar `getElementById('limiteProgressFill')`, `valorLiberado`, duplicatas. |

**Fora do escopo declarado das proximas fatias:** `login.js`, `userDataManager.js`, `formulario-conta.js`, Pix, backend.

---

### 1) `dynamic_card_form_conta_style.html`

**Lagertha (mapeamento):**

- **Arquivo no workspace:** **nao encontrado** (glob/search raiz do repo).
- **Estado apos fatia 2026-05-03:** ver **Registro de Execucao - fluxo interno (`dynamic_card`)** abaixo; **`index.html` nao referencia mais o arquivo.**
- **Historico (antes da correcao):** `openDynamicCardForm()` e `showTransporteCartao()` usavam `window.location.href = 'dynamic_card_form_conta_style.html'`.
- **Callers:** `onclick` em banner/cartao-container (~2212, ~2264), botao "Ver Cartao" (~3931), `cartaoLink` → `openDynamicCardForm` (~7091), `activateProposal` (~10182).

**Ragnar:**

- O redirecionamento e **apenas** navegacao client-side para arquivo estatico; **nao** define novo contrato nem chama endpoint por si. O **formulario/fluxo** que deveria existir nessa pagina poderia chamar APIs, mas **como o arquivo nao existe**, o fluxo atual tende a **404** ou pagina vazia no servidor — risco **100% frontend** de URL morta.
- **Dependencia de backend:** **nao** para a *linha* `location.href`; dependencia indireta **so** quando/ se a pagina destino existir e fizer `fetch`.

**Classificacao:**

- Referencia: **legada / quebrada** no estado do repo.
- **Nao remover** a navegacao sem **substituicao acordada** (fluxo inline SPA, outro `.html` existente, ou criacao da pagina).

**O que pode ser removido com seguranca:** **nada** nesta fase, sem decisao de produto sobre destino do pedido/ver cartao.

**Manter por compatibilidade:** manter *funcoes globais* `openDynamicCardForm` / `showTransporteCartao` ate haver UX definida; trocar **apenas** o alvo da URL em fatia dedicada.

---

### 2) IDs duplicados remanescentes

#### `movimentacoesLista`

- **Ocorrencias:** **2** em `index.html` — dentro de `#cartaoVirtualContainer` e `#cartaoFisicoContainer` (~4229, ~4312).
- **Consumo em JS (busca no repo):** **nenhum** `getElementById('movimentacoesLista')` nem referencia além do markup e documentacao.
- **Risco de remocao de `id`:** baixo **se** apenas renomearmos para IDs unicos sem remover o elemento; **nao** ha consumidor comprovado para o id legado.

#### `limiteProgressFill`

- **Ocorrencias:** **4** em `index.html` (~2153 `limiteCartaoContainer`, ~3286 `emprestimoLiberado`, ~4199 virtual, ~4282 fisico).
- **JS ativo em `index.html`:** ja usa `aplicarPercentualLimiteCartaoNosTresContainers` e `aplicarPercentualBarraEmprestimoLiberado` com **seletores por container** + classe `.limite-progress-fill`; **nao** depende de `getElementById('limiteProgressFill')` no codigo ativo do mesmo arquivo.
- **Compatibilidade com IDs duplicados:** **nao e necessaria** para o runtime atual do `index.html` apos a fatia de progress bars. Duplicata permanece **cosmetica / historica** e **invalida** no modelo HTML.
- **`containerEmprestimo.js`:** ainda contem `getElementById('limiteProgressFill')` — script **comentado** no HTML (~8220); se reativado, o bug do primeiro no volta.

**Conclusao Lagertha:** pode-se planejar **fatia futura** com **IDs unicos semanticos** (ou remocao de `id` duplicado deixando so classe + container), **desde que** ajustar `containerEmprestimo.js` na mesma ordem **ou** manter script desligado.

**Ivar:** **nao** remover atributos `id` sem grep de consumidores em **todo** o monorepo e testes manuais; renomeacao em fatia pequena e preferivel a remocao cega.

---

### 3) `containerEmprestimo.js` e runtime

**Estado atual:**

- Tag `<script src="js/containerEmprestimo.js">` esta **comentada** em `index.html`.
- Fluxo de emprestimo ativo usa `emprestimo_refatorado.js` (carregado) + markup/funcoes no `index.html`.

**Ragnar:**

- Trechos lidos do arquivo: logica **client-side** (formatacao, calculos de parcela, listeners em inputs); **sem** `fetch`/`/api/` encontrados no arquivo por busca rapida — **nao** ha dependencia **obrigatoria** de API para o arquivo existir como JS.

**Risco de reativacao:**

- **Medio:** qualquer `git` revert ou descomentar linha **sem** revisao reintroduz conflitos com IDs ja corrigidos (`valorLiberado`, `limiteProgressFill`, etc.) e possive **duplicatas** de funcoes globais (`voltarParaPrincipal`) versus definicoes no `index.html`.

**Classificacao:** **morto no runtime atual**; **legado** como arquivo em disco.

---

### O que **nao** remover nesta fase

- ~~Referencias `dynamic_card_form_conta_style.html` sem destino acordado.~~ Fluxo **corrigido** na fatia 2026-05-03 (ver registro de execucao).
- `id` duplicados sem fatia de substituicao e grep de consumidores.
- Comentario ou arquivo `containerEmprestimo.js` sem decisao de arquivamento versus migracao.

---

### Proxima **fatia executavel** pequena (sugestao Ivar)

**Opcao A (baixo risco, DOM):** renomear `movimentacoesLista` → `movimentacoesListaCartaoVirtual` e `movimentacoesListaCartaoFisico`; **zero** ajuste JS se grep confirmar ausencia de consumo; `npm run build`; teste visual das duas telas de cartao.

**~~Opcao B~~** **Concluida (2026-05-03):** fluxo `dynamic_card_form_conta_style.html` substituido por navegacao interna no `index.html` (ver registro de execucao).

**Opcao C (limiteProgressFill):** introduzir quatro IDs unicos + migrar `containerEmprestimo.js` **ou** declarar arquivo empresitimo antigo **nao suportado** e nao reativar script sem PR coordenada.

---

### Testes obrigatorios (apos qualquer implementacao futura)

1. Clicar em fluxos que chamam `openDynamicCardForm` e `showTransporteCartao` — destino correto, sem 404.
2. Cartao virtual e fisico: listas de movimentacoes e barras de limite coerentes.
3. Emprestimo: telas liberadas/score sem regressao; se `containerEmprestimo.js` voltar, smoke test completo.
4. `npm run build` e grep por IDs removidos/renomeados.

### Decisao Ivar (planejamento)

- **Mapa aprovado para registro.** Rota morta `dynamic_card_form_conta_style.html` **substituida por fluxo interno** na fatia 2026-05-03.
- **Bloqueio:** remover referencias ou IDs **sem** substituicao comprovada, prova de consumidor e plano fatiado.
- **Proxima execucao:** ver **Opcao A** / **Opcao C** acima.

## Registro de Execucao - fluxo interno (`dynamic_card_form`) - 2026-05-03

Status: **executada e aprovada por Ivar** para o recorte pedido.

**Objetivo:** eliminar navegacao quebrada para `dynamic_card_form_conta_style.html`; manter experiencia no dashboard `banco/index.html`.

**Alteracoes** (`agilbank-frontend/public/banco/index.html` apenas):

- `openDynamicCardForm()` — mantida checagem `window.AgilBank?.auth?.getToken?.() || getAuthToken()`; em caso de sucesso chama **`showCartaoGerenciamento()`** em vez de `location.href`.
- `showTransporteCartao()` — mesma checagem de token; em caso de sucesso chama **`showCartaoFisicoContainer()`** (tela do cartao fisico, alinhada ao botao "Ver Cartao" no bloco de gerenciamento/entrega).

**Callers preservados (nomes globais inalterados):** banner/cartao-container, `.cartao-link`, botao "Ver Cartao", `activateProposal` → continuam a usar as mesmas funcoes; apenas o destino interno mudou.

**Ragnar:** nenhuma alteracao de backend, endpoint, payload ou contrato.

**Validacoes:**

- `npm run build` em `agilbank-frontend`: **OK**.
- Busca por `dynamic_card_form_conta_style.html` no codigo-fonte do app: **zero** em `agilbank-frontend/public/banco/index.html`; referencias remanescentes apenas em `docs/reports/` (historico de auditoria).
- `window.onload =` em `public/banco/index.html`: **zero** (inalterado).
- `onclick` / stubs globais: sem remocao de funcoes; teste manual recomendado: banner "pedir cartao", tile cartao, link cartao, modal `activateProposal`, "Ver Cartao" no painel.

**Decisao Ivar:**

- **Aprovado:** fluxo nao abre mais URL inexistente; permanece SPA com containers existentes; visual e copy intocados.
- **Ressalva:** `showCartaoFisicoContainer` incorpora animacao/rolagem existente; se produto quiser "Ver Cartao" como virtual, revisar em fatia futura.

## Auditoria e plano - `showCartaoFisicoContainer` duplicada + `movimentacoesLista` (somente planejamento) - 2026-05-03

Escopo: **documentacao e decisao Ivar.** Nenhuma edicao de codigo, HTML, JS, backend, API ou visual nesta entrega.

### 1) Duas definicoes de `showCartaoFisicoContainer()`

**Local:** `agilbank-frontend/public/banco/index.html`, bloco de script principal (~7367-7382).

| # | Linhas (aprox.) | Conteudo |
|---|-----------------|----------|
| 1 | 7368-7374 | `function showCartaoFisicoContainer() { ocultarTodosContainers(); mostrarAnimacaoLogo02(() => { document.getElementById('cartaoFisicoContainer').style.display = 'block'; window.scrollTo(0, 0); }); }` |
| 2 | 7376-7382 | **Corpo identico** ao #1; comentario acima diz "mostrar o atencao e pagamento" mas o corpo abre `cartaoFisicoContainer`. |

**Comportamento em JavaScript:**

- Ambas sao **function declarations** no **mesmo** escopo (global do script inline).
- A **segunda** declaracao **substitui** a primeira na fase de parsing (mesmo nome no mesmo escopo).
- A primeira definicao e **codigo morto** / copia colada; o runtime efetivo e sempre a segunda.

**Callers mapeados (repo):**

- `showTransporteCartao()` (~5982) apos checagem de token.
- `onclick` no gerenciamento: botao "Desbloquear" do cartao fisico (~3916): `showCartaoFisicoContainer()`.
- **Nenhum** outro arquivo (`cartao.js`, etc.) referencia o nome por grep no workspace além do `index.html`.

**Plano de correcao pequena (futura):**

1. Remover **uma** das duas declaracoes, mantendo **uma unica** `function showCartaoFisicoContainer() { ... }` identica ao comportamento atual.
2. Corrigir o comentario erroneo ("atencao e pagamento") antes de `showAtecaoPagamento` (~7384) para nao colidir mentalmente com cartao fisico.
3. `npm run build`; smoke: "Ver Cartao", "Desbloquear" no grid, garantir que `#cartaoFisicoContainer` abre.

**Riscos:**

- **Baixo:** remocao de duplicata nao muda comportamento se a funcao mantida for identica.
- **Medio humano:** se alguem editar so o primeiro bloco no futuro, mudanca nao surtiria efeito hoje — consolidar elimina essa armadilha.

**Testes obrigatorios (apos execucao):**

1. A partir do painel `cartaoGerenciamentoContainer`, acionar cartao fisico ("Desbloquear").
2. Acionar "Ver Cartao" (`showTransporteCartao`).
3. Voltar com fluxos existentes (`voltarParaCartao`, etc.) sem erro de console.

**Decisao Ivar (planejamento):**

- **Mapa aprovado.** Duplicata e **legado seguro de remover** em fatia minima: **uma** funcao global preservada.
- **Bloqueio:** nao renomear a funcao global nem mudar corpo sem checklist acima; nao misturar com refator de `showAtecaoPagamento` na mesma PR sem revisao.

### 2) `movimentacoesLista` duplicado (virtual / fisico)

**Local:** `index.html` — `id="movimentacoesLista"` em ~4229 (`#cartaoVirtualContainer`) e ~4312 (`#cartaoFisicoContainer`).

**Consumo JS:** **nenhum** `getElementById('movimentacoesLista')` ou referencia além do markup (busca em `*.html` / `*.js` do repo).

**Plano de correcao pequena (futura):**

- Renomear para IDs unicos, ex.: `movimentacoesListaCartaoVirtual` e `movimentacoesListaCartaoFisico`.
- Sem mudanca de classe ou texto; apenas `id`.

**Riscos:** **baixissimo** (sem consumidor comprovado).

**Testes:** abrir telas virtual e fisico; lista visual inalterada.

**Decisao Ivar (planejamento):**

- **Aprovado para registro** como proxima fatia DOM de baixo risco, **apos** ou **junto** da deduplicacao de `showCartaoFisicoContainer` em PRs separados se preferir diff minimo.

### Arquivos afetados (futuro)

| Arquivo | Mudanca prevista |
|---------|------------------|
| `agilbank-frontend/public/banco/index.html` | Remover uma `showCartaoFisicoContainer`; opcional ajuste de comentario; renomear ids `movimentacoesLista` (2x). |

**Fora do escopo:** `login.js`, `userDataManager.js`, `formulario-conta.js`, Pix, backend, API.

## Registro de Execucao - deduplicacao `showCartaoFisicoContainer` + IDs `movimentacoesLista` - 2026-05-03

Status: **executada e aprovada por Ivar** para o recorte pedido.

Alteracoes (`agilbank-frontend/public/banco/index.html` apenas):

- Removida a **segunda** declaracao identica de `function showCartaoFisicoContainer()` e o comentario incorreto imediatamente acima dela ("atencao e pagamento" aplicado por engano ao bloco duplicado). Mantidos corpo e comentario "//Função para mostrar o cartão físico" na definicao unica.
- `id="movimentacoesLista"` no cartao virtual → `id="movimentacoesListaCartaoVirtual"`; no cartao fisico → `id="movimentacoesListaCartaoFisico"`. Classes, textos e layout inalterados.

Ragnar:

- **Nenhuma** alteracao de backend, API, endpoints ou payloads.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: **OK**.
- Busca por `function showCartaoFisicoContainer` em `public/banco/index.html`: **uma** definicao.
- Busca por `id="movimentacoesLista"` (id legado): **zero** ocorrencias.
- Busca por `movimentacoesListaCartaoVirtual` e `movimentacoesListaCartaoFisico` no atributo `id`: **uma** ocorrencia cada.
- `onclick` / funcoes globais: nenhuma remocao de funcao; `showCartaoFisicoContainer` permanece global com o mesmo comportamento.

Decisao Ivar:

- **Aprovado:** fatia DOM minima alinhada ao plano; sem impacto em Pix, visual (copy/CSS), arquivos proibidos ou contrato HTTP.
- **Ressalva:** se no futuro algum script passar a preencher movimentacoes por `getElementById`, deve usar os **novos** IDs.

## Plano tecnico - IDs unicos `limiteProgressFill` (somente planejamento) - 2026-05-03

Escopo: **auditoria e plano de execucao futura.** Nenhuma alteracao de codigo nesta entrega.

### Mapa das 4 ocorrencias `id="limiteProgressFill"` em `agilbank-frontend/public/banco/index.html`

| # | Linha (aprox.) | Container / contexto |
|---|----------------|----------------------|
| 1 | ~2153 | `#limiteCartaoContainer` — dashboard / limite ao lado do saldo |
| 2 | ~3286 | `#emprestimoLiberado` — fluxo emprestimo liberado |
| 3 | ~4199 | `#cartaoVirtualContainer` — barra de limite cartao virtual |
| 4 | ~4282 | `#cartaoFisicoContainer` — barra de limite cartao fisico |

Classes (`limite-progress-fill`), estilos inline existentes, textos e layout ao redor: **inalterados** na fatia prevista (apenas troca do valor do atributo `id`).

### JS ativo e helpers (Lagertha)

- **`getElementById('limiteProgressFill')`** em `public/banco/index.html`: **zero** ocorrencias (auditoria atual).
- **`aplicarPercentualLimiteCartaoNosTresContainers`:** para cada root em `['limiteCartaoContainer', 'cartaoVirtualContainer', 'cartaoFisicoContainer']`, usa `root.querySelector('.limite-progress-fill')` — **nao** depende do id duplicado.
- **`aplicarPercentualBarraEmprestimoLiberado`:** dentro de `#emprestimoLiberado`, `querySelector('.limite-progress-fill')` — **nao** depende do id duplicado.
- Chamadas: `updateCardLimitEverywhere`, `updateRealTimeData`, `carregarDadosCartaoVirtual` usam o helper dos tres containers.

**Conclusao:** o runtime atual **ja** e escopado por container + classe; os quatro `id` duplicados sao **redundantes** para a logica ativa, mas continuam **invalidos** no modelo HTML e confundem ferramentas e futuros `getElementById`.

### Risco `containerEmprestimo.js` (nao reativar nesta linha)

- Arquivo ainda contem `getElementById('limiteProgressFill')` (~532). Script **comentado** no `index.html`.
- Se alguem **reativar** o script **sem** PR: o codigo legado voltaria a mirar o **primeiro** id no documento — hoje quebraria de qualquer forma apos IDs unicos, a menos que o arquivo seja alinhado (fora do escopo; usuario pediu **nao** reativar).

### Ragnar (contrato / backend)

- Mudanca **exclusivamente** DOM + possivel ajuste de seletores no `index.html` nos helpers; **nenhum** endpoint, payload, response ou regra de negocio no servidor.

### Proposta de fatia executavel pequena (index.html apenas)

1. **Markup:** substituir os quatro `id="limiteProgressFill"` por:
   - `limiteProgressFillDashboard`
   - `limiteProgressFillEmprestimoLiberado`
   - `limiteProgressFillCartaoVirtual`
   - `limiteProgressFillCartaoFisico`
   (mapear cada um a linha/container da tabela acima.)

2. **Helpers (opcional mas recomendado para coerencia):** alterar `aplicarPercentualLimiteCartaoNosTresContainers` para aplicar `width` via `getElementById` nos tres IDs de cartao/dashboard (ou manter `querySelector('.limite-progress-fill')` — comportamento identico se um unico `.limite-progress-fill` por container). **Recomendacao:** usar os **tres IDs novos** explicitamente para o codigo espelhar o mapa e nao depender da classe so.
3. Alterar `aplicarPercentualBarraEmprestimoLiberado` para usar `getElementById('limiteProgressFillEmprestimoLiberado')` **ou** manter `querySelector` dentro de `#emprestimoLiberado` (comportamento inalterado).

4. **Nao** tocar: `cartao.js`, `login.js`, `userDataManager.js`, `formulario-conta.js`, `containerEmprestimo.js`, Pix, backend, API.

### Arquivos afetados (futuro)

| Arquivo | Mudanca |
|---------|---------|
| `agilbank-frontend/public/banco/index.html` | Quatro `id`; opcional refino dos dois helpers para `getElementById` nos novos nomes. |

### Riscos

| Risco | Mitigacao |
|-------|-----------|
| Regressao visual | Nao alterar `style`, classes nem estrutura; apenas `id`. |
| Script externo desconhecido usar `limiteProgressFill` | Grep monorepo antes do merge; hoje so `containerEmprestimo.js` (morto no runtime). |
| Dois `.limite-progress-fill` no mesmo container | Nao e o caso hoje; se surgir, priorizar ID explicito no helper. |

### Testes obrigatorios (apos execucao)

1. Dashboard: painel `#limiteCartaoContainer` com limite > 0; barra em 0% com `limiteUsado` 0.
2. Cartao virtual e fisico: mesma regra apos `updateCardLimitEverywhere` / `carregarDadosCartaoVirtual`.
3. Emprestimo liberado: barra nao e alterada pelos helpers de cartao (isolamento ja existente).
4. `npm run build`; grep `id="limiteProgressFill"` = **zero**; cada novo id **uma** vez.

### Decisao Ivar (planejamento)

- **Mapa e direcao aprovados para registro:** fatia **somente** `index.html`, sem mudanca visual/copy/CSS, sem reativar `containerEmprestimo.js`.
- **Bloqueio:** alterar `containerEmprestimo.js` ou backend na mesma PR sem ordem explicita; ou remover elementos de barra sem prova.
- **Execucao:** realizada — ver **Registro de Execucao - IDs unicos limiteProgressFill** abaixo.

## Registro de Execucao - IDs unicos `limiteProgressFill` - 2026-05-03

Status: **executada e aprovada por Ivar** para o recorte pedido.

Alteracoes (`agilbank-frontend/public/banco/index.html` apenas):

- `#limiteCartaoContainer`: `id="limiteProgressFillDashboard"`.
- `#emprestimoLiberado`: `id="limiteProgressFillEmprestimoLiberado"`.
- `#cartaoVirtualContainer`: `id="limiteProgressFillCartaoVirtual"`.
- `#cartaoFisicoContainer`: `id="limiteProgressFillCartaoFisico"`.
- Classes, estilos inline, textos e estrutura: **inalterados**.
- Helpers `aplicarPercentualLimiteCartaoNosTresContainers` e `aplicarPercentualBarraEmprestimoLiberado` **mantidos** com `querySelector('.limite-progress-fill')` escopado ao container — comportamento e regra de percentual inalterados.

Ragnar:

- **Nenhuma** alteracao de backend, API, endpoints ou payloads.

Validacoes executadas:

- `npm run build` em `agilbank-frontend`: **OK**.
- `id="limiteProgressFill"` em `public/banco/index.html`: **zero**.
- `getElementById('limiteProgressFill')` no mesmo arquivo: **zero**.
- Cada um dos quatro novos IDs no atributo `id`: **uma** ocorrencia.
- `onclick` / funcoes globais: nenhuma alteracao nesta fatia.

Decisao Ivar:

- **Aprovado:** HTML valido com IDs semanticos distintos; isolamento emprestimo vs cartao preservado pelos helpers existentes.
- **Ressalva:** `containerEmprestimo.js` continua com `getElementById('limiteProgressFill')` (fora do escopo, script nao carregado); reativacao exige alinhar ao id `limiteProgressFillEmprestimoLiberado` ou a `querySelector` escopado.

## Auditoria - `js/containerEmprestimo.js` (legado; somente planejamento) - 2026-05-03

Escopo: **documentacao e decisao.** Nenhuma edicao de codigo, reativacao de script, nem alteracao de `index.html` nesta entrega.

### Carregamento no runtime

- Em `agilbank-frontend/public/banco/index.html` (~8216): `<script src="js/containerEmprestimo.js">` esta **comentado**.
- **Conclusao:** arquivo **nao** participa do runtime atual do dashboard legado.

### Dependencia backend / API (Ragnar)

- Busca por `fetch`, `XMLHttpRequest`, `axios`, `127.0.0.1`, `localhost` em `containerEmprestimo.js`: **nenhuma ocorrencia**.
- **Conclusao:** logica **100% cliente** (DOM, `alert`, timers, `formatMoney` local); **nao** ha contrato HTTP obrigatorio neste arquivo.

### Referencias antigas / quebradas se reativado sem migracao

| Referencia | Uso no arquivo | Estado no DOM/JS atual |
|------------|----------------|-------------------------|
| `#valorLiberado` | `atualizarValorLiberado` — `querySelectorAll('#valorLiberado')` | IDs substituidos no `index.html` por `emprestimoCreditoDisponivelValor` / `emprestimoValorLiberadoValor` e seis ids de limite de cartao; **nao** ha mais `valorLiberado` no HTML ativo. |
| `limiteProgressFill` | `getElementById('limiteProgressFill')` apos liberacao | Id legado removido; correto seria `limiteProgressFillEmprestimoLiberado` ou `aplicarPercentualBarraEmprestimoLiberado` no `index.html`. |
| `voltarParaPrincipal` | Definida no arquivo (~69); usada em `confirmarEmprestimo` | **Colisao:** mesma funcao global definida no `index.html` (~5868). Quem carrega por ultimo vence — risco de sobrescrita se script for incluido **antes** ou **depois** do bloco principal. |
| `mostrarTermosCondicoes` | Modal so se checkbox marcado; ids `aceitarTermos` / `termosModaEmprestimo` | **Colisao** com definicao no `index.html` (~5909); comportamento diferente (wrapper atual abre para leitura sem exigir checkbox na mesma regra). |
| `fecharModalTermos1` | Fecha modal + `alert` de boleto | **Colisao** com `fecharModalTermos1` no `index.html` (~8223) apos `login.js` — fluxo atual de emprestimo usa tambem `fecharModalTermosEmprestimo` / `recusarModalTermosEmprestimo`. |

### Funcoes globais duplicadas ou sobrepostas (Lagertha)

Funcoes declaradas em `containerEmprestimo.js` que **tambem** existem ou competem com o `index.html` / outros scripts carregados:

- `voltarParaPrincipal`, `mostrarTermosCondicoes`, `fecharModalTermos1` — **overlap** direto com `index.html`.
- `mostrarFormularioEmprestimo` — existe tambem em `emprestimo_refatorado.js` (**carregado**); runtime atual usa a versao do refatorado, nao a do `containerEmprestimo.js`.
- **`confirmarEmprestimo`:** declarada **duas vezes** no proprio `containerEmprestimo.js` (~551 e ~718); a segunda **sobrescreve** a primeira. Com script **desligado**, o `onclick` em `emprestimoLiberado` (~3292) chama `confirmarEmprestimo()` mas **nao** ha definicao ativa em `index.html` nem em `emprestimo_refatorado.js` (grep). **Gap:** botao pode gerar `ReferenceError` se usuario chegar na tela sem outro stub — **risco de UX** independente desta auditoria; correcao e **fatia futura** no `index.html` ou `emprestimo_refatorado.js`.

Outras globais no arquivo: `formatMoney`, `calcularParcela`, `liberacaoEmprestimo`, `fecharModalTermos`, `gerenciarEmprestimoConcedido`, etc. — potencial colisao se reativado.

### Classificacao proposta

1. **Legado morto / nao suportado no runtime atual:** **Sim** — script comentado; referencias DOM desatualizadas (`valorLiberado`, `limiteProgressFill`).
2. **Candidato a arquivamento documental:** **Sim** — mover para pasta tipo `public/banco/js/legacy/` ou marcar no topo do arquivo/README que **nao** carregar sem PR de migracao (sem executar agora, apenas recomendacao).
3. **Candidato a migracao futura:** **Somente** se produto quiser reintegrar fluxos especificos (ex. animacao `liberacaoEmprestimo`); exigiria alinhar IDs, remover duplicata interna de `confirmarEmprestimo`, eliminar sobrescrita de globais do `index.html` e integrar com `emprestimo_refatorado.js`.

### Riscos

| Risco | Severidade |
|-------|------------|
| Reativar script sem revisao | **Alto:** sobrescreve `voltarParaPrincipal` / termos; JS quebrado em `valorLiberado` / `limiteProgressFill`. |
| Manter arquivo na mesma pasta sem aviso | **Baixo:** desenvolvedor pode descomentar por engano. |
| `confirmarEmprestimo` ausente com script off | **Medio** na tela emprestimo liberado — ver gap acima. |

### Recomendacao (Ivar)

- **Manter desligado** no `index.html` ate haver **PR dedicada** de migracao ou arquivamento.
- **Nao** reativar `containerEmprestimo.js` na mesma linha de trabalho que correcoes pontuais de cartao/Pix.
- **Registrar** no repositorio (comentario no topo do arquivo ou doc) que o modulo e **nao suportado** e que o fluxo ativo e `emprestimo_refatorado.js` + inline `index.html`.

### Proxima fatia executavel segura (fora desta auditoria)

1. **Corrigir gap `confirmarEmprestimo`:** definir funcao global unica em `index.html` ou `emprestimo_refatorado.js` alinhada ao fluxo atual (sem recarregar `containerEmprestimo.js`).
2. **Opcional:** mover `containerEmprestimo.js` para `js/legacy/` e atualizar apenas comentario no `index.html` (sem reativar tag).
3. Se migracao for desejada: PR isolada que substitui referencias obsoletas, remove duplicata interna `confirmarEmprestimo`, e testa fluxo completo emprestimo liberado.

### Decisao Ivar (auditoria)

- **Aprovado para registro:** classificacao **1 + 2** (morto no runtime + candidato a arquivamento documental); **3** apenas com RFC de produto.
- **Bloqueio:** reativar script sem plano de colisao de globais e sem alinhar DOM/IDs.

## Auditoria - gap `confirmarEmprestimo()` no fluxo ativo (somente planejamento) - 2026-05-03

Escopo: **documentacao e decisao.** Nenhuma edicao de codigo nesta entrega.

### Callers

| Origem | Trecho |
|--------|--------|
| `agilbank-frontend/public/banco/index.html` | Botao **"Confirmar Empréstimo"** dentro de `#emprestimoLiberado` (~3292): `onclick="confirmarEmprestimo()"`. |

**Busca no workspace (`public/banco`):** unico caller e o acima; **nenhuma** outra referencia a nome `confirmarEmprestimo` fora de `containerEmprestimo.js` (morto).

### Definicao ativa (runtime)

| Fonte | `function confirmarEmprestimo` |
|-------|-------------------------------|
| `index.html` (scripts inline principais) | **Nao** encontrada. |
| `js/emprestimo_refatorado.js` (**carregado** ~8217) | **Nao** encontrada. |
| `js/containerEmprestimo.js` | **Duas** definicoes (~551 e ~718); segundo bloco **sobrescreve** o primeiro **se** o script fosse carregado. |
| Tag `containerEmprestimo.js` no `index.html` | **Comentada** (~8216) — **nao reativar** sem PR de migracao (ver auditoria anterior). |

**Conclusao:** com o carregamento atual, `confirmarEmprestimo` e **indefinida** no runtime → clique pode resultar em **`ReferenceError`**.

### Comportamento esperado (referencia legada, nao executada)

No `containerEmprestimo.js` existiam **duas** semanticas concorrentes:

1. **Primeira** (~551-568): ocultar `#emprestimoLiberado`, `alert` de sucesso, `voltarParaPrincipal()` — fluxo "confirmar e voltar ao dashboard".
2. **Segunda** (~718-723), que prevaleceria se o script rodasse: `ocultarTodosContainers()`, exibir `#emprestimoConcedidoContainer` — fluxo "ir para tela Empréstimo Concedido" (markup ja existe no `index.html` ~3301+).

A segunda **nao** chama `gerenciarEmprestimoConcedido()` (preenchimento de contrato/parcelas), que no legado e funcao separada (~677).

**Alinhamento com DOM atual:** o bloco `emprestimoConcedidoContainer` sugere que o produto pode desejar **navegar para a tela de concedido**; o botao "Voltar ao Início" ja cobre retorno ao dashboard sem passar por "Confirmar".

### Ragnar (backend / API)

- Nenhuma das versoes legadas chama `fetch` ou endpoint; sao **apenas** manipulacao de DOM + `alert` + navegacao entre containers.
- **Correcao minima** pode permanecer **100% client-side** ate existir contrato de confirmacao de emprestimo; **nao** e obrigatorio backend nesta fatia.

### Plano de execucao pequena (futuro; nao executado aqui)

**Opcao A — Stub seguro (Ivar):** em `index.html` ou `emprestimo_refatorado.js`, definir `function confirmarEmprestimo()` que: (1) esconde `#emprestimoLiberado`; (2) `alert` alinhado ao copy legado ou mensagem neutra; (3) chama `voltarParaPrincipal()` se existir. **Sem** novo endpoint.

**Opcao B — Tela concedido minima:** mesma assinatura global; `ocultarTodosContainers()` + exibir `#emprestimoConcedidoContainer` + preencher campos minimos a partir de elementos ja visiveis (`valorEmprestimo`, `valorParcela`, `numeroParcelas`) espelhando a logica de `gerenciarEmprestimoConcedido` **sem** copiar arquivo legado inteiro. **Sem** API.

**Opcao C — Wrapper:** `confirmarEmprestimo` delega para funcao nomeada em `emprestimo_refatorado.js` (ex. `confirmarEmprestimoRefatorado`) para manter organizacao; `index.html` mantem apenas `onclick` existente.

**Arquivos candidatos:** `index.html` e/ou `emprestimo_refatorado.js`. **Proibido** nesta linha: reativar `containerEmprestimo.js`, `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js`, backend.

### Riscos

| Risco | Mitigacao |
|-------|-----------|
| Escolher Opcao A quando produto quer Opcao B | Alinhar com UX copy da tela "Empréstimo Concedido". |
| Opcao B sem preencher IDs | Tela vazia; prever preenchimento minimo ou mensagem. |
| Duplicar globais | Uma unica definicao de `confirmarEmprestimo`; grep apos merge. |

### Testes obrigatorios (apos implementacao)

1. Fluxo ate `#emprestimoLiberado` visivel; clicar **Confirmar Empréstimo** — sem erro de console.
2. Verificar estado de containers apos clique (dashboard **ou** concedido, conforme opcao).
3. **Voltar ao Início** continua funcionando.
4. `npm run build`; busca por **uma** definicao `function confirmarEmprestimo` no(s) arquivo(s) escolhido(s).

### Decisao Ivar (planejamento)

- **Gap confirmado:** **aprovado para registro**; correcao **obrigatoria** antes de tratar fluxo de emprestimo como "pronto para demo".
- **Recomendacao inicial:** **Opcao A** se o objetivo e so eliminar `ReferenceError` com menor diff; **Opcao B** se a tela `emprestimoConcedidoContainer` for o fluxo desejado — decidir com produto em uma linha.
- **Bloqueio:** reativar `containerEmprestimo.js` para "consertar" o botao; introduzir chamada de API sem RFC Ragnar.

### Execucao — `confirmarEmprestimo` (Opcao B) — 2026-05-03

**Decisao de produto:** Opcao B (Ivar alinhado): apos "Confirmar Empréstimo", exibir `#emprestimoConcedidoContainer`; sem backend; sem reativar `containerEmprestimo.js`.

**Entrega:**

- `agilbank-frontend/public/banco/index.html`: uma funcao global `confirmarEmprestimo()` — guard se `#emprestimoConcedidoContainer` ausente; `ocultarTodosContainers()` se existir; garante `#emprestimoLiberado` visivel (pai do concedido no DOM); `display: block` no concedido; `window.scrollTo(0, 0)`; sem alteracao de copy/CSS/layout.

**Validacoes:**

- `npm run build` (em `agilbank-frontend`): **OK** (2026-05-03).
- `function confirmarEmprestimo` em `public/banco/index.html`: **uma** definicao (~5916).
- Tag `containerEmprestimo.js`: permanece **comentada** (~8235).
- `onclick="confirmarEmprestimo()"`: handler global definido; demais `onclick` — revisao continua conforme auditorias (sem escopo de correcao total nesta fatia).

---

## Auditoria `http://127.0.0.1:5000` — dashboard legado (somente mapeamento)

**Data:** 2026-05-03  
**Escopo:** `agilbank-frontend/public/banco/index.html`, `agilbank-frontend/public/banco/js/*.js`  
**Codigo:** nao alterado nesta auditoria.

### Ragnar — contrato e base esperada

- `legacyApiClient.js` define `DEFAULT_API_BASE = 'http://localhost:3001/api'` e `AgilBank.api.request(path, options)`, que monta URL via `buildUrl`, injeta `Authorization: Bearer` quando `auth !== false`, e repassa `method`, `body`, `headers` e `credentials` ao `fetch`.
- Caminhos devem ser **relativos ao sufixo `/api`** (ex.: `'user/user-complete-data'`, `'auth/login'`), salvo URL absoluta intencional.
- **Confirmacao:** migracoes que apenas trocam host de `127.0.0.1:5000` para a base `AgilBank.api` **preservam contrato** se path, metodo, JSON e headers adicionais forem mantidos; qualquer divergencia de resposta no backend em `3001` exige validacao explicita antes do merge.

### Lagertha — inventario e ordem sugerida de migracao (segura)

Ordem proposta: (1) **GET** somente leitura ja alinhadas ao mesmo contrato que `3001`; (2) **PUT/PATCH** de perfil/configuracao com checklist Ragnar; (3) **auth** (login/register/reset) em PR dedicado com testes de seguranca; (4) **cartao** e **formulario** nos arquivos ja listados como fora desta fatia; **Pix** — nao aplicavel (sem ocorrencias `5000`).

### Tabela de ocorrencias

| # | Arquivo | Linha (aprox.) | Endpoint | Metodo | Categoria | Pode usar `AgilBank.api.request`? | Fase / risco (Ivar) |
|---|---------|------------------|----------|--------|-----------|-----------------------------------|---------------------|
| 1 | `index.html` | ~6390 | `auth/login` | POST | Auth/login | Tecnicamente sim (path `auth/login`, `auth: false`) | **Bloqueado** sem plano: auth sensivel; alinhar token/storage com `legacyAuthStore` |
| 2 | `index.html` | ~6771 | `user/settings` | PUT | User/settings | Sim | **Futuro:** escrita transacional; confirmar contrato PUT com Ragnar; nao mudar payload |
| 3 | `index.html` | ~7298 | `user/user-complete-data` | GET | Cartao (limite virtual) | Sim (ja migrado em outras funcoes do mesmo arquivo) | **Risco medio:** afeta fluxo cartao; migrar junto ou apos fatia GET padronizada + testes de UI limite |
| 4 | `index.html` | ~9358 | `auth/register` | POST | Auth/register | `auth: false` | **Bloqueado** sem plano dedicado |
| 5 | `index.html` | ~9704 | `auth/forgot-password` | POST | Auth/login | `auth: false` | **Bloqueado** sem plano dedicado |
| 6 | `index.html` | ~9885 | `auth/verify-reset-token` | POST | Auth/login | `auth: false` | **Bloqueado** sem plano dedicado |
| 7 | `index.html` | ~9974 | `auth/reset-password` | POST | Auth/login | `auth: false` | **Bloqueado** sem plano dedicado |
| 8 | `index.html` | ~10281 | `user/user-complete-data` | GET | Cartao (modal Agil / limite) | Sim | Mesmo risco que #3 |
| 9 | `index.html` | ~10480 | `user/user-complete-data` | GET | Cartao (`forceUpdateLimitAfterApproval`) | Sim | Mesmo risco que #3 |
| 10 | `index.html` | ~10537 | `user/user-complete-data` | GET | Cartao (`checkAndShowLimit`) | Sim | Mesmo risco que #3 |
| 11 | `index.html` | ~10573 | `user/user-complete-data` | GET | Cartao (`getUserCardLimit`) | Sim | Mesmo risco que #3 |
| 12 | `index.html` | ~10773 | `user/user-complete-data` | GET | Cartao (`updateRealTimeData` limite) | Sim | Mesmo risco que #3 |
| 13 | `js/login.js` | ~6 | `apiBase` completo | — | Auth/login | Substituir por `AgilBank.api` ou base unica | **Fora desta fatia** (arquivo explicitamente congelado no pedido) |
| 14 | `js/userDataManager.js` | ~9 | `apiBase` | — | User/profile | Idem | **Fora desta fatia** |
| 15 | `js/cartao.js` | ~193, ~441 | `cards` | — | Cartao | Idem | **Fora desta fatia**; transacional/sensivel |
| 16 | `js/formulario-conta.js` | ~528 | `usuarios/criar` | POST | Formulario/conta | Sob validacao Ragnar | **Futuro**; **fora desta fatia** |
| 17 | `js/formulario-conta.js` | ~563 | `email/confirmacao` | — | Formulario/conta | Idem | **Futuro**; **fora desta fatia** |

**Categoria 6 (codigo morto / comentario):** nenhuma ocorrencia de `http://127.0.0.1:5000` encontrada **apenas** em comentarios nestes arquivos; todas as linhas acima sao codigo ativo.

**Ja migrado no mesmo `index.html` (referencia):** `health`, `GET user/user-complete-data` e `GET user/settings` em fluxos como `testarAPI` / `carregarPerfilUsuario` / `carregarConfiguracoes` usam `window.AgilBank.api.request` (~6253, ~6263, ~6312, ~6455 por grep). As linhas da tabela sao os **restantes** hardcoded.

### Proxima fatia executavel pequena (recomendada)

- **Escopo:** somente `index.html`, **GET** `user/user-complete-data` nas funcoes **cartao-adjacentes** (#3, #8–#12), trocando para `AgilBank.api.request('user/user-complete-data', { method: 'GET', credentials: 'include' })` **ou** equivalente ja usado em `carregarPerfilUsuario`, **sem** alterar parse de JSON, `user_data.usuario.limite_cartao`, nem textos de UI.
- **Explicitamente fora desta fatia:** `fazerLogin` e demais `auth/*`; `salvarConfiguracoes` PUT; `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js`; Pix; backend.

### Riscos

| Risco | Mitigacao |
|-------|-----------|
| Backend `3001` diverge do legado `5000` em formato de `user-complete-data` | Smoke test com token real antes do merge; comparar shape `user_data.usuario.limite_cartao` |
| Duplicar logica de token (`localStorage` vs `AgilBank.auth.getToken`) | Padronizar getter de token na mesma fatia que a troca de fetch |
| Migrar auth ou PUT settings sem RFC | Ivar: bloquear; manter escopo GET-only ate aprovacao |
| Regressao em modal Agil / limites | Testar `checkUserCardAndShowModal`, `checkAndShowLimit`, tela limite apos patch |

### Testes obrigatorios (apos eventual implementacao da fatia GET cartao)

1. `npm run build`
2. Login existente (React ou legado); abrir dashboard; confirmar limite e modal Agil quando aplicavel
3. Abrir cartao virtual / fluxos que chamam `carregarDadosCartaoVirtual`
4. `grep` em `public/banco/index.html`: zero `127.0.0.1:5000` nas linhas migradas (ou contagem reduzida conforme escopo)
5. Nao reintroduzir `containerEmprestimo.js`

### Decisao Ivar

- **Auditoria aceita** para registro; nenhuma migracao **auth** ou **PUT settings** nesta linha sem PR/plano separado e validacao Ragnar.
- **GET `user-complete-data`** no `index.html` fora do fluxo de Pix: **candidato** a proxima fatia pequena **desde que** nao mude payload/contrato e seja testado com `localhost:3001`.
- **`login.js` / `userDataManager.js` / `cartao.js` / `formulario-conta.js`:** manter congelados ate fase propria; **nao** tratar como “quick win” sem analise transacional.

### Execucao — migracao GET `user/user-complete-data` no `index.html` — 2026-05-03

**Decisao Ivar:** fatia **aprovada**: somente substituir **GET** hardcoded `http://127.0.0.1:5000/api/user/user-complete-data` por `window.AgilBank.api.request('user/user-complete-data', …)`; **sem** auth/login/register/reset, **sem** PUT `user/settings`, **sem** Pix, **sem** alterar payloads ou backend.

**Entrega:**

- `agilbank-frontend/public/banco/index.html`: seis pontos migrados — `carregarDadosCartaoVirtual`, `checkUserCardAndShowModal`, `forceUpdateLimitAfterApproval`, `checkAndShowLimit`, `getUserCardLimit`, `updateRealTimeData`.
- Padrao alinhado a `carregarPerfilUsuario` / `testarAPI`: `method: 'GET'`, `headers` com `Content-Type` e `Authorization: Bearer ${token}`, `credentials: 'include'`.
- Token: `window.AgilBank?.auth?.getToken?.() || getAuthToken()` nos blocos migrados (antes: em varios trechos apenas `localStorage.getItem('govbr_token')`).
- Parse JSON, uso de `user_data.usuario.limite_cartao`, ramos de erro e `.then/.catch` existentes preservados.

**Contagem `127.0.0.1:5000` em `public/banco/index.html`:** **6** ocorrencias restantes — `auth/login`, `auth/register`, `auth/forgot-password`, `auth/verify-reset-token`, `auth/reset-password`, `PUT user/settings` (intencionalmente ainda hardcoded).

**Validacoes:**

- `npm run build` (`agilbank-frontend`): **OK** (2026-05-03).
- `grep user-complete-data` + `127.0.0.1:5000`: **zero** URLs hardcoded para esse endpoint no `index.html`.
- `onclick`: nenhuma alteracao nesta fatia; handlers continuam no mesmo arquivo (amostra: `confirmarEmprestimo`, navegacao, Pix — sem remocao de globais).
- `containerEmprestimo.js`: tag permanece **comentada** (~8235); sem mudanca.

---

## Planejamento — PUT `user/settings` → `AgilBank.api.request` (sem execucao)

**Data:** 2026-05-03  
**Escopo:** apenas documentacao; **nenhuma** alteracao de codigo, backend, payload ou visual nesta entrega.  
**Arquivo alvo (futuro):** `agilbank-frontend/public/banco/index.html`, funcao `salvarConfiguracoes()`.

### 1. Mapeamento da chamada atual (legado no HTML)

| Aspecto | Valor atual |
|---------|-------------|
| URL hardcoded | `http://127.0.0.1:5000/api/user/settings` |
| Metodo | **PUT** |
| `body` (`JSON.stringify`) | Objeto `settings` com: `notifications: { email, sms, push }`, `theme` (string), `language: 'pt-BR'` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer ${token}` |
| `credentials` | `include` |
| Token | `localStorage.getItem('govbr_token')` apenas (diferente de `carregarConfiguracoes`, que usa `AgilBank.auth.getToken \|\| getAuthToken`) |
| Sucesso (`response.ok`) | `await response.json()` → `console.log` → `alert('✅ Configurações salvas com sucesso!')` |
| Erro HTTP | `console.error` + `alert('❌ Erro ao salvar configurações')` |
| Excecao (`catch`) | `console.error` + mesmo `alert` |

**Gatilho UI:** `onclick="salvarConfiguracoes()"` no botao salvar configuracoes; tambem `change` em toggles/tema apos `carregarConfiguracoes`.

### 2. Ragnar — contrato PUT no backend atual (`PORT` padrao **3001**, `src/server.js`)

**Rota:** `PUT /api/user/settings` em `src/routes/user.js`.

**Autenticacao:** mesma stack que demais rotas `/api/user/*` (Bearer / `req.user.id` — conforme middleware montado no router).

**Body esperado (campos de primeiro nivel em `req.body`):**

- `notificacoesEmail` (boolean, opcional)
- `notificacoesSms` (boolean, opcional)
- `notificacoesPush` (boolean, opcional)
- `temaInterface` (string; atualizacao aplicada se truthy)
- `idioma` (string; atualizacao aplicada se truthy)

**Persistencia:** `prisma.configuracoesUsuario.update({ where: { userId }, data: { ... } })` — **nao** e `upsert`; registro deve existir para o `userId`.

**Resposta 200 (JSON):**

```json
{
  "success": true,
  "message": "Configurações atualizadas com sucesso",
  "data": { "configuracoes": { /* modelo Prisma ConfiguracoesUsuario */ } }
}
```

**Erros:** `500` com `success: false`, `message`, `code: 'INTERNAL_ERROR'` (e log no servidor).

**Swagger** no mesmo arquivo descreve o schema acima (nomes camelCase `notificacoesEmail`, etc.).

### 3. Comparacao contrato legado (HTML) vs backend 3001

| Item | Frontend (`salvarConfiguracoes`) | Backend 3001 (`PUT /settings`) |
|------|----------------------------------|--------------------------------|
| Formato do body | Aninhado: `notifications.*`, `theme`, `language` | Plano: `notificacoesEmail`, `notificacoesSms`, `notificacoesPush`, `temaInterface`, `idioma` |
| Nomes dos campos | `theme`, `language` | `temaInterface`, `idioma` |
| Compatibilidade direta | **Nao** — o handler faz destructuring flat; campos aninhados **nao** sao mapeados | — |

**Conclusao Ragnar/Ivar:** trocar **somente** a URL para `AgilBank.api` (base `http://localhost:3001/api`) **mantendo o body atual** tende a **nao persistir** alteracoes no 3001, porque o servidor ignora `notifications` / `theme` / `language`.

**Nota correlata (GET ja via `AgilBank.api`):** `carregarConfiguracoes()` le `settings.notifications.email`, `settings.theme`, mas o `GET /api/user/settings` no `src/routes/user.js` devolve `{ success, data: { configuracoes: { notificacoesEmail, ... } } }`. Ou seja, ha **divergencia tambem na leitura** em relacao ao contrato 3001 — vale validar em ambiente real antes de considerar o fluxo configuracoes “verde”.

### 4. Lagertha — plano de execucao minimo (quando desbloqueado)

1. **Pre-requisito (escolher uma linha, fora do “só trocar fetch”):**
   - **Opcao A:** backend aceita o JSON legado (adapter que traduz `notifications`/`theme`/`language` → campos Prisma), **ou**
   - **Opcao B:** frontend envia o body flat esperado pelo 3001 (**mudanca de payload** — exige decisao explicita e quebra a restricao “nao alterar payload” da fatia atual ate nova aprovacao).

2. **Passo tecnico (apos alinhamento de contrato):** substituir `fetch('http://127.0.0.1:5000/...')` por:

   `await window.AgilBank.api.request('user/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer ${token}\` }, credentials: 'include', body: JSON.stringify(settings) })`

   — com `settings` e tratamento de resposta/erro **iguais** ao bloco atual, salvo ajuste aprovado de `settings` ou de parsing de `result` (ex.: ler `result.data.configuracoes` se o UX depender disso).

3. **Token:** alinhar a `window.AgilBank?.auth?.getToken?.() || getAuthToken()` como nas outras funcoes do mesmo arquivo.

4. **Fora de escopo:** auth, Pix, `login.js`, `userDataManager.js`, `cartao.js`, `formulario-conta.js`, reativar `containerEmprestimo.js`.

### 5. Riscos

| Risco | Detalhe |
|-------|---------|
| Contrato body incompativel | PUT “silencioso” (200 com dados parciais ou update sem campos reconhecidos) ou erro Prisma se `update` sem linha |
| GET/PUT inconsistentes na UI | Mesmo apos corrigir PUT, GET pode nao preencher toggles ate normalizar parse em `carregarConfiguracoes` |
| Token só `govbr_token` | Usuario com token apenas em `agilbank_token` pode falhar no salvar ate unificar getter |
| `update` vs `upsert` | Novo usuario sem linha em `configuracoes_usuario` pode receber 500 |

### 6. Testes obrigatorios (apos implementacao futura)

1. `npm run build`
2. Login com token que o backend 3001 aceita; abrir **Configuracoes**; alterar toggles/tema; salvar — verificar persistencia (reload ou GET).
3. Inspecionar rede: `PUT` para host da `AgilBank.api`, body e status conforme contrato acordado.
4. Cenarios de erro: sem token, 401/500 — mensagens de `alert` ainda aceitaveis.
5. `grep 127.0.0.1:5000` no `index.html`: contagem de `user/settings` = **0**; demais auth permanecem ate proxima fase.

### 7. Decisao Ivar

- **Bloqueio ativo para “fatia minima só trocar cliente HTTP”:** enquanto o body do `salvarConfiguracoes` permanecer `{ notifications, theme, language }` e o backend 3001 continuar esperando `{ notificacoesEmail, notificacoesSms, ... }`, **nao** migrar PUT apenas substituindo `fetch` por `AgilBank.api.request` sem **plano de alinhamento de contrato** (adapter no backend **ou** mudanca aprovada de payload no frontend).
- **Aprovado para registro:** este planejamento e a analise Ragnar; proxima acao e **RFC/decisao de produto** sobre normalizacao GET+PUT settings vs legado `:5000`.
- **Nao bloqueado conceitualmente:** depois de contrato unico, a troca para `AgilBank.api.request('user/settings', { method: 'PUT', ... })` e a padronizacao de token sao a fatia executavel pequena desejada.

### Execucao — normalizacao Configuracoes (GET/PUT `user/settings`, contrato 3001) — 2026-05-03

**Parecer Ivar:** fatia **aprovada para execucao** apos alinhamento explicito de contrato (payload flat + parse `data.configuracoes`); **sem** mudanca de backend, Pix, cartao, auth inline, ou arquivos fora de `public/banco/index.html`.

**Ragnar (confirmacao pos-diff):**

- **PUT** `/api/user/settings` em `src/routes/user.js` espera `notificacoesEmail`, `notificacoesSms`, `notificacoesPush`, `temaInterface`, `idioma` no corpo — compativel com o `payload` enviado pelo `salvarConfiguracoes()` atualizado.
- **GET** `/api/user/settings` responde com `data.configuracoes` (campos Prisma) — compativel com o ramo principal de `carregarConfiguracoes()`; ramo legado `settings.notifications` / `theme` / `language` mantido como fallback.

**Lagertha (entrega):**

- `carregarConfiguracoes()`: leitura prioritaria de `settings.data.configuracoes.*`; fallback para formato antigo; toggles e tema aplicados; listeners `change` em ate tres checkboxes dentro de `#configuracoesContainer` (ordem DOM: push, e-mail, SMS se existir terceiro).
- `salvarConfiguracoes()`: token `window.AgilBank?.auth?.getToken?.() || getAuthToken()`; `AgilBank.api.request('user/settings', { method: 'PUT', ... })` com body flat; alerts e ramos de erro preservados.
- **Backend:** nao alterado.

**Validacoes:**

- `npm run build` (`agilbank-frontend`): **OK** (2026-05-03).
- `grep http://127.0.0.1:5000/api/user/settings` em `public/banco/index.html`: **zero** ocorrencias.
- `127.0.0.1:5000` restante no `index.html`: **5** linhas (**apenas** `auth/*`).
- GET e PUT `user/settings`: ambos via `window.AgilBank.api.request('user/settings', ...)`.
- **Smoke manual** (rede + UI): abrir Configuracoes, alterar toggles/tema, salvar, recarregar — **pendente** no ambiente do revisor (nao automatizado aqui).

**Nota tecnica:** checkboxes de notificacao foram escopados a `#configuracoesContainer` para corresponder ao markup (Push, E-mails) e evitar capturar o primeiro `checkbox` global da pagina (ex.: login).

### Execucao — migracao POST `auth/login` inline (`fazerLogin`) — 2026-05-03

**Parecer Ivar:** fatia **aprovada e limitada** a `fazerLogin()`; register, forgot/verify/reset, Pix, cartao, backend e `login.js` **inalterados**; compatibilidade com `govbr_token`, `agilbank_token` e `token` **mantida** (e `AgilBank.auth.setSession` quando existir).

**Ragnar (contrato 3001):** `POST /api/auth/login` retorna JSON com `success`, `data: { user, token, refreshToken }` (sem `accessToken` na forma atual); frontend normaliza `accessToken || token || data.data.accessToken || data.data.token`.

**Lagertha (entrega):**

- `fetch` hardcoded removido; `window.AgilBank.api.request('auth/login', { auth: false, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) })`.
- Token e usuario com fallbacks acordados; se ausencia de token apos sucesso HTTP → alert neutro e return.
- Persistencia: `AgilBank.auth.setSession(token, user)` se disponivel + `localStorage.setItem` para `govbr_token`, `agilbank_token`, `token`.
- Erro: `error.error || error.message` + `response.json` com `.catch` para body vazio.
- Fluxo pos-login (ocultar login, `carregarPerfilUsuario`, `tentarExibirModal`) **inalterado**.

**Validacoes:**

- `npm run build`: **OK** (2026-05-03).
- `http://127.0.0.1:5000/api/auth/login` no `index.html`: **zero**.
- Demais auth hardcoded: **4** ocorrencias (register, forgot-password, verify-reset-token, reset-password).
- Smoke manual / storage: **pendente** no ambiente do revisor (login + inspecao `govbr_token` / `agilbank_token` / `token`).

---

## Planejamento — migracao Auth inline (`index.html`) para `AgilBank.api` / `AgilBank.auth` (sem execucao)

**Data:** 2026-05-03  
**Escopo desta entrega:** apenas plano e inventario; **sem** edicao de codigo, backend, payload, storage, `login.js`, `formulario-conta.js`, Pix, cartao, configuracoes ou emprestimo.  
**Diff atual (referencia — documento historico):** em 2026-05-03 havia **5** `fetch` para `http://127.0.0.1:5000/api/auth/*`; **atual:** **zero** `127.0.0.1:5000/api/auth` no `index.html` (login, register, forgot, verify-reset, reset via `AgilBank.api`); ver pendencias no topo.

### 1. Inventario Lagertha — o que o `index.html` faz hoje

| # | Endpoint (path) | Funcao / contexto (aprox.) | Metodo | Payload enviado hoje | Tratamento de resposta | Storage / redirect | Riscos |
|---|-----------------|----------------------------|--------|----------------------|------------------------|---------------------|--------|
| 1 | `/api/auth/login` | `fazerLogin()` ~6397 | POST | `{ email, senha }` | Se `ok`: `data.accessToken` → `localStorage.setItem('govbr_token', ...)`; esconde `#loginContainer`; `carregarPerfilUsuario` + `tentarExibirModal` | **So** `govbr_token`; nao grava `agilbank_token`/`token` | **Contrato 3001:** ver Ragnar — token nao vem como `accessToken` |
| 2 | `/api/auth/register` | `finalizarCadastro()` ~9366 | POST | `JSON.stringify(dadosCadastro)` | Espera `data.success`; confirma UI; `fecharFormulario` apos 3s | Nao autentica; nao grava token | **Bug/pre-requisito:** `dadosCadastro` **nao** aparece definido no mesmo bloco (4 refs); corpo pode nao bater com validacao 3001 |
| 3 | `/api/auth/forgot-password` | submit `#esqueciSenhaForm` ~9721 | POST | `{ email, cpf }` (cpf so digitos) | `data.success` → fecha modal, abre criar senha | Nenhum | Depende de rota existir no servidor alvo |
| 4 | `/api/auth/verify-reset-token` | `verificarTokenReset(token)` ~9902 | POST | `{ token }` | Espera `data.valid` e `data.nome` para montar HTML do form | `window.resetToken` usado depois | Formato de resposta deve bater com backend real |
| 5 | `/api/auth/reset-password` | submit redefinir senha ~9992 | POST | `{ token: window.resetToken, new_password }` | `response.ok` → mensagem sucesso; senao `data.error` | Nenhum | Campo `new_password` vs nome esperado no backend |

**Gate / React:** fluxo React que envia usuario para `/banco/index.html` depende de tokens ja presentes (`legacyAuthStore` le `agilbank_token`, `govbr_token`, `token`). Login **inline** no HTML hoje so escreve `govbr_token` — alinhar com `getToken()` em outras funcoes ja mistura fontes.

**Mensagens:** alerts existentes em login (credenciais / conexao), cadastro, erros de recuperacao; **nao** trocar copy na fatia futura sem necessidade.

### 2. Ragnar — contrato `src/routes/auth.js` (backend **3001**, `PORT` padrao 3001)

Rotas montadas em `/api/auth` (ver `src/server.js`). **auth: false** em todas as chamadas abaixo (sem Bearer obrigatorio).

#### POST `/api/auth/login` (`validateLogin`)

| Item | Detalhe |
|------|---------|
| Payload | `senha` (obrigatorio; **6 digitos numericos**). Identificador: **`email` OU `identificador`** — CPF 11 digitos ou e-mail (ver `getLoginIdentifier` + validacao). |
| Headers | `Content-Type: application/json` |
| 200 | `{ success: true, message, data: { user, token, refreshToken } }` — **sem** `accessToken` na raiz |
| 401 | `{ success: false, message, code }` (ex.: `INVALID_CREDENTIALS`, `ACCOUNT_DEACTIVATED`) |
| 500 | `{ success: false, message, code: 'INTERNAL_ERROR' }` |

**Divergencia critica vs HTML:** frontend usa `data.accessToken`; backend expoe **`data.token`** dentro de `data` aninhado na resposta JSON (estrutura: `body.data.token` se `body = await response.json()`).

#### POST `/api/auth/register` (`validateUserRegistration`)

| Item | Detalhe |
|------|---------|
| Payload | `nomeCompleto`, `email`, `cpf` (11 digitos), `telefone` (opcional), `dataNascimento` (ISO8601), `senha` (**6 digitos**), `endereco` / `dadosProfissionais` opcionais (objetos aninhados camelCase) |
| 201 | `{ success: true, message, data: { user, message } }` |
| 409 | `ACCOUNT_ALREADY_EXISTS` |
| 400 | validacao (array `errors` via middleware) |

**Divergencia vs HTML:** handler de sucesso testa `data.success` (ok), mas erros usam `data.error` — backend tende a usar `message`/`code`. Corpo `dadosCadastro` precisa ser **camelCase** e campos obrigatorios alinhados.

#### POST `/api/auth/forgot-password`, `/verify-reset-token`, `/reset-password`

| Item | Detalhe |
|------|---------|
| **No repositorio atual** | Em `src/routes/auth.js` **nao** existem rotas `forgot-password`, `verify-reset-token` nem `reset-password` (arquivo exporta ate `verify-email`, `logout`, `refresh`, etc.). |
| Implicacao | Apontar esses `fetch` para `localhost:3001` via `AgilBank.api` **sem** implementar rotas no backend resulta em **404** (ou erro de rota). |

*(Email de reset menciona `FRONTEND_URL/reset-password?token=` em `src/utils/email.js`, mas o fluxo API correspondente nao esta no mesmo router analisado.)*

### 3. Lagertha — troca minima prevista (futura), por endpoint

Premissas: `window.AgilBank.api.request('auth/login', { method: 'POST', auth: false, body: JSON.stringify(...) })` etc.; manter `credentials` se necessario para cookies (hoje login nao envia `credentials` explicitamente no fetch legado).

| Endpoint | Troca minima | Bloqueio |
|----------|--------------|----------|
| login | Substituir `fetch` por `api.request`; **normalizar leitura do token** (`data.data?.token` ou alias compativel com legado **sem** mudar chaves de storage so se aprovado na mesma fatia) | Quebra gate se token nao for persistido corretamente |
| register | `api.request` + manter `JSON.stringify` do mesmo objeto **apos** garantir que o objeto existe e campos batem com 3001 | `dadosCadastro` + snake_case |
| forgot / verify / reset | `api.request` identico em forma | **Backend ausente** no 3001 atual |

### 4. Ivar — riscos e decisao (A/B/C/D)

**Riscos principais**

1. **Login:** mismatch `accessToken` vs `data.token` quebra sessao no dashboard e integracoes que leem `govbr_token`.
2. **Register:** payload / `dadosCadastro` indefinido ou invalido gera 400/500 e UX de cadastro quebrada.
3. **Reset:** tres endpoints **sem** implementacao em `src/routes/auth.js` — migrar URL apenas piora diagnostico (404) sem valor.
4. **React → legado:** qualquer mudanca de onde o token e gravado exige compatibilidade com `agilbank_token`, `govbr_token`, `token` (regra de produto).
5. **Fatia unica (D):** alta densidade de regressao; dificulta rollback.

**Decisao Ivar**

- **D) Migrar os 5 em uma unica fatia:** **nao recomendado** — muitos pontos de falha e reset bloqueado por backend.
- **A) Esqueci senha / verify / reset primeiro:** **bloqueado** ate Ragnar entregar contrato e rotas em `/api/auth/*` no backend 3001 (ou aceitar explicitamente outro host temporario).
- **B) Register em fatia separada:** **recomendado como segunda onda**, **apos** corrigir/inventariar `dadosCadastro` e alinhar nomes de campos ao `validateUserRegistration` **sem** mudar semantica de negocio (RFC curta).
- **C) Login por ultimo:** **recomendado** como **terceira onda** **ou** imediatamente apos register se cadastro nao for prioridade — desde que a fatia de login inclua **mapeamento de resposta** acordado (`token` → persistencia compativel com gate atual). **Nao** executar login com `AgilBank.api` sem esse mapeamento.

**Proxima fatia executavel recomendada (ordem)**

1. **Pre-requisito (Ragnar + produto):** implementar ou apontar contrato real para `forgot-password`, `verify-reset-token`, `reset-password` **ou** remover/ocultar fluxo no HTML ate existir API — **fora do escopo** deste repo se backend nao for editado.
2. **Register:** uma PR pequena: garantir objeto de cadastro + `AgilBank.api.request('auth/register', { auth: false, ... })` + tratamento de erro alinhado a `message`/`code`.
3. **Login:** uma PR pequena: `auth/login` + leitura de token alinhada ao contrato 3001 + (em fatia separada aprovada) unificar gravacao em `govbr_token` **e** espelho em `agilbank_token`/`token` se exigido pelo gate.

**Criterios de seguranca (manter na execucao futura):** nao remover funcoes globais nem IDs; nao alterar visual; nao quebrar redirect React para `/banco/index.html`; preservar mensagens salvo ajuste forcado por contrato.

### 5. Testes obrigatorios (apos implementacao futura)

1. `npm run build`
2. Login inline: sucesso e falha; token visivel no storage esperado; `carregarPerfilUsuario` e containers ok
3. Cadastro multi-etapas: 201 e 409/400
4. Se reset existir no backend: fluxo completo email → token → verify → reset
5. `grep 127.0.0.1:5000/api/auth` no `index.html` = **0**
6. Regressao: usuario chegando do React com token pre-existente continua vendo dashboard

---

## Planejamento — migracao POST `auth/register` inline (`index.html`) (sem execucao)

**Data:** 2026-05-03  
**Escopo desta entrega:** apenas plano e inventario; **sem** edicao de codigo, backend, visual, login, forgot/verify/reset, `formulario-conta.js`, Pix, cartao, configuracoes ou emprestimo.  
**Contexto:** login inline ja migrado para `AgilBank.api`; restam **4** URLs `127.0.0.1:5000` no `index.html` (register + tres reset).

### 1. Ragnar — contrato `POST /api/auth/register` (backend **3001**, `src/routes/auth.js` + `validateUserRegistration`)

| Item | Detalhe |
|------|---------|
| Metodo / path | **POST** `/api/auth/register` |
| Auth header | **Nao** — rota publica (`auth: false` no cliente) |
| Headers | `Content-Type: application/json` |

**Body — campos usados pelo handler (nomes exatos, camelCase):**

| Campo | Obrigatorio (validacao) | Observacao |
|-------|-------------------------|------------|
| `nomeCompleto` | Sim | 2–100 chars, letras/espacos |
| `email` | Sim | e-mail valido |
| `cpf` | Sim | **exatamente 11 digitos** (string, sem mascara) |
| `telefone` | Opcional | regex 10–11 digitos ou formato `(DD) NNNNN-NNNN` |
| `dataNascimento` | Sim | ISO8601; idade 18–120 |
| `senha` | Sim | **exatamente 6 digitos numericos** |
| `endereco` | Opcional | objeto: `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado` (2 chars) — validadores opcionais por subcampo |
| `dadosProfissionais` | Opcional | `profissao`, `empresa`, `cargo`, `rendaMensal` (numerico), `tempoTrabalho` — validadores opcionais |

**Resposta 201:**

```json
{
  "success": true,
  "message": "Usuário registrado com sucesso. Verifique seu email para ativar a conta.",
  "data": { "user": { ... }, "message": "Verifique seu email para ativar sua conta" }
}
```

**Resposta 400** (`handleValidationErrors`): `{ success: false, message: "Dados inválidos", errors: [{ field, message, value }], code: "VALIDATION_ERROR" }`

**Resposta 409** (duplicidade Prisma): `{ success: false, message: "...", code: "ACCOUNT_ALREADY_EXISTS" }`

**Resposta 500:** `{ success: false, message: "Erro interno do servidor", code: "INTERNAL_ERROR" }`

**endereco / dadosProfissionais:** aceitos e persistidos via `prisma.user.create` quando presentes (ver `auth.js`).

### 2. Lagertha — inventario do fluxo no `index.html`

| Item | Detalhe |
|------|---------|
| Funcao que chama API | `finalizarCadastro()` (~9380) |
| Transporte atual | `fetch('http://127.0.0.1:5000/api/auth/register', { method: 'POST', body: JSON.stringify(dadosCadastro) })` |
| Origem de `dadosCadastro` | **Nenhuma definicao** localizada no arquivo (apenas 4 referencias: `JSON.stringify(dadosCadastro)`, `nome_completo`, `telefone`, `email` em `mostrarConfirmacaoCadastro`). **Risco:** `ReferenceError` em runtime ao finalizar. |
| Sucesso atual | `if (data.success)` → `mostrarConfirmacaoCadastro(dadosCadastro.nome_completo, dadosCadastro.telefone)`; `setTimeout(fecharFormulario, 3000)` |
| Erro atual | `throw new Error(data.error \|\| 'Erro ao criar conta')` — backend 3001 usa **`message` / `code`**, nao `error` na raiz |
| Container / UI | `#contaContainer`, formulario multi-etapas `#contaForm`, secoes `.conta-form-section[data-section="1–4"]`, confirmacao `.conta-success` |

**Campos no HTML (IDs reais) vs validadores / backend:**

- Tela 1: `contaNomeCompleto`, `contaCpf`, `contaEmail`, `contaTelefone`, `contaDataNascimento` — alinhavel a `nomeCompleto`, `cpf` (limpar digitos), `email`, `telefone`, `dataNascimento` (input `date` → string ISO).
- **Senha:** **nao** ha campo visivel nas secoes 1–4 do formulario de abertura de conta no trecho analisado — **obrigatorio** para o backend; ausencia bloqueia registro real (ou exigiria geracao artificial, inaceitavel sem produto).
- Tela 2: `contaCep`, `contaRua`, `contaNumero`, `contaComplemento`, `contaBairro`, `contaCidade`, `contaEstado` — mapear `contaRua` → `endereco.logradouro`.
- Tela 3: `contaProfissao`, `contaEmpresa`, `contaCargo`, `contaRenda`, `contaEstadoCivil` — backend **nao** tem `estadoCivil` no modelo de registro; `renda` → `dadosProfissionais.rendaMensal`; `tempoTrabalho` opcional ausente no form.

**Inconsistencias adicionais no JS inline (pre-existentes):**

- `validarTela1()` usa `contaNome`, `contaDataNasc`, `contaSexo` — **IDs nao** batem com o markup (`contaNomeCompleto`, `contaDataNascimento`; **sem** `contaSexo` na secao 1 lida).
- `validarTela2()` usa `contaEndereco` — markup usa **`contaRua`**.
- `mostrarTela(n)` usa `getElementById('contaStep' + n)` — markup usa **`data-section`** em `.conta-form-section`, **sem** ids `contaStep1`…4 (navegacao por passos potencialmente quebrada).
- `validarTela3()` exige `contaFinalidade` — **nao** localizado no HTML da secao 3 (há `contaEstadoCivil`).

### 3. Ivar — riscos e criterios de bloqueio para liberar execucao

| Criterio | Status |
|----------|--------|
| `dadosCadastro` existe claramente | **Nao** — bloqueante ate haver funcao que monte o objeto (ou equivalente) antes do `JSON.stringify` |
| Payload bate com backend | **Parcial** — nomes e `senha` / CPF / ISO data precisam de montagem explicita; endereco/profissionais com mapeamento de IDs |
| Exige backend | **Nao** para trocar URL; **sim** para sucesso real (API ja existe em 3001) |
| Afeta login ou reset | **Nao**, se escopo limitado a `finalizarCadastro` (+ eventual helpers de montagem no mesmo arquivo, sem tocar em `fazerLogin` nem modais de senha) |
| Visual / IDs / globais | Plano futuro: **evitar** remover IDs; adicionar campo de **senha** (6 digitos) pode ser **necessario** para contrato — decisao de produto (pode ser considerado requisito funcional, nao cosmético) |

**Decisao Ivar**

- **Nao liberar** execucao “somente trocar `fetch` por `AgilBank.api.request`” **sem** fatia previa (ou inclusa) que: (1) **defina e popule** o payload com campos exigidos pelo 3001; (2) **inclua `senha`** coletada do usuario ou fluxo aprovado; (3) corrija **inconsistencias minimas** entre IDs dos validadores e o DOM **ou** substitua validacao por leitura direta dos IDs corretos — sempre **sem** alterar `formulario-conta.js` se essa for a restricao (entao todo ajuste fica no `index.html`).
- **Register** continua sendo o proximo tema logico **depois** do login; **reset** permanece bloqueado ate rotas no backend.
- Ordem sugerida: **(A)** corrigir montagem do payload + campo senha + alinhamento validacao/DOM no escopo `index.html`; **(B)** trocar para `AgilBank.api.request('auth/register', { auth: false, method: 'POST', body: JSON.stringify(payload) })`; **(C)** normalizar erros: `data.message`, `data.code`, `data.errors`.

### 4. Plano frontend (Lagertha) — proxima fatia executavel recomendada

1. Introduzir `function montarPayloadRegistro()` (ou nome equivalente) no `index.html` que leia apenas IDs existentes (e novo campo `senha` se aprovado), devolvendo objeto **camelCase** compativel com `validateUserRegistration`.
2. Ajustar `validarTela1`–`3` e/ou `mostrarTela` para usar **IDs reais** e estrutura de secoes (`data-section` / classes), **sem** remover funcoes globais.
3. Em `finalizarCadastro`: substituir `dadosCadastro` por payload montado; `AgilBank.api.request('auth/register', { auth: false, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })`; tratar **201** e corpo JSON; mensagens de erro com `message` e lista `errors` opcional.
4. Manter `mostrarConfirmacaoCadastro` usando `nomeCompleto` / `telefone` / `email` do payload (nao depender de variavel inexistente).
5. **Nao** alterar `auth/forgot-password`, `verify-reset-token`, `reset-password` nesta fatia.

### 5. Validacoes planejadas (execucao futura)

1. `npm run build`
2. Cadastro feliz → 201, email de verificacao (se ambiente enviar)
3. E-mail ou CPF duplicado → 409, mensagem amigavel
4. Validacao (ex.: senha com letras) → 400, `VALIDATION_ERROR`
5. `grep 127.0.0.1:5000/api/auth/register` no `index.html` = **0**
6. Confirmar que forgot / verify / reset **permanecem** hardcoded ate fase propria

### Execucao — fluxo cadastro inline + POST `auth/register` (3001) — 2026-05-03

**Parecer Ivar:** fatia **aprovada**; alteracoes **limitadas** a `public/banco/index.html` no fluxo de abertura de conta; **sem** backend, login inline ja migrado, reset fora do escopo, **sem** remocao de funcoes globais; senha **somente** via input `contaSenha` (6 digitos).

**Ragnar:** payload `montarPayloadRegistro()` alinha-se a `validateUserRegistration` / `POST /api/auth/register` (camelCase, `cpf` 11 digitos, `dataNascimento` ISO do `input type=date`, `senha` 6 digitos, `endereco` com `logradouro`, `dadosProfissionais` com `rendaMensal` numerico). Estado civil permanece **apenas** validacao UI (nao enviado ao backend atual).

**Lagertha (entrega):**

- Campo **Senha (6 digitos)** `contaSenha` na secao 1 (mesmo padrao visual `conta-form-*`).
- `montarPayloadRegistro()` global; `obterNumeroSecaoContaAtiva()`; `mostrarTela` / `proximoPasso` / `voltarTela` por `.conta-form-section[data-section]` dentro de `#contaForm`.
- `validarTela1`–`3` com IDs reais; tela 4 exige `contaTermos` antes de `finalizarCadastro`.
- `finalizarCadastro`: `AgilBank.api.request('auth/register', { auth: false, ... })`; `extrairMensagemErroCadastro` para `message`, `error`, `errors[0].message`, `code`.
- `mostrarConfirmacaoCadastro(nome, telefone, email)`; lista `camposConta` para validacao em tempo real atualizada.
- Removido uso de `dadosCadastro` inexistente.

**Validacoes:**

- `npm run build`: **OK** (2026-05-03).
- `http://127.0.0.1:5000/api/auth/register` no `index.html`: **zero**.
- Forgot / verify / reset: **inalterados** (ainda `127.0.0.1:5000`).
- Smoke 201 / 409 / 400: **pendente** no ambiente do revisor.

---

## Auditoria / plano — recuperacao de senha (`forgot-password`, `verify-reset-token`, `reset-password`)

**Data:** 2026-05-03  
**Escopo:** somente documentacao; **sem** alteracao de codigo, backend ou visual nesta entrega.

### 1. Ragnar — backend atual (`src`, Prisma, email)

**Rotas HTTP**

- Busca em `src/**/*.js` por `forgot-password`, `verify-reset-token`, `reset-password` em **routers**: **nenhuma rota** montada em `src/routes/auth.js` nem em outros arquivos de rotas do mesmo pacote para esses paths.
- `POST /api/auth/verify-email` existe (ativacao de conta); **nao** substitui fluxo de reset de senha.

**Email (`src/utils/email.js`)**

- Template **`passwordReset`** pronto: assunto “Redefinir senha”, link `${process.env.FRONTEND_URL}/reset-password?token=${data.token}`, texto de expiracao (1 hora no copy).
- Indica **intencao de produto** de enviar e-mail com token opaco; **nao** implementa geracao/persistencia do token (isso seria no handler da API).

**Rota de teste de e-mail (`src/routes/email.js`)**

- Permite disparar templates incl. `passwordReset` para desenvolvimento; **nao** e o fluxo completo de “esqueci senha”.

**Prisma (`prisma/schema.prisma`, model `User`)**

- `tokenVerificacao` e `dataVerificacao`: usados no codigo atual para **verificacao de e-mail** pos-cadastro.
- **Nao** ha campos dedicados `resetPasswordToken`, `resetPasswordExpires` (ou equivalente) no schema lido — **migracao Prisma seria necessaria** para armazenar token de reset com expiracao de forma segura (ou reutilizar um campo com semantica clara e risco de conflito com verificacao de e-mail, **nao recomendado** sem desenho explicito).

**Servico/util de reset**

- **Nao** ha servico pronto que encadeie: validar usuario → gerar token → persistir → `sendEmail({ template: 'passwordReset' })` → validar token → `bcrypt.hash` nova senha.

**Contrato minimo sugerido (para implementacao futura segura)**

| Endpoint | Metodo | Auth | Body (exemplo) | Resposta de sucesso (exemplo) |
|----------|--------|------|----------------|---------------------------------|
| `/api/auth/forgot-password` | POST | publico | `{ email, cpf }` (CPF 11 digitos) | `{ success: true, message }` — **sem** vazar se e-mail existe; rate limit recomendado |
| `/api/auth/verify-reset-token` | POST | publico | `{ token }` | `{ valid: true, nome }` ou `{ valid: false }` alinhado ao que o HTML espera |
| `/api/auth/reset-password` | POST | publico | `{ token, new_password }` ou `senha` alinhado ao login (6 digitos) | `{ success: true }` ou erro com `message`/`code` |

**Requisitos de seguranca (Ragnar):** token opaco unico, armazenar **hash** ou token com expiracao curta; invalidar apos uso; **nao** aceitar nova senha sem token valido; alinhar politica de senha com `validateLogin` (6 digitos). **Nao** documentar execucao de backend nesta fatia.

### 2. Lagertha — frontend (`public/banco/index.html`)

**Modais / containers**

- `#esqueciSenhaModal` — form `#esqueciSenhaForm`, campos `emailRecuperacao`, `cpfRecuperacao`, botao `#btnEnviarInstrucoes`.
- `#criarSenhaModal` / `#criarSenhaForm` — fluxo pos-“sucesso” do forgot (UI confusa vs e-mail com link).
- `#redefinirSenhaModal` — `#redefinirSenhaContent` substituido dinamicamente apos `verify-reset-token`.

**`POST .../forgot-password` (~9798)**

- Payload: `{ email, cpf }` com CPF so digitos.
- Esperado: `data.success === true` → `fecharEsqueciSenha()` + `mostrarCriarSenha()`.
- Erro: `data.error` (backend 3001 tipicamente usaria `message`).

**`POST .../verify-reset-token` (~9979)**

- Payload: `{ token }`.
- Esperado: `data.valid` e `data.nome` para montar form de nova senha via `innerHTML`; senao mensagem “Token Invalido”.

**`POST .../reset-password` (~10068)**

- Payload: `{ token: window.resetToken, new_password: novaSenha }`.
- Sucesso: `response.ok` → HTML de sucesso; erro: `data.error`.

**Entrada por URL**

- `window.addEventListener('load')`: `URLSearchParams` `token` → `mostrarRedefinirSenha(token)` — compativel com link `.../banco/index.html?token=...` (e-mail template aponta para `FRONTEND_URL/reset-password?token=` — **possivel desalinhamento** de path entre app React vs HTML legado; verificar `FRONTEND_URL` em deploy).

**Risco funcional adicional**

- `criarSenhaForm` submit **simula** sucesso com `setTimeout` + `alert`, **sem** chamar API de reset — mesmo que forgot retornasse sucesso, **nao** ha persistencia de nova senha nesse modal sem implementacao.

### 3. Ivar — decisao A / B / C / D

| Opcao | Descricao | Avaliacao |
|-------|-----------|-----------|
| **A** | Implementar backend minimo das 3 rotas (+ Prisma/migracao + e-mail) e depois migrar frontend para `AgilBank.api` | **Recomendada** como destino: unico caminho **seguro** e alinhado ao template `passwordReset` e ao criterio “nao endpoint inexistente em producao”. |
| **B** | Manter chamadas em `127.0.0.1:5000` com comentario | **Rejeitada** para usuario final: host local **nao** e aceitavel em producao; viola criterio explicito. |
| **C** | Desativar/ocultar “Esqueci senha” e fluxos ate backend existir | **Aceitavel** como **medida temporaria** (com mensagem clara), se nao houver capacidade para A imediatamente — evita falsa sensacao de seguranca. |
| **D** | Adaptar frontend para outro fluxo ja existente no backend | **Nao aplicavel hoje:** nao ha rota de reset no `src` analisado; `verify-email` e outro contrato. |

**Decisao Ivar:** **A** como meta; **C** como paliativo aceitavel se produto quiser bloquear UX ate RFC; **B** e **D** **nao** recomendados nas condicoes atuais.

**Proxima fatia executavel recomendada (ordem)**

1. **Backend (fora do escopo do frontend-only):** RFC + migracao Prisma (token reset + expiracao) + 3 rotas + rate limit + uso de `sendEmail` `passwordReset` + testes.
2. **Frontend:** substituir os 3 `fetch` por `AgilBank.api.request` com **mesmo** body esperado pelo contrato acordado; alinhar mensagens a `message`/`code`; corrigir modal `criarSenha` para **nao** simular sucesso sem API ou remover do fluxo se o produto for “somente link por e-mail”.
3. **Alinhar URL** do e-mail (`/reset-password` vs `/banco/index.html?token=`) com a pagina que realmente inicializa `mostrarRedefinirSenha`.

### 4. Riscos

| Risco | Mitigacao |
|-------|-----------|
| Enumeracao de e-mails no forgot | Resposta generica sempre; rate limit |
| Token em claro na URL | HTTPS, expiracao curta, uso unico |
| Reutilizar `tokenVerificacao` para reset | Evitar — conflito com verificacao de conta |
| UI promete reset sem backend | Opcao C ou desabilitar botao ate API pronta |

### 5. Testes obrigatorios (apos implementacao futura)

1. Forgot: usuario valido recebe e-mail (ambiente de teste); usuario invalido nao vaza detalhes.
2. Link com token valido abre modal e `verify-reset-token` retorna `valid`.
3. Reset com senha valida (6 digitos) e token invalido/expirado falha de forma clara.
4. `npm run build`; **zero** `127.0.0.1:5000` nos tres endpoints no `index.html`.
5. Regressao: login e cadastro migrados continuam funcionando.

---

## Plano técnico — backend seguro (recuperação de senha)

**Data:** 2026-05-03  
**Escopo:** somente **plano**; **não** editar código, frontend, nem rodar migration nesta entrega.  
**Decisão Ivar (produto):** meta **opção A** (backend seguro no `3001`); paliativo **C** até lá; **proibido** manter `127.0.0.1:5000` para usuário final.

### Ragnar — mapeamento do backend atual

| Área | Situação |
|------|----------|
| `src/routes/auth.js` | Expõe `register`, `login`, `refresh`, `logout`, `verify-email`. **Não** há `forgot-password`, `verify-reset-token`, `reset-password`. Senha: `bcrypt.hash` / `bcrypt.compare` (`BCRYPT_ROUNDS`, default 12). |
| `src/middleware/validation.js` | `validateUserRegistration`, `validateLogin`; senha **6 dígitos** (`/^\d{6}$/`). `handleValidationErrors` → **400** `{ success: false, message: 'Dados inválidos', errors: [...], code: 'VALIDATION_ERROR' }`. |
| `src/middleware/auth.js` | `jwt` (access), `hashRefreshToken` = HMAC-SHA256 do token opaco com `JWT_REFRESH_SECRET` \|\| `JWT_SECRET`. |
| `src/utils/email.js` | Template **`passwordReset`**: link `${FRONTEND_URL}/reset-password?token=...`, copy de expiração **1 hora**. Export **`sendPasswordResetEmail(userData)`** (`nome`, `email`, `token` em claro **só** no e-mail). |
| `prisma/schema.prisma` | `User.senha`: hash bcrypt. `User.tokenVerificacao`: fluxo **verify-email** (token **em claro** no banco — **não** reutilizar para reset). Model **`Token`**: `tokenHash`, `tipo`, `expiraEm`, `isAtivo`, `userId` — já usado para **refresh**; adequado para reutilizar com `tipo: 'password_reset'` **sem** novos campos em `User`. |
| Dependências | `bcryptjs`, `jsonwebtoken`, `crypto` (core), `express-validator`, `express-rate-limit` (disponível no `package.json`). |
| Respostas de erro “padrão auth” | `success`, `message`, `code` (ex.: `INVALID_CREDENTIALS`, `INTERNAL_ERROR`). |
| Testes | `tests/auth.test.js`: **Jest** + **supertest** sobre `src/server.js`; mocks de `prisma` e `bcrypt`; padrão `expect(response.body.success)`, `.code`, status HTTP. |

### Proposta de implementação segura (Ragnar)

1. **Token opaco:** `crypto.randomBytes(32).toString('hex')` (ou 48 bytes); **nunca** persistir o valor cru — apenas **`tokenHash`** com o **mesmo** esquema de `hashRefreshToken` (ou extrair `hashOpaqueToken` reutilizável em `middleware/auth.js` para refresh e reset).
2. **Persistência recomendada (sem migration em `User`):** criar registro em **`Token`** com `tipo: 'password_reset'`, `tokenHash`, `expiraEm` = agora + **1 hora**, `isAtivo: true`. Antes de criar um novo reset, **`updateMany`** nos tokens `password_reset` do `userId` para `isAtivo: false` (um reset válido por vez; opcionalmente manter histórico com `isAtivo` apenas).
3. **`forgot-password`:** validar **e-mail + CPF** (11 dígitos); buscar usuário por **`email` e `cpf`** (ambos devem bater — reduz abuso só com e-mail). **Sempre** responder **200** com a **mesma** mensagem genérica (abaixo), **mesmo** se usuário não existir ou combinação falhar; **não** revelar “e-mail cadastrado” ou “CPF incorreto”. Opcional: **rate limit** por IP (e/ou fingerprint leve) via `express-rate-limit` dedicado. Logar tentativas com **dados redigidos** (`logger.security`). Enviar e-mail **somente** quando houver match; falha de SMTP: ainda assim **não** alterar mensagem ao cliente (evita enumeração + vazamento de infra); logar erro.
4. **`verify-reset-token`:** body `{ token }`; calcular hash; `findFirst` em `Token` onde `tokenHash`, `tipo: 'password_reset'`, `isAtivo`, `expiraEm > now()`; incluir `user`. Se ok: **200** `{ valid: true, nome }` com `nome` = `nomeCompleto` (contrato Lagertha). Se inválido/expirado: **200** `{ valid: false, message }` com mensagem genérica (evita diferença de timing óbvia quando possível; alternativa **401** se produto aceitar e frontend for ajustado depois — hoje o HTML trata JSON com `valid`).
5. **`reset-password`:** body `{ token, new_password }`; mesma resolução de token que em (4); validar `new_password` com **mesma regra** do login (`/^\d{6}$/`). Se válido: `bcrypt.hash`, `prisma.user.update` em `senha`, **invalidar** o token de reset (`isAtivo: false`); opcional **hardness:** revogar refresh tokens (`tipo: 'refresh'`, `isAtivo: false`) para forçar novo login em todos os dispositivos. Resposta **200** `{ success: true, message }`. Erros: **400** `{ success: false, message, code }` (token inválido, senha inválida); manter compatível com evolução para `AgilBank.api` (`message` na raiz).
6. **Conflito com `tokenVerificacao`:** **não** usar o campo de e-mail para reset; fluxos independentes.
7. **`FRONTEND_URL`:** documentar que o link deve abrir a **mesma** superfície que consome `?token=` (hoje legado: `banco/index.html` vs template `.../reset-password` — **ajuste de env ou de template** na fase de execução, sem mudar copy de segurança).

**Alternativa (exige migration Prisma):** campos `resetPasswordTokenHash`, `resetPasswordExpires` (e opcional `resetPasswordIssuedAt`) em `User`. **Não** obrigatório se `Token` com `tipo` for aceito pelo time.

### Contratos finais propostos (alinhamento RULE-8 com UI atual)

**1. POST `/api/auth/forgot-password`** (público)

- **Body:** `{ "email": string, "cpf": string }` — CPF somente **11 dígitos** (normalizar no middleware).
- **Resposta (sempre 200):**  
  `{ "success": true, "message": "Se os dados estiverem corretos, enviaremos as instruções para o e-mail cadastrado." }`
- **E-mail (quando aplicável):** `sendPasswordResetEmail({ nome, email, token })` com `token` **cru** só na mensagem.

**2. POST `/api/auth/verify-reset-token`** (público)

- **Body:** `{ "token": string }`
- **Válido (200):** `{ "valid": true, "nome": string }` — `nome` preferencialmente primeiro nome ou `nomeCompleto` conforme produto (UI usa saudação).
- **Inválido/expirado (200):** `{ "valid": false, "message": string }` — mensagem amigável, sem detalhe interno.

**3. POST `/api/auth/reset-password`** (público)

- **Body:** `{ "token": string, "new_password": string }` — exatamente **6 dígitos**.
- **Sucesso (200):** `{ "success": true, "message": string }` — garante `response.ok` no `fetch` legado.
- **Erro (400 ou 401):** `{ "success": false, "message": string, "code": string }` — UI legada lê `data.error` em alguns ramos; na migração futura para `AgilBank.api`, padronizar leitura de `message` (e mapear `error` no cliente se necessário para compat).

### Arquivos a alterar na fase de execução (lista mínima)

- `src/routes/auth.js` — três rotas + chamadas Prisma/e-mail/audit opcional.
- `src/middleware/validation.js` — cadeias `validateForgotPassword`, `validateVerifyResetToken`, `validateResetPassword` (+ `handleValidationErrors`).
- `src/middleware/auth.js` (opcional) — generalizar `hashRefreshToken` → nome neutro reutilizado pelo reset.
- `tests/auth.test.js` — novos casos (mocks de `prisma.token`, `sendEmail` ou `sendPasswordResetEmail`).
- `prisma/schema.prisma` + migration — **somente** se **não** reutilizar `Token` e optar por campos em `User`.
- Documentação Swagger nos comentários das rotas em `auth.js` (consistência com o arquivo).
- **Não** obrigatório alterar `email.js` além de, se preciso, ajustar path do link para bater com `FRONTEND_URL` real do legado.

### Lagertha — expectativa do frontend atual (sem editar nesta fase)

| Etapa | Esperado hoje | Nota para execução futura |
|-------|----------------|---------------------------|
| Forgot | `data.success` | Trocar URL para `AgilBank.api.request('auth/forgot-password', { auth: false })`; erros: alinhar `message` vs `data.error`. |
| Verify | `data.valid`, `data.nome` | Manter shape acima. |
| Reset | `response.ok`, corpo com sucesso; erro `data.error` | Garantir **200** no sucesso; padronizar erros com `message`. |
| Modais | `#esqueciSenhaModal`, `#criarSenhaModal`, `#redefinirSenhaModal` | Após backend: remover fluxo “criar senha” **falso** ou ligar ao link por e-mail apenas (decisão de produto). |

### Ivar — riscos e gate de execução

| Risco | Mitigação no plano |
|-------|---------------------|
| Enumeração de usuário | Resposta idêntica no forgot; validação e-mail+CPF; rate limit. |
| Token na URL | HTTPS em produção; expiração curta; um uso; hash no banco. |
| Reutilização de token | Invalidar `Token` após reset bem-sucedido. |
| Token expirado | Recusar verify/reset; mensagem genérica. |
| Senha sem token válido | Não atualizar `User.senha` sem passo (4). |
| Conflito com `tokenVerificacao` | Usar tabela `Token` ou campos dedicados de reset, não o token de e-mail. |
| Impacto login/cadastro | Rotas novas; não alterar handlers existentes além de imports/helpers compartilhados. |
| SMTP ausente | Log + comportamento seguro sem vazar ao cliente. |

**Decisão Ivar (gate):** **Liberada a execução do backend** conforme este plano, com **(1)** escolha explícita registrada **Token `password_reset`** vs **campos em `User`**, **(2)** `FRONTEND_URL` e SMTP definidos por ambiente, **(3)** após merge do backend, fatia separada de frontend (`AgilBank.api` + tratamento de `message`/`code` + alinhamento de URL do e-mail). **Bloqueio:** não apontar fluxo real para `127.0.0.1:5000`; não colocar reset em produção sem testes abaixo.

### Testes obrigatórios (planejados pós-implementação)

1. **Forgot:** usuário existente com e-mail+CPF corretos → e-mail disparado (mock ou ambiente de teste); combinação inexistente → **mesma** resposta HTTP+JSON que (1); validação body → **400** `VALIDATION_ERROR`.
2. **Forgot:** rate limit (se habilitado) após N tentativas.
3. **Verify:** token válido → `valid: true` e `nome`; token inválido, expirado, ou token já consumido → `valid: false`.
4. **Reset:** token válido + `new_password` 6 dígitos → **200**, senha alterada, login com nova senha OK; token reutilizado → falha.
5. **Reset:** senha com formato inválido → **400**.
6. **Regressão:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/verify-email` inalterados em comportamento.
7. **`npm test`** (e `npm run build` / `prisma generate` se migration).

### Próxima fatia executável (após este plano)

1. Implementar as três rotas + validações + testes Jest.  
2. Revisar RULE-8 com o diff real (request/response/erro).  
3. PR dedicada no frontend: substituir os três `fetch` por `AgilBank.api`; corrigir modal “criar senha”; alinhar `FRONTEND_URL` / path do link com a página que lê `token`.

---

## Execução — backend recuperação de senha (3001)

**Data:** 2026-05-03  
**Decisão técnica:** model `Token` com `tipo: 'password_reset'`, hash HMAC-SHA256 via `hashOpaqueToken` (mesmo segredo que refresh); **sem** novos campos em `User`; **sem** uso de `tokenVerificacao`.

### Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/middleware/auth.js` | `hashOpaqueToken`; `hashRefreshToken` delega a ele; export de `hashOpaqueToken`. |
| `src/middleware/validation.js` | `validateForgotPassword`, `validateVerifyResetToken`, `validateResetPassword`. |
| `src/routes/auth.js` | `POST /forgot-password`, `POST /verify-reset-token`, `POST /reset-password`; import `crypto`, `sendPasswordResetEmail`, validações e `hashOpaqueToken`. |
| `tests/auth.test.js` | Casos forgot / verify / reset; `prisma.$transaction.mockImplementation(Promise.all)` no `beforeEach`. |

### Contratos implementados (RULE-8)

- **POST `/api/auth/forgot-password`** — Body: `{ email, cpf }` (CPF normalizado para 11 dígitos). **Sempre 200:** `{ success: true, message: "Se os dados estiverem corretos, enviaremos as instruções para o e-mail cadastrado." }`. Se usuário encontrado por e-mail **e** CPF: invalida tokens `password_reset` ativos, cria novo `Token`, envia `sendPasswordResetEmail` (falha de SMTP só em log). **500** apenas em erro inesperado de servidor.
- **POST `/api/auth/verify-reset-token`** — Body: `{ token }`. **200** válido: `{ valid: true, nome }` (`nomeCompleto`). **200** inválido/expirado/inativo: `{ valid: false, message: "Token inválido ou expirado." }`.
- **POST `/api/auth/reset-password`** — Body: `{ token, new_password }` (6 dígitos). **200:** `{ success: true, message: "Senha redefinida com sucesso." }`. **400:** `{ success: false, message, code: 'INVALID_RESET_TOKEN' }` se token inválido. Validação de formato → **400** `VALIDATION_ERROR`. Transação: atualiza `User.senha`, desativa token de reset usado, revoga refresh tokens ativos do usuário. Auditoria: `auth.password_reset_success`.

### Testes executados

- `npm test -- tests/auth.test.js` — **21 passed** (inclui novos casos forgot / verify / reset e regressão register / login / refresh / verify-email).
- `npm run build` (`prisma generate`) — **OK**.

### Decisão Ivar pós-diff

- **Backend da fatia de reset:** aceito para integração. **Frontend (2026-05-03):** os três `fetch` de recuperação no `index.html` migrados para `AgilBank.api.request`; mensagens `message` / `code` / `error` alinhadas; modal “criar senha” sem simulação.
- **Smoke manual pendente:** fluxo completo com SMTP real e login com nova senha após reset (não coberto pelo mock Prisma). **Opcional:** `FRONTEND_URL` apontar para a página que consome `?token=`.

### Pendência frontend (histórico — concluída 2026-05-03)

- ~~Migrar os três endpoints~~ — feito; ver **Execução — frontend recuperação de senha** abaixo.
- **Ainda recomendado:** alinhar `FRONTEND_URL` no backend com a página que lê `?token=` (`/banco/index.html` vs `/reset-password`) em deploy.

---

## Execução — frontend recuperação de senha (`index.html`)

**Data:** 2026-05-03  
**Arquivo:** `agilbank-frontend/public/banco/index.html`

### Alterações (Lagertha)

| Área | Comportamento |
|------|----------------|
| **forgot-password** | `window.AgilBank.api.request('auth/forgot-password', { auth: false, method: 'POST', ... })` com `{ email, cpf }`. Sucesso: `data.success`; fecha modal esqueci senha; `alert` com `data.message` (instruções por e-mail). **Não** abre mais `mostrarCriarSenha()`. Erro: `data.message \|\| data.error`. |
| **verify-reset-token** | `AgilBank.api.request('auth/verify-reset-token', ...)`, mantém `data.valid`, `data.nome`; inválido exibe `data.message` (escapado para texto em HTML). |
| **reset-password** | `AgilBank.api.request('auth/reset-password', ...)` com `{ token: window.resetToken, new_password }`. Sucesso: `response.ok && data.success`; mensagem `data.message`. Erro: `data.message \|\| data.error \|\| data.code`. Validação local: **6 dígitos** numéricos (alinhado ao backend). |
| **criarSenhaForm** | Removido `setTimeout` / “Senha criada com sucesso”. Submit mostra orientação: senha só pelo **link do e-mail** + `alert` informativo; mensagem de erro inline no campo. Modal: copy do info-box ajustado para fluxo por e-mail. |

### Ragnar (contrato)

- Payloads e respostas conferem com o backend 3001 documentado na seção **Execução — backend recuperação de senha**.

### Ivar (parecer pós-diff)

- **`127.0.0.1:5000/api/auth` no `index.html`:** **zero** ocorrências (busca no arquivo).
- **Escopo:** somente recuperação de senha e mensagens correlatas; login/cadastro/Pix/cartão/config/emprestimo não editados nesta fatia.
- **Fluxo falso de senha:** desativado (sem simulação de persistência no modal criar senha).
- **Build:** `npm run build` em `agilbank-frontend` — **OK** (2026-05-03).

### Próximos passos opcionais

- Smoke manual: e-mail real + link + reset + login.
- Harmonizar página de destino do link (`FRONTEND_URL`) com `banco/index.html?token=` se o app legado for a entrada principal.

---

## Execução — `login.js` (`AgilBank.api`)

**Data:** 2026-05-03  
**Arquivo:** `agilbank-frontend/public/banco/js/login.js`  
**Escopo:** somente este arquivo + registro neste relatório; **`index.html` não alterado**.

### Alterações (Lagertha)

- Removidos `this.apiBase` e qualquer `127.0.0.1:5000`.
- `handleLogin`: `window.AgilBank.api.request('auth/login', { auth: false, method: 'POST', ... })` com payload `{ email, senha }` inalterado.
- Normalização de token: `accessToken` / `token` / `data.data.accessToken` / `data.data.token`.
- Normalização de usuário: `user` / `usuario` / `data.data.user` / `data.data.usuario`.
- Persistência: `AgilBank.auth.setSession(token, user)` quando existir; senão espelho manual em `sessionStorage` + `localStorage` para `govbr_token`, `agilbank_token`, `token`, `govbr_user`, `agilbank_user`.
- Erros: `data.message` / `data.error` (alinhado ao backend 3001).
- `logout`: `AgilBank.api.request('auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } })` (Bearer via cliente padrão); depois `AgilBank.auth.clearSession()` ou limpeza manual incluindo chaves `agilbank_*`.
- Removido `logout()` duplicado (código morto que era sobrescrito pela versão assíncrona).
- `showSuccessMessage`: saudação com `nomeCompleto` ou `name` (compatível com Prisma).

### Ragnar (contrato)

- `POST /api/auth/login` — resposta com `success`, `data.token`, `data.user` (refresh opcional); sem mudança de backend.
- `POST /api/auth/logout` — autenticado via `Authorization` injetado por `legacyApiClient` quando `auth !== false`.

### Ivar (parecer pós-diff)

- **`grep 127.0.0.1:5000` em `login.js`:** **zero**.
- **`index.html`:** sem diff nesta fatia; fluxo `fazerLogin()` no submit do form permanece; `LoginSystem.handleLogin()` no clique do botão agora usa a mesma base API — **recomendação de smoke:** Entrar pelo botão **Entrar** e por **Enter**, e Sair.
- **Storage:** após login com `setSession`, `govbr_token` / `agilbank_token` / `token` consistentes com `legacyAuthStore`.
- **Build:** `npm run build` (`agilbank-frontend`) — **OK** (2026-05-03).

### Contagem runtime pós-fatia (`public/banco/**/*.js`)

Restam **`127.0.0.1:5000`:** `cartao.js` (2 trechos), `formulario-conta.js` (2) — ver **Auditoria global**.

---

## Execução — `userDataManager.js` (`AgilBank.api`)

**Data:** 2026-05-03  
**Arquivo:** `agilbank-frontend/public/banco/js/userDataManager.js`  
**Escopo:** somente este arquivo + registro neste relatório.

### Alterações (Lagertha)

- Removidos `this.apiBase` e `GET .../auth/me`.
- `loadUserDataFromAPI`: `window.AgilBank.api.request('user/profile', { method: 'GET', headers: { 'Content-Type': 'application/json' } })` — Bearer via `legacyApiClient` (auth padrão).
- Pré-checagem de token: `AgilBank.auth.getToken()` com fallback `govbr_token` (comportamento próximo ao anterior).
- Parser tolerante: `data.data.user`, `data.data.profile`, objeto “flat” em `data` com `email`/`id`, `user`, `profile`.
- `normalizeUserFields`: aliases `nome_completo`, `numero_conta`, `digito_conta` a partir de `nomeCompleto`, `numeroConta`, `digitoConta` (backend Prisma).
- `persistUserToStorage`: grava `govbr_user` e `agilbank_user` em session + local; `updateUserData` reutiliza o mesmo.
- `loadUserDataFromStorage` / `userLoggedIn` / `profileUpdated`: passam por `normalizeUserFields` onde aplicável; leitura inicial aceita `agilbank_user`.
- Métodos públicos e classe preservados; `updateAllUserData` continua noop intencional.

### Ragnar (contrato)

- **`GET /api/user/profile`** — `200` com `{ success, message, data: { user } }`; campos camelCase (`nomeCompleto`, `cpf`, `email`, `numeroConta`, …). Nenhuma alteração de backend.

### Ivar (parecer pós-diff)

- **`grep 127.0.0.1:5000` em `userDataManager.js`:** **zero**.
- Arquivos fora do escopo: **não alterados**.
- **Build:** `npm run build` (`agilbank-frontend`) — **OK** (2026-05-03).
- **Smoke sugerido:** após login, no console: `window.userDataManager.refreshUserData()` — deve retornar objeto usuário ou `null` sem throw se token inválido.

---

## Plano técnico — migração `cartao.js` → `AgilBank.api` / backend 3001

**Data:** 2026-05-03  
**Escopo:** somente **plano**; **sem** edição de código, backend, `index.html`, `formulario-conta.js`, `login.js`, `userDataManager.js`, nem visual nesta entrega.

### Ragnar — contrato confirmado (`src/routes/cards.js`, `validateCardRequest`)

**Middleware global nas rotas de cartão:** `authenticateToken` + **`requireVerification`** — conta com `isVerificado: false` recebe **403** `ACCOUNT_NOT_VERIFIED` (padrão do middleware), não chega ao handler de listagem/criação.

#### GET `/api/cards`

| Item | Detalhe |
|------|---------|
| Método | GET |
| Auth | Bearer obrigatório; usuário ativo e **verificado** |
| Sucesso **200** | `{ success: true, message, data: { cartoes: Cartao[] } }` — nome da chave é **`cartoes`** (array), **não** `cards`. |
| Cartão (campos principais) | `id`, `maskedNumber`, `last4`, `validade`, `limite`, `saldoUtilizado`, `status`, `tipo`, `bandeira`, `dataSolicitacao`, `dataAprovacao`, `createdAt` — **sem** `cardToken` na resposta (`publicCard`). |
| Erro **500** | `{ success: false, message, code: 'INTERNAL_ERROR' }` |

#### POST `/api/cards`

| Item | Detalhe |
|------|---------|
| Método | POST |
| Auth | Idem GET |
| Validação | **`validateCardRequest`** em `src/middleware/validation.js`: `tipo` obrigatório, **`'credito' \| 'debito'`**; `limite` **opcional**, float **100–50000**. Campos extras no body **não** são validados nem usados pelo handler — o servidor **só lê** `tipo` e `limite`. |
| Payload efetivo | **Não** aceita “payload legado” sem `tipo`; qualquer corpo com `tipo` + `limite` válidos passa. `titular`, `renda_mensal`, `endereco`, etc. são **ignorados** pelo backend. |
| Sucesso **201** | `{ success: true, message, data: { cartao: { ... } } }` — limite em **`data.cartao.limite`** (Decimal/JSON number). |
| Erro **400** | Ex.: `CARD_ALREADY_EXISTS` — já existe cartão **mesmo `tipo`** `aprovado` ou `pendente`. Corpo típico: `success: false`, `message`, `code`. |
| Erro validação **400** | `VALIDATION_ERROR` — `errors[]` (express-validator). |
| Erro **500** | `INTERNAL_ERROR` |

**Regra de negócio:** `limite` omitido → backend usa `calculateCreditLimit(req.user.scoreCredito)`.

### Lagertha — inventário `public/banco/js/cartao.js`

| Trecho | Função | Comportamento atual |
|--------|--------|---------------------|
| **POST** ~153–247 | `enviarSolicitacao()` | Token só `localStorage.getItem('govbr_token')`. Monta `cardData`: `{ titular, limite: calcularLimite(renda), tipo: 'credito', renda_mensal, endereco, tempo_emprego }`. `fetch` hardcoded `:5000/api/cards`. |
| Uso do **resultado** | Sucesso | Lê **`result.limite`** (raiz) — **incorreto** para 3001 (`data.cartao.limite`). Persiste `localStorage.cartao_solicitado` com JSON completo da resposta. Atualiza 6 IDs de limite via `aplicarLimiteCartaoNosSeisElementos` ou lista fixa de elementos (alinhado a auditorias anteriores do `index.html`). |
| Fluxo UI pós-POST | | Esconde progresso → `vencimentoContainer`. |
| **Erro** | | `showErrorModal(..., result.error || ...)` — backend 3001 usa **`message`**, não `error` na raiz. |
| **GET** ~433–474 | `verificarCartaoSolicitado()` | Mesmo token só `govbr_token`. `result.cards \|\| []` — **incorreto** para 3001 (`data.cartoes`). Se `length > 0`, chama `ocultarTodosContainers` + `mostrarAnimacaoLogo02` + exibe `#cartaoGerenciamentoContainer`. |
| Integração | | `setTimeout` 1s envolve `showCartaoContainer` para primeiro chamar `verificarCartaoSolicitado()`. |
| **Downstream** | `selecionarVencimento` / `atualizarInformacoesCartao` | Lê `cartao_solicitado`: espera **`limite`**, **`numero`** (com substring), **`validade`**, **`status`**, **`tipo`**. Backend expõe **`maskedNumber`**, **`last4`**, não `numero` completo — **ajuste de mapeamento** necessário na fatia de execução (ex. exibir `maskedNumber` ou montar máscara a partir de `last4`). |

### Ivar — estratégia (A / B / C / D)

| Opção | Descrição | Veredito |
|-------|-----------|----------|
| **A** | Adaptar **frontend** ao contrato 3001: `AgilBank.api.request`, body mínimo `{ tipo, limite }`, parser `data.cartoes` / `data.cartao`, mensagens `message`/`code`, token via `AgilBank.auth.getToken()` com fallback, objeto normalizado para `cartao_solicitado` (limite + maskedNumber/last4 para UI). | **Recomendada** — sem mudança de backend; atende RULE-8 com diff controlado no único arquivo permitido. |
| **B** | Adapter no backend aceitar payload legado completo. | **Fora do escopo imediato** — exige decisão explícita + RFC; não planejar sem aprovação. |
| **C** | Híbrido: enviar só `{ tipo, limite }` (igual a A); dados de formulário continuam só em `dadosCartao` / localStorage para telas que não dependem da API. | **Equivalente à A** na prática — detalhe de implementação. |
| **D** | Bloquear até smoke manual prolongado. | **Paliativo** — útil como **gate antes do merge** da PR de execução, não como substituto de A/C. |

**Decisão Ivar:** **A** (com elementos de **C** onde o legado já guarda dados localmente). **B** só se produto exigir preservar envio de `endereco`/`renda` ao servidor. **D** como checklist de QA antes de liberar a fatia executável.

### Próxima fatia executável (após este plano)

1. Editar **apenas** `agilbank-frontend/public/banco/js/cartao.js` (e registrar neste relatório): substituir os dois `fetch` por `AgilBank.api.request('cards', …)`.  
2. POST: body `JSON.stringify({ tipo: 'credito', limite: calcularLimite(renda) })` — garantir `limite` entre **100 e 50000** (clamp se `calcularLimite` ultrapassar teto).  
3. Normalizar resposta POST para UI + `cartao_solicitado`: extrair `data.cartao`, expor `limite` na raiz do objeto salvo **se** o restante do fluxo continuar esperando isso, ou refatorar leituras para um único helper.  
4. GET: `const cartoes = result.data?.cartoes ?? result.cards ?? []`.  
5. Erros: `result.message \|\| result.error` + opcional `result.code`. Tratar **403** conta não verificada com mensagem clara.  
6. Token: preferir `AgilBank.auth.getToken()` alinhado a `login.js` / `legacyAuthStore`.

### Testes obrigatórios (pós-implementação futura)

- `npm run build` (`agilbank-frontend`).  
- `grep 127.0.0.1:5000` em `cartao.js` = **0**.  
- Usuário **verificado** sem cartão: abre fluxo de solicitação; POST retorna **201**; limite refletido nos 6 elementos (ou helper global).  
- Usuário com cartão: GET retorna lista; `verificarCartaoSolicitado` abre **gerenciamento**.  
- **400** `CARD_ALREADY_EXISTS` e **400** `VALIDATION_ERROR`: modal ou mensagem sem travar a página.  
- **401** / **403**: comportamento definido (mensagem + não assumir lista vazia como “sem cartão” se for erro de auth).  
- Smoke: `selecionarVencimento` + `atualizarInformacoesCartao` com objeto derivado de `data.cartao` (maskedNumber/last4).  
- **Pix** e demais fluxos: não regressão (arquivo isolado).

---

## Execução — migração `cartao.js` (`AgilBank.api`)

**Data:** 2026-05-03  
**Escopo:** apenas `agilbank-frontend/public/banco/js/cartao.js` + este relatório; estratégia **A** (contrato backend 3001).

### Lagertha (implementado)

- Helpers: `getCartaoAuthToken()`, `clampLimiteCartao`, `extrairCartaoDaResposta`, `extrairCartoesDaResposta`, `normalizarCartaoParaLegado` (objeto salvo em `localStorage.cartao_solicitado` compatível com fluxo existente: `limite`, `numero` sintético para `substring`, `maskedNumber`, etc.).
- `enviarSolicitacao()`: mantém cálculo de renda/limite; POST só `{ tipo: 'credito', limite }` via `AgilBank.api.request('cards', { method: 'POST', … })`; sucesso persiste cartão normalizado e mantém UI (6 limites / vencimento).
- `verificarCartaoSolicitado()`: GET via `AgilBank.api.request('cards', { method: 'GET' })`; lista a partir de `data.cartoes` / `cartoes` / `cards`; **401/403** tratados com modal/retorno **`undefined`** — não confundidos com “sem cartão”; `showCartaoContainer` só abre fluxo de solicitação quando `temCartao === false`.

### Validações (executadas)

| Verificação | Resultado |
|-------------|-----------|
| `grep 127.0.0.1:5000` em `public/banco/js/cartao.js` | **Zero** ocorrências |
| `npm run build` em `agilbank-frontend` | **OK** |

### Ivar (parecer pós-diff)

- Contrato **preservado** no sentido RULE-8: sem alteração de backend; payload POST alinhado a `validateCardRequest` (`tipo`, `limite`); respostas lidas como `data.cartao` / `data.cartoes`.
- `cartao_solicitado` permanece utilizável pelo legado via normalização; erros de auth (**401/403**) não viram lista vazia.
- Arquivos fora do escopo: **não alterados**.

---

## Plano técnico — migração `formulario-conta.js` → `AgilBank.api` / backend 3001 (**planejamento**)

**Data:** 2026-05-03  
**Tipo de entrega:** análise e plano **somente** neste relatório. **Nenhuma** alteração de código-fonte nesta fase.

### Ragnar — contrato backend 3001 (`src/routes/auth.js`, `src/routes/email.js`, `src/middleware/validation.js`)

| Legado (`:5000`) | Equivalente 3001 | Observação |
|------------------|------------------|------------|
| `POST /api/usuarios/criar` | **`POST /api/auth/register`** | Rota `usuarios/criar` **não** existe no app 3001. Cadastro público é `register`, **sem** Bearer obrigatório. |
| `POST /api/email/confirmacao` | **Não existe** | `src/routes/email.js`: `router.use(authenticateToken)` em todas as rotas; há `/test`, `/send`, `/send-template` — **nenhum** `POST /email/confirmacao` público. |
| E-mail após cadastro | **Já ocorre no `register`** | Após `prisma.user.create`, `sendEmail` (template `welcome`) com `tokenVerificacao` (~`auth.js` 148–160). Uma segunda chamada no front para “confirmar e-mail” tende a **duplicar** envio ou falhar (401). |
| Ativação de conta | **`POST /api/auth/verify-email`** | Body `{ token }`; marca `isVerificado`, zera `tokenVerificacao`. Fluxo por **token** no e-mail, não por endpoint legado `email/confirmacao`. |

**Campos obrigatórios reais** (`validateUserRegistration`): `nomeCompleto`, `email`, `cpf` (11 dígitos), `dataNascimento` (ISO8601, idade 18–120), `senha` (**exatamente 6 dígitos numéricos**). `telefone` opcional. Blocos `endereco` e `dadosProfissionais` **opcionais**, com validação condicional (ex.: `endereco.logradouro`, `dadosProfissionais.rendaMensal` numérico se enviados).

**Conclusão Ragnar:** `email/confirmacao` **não** deve ser migrado literalmente; alinhar criação de usuário a **`auth/register`**. Qualquer necessidade de segundo disparo de e-mail exige **RFC** (contrato, auth, rate limit).

### Lagertha — inventário `public/banco/js/formulario-conta.js` e runtime em `index.html`

**Montagem para `usuarios/criar` (`createUserInDatabase`)**  
A partir de `collectFormData()` / objeto `userData`: nomes **legados** (`nome`, `endereco.endereco`, `dadosProfissionais.renda`), mais `documentos` (apenas metadados de `File`, sem upload binário), `aceitaTermos`, `status: 'pendente_confirmacao'`, `dataCriacao`, etc. Header `Authorization: Bearer` via `getAuthToken()` → `localStorage.authToken` ou **`'anonymous'`**. Resposta esperada: **`userId`** na raiz (contrato 3001 devolve `data.user` com `id`).

**Montagem para `email/confirmacao` (`sendConfirmationEmail`)**  
Body: `{ email, userId, tipo: 'confirmacao_conta' }`. Chamado após sucesso de `createUserInDatabase`; falha é **logada** e o fluxo **continua** (`submitForm`).

**Telas / funções dependentes**  
`submitForm` → overlay de loading → criação → e-mail → `showEmailConfirmationMessage` (innerHTML em `#contaContainer`) → countdown → `window.location.href = '../index.bancogov.html'` (**caminho legado** em relação ao app em `banco/index.html`). `abrirFormularioConta` / `closeForm` controlam `#contaContainer` e `#loginContainer`.

**Duplicação com cadastro no `index.html`**  
O mesmo `index.html` define **`montarPayloadRegistro()`** e **`finalizarCadastro()`** com **`AgilBank.api.request('auth/register', { auth: false, … })`** (payload alinhado ao 3001: `nomeCompleto`, `logradouro`, `rendaMensal`). Porém **`finalizarCadastro`** só é chamada por **`proximoPasso()`**, e **não há** botão no markup com `onclick="proximoPasso()"`; a navegação visível usa **`#contaNextBtn`** / **`#contaSubmitBtn`**, ouvidos pelo **`FormularioConta`**. **Conclusão:** fluxo **ativo** hoje: **classe `FormularioConta` → `:5000`**. Trecho `register` via `AgilBank.api` no HTML está **órfão** até reconexão ou remoção em fatia futura.

**Outro carregador:** `public/banco/pages/formularioCadastrodeConta.html` também inclui `formulario-conta.js` — qualquer migração deve considerar smoke nessa página.

**Dessincronização JS ↔ DOM (dívida)**  
HTML usa `contaNomeCompleto`, `contaRua`, `contaDataNascimento`; `collectFormData` referencia `contaNome`, `contaEndereco`, `contaDataNasc`. Validações em `validateCurrentStep` citam IDs inexistentes no HTML atual (`contaSexo`, `contaConfirmarSenha`, `contaTipoEndereco`, …). Passo 4 do HTML **não** expõe inputs de documentos exigidos por `validateFormData` — risco de fluxo **inconsistente** ou submit bloqueado conforme estado do DOM.

### Ivar — riscos

- **Não quebrar abertura de conta:** regressão em `submitForm` / mensagens de erro.  
- **Não duplicar usuário:** retries ou dois fluxos concorrentes → **409** `ACCOUNT_ALREADY_EXISTS`.  
- **Não disparar e-mail duas vezes:** `register` já envia; manter `sendConfirmationEmail` apontando para API inexistente ou autenticada é **pior** que removê-lo na execução.  
- **Não mudar payload sem contrato:** mapear estritamente a `validateUserRegistration`.  
- **Backend:** sem alteração sem RFC/aprovação.  
- **Visual / IDs / globais:** preservar `abrirFormularioConta` e estrutura do formulário salvo decisão explícita de produto.

### Decisão recomendada (A / B / C)

| Opção | Significado |
|-------|-------------|
| **A** | Migrar **`formulario-conta.js`** para **`AgilBank.api.request('auth/register')`**, `auth: false`, body = mesmo shape que **`montarPayloadRegistro`**; **eliminar** a segunda chamada **`email/confirmacao`** (e-mail só pelo backend no register); parser **`data.user.id`**. Corrigir coleta de campos para bater com IDs do HTML (escopo mínimo, sem redesenho visual). |
| **B** | **Unificar** com funções já no `index.html`: `FormularioConta` delega para **`montarPayloadRegistro` + request** (exige **editar `index.html`** na fatia de execução — fora do “só um arquivo” se não exportar helper global). |
| **C** | **Gate / RFC:** não executar até definir upload de documentos no servidor (não coberto por `register`) e alinhar passo 4 do HTML ao JS; entretanto **manter** script no carregamento porque os botões dependem dele. |

**Recomendação pré-execução:** **A** como caminho padrão para zerar `:5000` com RULE-8; **B** se a equipe aceitar tocar **`index.html`** na mesma PR para remover duplicação órfã; **C** apenas se produto **exigir** persistência de documentos no backend antes de qualquer migração.

### Arquivos afetados (referência para fatia futura)

- **Obrigatório:** `agilbank-frontend/public/banco/js/formulario-conta.js`.  
- **Recomendado:** `agilbank-frontend/public/banco/index.html` (remover ou reconectar `finalizarCadastro` / `montarPayloadRegistro`).  
- **Smoke:** `public/banco/pages/formularioCadastrodeConta.html`.  
- **Backend:** nenhum nesta linha, salvo RFC.

### Testes obrigatórios (pós-implementação futura)

- `npm run build`; `grep 127.0.0.1:5000` em `formulario-conta.js` = **0**.  
- Registro com sucesso (**201**), **um** e-mail de boas-vindas/verificação.  
- **409** / **400** com mensagem tratada.  
- `abrirFormularioConta`, fechar, login não regressivos.  
- `POST /api/auth/verify-email` com token recebido (smoke conforme ambiente).

### Migrar × remover carregamento × manter

- **Migrar** (`A`/`B`): alvo principal para eliminar as **duas** URLs `:5000` restantes em `public/banco/js`.  
- **Remover do `index.html` sem substituir handlers:** **não** recomendado — `#contaNextBtn` / `#contaSubmitBtn` quebrariam.  
- **Manter sem migrar (só plano):** obsoleto para **`formulario-conta.js`** — fatia **executada** (2026-05-03); ver **Execução — migração `formulario-conta.js`**.

---

## Execução — migração `formulario-conta.js` (`AgilBank.api`)

**Data:** 2026-05-03  
**Escopo:** apenas `agilbank-frontend/public/banco/js/formulario-conta.js` + este relatório; estratégia **A** (sem `index.html`, sem backend).

### Lagertha (implementado)

- `collectFormData`: leitura com fallback **`contaNomeCompleto` / `contaNome`**, **`contaDataNascimento` / `contaDataNasc`**, **`contaRua` / `contaEndereco`** para conviver com `index.html` e `formularioCadastrodeConta.html`.
- `buildRegisterPayload` + `createUserInDatabase`: `POST` via **`window.AgilBank.api.request('auth/register', { auth: false, method: 'POST', headers: { 'Content-Type': 'application/json' }, body })`**; payload alinhado a **`validateUserRegistration`** (`nomeCompleto`, `cpf` 11 dígitos, `dataNascimento`, `senha`, `endereco` com **`logradouro`**, `dadosProfissionais` com **`rendaMensal`** quando aplicável).
- Resposta: **`data.user.id`** (com tolerância a aliases); retorno **`{ userId, status, message, data }`** compatível com `submitForm`.
- `sendConfirmationEmail`: **sem rede**; `console.info` informando que o e-mail de verificação já sai do **`register`**; retorno **`{ success: true, skipped: true }`**.
- Erros: **`message` / `error` / `code`** e primeiro item de **`errors[]`** (validação); **não** simula sucesso se `!response.ok` ou `success === false`.

### Ragnar (contrato — somente confirmação em documentação)

- Payload final compatível com **`validateUserRegistration`** (`src/middleware/validation.js`).
- **`register`** dispara e-mail de boas-vindas/verificação no backend (`src/routes/auth.js`); nenhum endpoint novo necessário para substituir `email/confirmacao`.

### Validações (executadas)

| Verificação | Resultado |
|-------------|-----------|
| `grep 127.0.0.1:5000` em `public/banco/js/formulario-conta.js` | **Zero** ocorrências |
| `grep 127.0.0.1:5000` em `agilbank-frontend/public/banco/` (`*.js`, `*.html`) | **Zero** ocorrências (runtime legado `banco`) |
| `npm run build` em `agilbank-frontend` | **OK** |

### Ivar (parecer pós-diff)

- **`auth: false`** no `register`; sem Bearer espúrio.
- Dupla chamada de e-mail **eliminada**; fluxo visual **`submitForm` / `showEmailConfirmationMessage`** preservado.
- Arquivos fora do escopo: **não alterados** (incl. `index.html`, `login.js`, `cartao.js`, backend).

---

## Auditoria global — URLs legadas `127.0.0.1:5000` / `localhost:5000`

**Data:** 2026-05-03  
**Escopo:** somente **mapeamento**; **sem** edição de código, backend ou frontend nesta entrega.  
**Metodo:** `grep` em `*.{js,html,ts,tsx,json}` sob o repo (excluindo `docs/` na classificação de **código ativo**; menções em documentação/README anotadas à parte).

### Validações (planejadas / executadas nesta auditoria)

| Verificação | Resultado |
|-------------|-----------|
| `grep` `127.0.0.1:5000` / `localhost:5000` em `agilbank-frontend/public/banco/index.html` | **Zero** ocorrências |
| `grep` em `src/**` | **Zero** ocorrências |
| `grep` em `agilbank-frontend/public/banco/js/*.js` | **Zero** ocorrências `127.0.0.1:5000` após migração **`formulario-conta.js`** (2026-05-03); runtime **`public/banco`** (`*.js`/`*html`) sem `:5000` |
| Backend `auth/login`, `register`, reset | **Intactos** nesta auditoria (somente leitura); nenhuma alteração requerida pelo escopo |

### Tabela de ocorrências restantes (código ativo)

| # | Arquivo | Linha (aprox.) | Endpoint / uso | Método | Carregado no dashboard? | Risco (Lagertha) | Equivalente 3001 (Ragnar) | Recomendação |
|---|---------|----------------|----------------|--------|-------------------------|------------------|----------------------------|--------------|
| 1–3 | `public/banco/js/login.js` | — | `auth/login`, `auth/logout` | POST | **Sim** | **Concluído 2026-05-03** — `AgilBank.api` + normalização token/user + `setSession` / `clearSession`. Duplo caminho com `fazerLogin()` no `index` permanece; smoke: botão Entrar vs submit. | `POST /api/auth/login`, `POST /api/auth/logout` | Opcional futuro: unificar um único handler no HTML. |
| 4–5 | `public/banco/js/userDataManager.js` | — | `user/profile` (antes `auth/me`) | GET | Sim | **Concluído 2026-05-03** — `AgilBank.api.request('user/profile')`, parser tolerante, aliases snake_case. | **`GET /api/user/profile`** | — |
| 6 | `public/banco/js/cartao.js` | — | `cards` | POST | Sim | **Concluído 2026-05-03** — `AgilBank.api.request('cards')`, body `{ tipo, limite }`, parser `data.cartao`, `cartao_solicitado` normalizado. | **`POST /api/cards`** | Ver **Execução — migração `cartao.js`**. |
| 7 | `public/banco/js/cartao.js` | — | `cards` | GET | Sim (`verificarCartaoSolicitado`) | **Concluído 2026-05-03** — `data.cartoes` / aliases; 401/403 não viram “sem cartão”. | **`GET /api/cards`** | Idem. |
| 8 | `public/banco/js/formulario-conta.js` | — | `auth/register` (antes `usuarios/criar`) | POST | Sim | **Concluído 2026-05-03** — `AgilBank.api.request('auth/register', { auth: false })`, payload `validateUserRegistration`. | **`POST /api/auth/register`** | Ver **Execução — migração `formulario-conta.js`**. |
| 9 | `public/banco/js/formulario-conta.js` | — | — (antes `email/confirmacao`) | — | Sim | **Concluído 2026-05-03** — e-mail só no backend no `register`; `sendConfirmationEmail` sem rede. | — | Idem. |

**Nota:** `localhost:5000` não apareceu nos `.js`/`.html` do legado banco; apenas `127.0.0.1:5000`. `README.md` pode citar `localhost:5000` em texto — fora da contagem de runtime.

### Ordem sugerida das próximas fatias (Ivar)

1. ~~**`login.js`**~~ — **feito** (2026-05-03); ver **Execução — login.js**.
2. ~~**`userDataManager.js`**~~ — **feito** (2026-05-03); ver **Execução — userDataManager.js**.
3. ~~**`cartao.js`**~~ — **feito** (2026-05-03); ver **Execução — migração `cartao.js`**.
4. ~~**`formulario-conta.js`**~~ — **feito** (2026-05-03); ver **Execução — migração `formulario-conta.js`**.

**URLs `127.0.0.1:5000` no runtime `agilbank-frontend/public/banco/` (`*.js`/`*html`):** **zero** após migração do formulário (2026-05-03). Próximas revisões: grep ampliado no monorepo, `docs/`, README, e código órfão (`finalizarCadastro` no `index.html`) conforme produto.

### Testes obrigatórios (quando executar migrações)

- `npm run build` (`agilbank-frontend`).
- `grep 127.0.0.1:5000` nos arquivos migrados = **0**.
- Smoke: login, logout, fluxo cartão (após fatia cartão), formulário conta (após fatia formulario).
- Confirmar **RULE-8** para cada path (request/response/erro).

---

## Auditoria final pré-commit — runtime `agilbank-frontend/public/banco`

**Data:** 2026-05-03  
**Escopo:** revisão **somente documentada** aqui; leitura de `AGILBANK-STATUS-MIGRACAO-LEGADO.md` e `AGILBANK-RELATORIO-MIGRACAO-HTML-UNICO.md`. Objetivo: decidir se o legado **`public/banco`** está pronto para **commit** do pacote de migração.

### Validações executadas (nesta auditoria)

| Verificação | Resultado |
|-------------|-----------|
| `grep` `127.0.0.1:5000` e `localhost:5000` em `agilbank-frontend/public/banco/**/*.js` e `*.html` | **Zero** ocorrências |
| `npm run build` em `agilbank-frontend` | **OK** (Vite produção concluída) |
| Heurística `onclick` → primeiro token de chamada vs `function` / `window.* =` nos mesmos `.html`/`.js` sob `public/banco` | **Nenhum** candidato óbvio a handler inexistente (limitação: não valida funções definidas dinamicamente fora desse padrão) |

### Ivar — checklist

- **URLs legadas `:5000` no runtime banco:** **ausentes** nos `.js`/`.html` pesquisados.
- **Login/logout:** `login.js` mantém fluxo com `AgilBank.api`; `logout` global permanece no arquivo (ex.: `async function logout`); globais de tela continuam no `index.html` conforme relatório HTML único.
- **`FormularioConta`:** script `formulario-conta.js` ainda carregado e instanciado no `DOMContentLoaded` do `index.html`; `abrirFormularioConta` preservada.
- **Pix:** não consta alteração desta sequência nos arquivos da migração API do legado (`cartao`, `formulario-conta`, `login`, `userDataManager`, legados `legacy*`); **smoke manual** recomendado por ser área sensível.
- **Backend neste working tree:** `git status` mostra **`src/middleware/auth.js`**, **`src/middleware/validation.js`**, **`src/routes/auth.js`** **modificados** (diff relevante). **Se o commit pretendido for “só frontend legado”**, tratar como **bloqueio de escopo**: separar commits/PRs ou documentar explicitamente que o backend entra no mesmo pacote. **Se o pacote for full-stack intencional**, não é bloqueio técnico da migração do banco.

### Ragnar — contratos `AgilBank.api` vs backend 3001

| Caminho legado (`request('…')`) | Backend `src/routes` | Observação |
|----------------------------------|----------------------|------------|
| `auth/login` | `POST /api/auth/login` | Alinhado (`auth.js`). |
| `auth/logout` | `POST /api/auth/logout` | Requer Bearer; alinhado. |
| `auth/register` | `POST /api/auth/register` | Público; `formulario-conta.js` usa `auth: false`. |
| `user/profile` | `GET /api/user/profile` | Alinhado (`user.js`). |
| `cards` GET/POST | `GET`/`POST /api/cards` | Alinhado (`cards.js`); front envia `{ tipo, limite }` no POST. |
| Recuperação de senha | `forgot-password`, `verify-reset-token`, `reset-password` | Rotas presentes em `auth.js`; fluxo no `index` migrado em fases anteriores (não revalidado linha a linha nesta auditoria). |

Nenhum endpoint novo foi exigido pelo desligamento de `:5000` no runtime banco após `formulario-conta.js`.

### Lagertha — ordem de scripts e código órfão

- **`legacyAuthStore.js`**, **`legacyApiClient.js`**, **`legacyNavigation.js`:** carregados no **`<head>`** do `index.html` **antes** do script inline que usa `AgilBank.auth` / gate de login — ordem **adequada**.
- **`cartao.js`:** usa `AgilBank.api.request('cards')` com normalização de resposta e `cartao_solicitado` (conforme execução registrada).
- **`formulario-conta.js`:** fluxo visual `submitForm` → loading → mensagem de e-mail preservado; registro via `auth/register` sem segunda chamada de rede para confirmação.
- **Código órfão (fase futura, sem ação nesta auditoria):** no `index.html`, **`finalizarCadastro`** / **`montarPayloadRegistro`** / **`proximoPasso`** — caminho **`AgilBank.api` + register** documentado como **desconectado** do DOM (sem `onclick="proximoPasso()"` nos botões visíveis); unificar ou remover em RFC para evitar duplicação. **`user/settings`** no `index.html` já usa **`AgilBank.api.request`** (sem `:5000` no grep atual do `public/banco`).

### Parecer final

| Pergunta | Resposta |
|----------|----------|
| **Pronto para commit (runtime `public/banco` + docs de migração)?** | **Sim**, quanto ao objetivo **zerar `:5000`** e manter fluxos migrados para **`localhost:3001`** via `AgilBank.api`. |
| **Bloqueios** | **Escopo misto:** alterações **não revisadas aqui** em **`src/`**; se a intenção é PR só do legado, **separar** ou **incluir revisão backend** no mesmo merge com parecer explícito. |
| **Riscos não bloqueantes** | Heurística `onclick` não substitui teste manual completo; **Pix** e telas não tocadas merecem smoke; **código órfão** de cadastro no HTML pode confundir manutenção futura. |

### Checklist manual recomendado (pré-merge)

1. Login com e-mail e com CPF (se aplicável ao ambiente).  
2. Logout e retorno à tela de login.  
3. Abrir **abertura de conta**, submeter fluxo feliz (ou erro 409 duplicado) contra API 3001 real.  
4. Solicitar cartão (POST) e abrir gerenciamento (GET) com usuário verificado.  
5. Perfil / refresh de dados se usar `userDataManager`.  
6. Fluxo **Pix** superficial (abrir modais / sem regressão visual).  
7. Confirmar **um** e-mail de verificação após registro (sem duplicidade).  
8. Se `src/` entra no commit: rodar testes backend existentes (`npm test` / CI do repositório).

---

## Plano resumido — Fase 1 “dados reais no header/dashboard” — 2026-05-03 (pré-execução)

- Remover fallback `|| 4300` em `GET user/user-complete-data` (`src/routes/user.js`); `limite_cartao` / `limiteCartao` refletem o banco ou `null` se inválido/ausente.
- Introduzir `window.normalizarDadosUsuarioBruto`, `window.aplicarDadosUsuarioReais` e `textoSaldoExtratoOuMensagem` no `agilbank-frontend/public/banco/index.html`; conta = agência + número + dígito (nunca CPF).
- `login.js` / `userDataManager.js`: delegar atualização de header ao `aplicarDadosUsuarioReais` quando existir.
- Ajustar `carregarDadosPerfilAutomaticamente`, `usarDadosPadrao`, `carregarPerfilUsuario`, `atualizarInterfacePerfil`, `forceUpdateHeaderData`, extrato/toggle saldo e HTML estático do header para não exibir trio fictício após autenticação.

## Execução — Fase 1 “dados reais no header/dashboard” — 2026-05-03

Alterações:

- **`src/routes/user.js`:** `limite_cartao` / `limiteCartao` sem `|| 4300`; valores numéricos do BD ou `null` se não numérico.
- **`agilbank-frontend/public/banco/index.html`:** função única `aplicarDadosUsuarioReais`; perfil/API/login normalizados; sem mocks quando há token; estado público com placeholders neutros; extrato usa saldo real ou mensagem honesta; removida duplicata morta de `showExtratoContainer` (GovBr); HTML inicial do header/saldo/limite com `—` em vez de e-mail/conta fictícios.
- **`agilbank-frontend/public/banco/js/login.js`:** `updateUserHeader` chama `aplicarDadosUsuarioReais` com `fonte: 'login'`.
- **`agilbank-frontend/public/banco/js/userDataManager.js`:** `updateAllUserData` / `updateMainUserInfo` delegam ao `aplicarDadosUsuarioReais`.

Validações (obrigatórias):

| Verificação | Resultado |
|-------------|-----------|
| `npm run build` em `agilbank-frontend` | **OK** |
| `npm test` na raiz (backend alterado) | **OK** (21 testes) |
| `grep` `email@exemplo.com` em `public/banco/index.html` | **Zero** (permanecem apenas placeholders de formulário `000.000.000-00` em inputs, não como dado de conta logada) |
| `grep` `saldoReal = 1500.50` | **Zero** |
| `grep` `\|\| 4300` em `src/routes/user.js` | **Zero** |

**RULE-8:** resposta `user-complete-data` pode trazer `limite_cartao: null`; o front oculta bloco de limite ou exibe `—` no header quando não houver limite positivo.

### Ivar — parecer

- **Pós-login:** header/menu não deve mostrar `email@exemplo.com`, “Usuário” genérico nem CPF como número de conta; falha de API com token mostra “Dados indisponíveis”, não mocks.
- **Limite 4300:** removido no backend; sem limite inventado.
- **Saldo extrato:** sem constante `1500.50`; alinhado ao saldo vindo da API ou mensagem explícita.
- **Globais:** nenhuma função global removida; Pix/cartão transacional/empréstimo fora do escopo não foram alterados nesta fase.
- **Recomendação:** smoke manual login → dashboard → extrato → perfil após deploy.

---

## Auditoria pós-execução — Fase 1 dados reais — 2026-05-03

Escopo: revisão estática + comandos; **nenhuma alteração de código** nesta auditoria.

### Validações repetidas

| Verificação | Resultado |
|-------------|-----------|
| `npm run build` (`agilbank-frontend`) | **OK** |
| `npm test` (raiz) | **OK** (21 testes) |
| `grep` `email@exemplo.com`, `saldoReal = 1500.50`, `\|\| 4300` em `public/banco/**/*.{html,js}` e `user.js` | **Zero** ocorrências problemáticas nos caminhos citados |

### Ivar — confirmação

| Critério | Veredito |
|----------|----------|
| Logado: sem `email@exemplo.com` / trio fictício no header | **Atende** — HTML inicial `—`; `aplicarDadosUsuarioReais` em modo indisponível usa “Dados indisponíveis” + texto de e-mail de erro, não mocks de conta. |
| CPF como `#user-account` | **Atende** — linha de conta via `formatarLinhaContaUsuario` (agência + número + dígito). |
| Limite 4300 | **Atende** — `user.js` usa `limiteCartaoRaw` numérico ou `null`. |
| Extrato sem constante fixa | **Atende** — `saldoReal` sincronizado na aplicação real; `textoSaldoExtratoOuMensagem()` cobre ausência de saldo. |
| Falha API com token | **Atende** — `carregarPerfilUsuario` 401/erro/catch → `estado: 'indisponivel'`; `usarDadosPadrao` com token idem. |
| Globais preservados | **Atende** — `window.aplicarDadosUsuarioReais`, `window.forceUpdateHeaderData`, etc. mantidos. |
| Pix / cartão / empréstimo fora do escopo | **Atende** na amostragem — alterações concentradas em perfil/header/extrato/saldo; fluxos Pix não tocados nesta leitura. |

**Ressalva não bloqueante:** texto “Usuário” permanece como fallback em **toast** de sucesso do `login.js` e em cópia estática de **pós-abertura de conta** (`#contaUserName`); não é dado do header/dashboard autenticado.

### Lagertha — fluxo visual (revisão por código)

| Momento | Comportamento esperado |
|---------|------------------------|
| Header antes da API | `—` no markup; após script init saldo `—`. |
| Login → dashboard | `updateUserHeader` → `aplicarDadosUsuarioReais` com payload do login; depois `carregarPerfilUsuario` pode refinar. |
| Refresh com token | `carregarDadosPerfilAutomaticamente` usa token → API. |
| Perfil | `atualizarInterfacePerfil` delega header a `aplicar` + campos de painel a partir de `user_data.usuario`. |
| Extrato | `valorCredito` via `textoSaldoExtratoOuMensagem()`. |
| Menu usuário | Mesmos nós que o header (`user-menu-*`). |
| Agência / conta / dígito null | `formatarLinhaContaUsuario` devolve mensagens honestas (“Dados da conta indisponíveis”, “Conta em processamento”, parcial com só agência). |

**Não substitui** smoke manual no browser.

### Ragnar — contrato

- **`user-complete-data`:** `limite_cartao` / `limiteCartao` podem ser **`null`**; não há mais coerção para 4300.
- **Frontend:** ramo `limiteC != null && limiteC > 0` evita `toFixed`/`toLocaleString` em `null`; caso contrário painel oculto e header `—`.
- **Login / profile / complete-data:** não alterados estruturalmente além do limite; nome/e-mail/saldo continuam nos objetos já consumidos pelo normalizador.

### Parecer final

**Aprovado para commit** quanto à Fase 1 e ausência de bloqueios técnicos identificados nesta auditoria. Risco residual: apenas **smoke manual** e eventual integração externa que assumisse limite numérico sempre presente (mitigar com release note RULE-8).

---

## Plano — Fase próxima: R-03 / R-04 — confirmação de e-mail e reset de senha (auxiliares)

**Data:** 2026-05-03. **Escopo:** planejamento apenas; **sem alteração de código** nesta entrega.

**Referência:** `AGILBANK-AUDITORIA-PROFUNDA-SISTEMA.md` (R-03, R-04, R-08); impacto em `requireVerification` (Pix/cartão).

### Ragnar — contrato backend real (`src/routes/auth.js` + `src/middleware/validation.js`)

| Rota | Auth | Body | Respostas de sucesso | Erros típicos |
|------|------|------|----------------------|---------------|
| `POST /api/auth/verify-email` | **Pública** (sem Bearer) | `{ token }` **apenas** (`auth.js` ~735–778) | `200` `{ success: true, message: 'Email verificado com sucesso' }` | `400` `{ success, message, code: 'TOKEN_REQUIRED' \| 'INVALID_TOKEN' }`; `500` `{ success, message, code: 'INTERNAL_ERROR' }` |
| `POST /api/auth/verify-reset-token` | **Pública** | `{ token }` (validação `validateVerifyResetToken`) | `200` `{ valid: true, nome }` ou `200` `{ valid: false, message }` | `500` `{ success: false, message, code: 'INTERNAL_ERROR' }` |
| `POST /api/auth/reset-password` | **Pública** | `{ token, new_password }` — `new_password` deve ser **6 dígitos** (`/^\d{6}$/`) | `200` `{ success: true, message: 'Senha redefinida com sucesso.' }` | `400` token inválido `{ success, message, code: 'INVALID_RESET_TOKEN' }`; validação `{ success, message: 'Dados inválidos', errors: [...], code: 'VALIDATION_ERROR' }`; `500` interno |

**Notas RULE-8:** não há campo `error` top-level nas respostas de domínio; usar **`message`** (e `code` quando existir). Erros de validação usam **`errors`** (array).

**Links por e-mail (`src/utils/email.js`):**

- Boas-vindas: `${FRONTEND_URL}/verify-email?token=...`
- Reset: `${FRONTEND_URL}/reset-password?token=...`

**Desalinhamento estrutural:** no repo, os HTML estáticos estão em `agilbank-frontend/public/banco/confirmar-email.html` e `.../reset-password.html`. O Vite expõe `public/` na raiz do dev server → URLs reais típicas: `/banco/confirmar-email.html` e `/banco/reset-password.html`, **não** `/verify-email` nem `/reset-password`, salvo proxy/rewrite ou `FRONTEND_URL` já incluir subpath e arquivos renomeados. **Corrigir na mesma fase** (template de e-mail e/ou rotas estáticas) para o clique no link abrir a página certa.

### Lagertha — mapeamento frontend atual

| Arquivo | Transporte | Host / path | Comportamento |
|---------|--------------|-------------|---------------|
| `confirmar-email.html` | `fetch` **direto** (não carrega `legacyApiClient` / `AgilBank.api`) | `https://aggibank-production.up.railway.app/api/auth/confirm-email` — **rota inexistente** (backend só tem `verify-email`) | Lê `token` e `email` da query; envia body `{ token, email }`; falha silenciada (`.catch` só log); UI já mostra sucesso **antes** da API; countdown + redirect para `index.agilbank.html` |
| `reset-password.html` | `fetch` direto | **(1)** `POST /api/auth/verify-reset-token` — path **relativo** (resolve para origem da página, p.ex. `localhost:5173`) — **não** é o backend 3001 por padrão; **(2)** `POST` reset em `https://aggibank-production.up.railway.app/api/auth/reset-password` | Se token OK, exibe formulário; sucesso substitui HTML interno; “Voltar” usa `href='/'`; erro de API usa `data.error` — **incompatível** com contrato (`message`) |

**Mensagens / redirects:** confirmar e-mail → login legado `index.agilbank.html`; reset → `/` após sucesso ou voltar (pode não ser a rota real do app `/banco/` ou `/login`).

**Riscos de UX no próprio HTML (para execução):** `reset-password.html` referencia `getElementById('strengthFill')`, `strengthText`, `confirmPasswordSuccess` em JS, mas esses elementos **não existem** no markup — risco de **exceção** em fluxos de validação (corrigir ou remover handlers mortos na fase de código).

### Ivar — classificação de riscos

| ID | Nível | Motivo |
|----|-------|--------|
| R-03 | **BLOQUEANTE** | Confirmação não chama `verify-email`; usuário pode permanecer `isVerificado: false` → **Pix/cartão** com `requireVerification` falham. |
| R-04 | **BLOQUEANTE** | Verify em origem errada + reset em Railway → fluxo incoerente; reset pode falhar ou validar token contra ambiente errado. |
| Link e-mail vs ficheiro | **BLOQUEANTE** | `/verify-email` e `/reset-password` podem **404** no Vite se `FRONTEND_URL` não apontar para páginas que existem (ou sem rewrite). |
| Parser `data.error` vs `message` | **ALTO** | Mensagem de erro genérica ou vazia após falha real. |
| IDs ausentes (força da senha / sucesso confirmação) | **ALTO/MÉDIO** | Possível quebra de script em interação com formulário. |
| Redirect `index.agilbank.html` / `/` | **MÉDIO** | Copy e destino pós-sucesso podem confundir; não impede verificação se API for corrigida. |

### Plano de execução (futura — não aplicado aqui)

1. **`confirmar-email.html`**  
   - Trocar URL para `{API_BASE}/api/auth/verify-email` com `API_BASE` configurável (env ou `http://localhost:3001` em dev), **sem** Railway fixo.  
   - Body: `{ token }` (email opcional só para UI; backend ignora).  
   - Tratar resposta: `success`; em falha, mostrar estado de erro honesto (não só sucesso cosmético).  
   - Redirect alinhado ao login real do produto (ex. `/login` ou `/banco/...` conforme deploy).

2. **`reset-password.html`**  
   - Uma única **`API_BASE`** para `verify-reset-token` e `reset-password`.  
   - Remover host Railway embutido.  
   - Erros: ler `data.message` e, se `VALIDATION_ERROR`, primeiro item de `errors` ou `message`.  
   - Opcional: carregar mesmo padrão que o legado (`AGILBANK_API_BASE` / script mínimo) para não duplicar constantes.

3. **`src/utils/email.js` (se necessário para fechar o fluxo)**  
   - Ajustar paths para refletir URLs reais servidas (ex. `.../banco/confirmar-email.html?token=` e `.../banco/reset-password.html?token=`) **ou** adicionar redirects no servidor front.  
   - Documentar `FRONTEND_URL` no `.env.example` (sem commit de segredos).

4. **Backend:** manter rotas atuais; alterar só se decisão de produto exigir (ex. aceitar `email` no verify-email — hoje **não** necessário).

5. **Visual:** preservar CSS/layout; apenas lógica de rede, mensagens e redirects.

### Arquivos previstos para edição (execução)

- `agilbank-frontend/public/banco/confirmar-email.html` (bloco `fetch` ~234–248, redirect ~230).  
- `agilbank-frontend/public/banco/reset-password.html` (`verifyToken`, `submitPasswordReset`, tratamento de erro, opcionalmente JS morto de strength).  
- `src/utils/email.js` (href dos templates — se alinhamento URL/página for por e-mail).  
- Opcional: `docs/` ou `.env.example` para `FRONTEND_URL` + convenção de path `/banco/`.

### Testes sugeridos (após implementação)

- `npm test` (já cobre `verify-email`, `verify-reset-token`, `reset-password`).  
- Manual: link com token válido/inválido; front dev (5173) + API (3001) com CORS; fluxo feliz verificação e `isVerificado` no BD.  
- `grep` pós-patch: `confirm-email`, `aggibank-production`, `railway.app` em auxiliares (zero em hardcode se política for env-only).

### Parecer Ivar (planejamento)

A fase está **bem definida** e **deve** ser executada antes de tratar outros bloqueantes dependentes de conta verificada. **Bloqueio atual:** R-03 + R-04 + possível mismatch **FRONTEND_URL ↔ ficheiros** permanecem **abertos** até a implementação; o plano acima é **aprovado para próxima execução** (commit de código), com revisão RULE-8 nos links de e-mail se o contrato da URL mudar.
