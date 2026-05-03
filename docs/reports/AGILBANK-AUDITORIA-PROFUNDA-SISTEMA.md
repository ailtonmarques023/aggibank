# AgilBank — Auditoria profunda do sistema (reforço metodológico)

**Data:** 2026-05-03  
**Tipo:** Auditoria só leitura (nenhum código alterado).  
**Metodologia:** buscas com `grep` em `src/`, `agilbank-frontend/`, `prisma/`; leitura direta de trechos de `index.html`, rotas Express, `schema.prisma`, `migration.sql`; `npx prisma migrate status` no workspace; `npm run build` em `agilbank-frontend`.

**Papéis:** **Ragnar** (backend/API/banco), **Lagertha** (frontend/telas/botões), **Ivar** (crítica e classificação).

---

## Metodologia e limites

- **Coberto com evidência:** rotas registradas em `src/server.js` + `src/routes/*.js`; chamadas `AgilBank.api.request`, `fetch` com base API, serviços React em `src/services/`; `public/banco/index.html` (bloco `<script>` ~5747–8266 + scripts finais ~8269+); scripts `public/banco/js/*.js` citados no HTML.
- **Não executado nesta rodada:** testes E2E manuais no browser; varredura linha a linha dos ~11k linhas de HTML além dos padrões grep + amostras; fuzz de payloads.
- **Contagens automatizadas:** `onclick=` em `index.html`: **196** ocorrências (grep).

---

## 1. Inventário completo — rotas HTTP do backend (Ragnar)

Prefixo global: **`/api`**. Montagem em `src/server.js` (linhas 87–107): health, auth, user (duplicado em `/usuarios`), cards, loans, pix, boletos, notifications, payments, email.

| Montagem | Métodos e paths relativos ao prefixo | Arquivo (1ª rota) |
|----------|----------------------------------------|-------------------|
| `/api/health` | GET `/api/health` | `server.js` ~87 |
| `/api/auth` | POST `/register`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/verify-reset-token`, `/reset-password`, `/verify-email` | `auth.js` 75, 227, 344, 438, 523, 606, 657, 735 |
| `/api/user` e `/api/usuarios` (alias) | GET `/profile`, PUT `/profile`, POST `/change-password`, GET/POST `/address`, GET `/balance`, GET/PUT `/settings`, GET `/user-complete-data`; **todas** com `router.use(authenticateToken)` em `user.js` ~11 | `user.js` 29–534 |
| `/api/cards` | GET `/`, POST `/`, POST `/:id/approve`, POST `/:id/block`, POST `/:id/unblock`, PUT `/:id/limit` | `cards.js` 35–427 |
| `/api/loans` | GET `/`, POST `/`, POST `/:id/approve`, POST `/:id/reject`, POST `/simulate`, GET `/eligibility` | `loans.js` 25–388 |
| `/api/pix` | GET `/keys`, POST `/keys`, POST `/send`, GET `/transactions`, GET `/limits` | `pix.js` 26–438 |
| `/api/boletos` | GET `/`, POST `/`, POST `/:id/pay`, POST `/validate`, GET `/:id`, GET `/:id/pdf` | `boletos.js` 32–394 |
| `/api/notifications` | GET `/`, PUT `/:id/read`, PUT `/read-all`, DELETE `/:id`, GET `/unread-count`, POST `/send` | `notifications.js` 42–320 |
| `/api/payments` | GET `/`, POST `/pix`, POST `/boleto`, POST `/:id/process`, GET `/:id`, POST `/:id/cancel` | `payments.js` 44–455 |
| `/api/email` | POST `/test`, POST `/send`, GET `/templates`, POST `/send-template` | `email.js` 23–231 |

**Rotas que o frontend legado chama e que não existem neste backend:**  
`POST /api/pix/validate`, `POST /api/pix/qr-code` (chamadas em `index.html` ~7970, ~8008). **Não há** `GET/POST /api/auth/confirm-email` — o correto é **`POST /api/auth/verify-email`** (`auth.js` ~735).

**Rotas que o React referencia e que não existem neste backend (paths diferentes):**

- `GET /api/auth/profile` em `authService.js` ~42 — backend expõe **`GET /api/user/profile`**.
- `GET /api/account/balance`, `POST /api/account/transfer`, `GET /api/account/info` em `accountService.js` ~6–24 — backend tem **`GET /api/user/balance`**, sem rota `/account/transfer` dedicada (transferência PIX é `/api/pix/send`).
- `GET /api/transactions` em `transactionsService.js` ~6 — backend lista PIX em **`GET /api/pix/transactions`**, não `/transactions` na raiz.

**Middleware relevante (Pix/cartão):** `src/routes/pix.js` ~11–12: `authenticateToken` + **`requireVerification`** em todas as rotas Pix. `src/middleware/auth.js` ~104–112: conta com `isVerificado === false` recebe **403** nas rotas que usam `requireVerification` (cartões usam o mesmo padrão em `cards.js` ~20–21).

---

## 2. Tabela — chamadas reais do frontend → backend

Base legada padrão: `legacyApiClient.js` ~5: `http://localhost:3001/api` (sobrescrevível por `window.AGILBANK_API_BASE`).

