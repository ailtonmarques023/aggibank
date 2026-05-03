# Auditoria Estrutural de IDs, Funcoes e Referencias do Legado AgilBank

Data: 2026-05-03

## Objetivo

Verificar se IDs duplicados, IDs inexistentes, funcoes aparentemente ausentes e arquivos referenciados ainda fazem parte de telas/fluxos ativos do dashboard legado em `agilbank-frontend/public/banco/index.html`.

Escopo: somente auditoria e documentacao. Nenhum codigo foi alterado.

## Fontes Consultadas

- `docs/reports/AGILBANK-STATUS-MIGRACAO-LEGADO.md`
- `docs/reports/AGILBANK-RELATORIO-MIGRACAO-HTML-UNICO.md`
- Diff atual do workspace
- `agilbank-frontend/public/banco/index.html`
- Scripts em `agilbank-frontend/public/banco/js/`
- Rotas backend em `src/routes/`

## Tabela de Auditoria

| Item auditado | Onde aparece | Quem usa | Tela/fluxo relacionado | Classificacao | Recomendacao | Risco de mexer |
|---|---|---|---|---|---|---|
| `valorLiberado` | 8 ocorrencias de `id` no HTML: emprestimo liberado, opcoes de limite, cartao virtual e cartao fisico | `querySelectorAll('#valorLiberado')` no `index.html`; `getElementById('valorLiberado')` em `cartao.js`; `containerEmprestimo.js` comentado tambem usa | Emprestimo, limite, cartao virtual/fisico | Necessario, mas duplicado perigoso | Futuramente trocar para IDs por contexto ou seletores escopados por container | Alto: limite/credito pode atualizar elemento errado |
| `limiteProgressFill` | 4 ocorrencias: header de limite, emprestimo, cartao virtual, cartao fisico | `getElementById('limiteProgressFill')` no `index.html`; `containerEmprestimo.js` comentado tambem usa | Limite/cartao/emprestimo | Necessario, mas duplicado perigoso | Separar por contexto ou usar classe + root de container | Medio/alto: barra errada pode ser atualizada |
| `novaSenha` | 2 ocorrencias: markup inicial do modal e HTML dinamico recriado em `verificarTokenReset()` | `configurarFormularioRedefinirSenha()` usa `getElementById('novaSenha')` | Reset de senha | Necessario e deve ficar ate refatoracao coordenada | Nao remover agora; se corrigir, consolidar para um unico formulario ativo ou IDs unicos por instancia | Alto: quebra reset de senha |
| `confirmarSenha` | 2 ocorrencias: markup inicial do modal e HTML dinamico recriado em `verificarTokenReset()` | `configurarFormularioRedefinirSenha()` usa `getElementById('confirmarSenha')` | Reset de senha | Necessario e deve ficar ate refatoracao coordenada | Mesma estrategia de `novaSenha` | Alto: quebra validacao de senha |
| `redefinirSenhaForm` | 2 ocorrencias: markup inicial e HTML dinamico do reset | `fecharRedefinirSenha()` e `configurarFormularioRedefinirSenha()` | Reset de senha | Necessario e deve ficar ate refatoracao coordenada | Consolidar formulario ou escopar pelo modal ativo em fase propria | Alto: submit/reset podem atingir formulario errado |
| `btnBloquear` | 2 ocorrencias: cartao virtual e cartao fisico | `onclick="bloquearCartao()"`; nao ha uso direto por ID encontrado | Cartao virtual/fisico | Necessario, mas precisa renomear se virar funcional | Manter por enquanto; futuramente usar IDs por container ou classe comum | Medio: baixo uso atual, mas risco em futuras integracoes |
| `movimentacoesLista` | 2 ocorrencias: cartao virtual e cartao fisico | Nenhum uso direto encontrado no JS atual | Movimentacoes de cartao | Provavelmente morto/visual, mas manter ate teste manual | Nao remover sem teste da tela de cartao; se necessario, trocar por classe | Baixo/medio: pode afetar layout ou futuro preenchimento |
| `numeroCartao` | 2 ocorrencias: cartao virtual e cartao fisico | `cartao.js` e `copiarDadosCartao()` usam `getElementById` | Cartao virtual/fisico | Necessario, mas duplicado perigoso | Usar IDs distintos ou `querySelector` dentro de `cartaoVirtualContainer` / `cartaoFisicoContainer` | Medio/alto: numero copiado/atualizado pode ser o cartao errado |
| `validadeCartao` | 2 ocorrencias: cartao virtual e cartao fisico | `cartao.js` e `copiarDadosCartao()` usam `getElementById` | Cartao virtual/fisico | Necessario, mas duplicado perigoso | Mesma estrategia de `numeroCartao` | Medio/alto |
| `titularCartao` | 2 ocorrencias: cartao virtual e cartao fisico | `copiarDadosCartao()` usa `getElementById`; atualizacao pelo backend nao foi confirmada | Cartao virtual/fisico | Necessario, mas duplicado perigoso | Escopar por container e confirmar quem atualiza titular | Medio |
| `cartaoContainer` | Usado em `getElementById`, listas de hide/show e `voltarParaCartaoSolicitacao()`; nao existe `id="cartaoContainer"` no HTML | Navegacao inline e `legacyNavigation.js` mapeia `cartao: 'cartaoContainer'` | Navegacao/cartao | Necessario, mas precisa renomear/alinhamento | Alinhar com `cartaoGerenciamentoContainer` ou criar container real apenas apos plano especifico | Alto: acesso `.style` em `null` pode quebrar navegacao e afetar Pix indiretamente |
| `vantagensContainer` | Usado em `levarParaVantagens()`; nao existe `id`, apenas area com classe de vantagens dentro de credito | Funcao `levarParaVantagens()`; nenhum caller encontrado | Credito/vantagens | Indefinido, provavelmente morto ate ser chamado | Manter; se ativar fluxo, adicionar id correto ou escopar para `.vantagens-container` | Baixo agora, alto se funcao for chamada |
| `mostrarTermosCondicoes()` | Chamado em `onclick` no aceite de termos do emprestimo | Definido apenas em `containerEmprestimo.js`, que esta comentado; nao carregado no runtime atual | Emprestimo/termos | Indefinido e deve permanecer ate teste manual, mas onclick parece quebrado | Reexpor funcao no script ativo ou migrar comportamento para `emprestimo_refatorado.js`; evitar conflito com `fecharModalTermos` de configuracoes | Alto: clique pode gerar `ReferenceError` |
| `dynamic_card_form_conta_style.html` | Referenciado por `openDynamicCardForm()` e `showTransporteCartao()` | Navegacao via `window.location.href` | Pedido/ver cartao | Morto/quebrado no workspace atual: arquivo nao encontrado | Corrigir destino para arquivo existente ou criar pagina real em fase propria | Medio/alto: fluxo de pedir/ver cartao pode ir para 404 |

