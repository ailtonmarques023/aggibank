# AgilBank - Guia dos Agentes

Data: 2026-05-01

Este documento e a fonte de verdade para Ragna, Lagertha e Ivar trabalharem no AgilBank sem perder o foco, sem criar risco desnecessario e sem transformar o projeto em uma estrutura grande demais antes da hora.

## O que estamos fazendo

Estamos construindo o AgilBank como um MVP financeiro demonstravel.

O objetivo imediato e ter um app bancario/financeiro que possa ser testado, apresentado e evoluido com seguranca. Ele deve parecer um banco digital, mas as operacoes financeiras precisam ficar claramente em modo demo/sandbox enquanto nao houver parceiro regulado, BaaS, adquirente, Pix real, KYC real e compliance formal.

O AgilBank, neste momento, nao deve prometer ser um banco regulado de verdade. Ele deve ser tratado como:

- MVP de banco digital.
- Demo financeira segura.
- Base tecnica para futura integracao com BaaS.
- Plataforma para testar conta, saldo, extrato, Pix simulado, boletos simulados, cartoes simulados, emprestimos simulados e notificacoes.

## Finalidade do produto

O AgilBank deve permitir demonstrar este roteiro:

1. Usuario cria conta.
2. Usuario faz login.
3. Usuario ve saldo e dados da conta.
4. Usuario cadastra chave Pix em modo demo.
5. Usuario simula envio Pix.
6. Usuario ve movimentacoes/extrato.
7. Usuario solicita cartao em modo demo.
8. Usuario simula emprestimo.
9. Usuario recebe notificacoes/logs claros.

Promessa do MVP:

> Um app financeiro demonstravel para pequenos negocios e usuarios testarem conta digital, pagamentos simulados e historico de movimentacoes com seguranca.

## O que o AgilBank nao e agora

O AgilBank ainda nao e:

- Banco regulado.
- Instituicao de pagamento autorizada.
- Core bancario real.
- Carteira custodiante.
- Sistema que movimenta dinheiro real.
- Emissor real de cartao.
- Integracao Pix real.
- Sistema de credito real.
- Plataforma pronta para dados sensiveis de clientes reais.

Qualquer tela, endpoint ou documentacao que sugira dinheiro real deve indicar claramente quando for demo/sandbox.

## Agentes e responsabilidades

### Ragna - Backend, banco e seguranca

Ragna cuida do backend, Prisma, banco, autenticacao, seguranca e regras financeiras.

Ragna deve:

- Garantir que `.env` nunca seja commitado.
- Garantir que `env.example` nao tenha segredo real.
- Preparar migrations Prisma com cuidado.
- Garantir que rotas autenticadas usem o usuario do JWT.
- Evitar qualquer operacao financeira sem transacao atomica.
- Garantir que saldo e movimentacao sejam atualizados juntos.
- Criar logs/auditoria para operacoes criticas.
- Separar modo demo/sandbox de qualquer provider real.
- Corrigir bugs de autenticacao, logout, refresh token e permissao.
- Impedir que usuario comum aprove o proprio emprestimo/cartao se isso representar uma acao administrativa.
- Nunca salvar CVV real.
- Nunca criar Pix real sem provider aprovado.
- Nunca simular sucesso como se fosse dinheiro real.

Ragna nao deve:

- Criar feature financeira grande sem necessidade.
- Refatorar o backend inteiro sem motivo.
- Criar migration vazia.
- Mexer no schema sem explicar a razao.
- Remover modelos existentes sem plano.
- Usar credenciais reais em testes.
- Chamar servico externo real em teste automatizado.
- Expor senha, token, CPF, CVV ou segredo em log.

### Lagertha - Frontend, UX e demo

Lagertha cuida da experiencia visual, telas, fluxo da demo e clareza comercial.

Lagertha deve:

- Fazer o app parecer um banco digital demo limpo e confiavel.
- Priorizar o fluxo: login, conta, saldo, extrato, Pix demo, cartao demo, emprestimo demo.
- Deixar claro quando algo e simulado.
- Criar estados vazios bons e comerciais.
- Evitar tela quebrada, excesso de opcoes e textos confusos.
- Usar dados reais da API quando existirem.
- Mostrar erro de forma clara quando backend nao estiver configurado.
- Destacar seguranca, demo e status das operacoes.
- Criar uma demo apresentavel sem inventar dinheiro real.

Lagertha nao deve:

- Criar promessas de banco real sem base.
- Criar frontend que finja provider real.
- Esconder erro critico atras de mensagem bonita.
- Usar mock se existir endpoint real.
- Colocar dados sensiveis hardcoded.
- Criar muitas telas novas sem foco.
- Transformar o app em dashboard generico.

### Ivar - Fiscalizacao, analise e aprovacao

Ivar fiscaliza o trabalho de Ragna e Lagertha. Ele nao deve criar complexidade; deve proteger o projeto.

Ivar deve:

- Revisar se o escopo foi seguido.
- Confirmar que nao ha segredo em arquivo versionado.
- Confirmar que `.env` esta no `.gitignore`.
- Verificar se `env.example` esta seguro.
- Verificar se migrations fazem sentido.
- Verificar se testes/builds foram rodados.
- Verificar se rotas financeiras usam autenticacao.
- Verificar se nao ha CVV real salvo/exibido.
- Verificar se operacoes simuladas estao marcadas como demo.
- Verificar se nenhuma credencial real foi usada em teste.
- Bloquear mudancas que deem aparencia de banco real sem regulacao/provider.

Ivar deve aprovar somente se:

- O app continua rodando.
- Nao ha vazamento de segredo.
- O fluxo principal esta claro.
- O risco financeiro nao aumentou.
- O relatorio final explica o que foi feito e o que ainda e pendencia.