| Origem | Chamada (path relativo ou URL) | Método | Backend existe? | Notas / divergência |
|--------|--------------------------------|--------|-----------------|---------------------|
| `login.js` ~332 | `auth/login` | POST | Sim | Body `email`, `senha` — alinhado a `validateLogin` (email pode carregar CPF). |
| `login.js` ~565 | `auth/logout` | POST | Sim | |
| `formulario-conta.js` ~588 | `auth/register` | POST | Sim | |
| `userDataManager.js` ~111 | `user/profile` | GET | Sim | |
| `cartao.js` ~253, ~509 | `cards` | POST / GET | Sim | Requer usuário verificado (403 se não). |
| `index.html` ~6259 | `health` | GET | Sim | `auth: false`. |
| `index.html` ~6269+ | `user/user-complete-data` | GET | Sim | Múltiplas ocorrências ~6494, ~7337, ~10347, ~10547, ~10605, ~10642, ~10843. |
| `index.html` ~6318, ~6810 | `user/settings` | GET / PUT | Sim | GET definido; **uso ao abrir tela** — ver achado L-08. |
| `index.html` ~6415 | `auth/login` | POST | Sim | Fluxo alternativo embutido no HTML. |
| `index.html` ~9452 | `auth/register` | POST | Sim | |
| `index.html` ~9797 | `auth/forgot-password` | POST | Sim | |
| `index.html` ~9957 | `auth/verify-reset-token` | POST | Sim | |
| `index.html` ~10043 | `auth/reset-password` | POST | Sim | |
| `index.html` ~7843, ~7924 | `${AGILBANK_API_BASE}/pix/limits` | GET | Sim | |
| `index.html` ~7875, ~8066 | `.../pix/keys` | GET / POST | Sim | POST: validação telefone **+55** na UI ~8051 vs backend `(XX) XXXXX-XXXX` `pix.js` ~104–108. |
| `index.html` ~7970 | `.../pix/validate` | POST | **Não** | 404 no servidor atual. |
| `index.html` ~8008 | `.../pix/qr-code` | POST | **Não** | 404 no servidor atual. |
| `index.html` ~8117 | `.../pix/send` | POST | Sim | Resposta: ver achado R-05 / L-18. |
| `confirmar-email.html` ~236 | Railway `.../api/auth/confirm-email` | POST | Path **errado** | Backend: `/api/auth/verify-email`. |
| `reset-password.html` ~492 | `/api/auth/verify-reset-token` | POST | Sim **se** mesmo host da API | Path relativo depende de como o HTML é servido. |
| `reset-password.html` ~670 | Railway `.../api/auth/reset-password` | POST | Ambiente externo | Inconsistente com verify local. |
| `formularioCadastrodeConta.html` ~1923 | viacep | GET | Externo | |
| `Register/index.jsx` ~82 | viacep | GET | Externo | |
| `authService.js` | `/auth/login`, `/auth/register`, `/auth/logout`, **`/auth/profile`** | vários | profile **não** | Deveria ser `/user/profile` ou novo endpoint. |
| `accountService.js` | **`/account/balance`**, **`/account/transfer`**, **`/account/info`** | vários | **Não** como paths | Build atual **não** importa estes no `main.jsx` (código morto / risco futuro). |
| `transactionsService.js` | **`/transactions`** | GET | **Não** | Backend: `/pix/transactions`. |

**Obs. React:** `src/main.jsx` importa apenas `App-simple-working.jsx`; **`npm run build`** (executado) **passou** — páginas `Transactions` / `TransferModal` que importam `{ transactionsService, accountService } from '../services/api'` **não** entram no bundle atual (`api.js` só tem `export default`). Achado **I-09**: imports nomeados incompatíveis com `api.js` se outro entrypoint for ativado.

---

## 3. Tabela — containers principais e ações (Lagertha)

IDs extraídos de `index.html` (grep `id="...Container"` e correlatos). **196** `onclick=` no mesmo arquivo.

| Container / ID (aprox.) | Acesso típico (onclick / menu) | Função principal | API? |
|---------------------------|--------------------------------|------------------|------|
| `loginContainer` | fluxo inicial | login | `auth/login` via `login.js` / trechos HTML |
| `container` (dashboard) | `voltarParaPrincipal` | hub | saldo via `user-complete-data` / variáveis globais |
| `pixContainer` | `showPixContainer()` ~7283 | área Pix | `pix/*` parcial (validate/qr **quebrados**) |
| `extratoContainer` | `showExtratoContainer()` | extrato | **sem** fetch de movimentações |
| `cartaoGerenciamentoContainer` | `showCartaoGerenciamento()` | cartões | `GET cards` |
| `creditoContainer` | `creditoContainer()` | crédito pessoal | `creditoPessoal.js` **sem** fetch (grep) |
| `emprestimoContainer` | `solicitarEmprestimo()` ~5895 | fluxo empréstimo | **navegação + simulação**; submit refatorado sem API |
| `emprestimoConcedidoContainer` | `confirmarEmprestimo()` ~5922 | “liberado” | **só troca de `display`** |
| `notification` | `irParaNotification()` ~5884 | notificações | **sem** `/api/notifications` encontrado |
| `configuracoesContainer` | `abrirConfiguracoesSimples()` ~6178 | ajustes | PUT ok; GET não acionado ao abrir |
| `perfilContainer` | `abrirPerfilSimples()` ~6231 | perfil | dados via `user-complete-data` / perfil |
| `paymentOptionsContainer` | `exibirOpcoesPagamento()` ~7594 | opções pagamento | só UI |
| `boletoContainer` | `levarboletoContainer()` ~7622 | boleto | **sem** chamada `/api/boletos` nesta função |
| `containerGerarBoletoPix` | `containerGerarBoletoPix()` ~7613 | gerar boleto/pix | só exibe bloco ~7616 |
| `chatContainer` | `levarParaChatContainer()` ~8255 | simulação | `simulacaoChat.js` **sem** fetch |
| `contaContainer` | — | abertura conta | formulário em fluxo separado / `formulario-conta.js` |

**Função duplicada (evidência):** `showExtratoContainer` definida **duas vezes** no mesmo `index.html`: ~**5941** e ~**6965**. A segunda sobrescreve a primeira no runtime (hoisting de `function` no mesmo escopo global do bloco). Comportamento final: segunda versão (animação `mostrarAnimacaoLogo02`, esconde `container`/`pixContainer`/`notification` explicitamente).

