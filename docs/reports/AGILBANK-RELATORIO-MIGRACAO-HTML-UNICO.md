# Relatorio de migracao do HTML unico do AgilBank

Data: 2026-05-03

## Objetivo

Analisar o dashboard legado em `agilbank-frontend/public/banco/index.html` com a intencao de preparar uma migracao segura de um HTML unico com varios containers para telas/componentes separados, sem quebrar o JavaScript atual.

## Resumo executivo

O dashboard do banco hoje funciona como uma SPA manual dentro de um unico arquivo:

- Arquivo principal: `agilbank-frontend/public/banco/index.html`
- Tamanho aproximado: 10248 linhas
- Funcoes globais no HTML: 154
- `onclick` inline: 196
- `window.onload`: 2 atribuicoes diretas
- `DOMContentLoaded`: 10 usos
- Containers principais mapeados: 25
- Modais/overlays mapeados: 24
- Usos de `localStorage`/`sessionStorage` no legado: 129

Conclusao: a migracao e possivel, mas nao deve ser feita separando tudo de uma vez. O caminho seguro e primeiro estabilizar os contratos globais de autenticacao, API, navegacao e storage. Depois, migrar tela por tela.

## Como o sistema funciona hoje

O React/Vite carrega `src/App-simple-working.jsx`. Depois do login, o usuario e redirecionado para:

```txt
/banco/index.html
```

Dentro desse HTML, as telas nao sao rotas reais. Elas sao `div`s/containers que aparecem e somem com JavaScript global.

Exemplo:

- `container`: dashboard principal
- `pixContainer`: Area Pix
- `extratoContainer`: Extrato
- `cartaoGerenciamentoContainer`: Cartoes
- `creditoContainer`: Credito pessoal
- `perfilContainer`: Perfil
- `configuracoesContainer`: Ajustes

O padrao atual e:

1. Clicar em um botao com `onclick`.
2. Chamar uma funcao global como `showPixContainer()`.
3. Executar `ocultarTodosContainers()`.
4. Mostrar apenas o container desejado.
5. A URL continua a mesma: `/banco/index.html`.

## Telas por URL

React ativo:

- `/`
- `/login`
- `/register`
- `/terms`
- `*` redireciona para `/`

HTML legado publico:

- `/banco/index.html`
- `/banco/confirmar-email.html`
- `/banco/reset-password.html`
- `/banco/pages/formularioCadastrodeConta.html`

## Telas internas principais do dashboard legado

- `container` - dashboard principal
- `pixContainer` - Area Pix
- `extratoContainer` - Extrato
- `cartaoGerenciamentoContainer` - Gerenciamento de cartoes
- `cartaoVirtualContainer` - Cartao virtual
- `cartaoFisicoContainer` - Cartao fisico
- `limiteCartaoContainer` - Limite do cartao
- `opcoesLimiteContainer` - Opcoes de limite
- `creditoContainer` - Credito pessoal
- `emprestimoContainer` - Emprestimo
- `emprestimoContent` - Conteudo de emprestimo
- `emprestimoFormulario` - Formulario de emprestimo
- `emprestimoLoading` - Loading de emprestimo
- `emprestimoLiberado` - Emprestimo liberado
- `emprestimoConcedidoContainer` - Emprestimo concedido
- `boletoContainer` - Boleto
- `containerGerarBoletoPix` - Gerar boleto/Pix
- `paymentOptionsContainer` - Opcoes de pagamento
- `resultadoVerificacaoContainer` - Resultado de verificacao
- `statusEntregaContainer` - Status de entrega
- `notification` - Notificacoes
- `fullNotification` - Notificacao completa
- `perfilContainer` - Perfil
- `configuracoesContainer` - Configuracoes
- `chatContainer` - Chat/simulacao
- `contaContainer` - Abertura de conta
- `validarCartao` - Validacao de cartao

## Modais e overlays importantes

- `modalEnviarPix`
- `modalReceberPix`
- `modalChavePix`
- `modalLimitesPix`
- `modalQRCode`
- `modalCopiaCola`
- `modalOverlay`
- `modalOverlay1`
- `containerOverlayGRU`
- `containerOverlayPix`
- `biometriaModal`
- `esqueciSenhaModal`
- `criarSenhaModal`
- `redefinirSenhaModal`
- `modalVersao`
- `modalTermosUso`
- `modalPrivacidade`
- `termsModal`

## Achados da analise do Ragnar

Ragnar focou no JavaScript e confirmou os principais riscos tecnicos.

### Dependencias globais

O HTML depende de funcoes globais chamadas por `onclick`, por exemplo:

- `showPixContainer()`
- `voltarParaPrincipal()`
- `ocultarTodosContainers()`
- `showExtratoContainer()`
- `showCartaoGerenciamento()`
- `abrirPerfilSimples()`
- `abrirConfiguracoesSimples()`
- `abrirModal1()`
- `abrirModalReceberPix()`
- `abrirModalLimitesPix()`

Se uma tela for movida para outro arquivo sem carregar essas funcoes, os botoes quebram.

### Riscos criticos

