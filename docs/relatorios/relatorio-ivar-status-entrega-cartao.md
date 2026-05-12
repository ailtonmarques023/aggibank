# Relatório IVAR - Status de Entrega do Cartão

1. Data
- 2026-05-12

2. Funcionalidade
- Refatoração da tela "Status de Entrega" do cartão com integração à fonte real de remessa.

3. Classificação da demanda
- Problema de UX + Refatoração + Integração com dados reais

4. Criticidade
- P2

5. Fluxo real identificado
- UI ativa: [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html)
- Entrada frontend: o HTML servido referencia `js/legacyAuthStore.js`, `js/agilbankApiBase.js`, `js/legacyApiClient.js`, `js/legacyNavigation.js` e `js/cartao.js`.
- Ação de entrada: botão `#cartaoAcaoStatus` dispara `agilbankCartaoAcaoStatus()` em [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js).
- Fluxo FE: `agilbankCartaoAcaoStatus()` -> `agilbankRequestCards('cards/:id/shipment')` -> fallback `agilbankRequestCards('cards/:id/shipment/timeline?page=1&limit=20')` -> `agilbankRenderStatusEntregaParaCartao(...)`.
- Fluxo API: [`C:\Users\gordi\.codex\worktrees\5144\concurso\src\server.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\src\server.js) expõe `/api/cards`.
- Backend: [`C:\Users\gordi\.codex\worktrees\5144\concurso\src\routes\cards.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\src\routes\cards.js) implementa `GET /api/cards/:id/shipment` e `GET /api/cards/:id/shipment/timeline`.
- Fonte de verdade: Prisma em [`C:\Users\gordi\.codex\worktrees\5144\concurso\prisma\schema.prisma`](C:\Users\gordi\.codex\worktrees\5144\concurso\prisma\schema.prisma), modelos `Cartao`, `CardShipment`, `CardShipmentEvent`, `Endereco`, `Movimentacao`, `User`.
- Isolamento de usuário: backend filtra `cardId` e `userId: req.user.id`; não aceita `userId` do frontend.

6. Problema encontrado
- A tela atual consumia endpoint real, mas a experiência visual estava abaixo do padrão desejado e o tratamento de `401` não limpava sessão nem redirecionava para login.
- O layout anterior usava uma timeline vertical simples e cards informacionais sem hierarquia visual equivalente ao mockup de referência.
- O erro reportado `GET /api/cards/{cardId}/shipment 404` não aparece como string literal no código fonte atual; o fluxo ativo chama `cards/' + c.id + '/shipment`. O risco técnico identificado ficou concentrado na resolução do cartão selecionado em estado legado, com possibilidade de `id` inválido ou desatualizado no frontend antes da chamada da remessa.
- A governança referenciou arquivos inexistentes nesta cópia do projeto, como `docs/CODEX-CURSOR-AUTOMACAO.md` e `docs/subagentes/*.md`, exigindo adaptação pela regra master efetivamente encontrada em `.cursor/rules/agilbank-master.mdc`.
- A validação manual em navegador mostrou que a tela ativa publicada ainda exibe o layout antigo. A divergência não está no arquivo local já alterado, e sim no artefato realmente servido em runtime no host publicado.
- O risco local de abrir a tela antiga pelo fluxo ativo foi reduzido no código fonte: `showStatusEntregaContainer()` agora delega sempre para `window.agilbankCartaoAcaoStatus()` quando a função existe, sem depender de `window.__agilbankCartoesLista.length`.

7. Causa técnica
- A tela de entrega já havia sido ligada aos endpoints reais, mas a renderização permaneceu no formato legado do HTML único.
- O frontend mantinha estados básicos de erro/sem dados, porém sem o comportamento obrigatório de sessão expirada definido na governança.
- O bloqueio principal de validação completa em runtime passou a ser ausência de credencial real autenticada acessível nesta sessão e ausência de automação de browser autenticado disponível para inspecionar Network/DOM após login.
- O diagnóstico desta rodada confirmou que `https://aggibank.vercel.app/banco/index.html` ainda publica o HTML antigo do container `#statusEntregaContainer`, `https://aggibank.vercel.app/banco/js/cartao.js` ainda publica o render antigo de shipment, e `https://aggibank.vercel.app/banco/css/style.cartao-status-card {pedidoCartaoAprovado}.css` ainda publica o CSS antigo sem as classes do layout novo.
- Não há evidência de service worker ativo no código do projeto. Os headers do Vercel retornam `Cache-Control: public, must-revalidate, max-age=0` com `X-Vercel-Cache: HIT`, o que indica cache de CDN servindo o artefato atualmente publicado, não uma versão nova invisível por cache local do navegador.
- A worktree atual `C:\Users\gordi\.codex\worktrees\5144\concurso` está com alterações locais não publicadas em `agilbank-frontend/public/banco/index.html`, `agilbank-frontend/public/banco/js/cartao.js` e `agilbank-frontend/public/banco/css/style.cartao-status-card {pedidoCartaoAprovado}.css`.
- Nesta rodada, o código local foi endurecido para evitar fallback silencioso ao estado legado e para forçar recarga dos assets relevantes da tela:
  - `css/style.cartaoWizard.css?v=20260512-status-entrega-active`
  - `css/style.cartao-status-card {pedidoCartaoAprovado}.css?v=20260512-status-entrega-active`
  - `js/cartao.js?v=20260512-status-entrega-active`