**Stub documentado:** `mensagemAlertaPix()` ~**7636–7637** — `alert` diz que função Pix “ainda não está disponível”; coexistindo com implementação `enviarPix` ~8090 (inconsistência de mensageria / possível código morto).

**Tripla atribuição:** `document.getElementById('botaoFecharModal').onclick = function() {...}` repetida ~**7671**, ~**7685**, ~**7692** — apenas a última permanece efetiva.

---

## 4. Tabela — dados coletados vs persistência

| Dado / grupo | Onde coletado | Enviado ao backend? | Persistido (Prisma) | Sensível | Observação |
|--------------|---------------|---------------------|----------------------|----------|------------|
| Cadastro completo | `formulario-conta.js`, `index.html` register | Sim `auth/register` | `User`, `Endereco`, `DadosProfissionais`, `ConfiguracoesUsuario` | Sim | |
| Login | `login.js` | Sim | — | Sim | |
| Perfil / saldo / limites | `user-complete-data`, `profile` | Sim | `User` | Sim | |
| Preferências | `salvarConfiguracoes` ~6785 | Sim PUT `user/settings` | `ConfiguracoesUsuario` | Baixo | Carregamento inicial ver L-08. |
| Solicitação cartão (API) | `cartao.js` `enviarSolicitacao` | `tipo`, `limite` | `Cartao` | Médio | |
| Formulário longo cartão | `coletarDadosCartao` `cartao.js` ~9 | **Não** (vai `localStorage` ~114) | **Não** | **Alto** (incl. senha do cartão) | Achado I-12. |
| Chave Pix | modais `index.html` ~8031 | POST `pix/keys` | `ChavePix` | Sim | Formato telefone. |
| Envio Pix | `enviarPix` ~8090 | POST `pix/send` | `TransacaoPix`, `Movimentacao`, saldo | Sim | Contrato resposta ver R-05. |
| Proposta empréstimo (form refatorado) | `emprestimo_refatorado.js` `collectFormData` | **Não** (`submitToAPI` simula ~367–375) | **Não** | Sim | Achado L-03. |
| CPF/nome empréstimo (container antigo) | `containerEmprestimo.js` ~127 (script **comentado** no HTML ~8274) | — | — | — | Risco de manutenção: duas pilhas JS. |

---

## 5. Tabela — migrations e banco

| Item | Evidência |
|------|-----------|
| **Arquivos** | `prisma/migrations/20260501152812_init/migration.sql`, `migration_lock.toml` |
| **Status** | `npx prisma migrate status` (2026-05-03 neste workspace): **1 migration**, **Database schema is up to date** |
| **Tabelas criadas na init** | `usuarios`, `enderecos`, `dados_profissionais`, `configuracoes_usuario`, `cartoes`, `emprestimos`, `movimentacoes`, `notificacoes`, `transacoes_pix`, `chaves_pix`, `boletos`, `pagamentos`, `tokens`, `afiliacoes`, `campanhas`, `gamificacao_usuario`, `audit_logs` (+ FKs no restante do arquivo) |
| **Schema vs produto** | `Emprestimo` tem valor, prazo, taxa, parcela, status — **não** há tabela de contrato assinado, parcelas futuras, ou PDF. `Movimentacao` existe mas extrato legado não consome API. |

**Detalhe de modelo:** `campanhas` / `gamificacao_usuario` em `migration.sql` exigem `updatedAt` NOT NULL sem default na migration (~256, ~271); criação via Prisma deve preencher — risco se inserção manual incompleta (MÉDIO, operacional).

---

## 6. Achados priorizados (25+ com ID, severidade, evidência)