## Dependencias Backend/API

- `valorLiberado` e `limiteProgressFill` dependem indiretamente de `GET /api/user/user-complete-data`, especialmente `limite_cartao` / `limiteCartao`, e tambem de fluxos de cartao em `cartao.js`.
- `numeroCartao`, `validadeCartao` e `titularCartao` pertencem ao fluxo de cartoes. O backend possui rotas de cards, mas os IDs duplicados sao problema de DOM/seletores, nao de contrato HTTP.
- `novaSenha`, `confirmarSenha` e `redefinirSenhaForm` pertencem ao reset de senha. O frontend espera chamadas de reset com `token` e `new_password`; qualquer mudanca de nomes deve ser coordenada com contrato de auth/reset.
- `btnBloquear` hoje chama stub/fallback visual; backend possui rota de bloqueio de cartao, mas o fluxo atual nao esta integrado a ela.
- `movimentacoesLista`, `vantagensContainer`, `mostrarTermosCondicoes()` e `dynamic_card_form_conta_style.html` nao dependem diretamente de backend no estado atual.

## Decisao Ivar

Classificacao por codigo:

1. Necessario e deve ficar:
   - `novaSenha`
   - `confirmarSenha`
   - `redefinirSenhaForm`

2. Necessario, mas precisa renomear/alinhamento em fase futura:
   - `valorLiberado`
   - `limiteProgressFill`
   - `btnBloquear`
   - `numeroCartao`
   - `validadeCartao`
   - `titularCartao`
   - `cartaoContainer`
   - `vantagensContainer`

3. Morto ou removivel no futuro apos teste manual:
   - `movimentacoesLista`
   - `dynamic_card_form_conta_style.html`

4. Indefinido e deve permanecer ate teste manual:
   - `mostrarTermosCondicoes()`

Observacao: `dynamic_card_form_conta_style.html` nao deve simplesmente ser removido da referencia sem decidir o fluxo correto de pedido/ver cartao.

## Ordem Segura Para Correcao Futura

1. Corrigir `cartaoContainer` para evitar `null.style` em navegacao e preservar troca de telas.
2. Resolver `vantagensContainer` ou manter `levarParaVantagens()` inacessivel ate haver container real.
3. Restaurar ou migrar `mostrarTermosCondicoes()` para script carregado, testando modal de termos de emprestimo.
4. Refatorar IDs duplicados de limite/cartao (`valorLiberado`, `limiteProgressFill`, `numeroCartao`, `validadeCartao`, `titularCartao`) com seletores escopados por container.
5. Alinhar `btnBloquear` com o fluxo real de bloquear cartao, sem integrar backend antes de contrato e testes.
6. Corrigir o destino `dynamic_card_form_conta_style.html` para arquivo/rota existente ou criar pagina real.
7. Revisar `movimentacoesLista` apenas depois de confirmar se a tela de movimentacoes de cartao sera mantida.

## Validacoes Da Auditoria

- `docs/reports/AGILBANK-STATUS-MIGRACAO-LEGADO.md` lido antes da auditoria.
- `docs/reports/AGILBANK-RELATORIO-MIGRACAO-HTML-UNICO.md` lido antes da auditoria.
- Diff atual lido antes da auditoria.
- Busca por IDs duplicados e referencias JS feita em `agilbank-frontend/public/banco/index.html` e scripts em `public/banco/js/`.
- Busca por `dynamic_card_form_conta_style.html`: arquivo nao encontrado em `agilbank-frontend/public/banco`.
- Nenhum codigo, visual, backend, ID, funcao global ou JS foi alterado.