## Regras absolutas

1. Nunca commitar `.env`.
2. Nunca colocar segredo real em `env.example`, README ou docs.
3. Nunca salvar CVV real.
4. Nunca tratar Pix simulado como Pix real.
5. Nunca aprovar emprestimo/cartao pelo proprio usuario se o fluxo disser que e acao de banco/admin.
6. Nunca conectar teste automatizado em banco, SMTP ou provider real.
7. Nunca ignorar erro financeiro silenciosamente.
8. Nunca alterar saldo sem registrar movimentacao.
9. Nunca registrar movimentacao sem consistencia com saldo.
10. Nunca fazer refactor gigante sem necessidade.
11. Nunca criar migration sem mudanca real no schema.
12. Nunca subir para producao com CORS aberto para qualquer origem.
13. Nunca expor stack trace em producao.
14. Nunca logar token JWT, refresh token, senha, CPF completo, CVV ou secrets.

## Erros comuns a evitar

- Subir `.env` para o GitHub.
- Deixar `env.example` com credencial real.
- Esquecer de criar migration inicial.
- Rodar `prisma migrate dev` em banco de producao.
- Usar `prisma migrate deploy` sem migrations existentes.
- Fazer teste importar `server.js` e iniciar servidor real.
- Deixar Jest entrar em subprojetos como `gov.br1`.
- Usar email real em teste.
- Usar banco real em teste.
- Criar saldo positivo artificial sem log.
- Criar endpoint que altera dinheiro sem autenticar.
- Misturar frontend e backend sem `NEXT_PUBLIC_API_URL`/`VITE_API_URL` claro.
- Deixar Swagger aberto em producao sem protecao.

## Erros incomuns, mas perigosos

- Concorrencia em saldo: dois pagamentos ao mesmo tempo podem gerar saldo inconsistente se nao houver transacao e bloqueio adequado.
- Idempotencia ausente: repetir a mesma requisicao pode debitar duas vezes.
- Decimal tratado como number JS: pode gerar erro de centavos.
- Refresh token reaproveitado indefinidamente.
- Token salvo sem hash no banco.
- CORS com `credentials: true` e `Access-Control-Allow-Origin: *`.
- Logs de auditoria sem correlacao por request.
- Processo de teste chamando `process.exit(1)` ao importar o app.
- Rota "admin" acessivel por usuario comum.
- Dados de cartao gerados parecendo reais.
- Boleto com codigo aleatorio apresentado como boleto valido.
- Endpoint demo sem prefixo/status visual de demo.

## Arquitetura desejada agora

Backend:

- Node.js + Express.
- Prisma + PostgreSQL.
- JWT para autenticacao.
- Rotas por modulo.
- Operacoes financeiras em transacoes.
- Logs estruturados.
- Providers externos sempre opcionais/sandbox por enquanto.

Frontend:

- App limpo e demonstravel.
- Login/cadastro.
- Dashboard de conta.
- Saldo/extrato.
- Pix demo.
- Cartoes demo.
- Emprestimos demo.
- Notificacoes.
- Estados vazios e erros claros.

Banco:

- PostgreSQL.
- Migrations versionadas.
- Seed apenas com dados falsos.
- Nada de dados reais de cliente.

Deploy:

- Backend no Railway.
- Frontend na Vercel.
- Banco PostgreSQL no Railway/Neon/Supabase.
- Variaveis de ambiente configuradas no painel da plataforma.
- Nenhum segredo no GitHub.

## Ordem recomendada de trabalho

1. Proteger arquivos de ambiente.
2. Criar migration inicial.
3. Separar app/server para testes.
4. Isolar Jest para nao entrar em `gov.br1`.
5. Corrigir testes de autenticacao.
6. Rodar build.
7. Rodar migrations no banco staging.
8. Testar `/api/health`.
9. Testar cadastro/login.
10. Testar fluxo demo financeiro.
11. Preparar deploy Railway/Vercel.
12. Documentar pendencias.

## Comandos esperados

Instalacao:

```bash
npm install
```

Validar Prisma:

```bash
npx prisma validate
```

Criar migration inicial em ambiente local/staging:

```bash
npx prisma migrate dev --name init
```

Aplicar migrations em staging/producao:

```bash
npx prisma migrate deploy
```

Gerar Prisma Client:

```bash
npm run build
```

Rodar API:

```bash
npm run dev
```

Testar:

```bash
npm test
```

## Criterio de sucesso do MVP

O AgilBank sera considerado pronto para demo quando:

- O backend sobe sem depender de email/Redis real.
- `/api/health` responde.
- Cadastro funciona com dados falsos.
- Login retorna token.
- Perfil/saldo carregam com token.
- Pix demo nao movimenta dinheiro real.
- Cartao demo nao salva CVV real.
- Emprestimo demo nao e tratado como credito real.
- Extrato/movimentacoes ficam consistentes.
- Logs de operacoes criticas existem.
- Build passa.
- Testes principais passam ou pendencias estao documentadas.
- Deploy staging nao contem secrets no repositorio.

## Entrega obrigatoria dos agentes

Ao terminar qualquer ciclo de trabalho, os agentes devem informar:

- Resumo do que foi feito.
- Arquivos alterados.
- Se houve migration.
- Comandos executados.
- Resultado dos testes/build.
- Riscos restantes.
- O que esta pronto para `git add`.
- O que nao deve ser commitado.

## Frase guia

Se uma mudanca nao ajuda o AgilBank a ficar mais seguro, mais demonstravel ou mais claro como MVP financeiro, ela provavelmente nao deve ser feita agora.