| ID | Sev. | Evidência (arquivo ~linha) | Descrição |
|----|------|----------------------------|-----------|
| R-01 | BLOQ | `index.html` ~7970; `pix.js` (sem rota validate) | `POST /api/pix/validate` chamado pela UI; **não implementado** no backend. |
| R-02 | BLOQ | `index.html` ~8008; `pix.js` | `POST /api/pix/qr-code` idem. |
| R-03 | BLOQ | `confirmar-email.html` ~236; `auth.js` ~735 | UI usa **`confirm-email`** e host Railway; backend expõe **`verify-email`**. |
| R-04 | BLOQ | `reset-password.html` ~492 vs ~670 | Verify token path relativo; reset para **outro host** — fluxo incoerente. |
| R-05 | ALTO | `index.html` ~8126–8128; `pix.js` ~284–287 | Sucesso PIX: UI espera `data.transaction.novoSaldo`; API retorna `success`, `data: { transacao }` sem esse campo. |
| R-06 | ALTO | `index.html` ~8131–8132; erros Express | Erro frequentemente em `message` / `success: false`; UI usa `error.error`. |
| R-07 | ALTO | `index.html` ~8051; `pix.js` ~104–108 | Validação formato telefone **incompatível** (UI +55, API formato nacional com parênteses). |
| R-08 | ALTO | `middleware/auth.js` ~104; `pix.js` ~12 | Pix (e cartão) exigem **`isVerificado`**; confirmação de e-mail quebrada (R-03) **bloqueia** produtos. |
| R-09 | ALTO | `server.js` ~41–47 + ~50–54 | CORS: combinação `credentials: true` com `Access-Control-Allow-Origin: '*'` em middleware — **impróprio para produção**. |
| R-10 | MÉD | `schema.prisma` / `migration.sql` empréstimo | Sem entidade contratual / histórico de aceite além do registro `Emprestimo`. |
| R-11 | MÉD | `boletos.js`, `payments.js` existentes | UI de boleto/pagamento em `index.html` **não** mostra chamadas às rotas nas funções `exibirOpcoesPagamento` / `levarboletoContainer` (~7594–7627). |
| R-12 | MÉD | `notifications.js` | API rica; `irParaNotification` ~5884 **sem** consumo mapeado. |
| L-01 | ALTO | `emprestimo_refatorado.js` ~367–375 | Envio de proposta **simulado** (`setTimeout` + `console.log`). |
| L-02 | ALTO | `index.html` ~5922–5938 | `confirmarEmprestimo` apenas manipula DOM; **nenhuma** chamada `loans`. |
| L-03 | ALTO | `index.html` ~5941 e ~6965 | **Duas** definições de `showExtratoContainer`; última prevalece — risco de manutenção e regressão. |
| L-04 | ALTO | `index.html` extrato ~3802–3857; sem `fetch` movimentação | Extrato **não** integra `Movimentacao` / endpoint agregador. |
| L-05 | MÉD | `index.html` ~6309 `carregarConfiguracoes`; grep só define | Função **nunca chamada**; `abrirConfiguracoesSimples` ~6178 **não** invoca GET settings. |
| L-06 | MÉD | `creditoPessoal.js`, `simulacaoChat.js` | **Sem** `fetch` / `AgilBank.api` — fluxo “simulação” isolado. |
| L-07 | MÉD | `index.html` ~8274 | `containerEmprestimo.js` **comentado**; lógica duplicada entre arquivos. |
| L-08 | BAIX | `index.html` ~7636 | `mensagemAlertaPix` declara Pix indisponível enquanto há `enviarPix` funcional na mesma base. |
| L-09 | BAIX | `index.html` ~7671–7692 | Três atribuições ao mesmo `onclick` do botão fechar modal — código confuso. |
| L-10 | MÉD | `index.html` ~7094–7118 vs `cartao.js` ~218 | Duas implementações de `enviarSolicitacao`; **ordem de script** (cartão.js **depois** ~8271) faz a versão API **sobrescrever** a versão só progresso — dependência frágil. |
| I-01 | BLOQ | Síntese R-01–R-04, L-01–L-02 | Fluxos **transacionalmente falsos** ou **quebrados** em Pix parcial e empréstimo. |
| I-02 | ALTO | `cartao.js` ~9–114 | Coleta de **senha do cartão** e dados no **localStorage**. |
| I-03 | ALTO | `authService.js` ~42; `accountService.js`; `transactionsService.js` | Contratos React **divergentes** das rotas reais; hoje mascarado por entrypoint mínimo. |
| I-04 | MÉD | `tests/auth.test.js` | Cobertura concentrada em auth mockado; sem testes integrados Pix/cartão/loans. |
| I-05 | MÉD | `gov.br1/` no repo | Segundo backend (porta 5000 em `gov.br1/src/server.js`) pode confundir operadores se documentação desatual. |

*(Total: **26** achados na tabela acima.)*

---

## 7. Respostas objetivas (checklist pedido na auditoria anterior)

| Fluxo | Completo end-to-end? | Evidência resumida |
|-------|----------------------|---------------------|
| Cadastro | Parcial até verificar e-mail | Register OK; página confirmação **incorreta** (R-03). |
| Login / logout | Sim no legado + API | `login.js`, `auth/logout`. |
| Perfil | Sim | `user-complete-data`, `profile`. |
| Configurações | Leitura fraca | PUT ok; GET não ao abrir (L-05). |
| Cartão | Parcial | POST lista/cria; formulário longo não persiste (I-02); verificado obrigatório (R-08). |
| Pix | Parcial / quebrado em passos | validate/qr 404 (R-01–R-02); send OK mas resposta UI (R-05); telefone (R-07). |
| Transferência | Não no legado | Não mapeado `pix/send` como “TED”; React `account/transfer` inexistente (I-03). |
| Pagamento / boleto | UI sem API nas funções citadas | R-11. |
| Extrato | Não | L-04. |
| Empréstimo | Não | L-01, L-02. |

---

## 8. Plano de correção por fases

1. **Bloqueantes:** Implementar ou remover `pix/validate` e `pix/qr-code`; corrigir `confirmar-email.html` e unificar `reset-password.html` na mesma base e paths do `auth.js`; alinhar resposta ou parser de `pix/send`; garantir verificação de e-mail funcional antes de exigir `requireVerification` em tudo.
2. **Alto:** Integrar `POST /api/loans` ou desativar CTAs de envio; parar de persistir dados sensíveis de cartão em `localStorage`; harmonizar validação de chave telefone; corrigir tratamento de erro (`message` vs `error`).
3. **Médio:** Extrato consumindo movimentações; notificações consumindo API; funções duplicadas (`showExtratoContainer`, `enviarSolicitacao`); carregar settings ao abrir painel.
4. **Baixo / produto:** Modelar contratos e comprovantes; ampliar testes; endurecer CORS; revisar `gov.br1` vs deploy único.

---

## 9. Parecer final do Ivar

**Aprovado para produção financeira real:** **Não.**

**Motivo:** Há evidência concreta de **endpoints ausentes** usados pela UI (Pix), **páginas de autenticação auxiliares incoerentes** com o servidor local, **fluxo de empréstimo sem persistência**, **extrato e notificações desconectados** das APIs existentes, e **armazenamento inaceitável de dados sensíveis** no browser no fluxo de cartão. O sistema pode servir como **protótipo técnico** ou **demo**, não como banco em produção sem a Fase 1 do plano.

**Próximo passo recomendado:** corrigir bloqueantes da Fase 1 com revisão explícita de **contrato** (RULE-8): qualquer mudança de response deve ser coordenada entre `index.html` e consumidores React futuros.

**Build:** `npm run build` em `agilbank-frontend` **OK** no estado atual — não prova integridade dos fluxos bancários acima.

---

## 10. Auditoria de dados reais vs mock/fallback

**Escopo:** verificar se valores exibidos ao usuário autenticado refletem **dados persistidos** (Prisma/API) ou se há **placeholder, constante ou fallback** que imita dado real. Nenhum código foi alterado.