1. Existem 2 `window.onload` no `index.html`. Um pode sobrescrever o outro.
2. Existem funcoes duplicadas, incluindo `showExtratoContainer` e `showCartaoFisicoContainer`.
3. Ha chamadas de API espalhadas, algumas ainda apontando para backend antigo `127.0.0.1:5000`.
4. O storage e contrato implicito: `agilbank_token`, `govbr_token`, `token`, `agilbank_user`, `govbr_user`.
5. Scripts fazem `document.getElementById` direto em elementos globais. Se o container nao existir, pode quebrar com `null`.

### Recomendacoes do Ragnar

- Criar um `authStore` unico.
- Criar um `apiClient` unico.
- Trocar `window.onload = ...` por `window.addEventListener('load', ...)`.
- Trocar `onclick` inline por `data-action` com delegacao de evento.
- Usar padrao `mount(root)` / `unmount(root)` para cada tela.
- Criar namespace temporario:

```js
window.AgilBank = {
  nav: {},
  auth: {},
  pix: {},
  cards: {},
  loan: {},
  account: {}
};
```

## Achados da analise da Lagertha

Lagertha focou na estrategia de migracao segura.

### Prioridade de negocio

1. Login, cadastro e sessao
2. Dashboard principal
3. Pix
4. Cartao e emprestimo
5. Perfil, configuracoes, notificacoes, extrato, boleto e GRU

### Regra principal

Nada deve sair do legado sem provar tres coisas:

1. Mesma entrada
2. Mesmo estado salvo
3. Mesmo resultado de API

## Plano seguro de migracao

### Fase 0 - Inventario e congelamento

Antes de separar telas:

- Mapear containers.
- Mapear funcoes chamadas por `onclick`.
- Mapear endpoints usados por cada tela.
- Mapar storage usado por cada tela.
- Corrigir URLs antigas de API.
- Corrigir `window.onload` duplicado.

### Fase 1 - Contrato unico de autenticacao

Criar uma camada unica para sessao:

- `getToken()`
- `getUser()`
- `setSession(token, user)`
- `clearSession()`

Ela deve manter compatibilidade com:

- `agilbank_token`
- `govbr_token`
- `token`
- `agilbank_user`
- `govbr_user`

### Fase 2 - API client unico

Centralizar chamadas para API em um unico lugar.

Hoje existem chamadas misturadas entre:

- `http://localhost:3001/api`
- `http://127.0.0.1:5000/api`
- caminhos diretos `/api/...`

O correto e todo mundo usar a mesma base.

### Fase 3 - Navegacao controlada

Antes de transformar em rotas React, criar um controlador simples:

```js
AgilBank.nav.show('pix');
AgilBank.nav.show('extrato');
AgilBank.nav.show('cartoes');
```

Esse controlador pode continuar mostrando/escondendo containers no HTML atual. Assim a gente reduz risco antes de separar arquivos.

### Fase 4 - Migrar dashboard principal

Primeira tela candidata:

- `container`

Motivo: e a tela raiz, mas nao deve mexer diretamente em dinheiro/transacao como Pix.

Critico manter:

- usuario logado
- saldo
- menu principal
- botoes apontando para telas legadas enquanto elas nao forem migradas

### Fase 5 - Migrar Pix como modulo fechado

Pix deve ser migrado depois da base estar estavel.

Telas/modais envolvidos:

- `pixContainer`
- `modalEnviarPix`
- `modalReceberPix`
- `modalChavePix`
- `modalLimitesPix`
- `modalQRCode`
- `modalCopiaCola`

Endpoints:

- `GET /api/pix/limits`
- `GET /api/pix/keys`
- `POST /api/pix/keys`
- `POST /api/pix/validate`
- `POST /api/pix/qr-code`
- `POST /api/pix/send`

### Fase 6 - Migrar cartao e emprestimo

Cartao:

- `cartaoGerenciamentoContainer`
- `cartaoVirtualContainer`
- `cartaoFisicoContainer`
- `limiteCartaoContainer`

Emprestimo:

- `creditoContainer`
- `emprestimoContainer`
- `emprestimoFormulario`
- `emprestimoLiberado`
- `emprestimoConcedidoContainer`

### Fase 7 - Migrar telas secundarias

Depois:

- Perfil
- Configuracoes
- Extrato
- Notificacoes
- Boleto/GRU
- Chat
- Abertura de conta

## O que nao fazer agora

Nao fazer:

- Separar todo o HTML de uma vez.
- Remover funcoes globais antes de saber quem chama.
- Remover IDs dos containers.
- Trocar todos os `onclick` de uma vez.
- Migrar Pix antes de estabilizar auth/API/storage.
- Deletar arquivos CSS/JS legados antes de confirmar zero uso.

## Primeiro pacote de trabalho recomendado

O primeiro pacote deve ser pequeno e seguro:

1. Criar `legacyAuthStore.js`.
2. Criar `legacyApiClient.js`.
3. Corrigir `window.onload` duplicado.
4. Criar `legacyNavigation.js` com `showContainer`.
5. Trocar apenas 3 botoes para usar o novo controlador:
   - dashboard
   - Pix
   - Extrato
6. Rodar smoke test:
   - login
   - dashboard
   - Pix abre
   - Extrato abre
   - voltar para dashboard
   - logout

## Decisao recomendada

Manter o HTML unico por enquanto, mas comecar a domesticar o JavaScript dentro dele.

So depois separar telas fisicamente.

Essa abordagem reduz o risco de quebrar o sistema pronto e cria base para migrar com seguranca.
