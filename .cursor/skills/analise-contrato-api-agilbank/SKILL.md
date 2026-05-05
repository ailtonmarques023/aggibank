---
name: analise-contrato-api-agilbank
description: Analisa contrato de API no fluxo AgilBank, valida alinhamento frontend-backend por endpoint e reporta riscos de quebra. Use quando o usuario pedir analise de contrato, mapeamento de endpoints, validacao de payload/response, impacto em telas ou verificacao de compatibilidade.
disable-model-invocation: true
---

# Analise de Contrato API do AgilBank

Use esta skill para analisar contrato de API no fluxo AgilBank com rastreabilidade e criterio de aprovacao/reprovacao.

## Fluxo obrigatorio

1. Mapear fluxo ponta a ponta: `UI -> Evento -> JS -> API -> Backend -> Banco -> API -> UI`.
2. Listar todos os endpoints envolvidos no fluxo solicitado.
3. Para cada endpoint, preencher o contrato completo.
4. Validar compatibilidade com telas existentes.
5. Emitir parecer final com `STATUS FINAL`.

## Contrato por endpoint

Para cada endpoint, registre:
- rota
- metodo HTTP
- autenticacao exigida
- payload esperado
- campos obrigatorios
- campos opcionais
- resposta de sucesso
- resposta de erro
- codigos de erro
- impacto em telas existentes

## Regras

- frontend nao inventa campo
- backend nao muda response silenciosamente
- erros devem ter formato previsivel
- sucesso deve retornar dado util quando houver mutacao
- alteracao de contrato exige ajuste das telas consumidoras

## Validacao de nao quebra de contrato

Para cada mudanca, validar explicitamente:
- afeta request?
- afeta response?
- afeta tratamento de erro?
- existe risco de quebrar frontend, integracoes ou fluxos existentes?

Se houver quebra necessaria, sinalizar antes e descrever estrategia de compatibilidade.

## Formato de saida obrigatorio

Use exatamente os 10 blocos abaixo, nesta ordem:

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

## Criterio de reprovacao

Se faltar contrato claro, STATUS FINAL deve ser REPROVADO.