### 10.1 Ragnar — backend, conta e saldo

| Pergunta | Resposta com evidência |
|----------|-------------------------|
| No cadastro, o backend gera número de conta? | **Sim.** `auth.js` ~83–86: `numeroConta` aleatório 6 dígitos, `digitoConta` 2 dígitos, `agencia` fixa `'0001'`. |
| `numeroConta` existe no Prisma? É único? | **Sim.** `schema.prisma` ~23–25: `numeroConta String? @unique`, `digitoConta`, `agencia`. |
| Retorno em `POST /auth/login`? | **Sim.** Objeto `user` completo (sem `senha`) após `findUnique` — inclui `numeroConta`, `digitoConta`, `agencia`, `saldoAtual`, `limiteCartao`, `nomeCompleto`, `email`, `cpf`, etc. (`auth.js` ~233–237, ~285–309). |
| Retorno em `GET /user/profile`? | **Sim.** `user.js` ~31–55: `select` explícito com `numeroConta`, `digitoConta`, `agencia`, `saldoAtual`, `limiteCartao`, … |
| Retorno em `GET /user/user-complete-data`? | **Sim**, com ressalva: monta `usuario` com aliases snake_case (`user.js` ~495–518). **Saldo:** `saldo_atual` vem de `User.saldoAtual` (real). **Limite cartão:** `limite_cartao: toNumber(user.limiteCartao) \|\| 4300` — se `limiteCartao` for **null**, o backend devolve **4300** (valor **não retirado do BD** nesse caso → comportamento **mock/fallback**). |
| Saldo “real” vem de qual campo? | **`User.saldoAtual`** (Decimal), exposto como `saldoAtual` / `saldo_atual` nas respostas. Atualizado em operações como PIX (`pix.js` decrementa saldo). |
| `tipoConta`? | **Não existe** no modelo `User` (`schema.prisma`); a API não expõe tipo de conta corrente/poupança. |
| Limites / cartão são calculados ou mockados? | **Limite no `user-complete-data`:** fallback **4300** quando nulo (mock). **Cartão aprovado:** `cards.js` gera dados demo de cartão (`generateDemoCardFields`); limite de crédito pode ser calculado a partir de `scoreCredito` na criação — misto **real + demo**. |

### 10.2 Lagertha — onde o dashboard/header preenche dados

**HTML inicial (antes de qualquer JS):** `index.html` ~2123–2134 — `#user-name` “Olá, Usuário”, `#user-email` `email@exemplo.com`, `#user-account` “Conta: Não disponível”, `#saldoValue` `R$ 0,00`, `#limiteValorHeader` `R$ 0,00`.  
**Menu dropdown:** ~2036–2038 — texto inicial “Carregando...”.

**Fluxos que atualizam a UI:**

1. **`carregarPerfilUsuario()`** (~6488+) → `GET user/user-complete-data` → **`atualizarInterfacePerfil(profile)`** (~6557+).  
   - Atualiza `#user-name`, `#user-email`, dropdown, `#saldoValue` com dados de `profile.user_data.usuario` quando a API responde 200.  
   - **Bug de domínio:** `#user-account` recebe **`Conta: ${cpf}`** (~6602) — exibe **CPF** no rótulo “Conta”, não `numero_conta-digito` (dados reais de conta existem em `userData` mas não são usados nesse elemento).

2. **`usarDadosPadrao()`** (~6534+) — chamado em falha de API ou quando `carregarDadosPerfilAutomaticamente` (~6085) julga usuário não logado. Monta objeto **sem** `user_data.usuario`; `atualizarInterfacePerfil` cai nos fallbacks **‘Usuário’**, **‘email@exemplo.com’**, **‘000.000.000-00’**, saldo 0 — **enganoso se ainda houver token**.

3. **`carregarDadosPerfilAutomaticamente`** (~6085) — só chama `carregarPerfilUsuario()` se `loginContainer.style.display === 'none'`. Se o estilo não foi aplicado ainda, pode chamar **`usarDadosPadrao()`** e preencher placeholders **com usuário já autenticado** (condição frágil).

4. **`LoginSystem.updateUserHeader`** (`login.js` ~514–524) — chama `userDataManager.updateAllUserData()`, que em **`userDataManager.js` ~146–149** está **explicitamente desabilitado** (“Manter dados estáticos”, `return` imediato). O fallback `updateUserHeaderFallback` também está **desabilitado** (`login.js` ~527–530). **Conclusão:** após o login, **o header não é atualizado por esse caminho**; depende de `carregarPerfilUsuario` / outras funções.

5. **`forceUpdateHeaderData()`** (`index.html` ~10696+) — lê apenas **`localStorage['user_data']`**. Se vazio, aplica de novo **Usuário / email@exemplo.com / 000.000.000-00**. Repete o erro **Conta: CPF** (~10753).

6. **Variável `saldoReal`** (`index.html` ~5809) — inicializada como **`1500.50`** (constante). Usada em **`showExtratoContainer`** (~5958, ~6985, ~7015) para formatar valor no extrato — **não** liga ao `saldo_atual` da API → **mock** na visão de extrato.

7. **Helpers de teste no próprio HTML** (~10473–10488) — gravam `limite_cartao` **0** ou **5000** em `localStorage` para simulação — risco de **sobrescrever** percepção de limite se executados.

### 10.3 Tabela consolidada — dado exibido vs fonte