8. Impacto no sistema
- Sem refatoração, a UX continuava pouco legível para status logístico e histórico real da remessa.
- Sem tratamento correto de `401`, havia risco de permanência em tela protegida após expiração de sessão.
- Sem validação autenticada em browser real, permanece risco residual de integração não observada com dados reais de produção na tela de entrega.

9. Ação da RAGNA
- Validado reaproveitamento do contrato real existente:
  - `GET /api/cards/:id/shipment`
  - `GET /api/cards/:id/shipment/timeline?page=1&limit=20`
- Confirmado uso de `req.user.id` no backend e ausência de `userId` vindo do frontend.
- Confirmados modelos reais:
  - `Cartao`
  - `CardShipment`
  - `CardShipmentEvent`
  - `Endereco`
  - `Movimentacao`
- Nenhuma alteração backend foi necessária para atender à demanda; o endpoint existente já cumpre a regra de fonte de verdade.

10. Ação da LARGETHA
- Refatorada a tela ativa em [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html).
- Atualizada a renderização em [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js) para:
  - loading com skeleton
  - success com dados reais
  - empty sem remessa
  - error com retry
  - 401 com limpeza de sessão e redirecionamento
  - 403 com estado seguro sem loop
- Endurecida a resolução do cartão selecionado antes de consultar remessa:
  - valida `card.id`
  - rejeita placeholders como `{cardId}` e `:id`
  - recarrega a lista oficial via `GET /api/cards` se o estado local estiver inconsistente
  - refaz a consulta de remessa quando detectar `CARD_NOT_FOUND` sem refresh prévio
