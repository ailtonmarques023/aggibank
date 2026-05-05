# Exemplos de uso - Automacao Codex + Cursor - AgilBank

## Exemplo 1: Auditoria de transferencia com divergencia de saldo

**Quando usar:** usuario reporta saldo diferente entre tela de extrato e tela inicial apos transferencia.

**Entrada resumida:**
- "Depois da transferencia, o saldo na Home nao bate com o extrato."

**Aplicacao esperada da skill:**
1. Mapear `UI -> Evento -> JS -> API -> Backend -> Banco -> API -> UI`.
2. Verificar se a Home usa resposta real da API ou calculo local.
3. Validar autenticacao, autorizacao e registro de transacao no backend.
4. Registrar bloqueio se houver mock/hardcode/localStorage como fonte principal.
5. Gerar ou atualizar relatorio em `docs/relatorios/`.

**Formato minimo da resposta:**
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

---

## Exemplo 2: Implementacao real de correcao em frontend

**Quando usar:** botao de confirmar PIX fecha modal sem persistir operacao no backend.

**Entrada resumida:**
- "Corrija o botao confirmar PIX, ele mostra sucesso mas nao salva."

**Aplicacao esperada da skill:**
1. Identificar tela ativa, evento e funcao acionada no frontend.
2. Confirmar endpoint, payload, resposta e erros esperados.
3. Tratar estados de UI: carregando, sucesso, validacao, autenticacao, permissao, interno, vazio e timeout.
4. Impedir sucesso visual sem confirmacao real do backend.
5. Atualizar relatorio IVAR em `docs/relatorios/relatorio-ivar-pix.md` (ou nome equivalente).

**Resultado esperado:**
- Sem botao morto.
- Sem sucesso simulado.
- Saldo e extrato atualizados por dado real de API.

---

## Exemplo 3: Analise de contrato de endpoint

**Quando usar:** tarefa envolve alteracao de payload/response de endpoint consumido por tela existente.

**Entrada resumida:**
- "Precisamos incluir campo novo no retorno do endpoint de cartao."

**Aplicacao esperada da skill:**
1. Ativar papel Contrato API.
2. Registrar contrato completo:
   - rota
   - metodo HTTP
   - payload esperado
   - resposta esperada
   - possiveis erros
   - campos obrigatorios
   - campos opcionais
3. Avaliar risco de quebra:
   - afeta request?
   - afeta response?
   - afeta tratamento de erro?
   - quebra frontend/integracoes/fluxos existentes?
4. Se houver quebra necessaria, sinalizar explicitamente antes da implementacao.
5. Consolidar decisao em relatorio IVAR.

**Status final:**
- APROVADO somente com evidencias.
- REPROVADO se faltar mapeamento, contrato, persistencia, validacao ou relatorio.