| Dado exibido | Onde aparece | Elemento / função | Valor mock / fallback encontrado | Fonte real esperada | Backend tem? | Front busca? | Front aplica? | Risco | Severidade | Correção recomendada (futura) |
|--------------|--------------|-------------------|-----------------------------------|---------------------|----------------|--------------|---------------|-------|------------|--------------------------------|
| Nome do cliente | Dashboard header | `#user-name`, `atualizarInterfacePerfil` ~6589 | HTML inicial “Olá, Usuário”; fallback `'Usuário'` ~6562, `usarDadosPadrao` ~6538 | `nomeCompleto` / `nome_completo` | Sim | Sim (`user-complete-data`) | Sim se API OK | Usuário logado vê nome genérico se API falhar ou ordem de execução errada | **BLOQ.** se persistir após login | Garantir uma única fonte pós-login; não chamar `usarDadosPadrao` com token válido; reabilitar atualização pós-login ou remover desabilitação |
| E-mail | Dashboard header | `#user-email` ~2124 | `email@exemplo.com`; fallback ~6563 | `email` | Sim | Sim | Sim se API OK | Idem | **BLOQ.** se persistir | Idem |
| “Conta” no header | Dashboard | `#user-account` ~2125 | “Não disponível”; depois **CPF** em ~6602 e ~10753 | `numeroConta` + `digitoConta` + `agencia` | Sim | Sim (indireto) | **Aplica errado** (usa CPF) | **Conta bancária falsa** (mostra CPF como conta) | **BLOQ.** | Exibir agência/conta-dígito; nunca CPF no label Conta |
| Saldo (dashboard) | `#saldoValue` | `atualizarInterfacePerfil` ~6607 | HTML `R$ 0,00` até carregar; fallback saldo 0 | `saldo_atual` | Sim | Sim | Sim se API OK | Zero enganoso antes da API | **ALTO** se não atualizar | Loading explícito; sincronizar após login |
| Limite cartão (header / painel) | `#limiteValorHeader`, funções limite | API + `localStorage` | Backend **4300** se `limiteCartao` null ~505-506; testes HTML 5000/0 | `limiteCartao` real ou ausência de cartão | Sim (com fallback API) | Sim | Sim | **Limite fictício R$ 4.300** | **BLOQ.** (backend+front) | Remover `|| 4300` ou retornar null e UI tratar “sem limite” |
| Nome no painel perfil | `#perfil-nome` | ~6632 | `'Usuário'` quando `profile.nome` indefinido | `user_data.usuario.nome_completo` | Sim | Sim | **Parcial** — lê `profile.nome` em vez de `userData` | Perfil mostra mock com API OK | **ALTO** | Usar `userData.nome_completo` ou normalizar objeto |
| CPF no painel perfil | `#perfil-cpf` | ~6633 | fallback CPF zeros | `user_data.usuario.cpf` | Sim | Sim | **Parcial** — mesma inconsistência | Idem | **ALTO** | Idem |
| E-mail no painel | `#emailValor` | ~6638 | `email@exemplo.com` | `usuario.email` | Sim | Sim | **Parcial** — usa `profile.email` flat | Idem | **ALTO** | Usar `userData.email` |
| Saldo / valor extrato | Extrato | `showExtratoContainer`, `saldoReal` | **`saldoReal = 1500.50`** ~5809 | `saldo_atual` | Sim | **Não** neste fluxo | **Não** — usa constante | Extrato **mentiroso** | **BLOQ.** | Ler saldo da API ou variável atualizada por `atualizarInterfacePerfil` |
| Menu dropdown nome/e-mail/conta | `#user-menu-*` | `atualizarInterfacePerfil` ~6571 | “Carregando...” → dados reais ou fallback | Mesmos campos usuário | Sim | Sim | Sim se API OK | Login path desabilitado no UserDataManager | **ALTO** | Ver itens acima |

### 10.4 Ivar — síntese de risco

- **BLOQUEANTE:** (1) Exibir **CPF** como “Conta” no header (`index.html` ~6602, ~10753). (2) Backend devolver **limite 4300** quando não há limite no BD (`user.js` ~505–506). (3) Extrato usar **`saldoReal` fixo 1500.50** em vez do saldo da conta (~5809). (4) Usuário autenticado cair em **`usarDadosPadrao`** (placeholders “Usuário”, e-mail exemplo, CPF zeros) por condição frágil ou falha de API — **parece conta real, não é**.
- **ALTO:** `UserDataManager.updateAllUserData` / `login.js` fallback **desabilitados** — header permanece estático após login até outra rotina rodar; campos de perfil (`perfil-nome`, etc.) leem chaves **erradas** do objeto `profile`.
- **MÉDIO:** Dropdown inicia “Carregando...”; se a API for lenta, ok; se nunca atualizar, vira ALTO.
- **BAIXO:** Placeholders na tela de login ou formulários (`placeholder="000.000.000-00"` em recuperação de senha) — desde que não apareçam como dado da conta logada.

**Atualização do parecer (complemento):** o problema **não é só** integração de rotas; há **dados financeiros e identificação de conta apresentados incorretamente ou constantes**, o que, para app bancário, **agrava** a reprovação para produção até correção da seção 10.3.

---

## 11. Referência rápida — arquivos mais inspecionados

- Backend: `src/server.js`, `src/routes/auth.js`, `user.js`, `pix.js`, `cards.js`, `loans.js`, `boletos.js`, `payments.js`, `notifications.js`, `email.js`, `src/middleware/auth.js`, `validation.js`
- Frontend legado: `agilbank-frontend/public/banco/index.html`, `js/legacyApiClient.js`, `js/login.js`, `js/cartao.js`, `js/formulario-conta.js`, `js/userDataManager.js`, `js/emprestimo_refatorado.js`, `confirmar-email.html`, `reset-password.html`
- Frontend React (parcial): `src/main.jsx`, `App-simple-working.jsx`, `src/services/*.js`
- ORM: `prisma/schema.prisma`, `prisma/migrations/20260501152812_init/migration.sql`

---

## 12. Plano técnico — Fase 1: dados reais no header/dashboard (planejamento)