- Atualizado o estilo em [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card {pedidoCartaoAprovado}.css`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card%20%7BpedidoCartaoAprovado%7D.css) para:
  - header azul
  - card principal do cartão
  - timeline horizontal
  - cards de entrega, endereço, observações e histórico
- Nesta rodada, removido somente o legado confirmado do fluxo antigo de entrega:
  - seletor `#statusEntregaTimelineHost .status-item` em [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartaoWizard.css`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartaoWizard.css)
  - blocos CSS antigos exclusivos do layout velho em [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card {pedidoCartaoAprovado}.css`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card%20%7BpedidoCartaoAprovado%7D.css):
    - `.status-timeline`
    - `.status-info`
    - `.status-info-item`
    - `.status-content`
    - `.status-dot`
    - definições antigas duplicadas de `.status-entrega-container`
- Não foi removido o nome genérico `.status-item` porque ele é compartilhado com outro fluxo da tela de empréstimo.

11. Contrato API usado/criado
- Usado sem criar endpoint novo:
  - `GET /api/cards/:id/shipment`
    - Auth: JWT obrigatório via middleware
    - Resposta de sucesso: `success`, `message`, `data.shipment`, `data.timeline`
    - Erros observados: `CARD_NOT_FOUND`, `SHIPMENT_NOT_FOUND`, `INTERNAL_ERROR`
  - `GET /api/cards/:id/shipment/timeline?page=1&limit=20`
    - Auth: JWT obrigatório via middleware
    - Resposta de sucesso: `success`, `message`, `data.shipmentId`, `data.timeline`, `data.pagination`

12. Arquivos backend analisados
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\src\server.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\src\server.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\src\routes\cards.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\src\routes\cards.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\src\config\database.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\src\config\database.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\prisma\schema.prisma`](C:\Users\gordi\.codex\worktrees\5144\concurso\prisma\schema.prisma)

13. Arquivos backend alterados
- Nenhum

14. Arquivos frontend analisados
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\agilbankApiBase.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\agilbankApiBase.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\legacyApiClient.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\legacyApiClient.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\legacyAuthStore.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\legacyAuthStore.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card {pedidoCartaoAprovado}.css`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card%20%7BpedidoCartaoAprovado%7D.css)

15. Arquivos frontend alterados
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\js\cartao.js)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card {pedidoCartaoAprovado}.css`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartao-status-card%20%7BpedidoCartaoAprovado%7D.css)
- [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartaoWizard.css`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\css\style.cartaoWizard.css)

16. Endpoints envolvidos
- `GET /api/cards`
- `GET /api/cards/:id/shipment`
- `GET /api/cards/:id/shipment/timeline?page=1&limit=20`

17. Tabelas/modelos usados
- `usuarios`
- `cartoes`
- `card_shipments`
- `card_shipment_events`
- `enderecos`
- `movimentacoes`

18. Migrations criadas, se houver
- Nenhuma

19. Telas analisadas
- Tela única do app bancário em [`C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html`](C:\Users\gordi\.codex\worktrees\5144\concurso\agilbank-frontend\public\banco\index.html)
- Seção ativa `#statusEntregaContainer`

20. Validação realizada
- Leitura e mapeamento estático do fluxo ponta a ponta.
- Revisão dos endpoints reais e modelos Prisma.
- Revisão do diff aplicado nos arquivos de frontend.
- Verificação de sintaxe JavaScript com `node --check` em `agilbank-frontend/public/banco/js/cartao.js`.
- Dependências instaladas com sucesso:
  - `npm ci` no backend
  - `npm ci` no frontend
- Backend oficial alcançado em runtime:
  - `GET https://aggibank-production.up.railway.app/api/health`
  - Resultado: `200` com payload `status=healthy`, `environment=production`
- Validação de segurança de rota protegida:
  - `GET https://aggibank-production.up.railway.app/api/cards`
  - Resultado sem token: `401 TOKEN_REQUIRED`
  - `GET https://aggibank-production.up.railway.app/api/cards/{cardId}/shipment`
  - Resultado sem token: `401 TOKEN_REQUIRED`
  - Conclusão: a rota existe e está protegida; a evidência não aponta para ausência da rota no backend oficial.
- Build backend executado com sucesso:
  - `npm run build`
  - Resultado: `prisma generate` concluído
- Build frontend executado com sucesso fora da sandbox:
  - `npm run build`
  - Resultado: build Vite concluído
- Testes automatizados executados com sucesso:
  - `npx jest tests/shipment.test.js --runInBand`
  - Resultado: `6/6` testes passando
  - Evidências de contrato:
    - `GET /api/cards/card-shipment-1/shipment 200`
    - `GET /api/cards/card-shipment-1/shipment/timeline?page=1&limit=20 200`
  - `npx jest tests/cards.test.js --runInBand`
  - Resultado: `50/50` testes passando
- Serving local da tela ativa:
  - servidor auxiliar em `http://127.0.0.1:3100/banco/index.html`
  - resposta HTTP `200`
  - HTML servido contém:
    - `statusEntregaCardTitle`
    - `statusEntregaTimelineHost`
    - `statusEntregaEventos`
  - Conclusão: o arquivo ativo servido localmente já contém a estrutura do layout novo.
- Login em produção com credenciais de teste visíveis no repositório não autenticou:
  - `teste@agilbank.com / 123456` -> `401`
  - `12345678901 / 123456` -> `401`
  - Sem credencial real válida, não foi possível abrir sessão autenticada para verificar Network e dados reais da tela.
- Diagnóstico objetivo do arquivo realmente publicado no frontend:
  - `GET https://aggibank.vercel.app/banco/index.html`
  - Resultado: HTML remoto contém `statusEntregaInfoHost` e `status-info-item`, mas não contém `statusEntregaCardTitle`, `statusEntregaEventos`, `status-entrega-content` nem o card “Acompanhar pedido”.
  - Trecho remoto confirma header antigo e bloco antigo:
    - `<div class="header">`
    - `<div class="status-timeline" id="statusEntregaTimelineHost"></div>`
    - `<div class="status-info" id="statusEntregaInfoHost">`
- Diagnóstico objetivo do JS realmente publicado:
  - `GET https://aggibank.vercel.app/banco/js/cartao.js`
  - Resultado: JS remoto contém `statusEntregaLinha1`, `enderecoEntrega` e texto antigo `Sem dados de entrega`, mas não contém `statusEntregaCardTitle`, `statusEntregaSupportText`, `statusEntregaEventos` nem `status-entrega-empty-copy`.
  - Trecho remoto confirma render antigo:
    - `host.innerHTML = '<div class="status-item active"...`
    - `<h4>Sem dados de entrega</h4>`
- Diagnóstico objetivo do CSS realmente publicado:
  - `GET https://aggibank.vercel.app/banco/css/style.cartao-status-card%20%7BpedidoCartaoAprovado%7D.css`
  - Resultado: CSS remoto não contém `.status-entrega-header`, `.status-entrega-card-visual`, `.status-entrega-timeline-horizontal`, `.status-entrega-events` nem `.status-entrega-empty-copy`.
- Diagnóstico de cache/publicação:
  - Não foram encontrados registros de `serviceWorker`, `navigator.serviceWorker`, `workbox`, `sw.js` ou `manifest` ativos no código do frontend legado pesquisado.
  - Headers remotos observados no Vercel para `banco/index.html`, `banco/js/cartao.js` e CSS:
    - `Cache-Control: public, must-revalidate, max-age=0`
    - `X-Vercel-Cache: HIT`
    - `Last-Modified: Tue, 12 May 2026 18:58:13 GMT`/`18:58:24 GMT`
  - Conclusão: o navegador está recebendo um deploy/artefato antigo já publicado na CDN, não a versão nova presente na worktree local.
- Estado da worktree local:
  - `git status --short` mostra alterações locais ainda não publicadas em:
    - `agilbank-frontend/public/banco/index.html`
    - `agilbank-frontend/public/banco/js/cartao.js`
    - `agilbank-frontend/public/banco/css/style.cartao-status-card {pedidoCartaoAprovado}.css`
  - `git worktree list` confirma que esta análise foi feita na worktree `C:\Users\gordi\.codex\worktrees\5144\concurso`, em `detached HEAD`.
- Validação local do runtime estático após limpeza do legado:
  - `GET http://127.0.0.1:3100/banco/index.html`
  - Resultado:
    - `statusEntregaCardTitle=True`
    - `statusEntregaTimelineHost=True`
    - `statusEntregaEventos=True`
    - `Acompanhar pedido=True`
    - `statusEntregaInfoHost=False`
    - `status-timeline=False`
    - `status-info-item=False`
  - Conclusão: o HTML servido localmente já não contém a estrutura velha da entrega.
- Validação local dos assets versionados:
  - `index.html` agora referencia:
    - `css/style.cartao-status-card {pedidoCartaoAprovado}.css?v=20260512-status-entrega-active`
    - `js/cartao.js?v=20260512-status-entrega-active`
  - `GET http://127.0.0.1:3100/banco/js/cartao.js?v=20260512-status-entrega-active`
    - `status-item active=False`
  - `GET http://127.0.0.1:3100/banco/css/style.cartao-status-card%20%7BpedidoCartaoAprovado%7D.css?v=20260512-status-entrega-active`
    - `.status-timeline=False`
    - `.status-info-item=False`
    - `.status-entrega-header=True`
- Build do frontend após a limpeza:
  - `npm run build` em `agilbank-frontend`
  - Resultado: build Vite concluído com sucesso fora da sandbox
- Teste automatizado de shipment reexecutado:
  - `npx jest tests/shipment.test.js --runInBand`
  - Resultado: `6/6` testes passando
- Publicação validada na Vercel após push sem `force` para `origin/main`:
  - commit publicado: `29aa713 feat(cards): activate new delivery status layout`
  - `GET https://aggibank.vercel.app/banco/index.html`
    - `statusEntregaCardTitle=True`
    - `statusEntregaTimelineHost=True`
    - `statusEntregaEventos=True`
    - `Acompanhar pedido=True`
    - `statusEntregaInfoHost=False`
    - `status-timeline=False`
    - `status-info-item=False`
    - `js/cartao.js?v=20260512-status-entrega-active=True`
    - `style.cartao-status-card {pedidoCartaoAprovado}.css?v=20260512-status-entrega-active=True`
  - `GET https://aggibank.vercel.app/banco/js/cartao.js?v=20260512-status-entrega-active`
    - `statusEntregaCardTitle=True`
    - `statusEntregaTimelineHost=True`
    - `statusEntregaEventos=True`
    - `status-item active=False`
    - `statusEntregaInfoHost=False`
  - `GET https://aggibank.vercel.app/banco/css/style.cartao-status-card%20%7BpedidoCartaoAprovado%7D.css?v=20260512-status-entrega-active`
    - `.status-entrega-header=True`
    - `.status-entrega-card-visual=True`
    - `.status-entrega-timeline-horizontal=True`
    - `.status-entrega-events=True`
    - `.status-timeline=False`
    - `.status-info-item=False`
  - Headers da publicação:
    - `Last-Modified: Tue, 12 May 2026 21:04:12 GMT`
    - `Age: 0`
    - `X-Vercel-Cache: HIT`
  - Conclusão: o artefato publicado em produção já foi atualizado para o layout novo da tela de Status de Entrega.

21. Pendências
- Validar visualmente a tela em browser autenticado real.
- Executar fluxo autenticado com:
  - cartão com remessa
  - cartão sem remessa
  - usuário sem cartão
  - 401
  - 403
  - erro interno
  - timeline vazia
  - status `FALHA_ENTREGA`
  - status `DEVOLVIDO`
  - status `ENTREGUE`
- Obter credencial real válida ou sessão autenticada reaproveitável para inspecionar a tela após login.
- Disponibilizar automação de browser autenticado ou validar manualmente no navegador do usuário com DevTools/Network.
- Publicar o artefato correto do frontend legado (`agilbank-frontend/public/banco/*`) no ambiente realmente aberto pelo navegador.
- Confirmar se o deploy ativo do usuário aponta para `https://aggibank.vercel.app/banco/index.html` ou para outro host/build equivalente.
- Após a publicação, repetir a verificação em runtime de:
  - `statusEntregaCardTitle`
  - `statusEntregaTimelineHost`
  - `statusEntregaEventos`
  - `Acompanhar pedido`
  - ausência do layout antigo em `Elements`
- Revalidar em browser real com autenticação, porque nesta sessão não houve automação de navegador autenticado nem captura de DevTools/Network da tela clicada em runtime real.
- Confirmar em `Network` do navegador publicado, após o deploy correto:
  - `GET /api/cards`
  - `GET /api/cards/:id/shipment`
  - `GET /api/cards/:id/shipment/timeline`
  - ausência de `{cardId}`, `:id`, `undefined` e `null` nas URLs efetivamente chamadas
- Validar login com usuário real no publicado e abrir manualmente `Status de Entrega`, porque nesta sessão não havia browser autenticado nem credencial válida reaproveitável.

22. Riscos residuais
- Sem sessão autenticada em browser real, há risco residual de ajuste fino visual, overflow ou conflito com CSS legado sob dados reais.
- A timeline horizontal usa mapeamento honesto dos status existentes, mas precisa validação com dados reais do banco para todos os cenários operacionais.
- O HTML único continua com acoplamento alto; futuras mudanças de cartão podem afetar a seção se não houver regressão visual monitorada.
- Enquanto o deploy publicado continuar antigo, o usuário seguirá vendo a tela velha e o fluxo real continuará 100% reprovado em runtime, mesmo com a worktree local correta.
- Como o ambiente real publicado ainda não foi atualizado nesta rodada, não há evidência de que o navegador do usuário deixou definitivamente de abrir a versão antiga fora desta worktree.
- O artefato publicado já foi atualizado; o risco residual agora ficou concentrado exclusivamente na ausência de validação autenticada de runtime/Network com usuário real.

23. Estratégia de rollback
- Reverter apenas os três arquivos de frontend alterados:
  - `agilbank-frontend/public/banco/index.html`
  - `agilbank-frontend/public/banco/js/cartao.js`
  - `agilbank-frontend/public/banco/css/style.cartao-status-card {pedidoCartaoAprovado}.css`
- Reverter também `agilbank-frontend/public/banco/css/style.cartaoWizard.css` se for necessário restaurar o seletor legado removido.
- Nenhum rollback de banco ou backend é necessário nesta entrega.

24. Decisão final do IVAR
- REPROVADO
- Motivo:
  - build backend, build frontend, testes de `shipment/cards`, serving local e checagem da API oficial foram concluídos com sucesso;
  - o deploy de produção agora já publica HTML, JS e CSS novos da tela de Status de Entrega;
  - nesta rodada, o código local passou a servir apenas a estrutura nova de Status de Entrega e teve o legado exclusivo removido de forma segura;
  - porém ainda não houve validação no navegador publicado com usuário autenticado e inspeção de `Network`;
  - além disso, continua faltando a evidência obrigatória de browser autenticado com backend real e dados reais/estado vazio real na própria tela;
  - sem inspeção de Network/DOM autenticada após a publicação, a governança não permite promover para APROVADO.
