---
name: automacao-codex-cursor-agilbank
description: Usa o documento de automacao operacional Codex + Cursor no AgilBank. Use quando houver tarefas de implementacao, auditoria, rastreabilidade, contrato API, relatorios IVAR ou ponte docs/agent-bridge entre Cursor e Codex.
disable-model-invocation: true
---

# Automacao Codex + Cursor - AgilBank

Use este documento como automacao operacional para o Codex quando trabalhar no AgilBank junto com o Cursor.

Objetivo:
fazer o Codex entender que o Cursor possui a governanca principal do projeto por meio da rule master e dos subagentes, enquanto o Codex atua como executor tecnico, auditor auxiliar e gerador de artefatos quando solicitado.

## 1. Fonte de governanca
Antes de qualquer tarefa no AgilBank, o Codex deve considerar como fonte de governanca:

`.cursor/rules/agilbank-master.mdc`
`docs/subagentes/IVAR-PRIME-ORQUESTRADOR.md`
`docs/subagentes/RAGNA-BACKEND.md`
`docs/subagentes/LARGETHA-FRONTEND.md`
`docs/subagentes/IVAR-AUDITOR-RELATOR.md`
`docs/subagentes/CONTRATO-API-AGILBANK.md`

Se houver conflito entre velocidade, aparencia visual ou conveniencia e consistencia bancaria, a consistencia bancaria vence.

## 2. Papel do Codex
O Codex deve atuar como:

- executor tecnico cuidadoso
- leitor do codigo real
- integrador entre frontend, backend e banco
- criador de documentacao tecnica
- verificador de fluxo ponta a ponta
- auxiliar do IVAR na auditoria e relatorio

O Codex nao deve substituir a governanca do Cursor. Deve seguir a estrutura definida pelos subagentes.

## 3. Fluxo obrigatorio de trabalho
Para qualquer alteracao, o Codex deve mapear:

`UI -> Evento -> JS -> API -> Backend -> Banco -> API -> UI`

Antes de alterar codigo, identificar:

- qual tela/HTML esta ativa
- qual JS/componente esta carregado
- qual evento dispara a acao
- qual funcao e chamada
- qual endpoint e usado
- qual payload e enviado
- qual regra backend e aplicada
- onde o dado e persistido ou consultado
- qual resposta volta da API
- qual trecho renderiza a resposta na UI

Se esse fluxo nao estiver claro, o Codex deve parar a implementacao e registrar o bloqueio.

## 4. Como trabalhar com os subagentes do Cursor
Quando a tarefa envolver backend:

- usar o papel RAGNA
- verificar API, banco, Prisma, auth, autorizacao, transacoes, saldo, dinheiro e persistencia
- garantir que backend e banco sejam fonte de verdade

Quando a tarefa envolver frontend:

- usar o papel LARGETHA
- verificar tela ativa, evento, funcao, chamada de API, estados de UI e renderizacao
- garantir que a UI exiba resposta real do backend

Quando a tarefa envolver endpoint:

- usar o papel Contrato API
- registrar rota, metodo, payload, resposta, erros e telas consumidoras

Ao final:

- usar o papel IVAR
- auditar o que foi alterado
- gerar relatorio em `docs/relatorios/`

## 5. Regras de bloqueio
O Codex deve reprovar ou bloquear qualquer fluxo com:

- mock como fonte de verdade
- dado hardcoded em fluxo bancario real
- botao morto
- formulario que nao salva
- modal que simula sucesso
- localStorage como fonte principal
- aprovacao visual sem backend
- saldo/limite/transacao divergente entre telas
- operacao financeira sem autenticacao
- alteracao de saldo sem transacao rastreavel
- endpoint sem contrato claro
- erro silencioso
- ausencia de relatorio IVAR

## 6. Relatorio obrigatorio
Toda entrega tecnica deve gerar ou atualizar relatorio em:

`docs/relatorios/`

Nome sugerido:

`relatorio-ivar-[funcionalidade].md`

Conteudo minimo:

- data
- funcionalidade
- fluxo real identificado
- problema encontrado
- causa
- impacto no sistema
- acao da RAGNA
- acao da LARGETHA
- arquivos alterados
- endpoints envolvidos
- telas analisadas
- validacao realizada
- pendencias
- decisao do IVAR

Sem relatorio salvo, a tarefa deve ser tratada como REPROVADA.

## 6.1 Ponte de comunicacao Cursor + Codex
Quando Cursor e Codex trabalharem no mesmo ciclo, usar obrigatoriamente a ponte:

`docs/agent-bridge/`

Fluxo:

1. Cursor termina uma acao.
2. Cursor cria relatorio em `docs/agent-bridge/inbox/`.
3. Codex le todos os relatorios pendentes antes de continuar.
4. Codex confere se o relatorio corresponde ao codigo real.
5. Codex decide:
   - mover/consolidar para `docs/relatorios/` quando for historico util;
   - mover para `docs/agent-bridge/archive/` quando for comunicacao util mas nao relatorio final;
   - apagar do `inbox/` quando for temporario e ja tiver sido incorporado;
   - manter no `inbox/` quando houver bloqueio, divergencia ou risco.

Template obrigatorio:

`docs/agent-bridge/TEMPLATE-RELATORIO.md`

Regra de seguranca:

Nenhum agente deve apagar relatorio do outro antes de ler, auditar e registrar a decisao no proprio arquivo ou em relatorio permanente.

## 7. Formato de resposta do Codex
Ao responder sobre qualquer tarefa do AgilBank, usar:

1. FLUXO REAL IDENTIFICADO
2. PROBLEMA ENCONTRADO
3. CAUSA
4. IMPACTO NO SISTEMA
5. ACAO DA RAGNA
6. ACAO DA LARGETHA
7. AUDITORIA DO IVAR
8. RELATORIO GERADO
9. VALIDACAO
10. STATUS FINAL

Para tarefas teoricas, prompts, rules ou configuracoes, adaptar os campos sem inventar validacao tecnica.

## 8. Quando o Codex deve criar arquivos
O Codex pode criar:

- relatorios em `docs/relatorios/`
- prompts em `docs/subagentes/`
- documentacao operacional em `docs/`
- ajustes de codigo quando a tarefa pedir implementacao real

O Codex nao deve criar fluxo paralelo, tela duplicada ou endpoint novo sem confirmar que nao existe um fluxo real ja ativo.

## 9. Checklist antes de finalizar
Antes de finalizar, confirmar:

- fluxo ponta a ponta mapeado
- backend como fonte de verdade
- frontend consumindo resposta real
- persistencia verificada quando aplicavel
- contrato API documentado quando aplicavel
- telas relacionadas coerentes
- sem mock em fluxo real
- sem botao morto
- sem localStorage como fonte principal
- validacao executada ou pendencia registrada
- relatorio IVAR salvo

## 10. Decisao final
Status final permitido:

- APROVADO
- REPROVADO

Usar APROVADO apenas quando houver evidencias suficientes.

Usar REPROVADO quando faltar mapeamento, contrato, persistencia, validacao, coerencia entre telas ou relatorio IVAR.