**Status:** planejamento apenas — **nenhuma alteração de código** foi aplicada neste passo.  
**Leituras de apoio:** §10 deste documento; `docs/reports/AGILBANK-STATUS-MIGRACAO-LEGADO.md` (convenções `AgilBank.api`, storage `agilbank_*` / `govbr_*`, regra de não remover IDs/funções globais sem estratégia).

**Objetivo da Fase 1:** o dashboard/header **não** exibe, para usuário autenticado, placeholders ou constantes que imitem dado bancário real (nome genérico, e-mail exemplo, CPF como conta, saldo/extrato fictícios, limite 4300 inventado).

---

### 12.1 Ragnar — contrato final dos dados (confirmação para implementação)

| Fonte | Formato da resposta (sucesso) | Campos relevantes ao header/dashboard |
|-------|-------------------------------|----------------------------------------|
| **`POST /api/auth/login`** | `{ success, message, data: { user, token, refreshToken } }` | `user`: objeto `User` Prisma **sem** `senha`; inclui `nomeCompleto`, `email`, `cpf`, `telefone`, `dataNascimento`, `saldoAtual`, `limiteCartao`, `limitePixDiario`, `limitePixMensal`, `scoreCredito`, `numeroConta`, `digitoConta`, `agencia`, `isAtivo`, `isVerificado`, `createdAt`, `updatedAt`, `configuracoes`, … (`auth.js` ~302–309, usuário vindo de `findUnique` ~233–237). |
| **`GET /api/user/profile`** | `{ success, message, data: { user } }` | `user` com `select`: `nomeCompleto`, `email`, `cpf`, `saldoAtual`, `limiteCartao`, `numeroConta`, `digitoConta`, `agencia`, … (`user.js` ~31–61). |
| **`GET /api/user/user-complete-data`** | `{ success, message, user_data: { usuario }, data: { user, user_data } }` | `usuario` normalizado com aliases: `nome_completo`, `email`, `cpf`, `saldo_atual`, `saldoAtual`, `limite_cartao`, `limiteCartao`, `numero_conta`, `digito_conta`, `agencia`, … (`user.js` ~495–524). |

**Tipo de `saldoAtual` / `limiteCartao` no JSON:** vêm do Prisma como `Decimal`. Na serialização JSON do Express, costumam aparecer como **string** (ex.: `"1500.50"`) ou número conforme configuração do cliente Prisma — **o frontend da Fase 1 deve normalizar com `Number(...)` ou parse seguro** antes de `toFixed`, evitando `NaN` na UI.

**`numeroConta`, `digitoConta`, `agencia` após cadastro:** no fluxo **`POST /auth/register`**, o backend **sempre** atribui os três (`auth.js` ~83–102). No modelo Prisma, `numeroConta` é **opcional** (`String?`); usuários criados por outros meios ou dados legados **podem** ter `null` — a UI deve tratar “conta ainda não disponível” sem inventar dígitos.

**`limiteCartao` nulo:** hoje `user-complete-data` faz `toNumber(user.limiteCartao) || 4300` (`user.js` ~505–506), o que **inventa** limite — **remover o `|| 4300`** é mudança de **contrato** (RULE-8): clientes devem aceitar `null` / `0` / omitir painel de limite. Recomendação: retornar `limite_cartao: null` (ou número apenas quando existir no BD) e o front exibir **“Sem limite de cartão cadastrado”** ou ocultar o bloco.

**Decisão de produto (registrar antes de codar):** quando não houver limite no BD, preferir **omitir valor numérico** ou mostrar texto **não numérico** (“—”, “Não disponível”), nunca um valor que pareça crédito aprovado.

---

### 12.2 Lagertha — mapeamento frontend (arquivos e funções)

| O quê | Onde | Detalhe |
|-------|------|---------|
| Header hardcoded inicial | `index.html` ~2123–2134 | `#user-name`, `#user-email`, `#user-account`, `#saldoValue`, `#limiteValorHeader` com strings de marketing/placeholder. |
| Dropdown menu | `index.html` ~2036–2038 | `#user-menu-fullname`, `#user-menu-email`, `#user-menu-account` inicial “Carregando...”. |
| Atualização principal pós-API | `index.html` `atualizarInterfacePerfil(profile)` ~6557+ | Preenche header, saldo, dropdown; **erros:** CPF como conta ~6602; fallbacks ~6562–6566; perfil usa `profile.nome` em vez de `user_data` ~6632–6638. |
| Carga disparada no load | `index.html` `carregarDadosPerfilAutomaticamente` ~6085 | Chama `carregarPerfilUsuario()` se `loginContainer.style.display === 'none'`, senão `usarDadosPadrao()`. |
| Carga explícita | `index.html` `carregarPerfilUsuario` ~6488+ | `GET user/user-complete-data`. |
| Mocks forçados | `index.html` `usarDadosPadrao` ~6534+ | Define nome/e-mail/cpf fictícios e chama `atualizarInterfacePerfil` — **perigoso com token válido**. |
| Header a partir de `localStorage` | `index.html` `forceUpdateHeaderData` ~10696+ | Usa `user_data`; fallback mock; **Conta: CPF** ~10753. |
| Pós-login | `login.js` `updateUserHeader` ~514 | Chama `userDataManager.updateAllUserData()` — **no-op** (`userDataManager.js` ~146–149). |
| Saldo extrato mock | `index.html` `let saldoReal = 1500.50` ~5809 | Consumido em `showExtratoContainer` ~5958, ~6985, ~7015. |

**Função única proposta como fonte de verdade (implementação futura):**  
`aplicarDadosUsuarioReais(dadosNormalizados, opcoes)` — recebe **sempre** um objeto já normalizado (camelCase + aliases mínimos) proveniente de **login** ou **`user/profile`** ou **`user/user-complete-data`**, e:

1. Atualiza `#user-name`, `#user-email`, `#user-account`, `#saldoValue`, `#user-menu-*`, e coerente com **agência + conta + dígito** (formato acordado: ex. `Agência 0001 · Conta 123456-78`).
2. **Nunca** preenche “Conta” com CPF.
3. Não usa strings `Usuário` / `email@exemplo.com` / `000.000.000-00` quando `opcoes.modo === 'autenticado'`.
4. Se `dadosNormalizados` for `null` e autenticado: estado **`carregando`** ou **`Dados indisponíveis. Tente novamente.`** — não fallback bancário falso.
5. Sincroniza **`saldoReal`** (ou remove a variável) para que o extrato use **o mesmo saldo** que o header, ou remove exibição de “saldo” no extrato até haver endpoint de movimentações.

**Onde passar a chamar (ordem lógica após implementação):**

1. Após login bem-sucedido (`login.js`): normalizar `data.user` e chamar `aplicarDadosUsuarioReais` **antes ou em paralelo** com `showMainApp`, sem depender só do timeout do `DOMContentLoaded`.
2. Após `GET user/user-complete-data` com sucesso: uma única chamada à mesma função (refatorar `atualizarInterfacePerfil` para delegar nela ou receber o objeto normalizado).
3. Opcional: `userDataManager.loadUserDataFromAPI` passa a atualizar UI via essa função **se** reabilitar atualização automática (alinhado à migração legada: um cliente de API único).

---

### 12.3 Alterações mínimas previstas (lista de arquivos — ainda não executadas)

| Arquivo | Alteração prevista |
|---------|---------------------|
| `src/routes/user.js` | Remover `|| 4300` em `limite_cartao` / `limiteCartao` no objeto `usuario` de `user-complete-data`; documentar novo contrato (Swagger se aplicável). **Impacto:** RULE-8 — qualquer outro consumidor deve tratar `null`. |
| `agilbank-frontend/public/banco/index.html` | Introduzir/refatorar `aplicarDadosUsuarioReais`; corrigir `#user-account`; substituir `usarDadosPadrao` para **não** aplicar mocks quando `getToken()` presente; endurecer `carregarDadosPerfilAutomaticamente` (ex.: token presente ⇒ sempre tentar API, nunca mock); corrigir `forceUpdateHeaderData`; eliminar ou repor `saldoReal` mock; ajustar extrato (saldo honesto ou mensagem); corrigir trechos de perfil ~6632–6638 para usar `userData` derivado de `profile.user_data.usuario`. |
| `agilbank-frontend/public/banco/js/login.js` | Após login: chamar `aplicarDadosUsuarioReais` com objeto do `data.user` (normalizado); reavaliar `updateUserHeader` / reabilitar caminho único com `userDataManager` ou remover duplicidade. |
| `agilbank-frontend/public/banco/js/userDataManager.js` | Reabilitar `updateAllUserData` / `updateMainUserInfo` para delegar à função global única **ou** importar módulo compartilhado — evitar dois pontos de verdade. |

**Fora do escopo da Fase 1 (não bloquear o pacote):** Pix transacional completo; extrato com lista real de movimentações (pode ficar “indisponível” com mensagem clara); React `App-simple-working` (usuário entra no legado via redirect).

---

### 12.4 Ivar — riscos e aprovação do plano

| ID | Severidade | Descrição |
|----|------------|-----------|
| F1-B01 | BLOQUEANTE | Manter qualquer mock (nome/e-mail/conta/saldo/limite falso) **visível** após login. |
| F1-A01 | ALTO | Remover `4300` no backend sem atualizar **todos** os pontos do legado que assumem número — risco de `undefined` na UI. |
| F1-A02 | ALTO | Duas funções competindo (`atualizarInterfacePerfil` vs `forceUpdateHeaderData` vs login) — **sobrescrita** de dado real. |
| F1-M01 | MÉDIO | Placeholder “Carregando...” ou skeleton **apenas** até primeira resposta autenticada — aceitável. |
| F1-M02 | MÉDIO | `Decimal` como string — precisa normalização numérica única para não quebrar `toFixed`. |

**Parecer:** o plano da Fase 1 é **aprovado para execução futura**, desde que: (1) a remoção do fallback **4300** seja feita com **anúncio de contrato** e ajuste do front na **mesma entrega** ou feature flag; (2) `usarDadosPadrao` **não** seja chamado quando houver token válido; (3) exista **uma** função de aplicação de dados ao header alimentada só por API/login normalizado.

---

### 12.5 Testes obrigatórios (após implementação — checklist)

1. **Cadastro novo** → login → header mostra nome/e-mail reais, conta `agencia` + `numeroConta-digito`, saldo igual ao BD (ex.: 0,00 inicial), **sem** 4300 se `limiteCartao` for null.
2. **Login usuário existente** com saldo alterado (ex.: após PIX em ambiente de teste) → header e valor usado no extrato (se exibido) **batem** com `GET user/profile`.
3. **Falha de rede** simulada com token válido → **não** aparecem `email@exemplo.com` / `000.000.000-00` como dado da conta; mensagem de indisponibilidade ou retry.
4. **Refresh da página** com sessão persistida → dados recarregados da API, não só HTML inicial.
5. **Regressão:** `npm run build` no frontend; smoke login no legado; grep rápido por strings proibidas no bloco pós-login (`email@exemplo.com` como valor aplicado em header).

---

### 12.6 Registro para `AGILBANK-STATUS-MIGRACAO-LEGADO.md` (quando executar)

Antes de editar código: registrar neste arquivo o plano resumido “Fase 1 — header dados reais”, escopo backend + `index.html` + `login.js` + `userDataManager.js`, e após merge validar build e checklist §12.5.

---

*Documento atualizado em 2026-05-03 (inclui §12 plano Fase 1 header/dashboard).*
