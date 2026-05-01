# AgilBank — Auditoria de Schema Prisma (Ivar)

**Data:** 2026-05-01  
**Escopo:** `prisma/schema.prisma` (AgilBank backend), alinhado a `docs/AGILBANK-AGENTS-GUIDE.md`, `README.md`, `env.example`, `package.json`.  
**Restrições respeitadas:** nenhuma alteração de código, migration, `.env` ou commit.

---

## Resumo executivo

O schema cobre boa parte do roteiro do MVP (usuário, endereço, configurações, Pix, boleto, pagamento genérico, cartão, empréstimo, movimentação, notificação, tokens de sessão). Porém há **bloqueadores de segurança para demo responsável**: o modelo `Cartao` persiste **CVV em texto** e número de cartão completo; o modelo `Token` armazena o valor do token em campo único (risco elevado se for refresh token em claro). Não existe tabela dedicada de **auditoria** nem de **eventos financeiros** além de `Movimentacao`. Saldo está **duplicado** (`User.saldoAtual` + histórico em `Movimentacao`), o que exige transações e disciplina na aplicação para evitar inconsistência — o schema sozinho não garante isso. Há modelos (`afiliacoes`, `campanhas`, `gamificacao_usuario`) que **desviam do foco** do guia atual.

**Conclusão formal:** **reprovado para demo** até eliminar armazenamento de CVV (e tratar número de cartão de forma compatível com demo), e até definir estratégia mínima para refresh token e rastreabilidade auditável, conforme critérios abaixo.

---

## Diagnóstico por modelo / tabela

### `User` (`usuarios`)

- **Papel no MVP:** núcleo de cadastro, conta, saldo, limites e relacionamentos.
- **Coerência:** adequado para PF demo; campos de conta (`numeroConta`, `agencia`, etc.) fazem sentido.
- **Riscos:** `senha` é `String` sem indicação no schema de ser hash (esperado bcrypt na aplicação — **validar no código**). `cpf`, `email`, `telefone` são PII; o schema não impõe mascaramento — controle é por API/logs. `saldoAtual` denormalizado versus extrato.
- **Naming:** mistura PT em campos (`nomeCompleto`, `senha`) e inglês em flags (`isAtivo`) — aceitável, mas inconsistente.

### `Endereco`, `DadosProfissionais`, `ConfiguracoesUsuario`

- **Coerência:** fazem sentido para perfil “bancário” demo; `DadosProfissionais` pode ser pesado para MVP mínimo — vários campos poderiam ser opcionais no produto, mas no schema `profissao` já é obrigatório.
- **MVP:** não bloqueiam demo; avaliar se cadastro inicial exige tudo isso no fluxo.

### `Cartao` (`cartoes`)

- **Crítico:** `cvv String` — **armazenamento de CVV é risco crítico** e viola regras absolutas do guia (“Nunca salvar CVV real”) e o critério de aprovação desta auditoria. Mesmo em demo, o schema **trata CVV como dado persistido**.
- **Alto:** `numero` completo e único — para demo, padrão desejável é máscara + últimos dígitos ou token; não armazenar PAN completo quando evitável.
- **Fluxo:** `status` default `pendente`, `dataAprovacao` — coerente com aprovação **admin**; o schema não impede que a API permita autoaprovação (revisar backend).

### `Emprestimo` (`emprestimos`)

- **Coerência:** valor, taxa, prazo, parcela calculada, status, datas — razoável para demo.
- **Lacuna:** **não há entidade `Parcela` / cronograma**; README menciona controle de parcelas — modelo atual não modela parcelas individuais.
- **Aprovação:** campos sugerem fluxo com aprovação; garantir via regra de negócio que não é self-service indevido.

### `Movimentacao` (`movimentacoes`)

- **Papel:** extrato com `saldoAnterior` / `saldoAtual` — útil para rastreabilidade.
- **Risco de consistência:** duplicidade com `User.saldoAtual`; sem constraint de DB entre eles; concorrência e idempotência são **responsabilidade da aplicação**.
- **Evolução:** para demo robusta, considerar futuro `LedgerEntry` com partidas dobradas; **não obrigatório** para MVP se transações forem atômicas e bem testadas.

### `Notificacao`

- **Coerência:** adequado para demo de notificações in-app.

### `TransacaoPix` / `ChavePix`

- **Coerência:** básico para demo (chave, valor, status, tipo).
- **Lacunas:** sem `idempotencyKey`, sem `provider` / `modo` (demo vs real), sem referência explícita a `Movimentacao` ou ID de correlação — risco de extrato desalinhado e duplo clique.
- **Clareza “não é Pix real”:** não há campo semântico no schema (ex.: `environment` / `isDemo`); depende de convenção na API e UI.

### `Boleto` / `Pagamento`

- **Boleto:** código de barras, vencimento, beneficiário, status, data pagamento — coerente para demo.
- **Pagamento:** agrega `tipo`, `chavePix`, `codigoBarras` — possível **sobreposição conceitual** com `TransacaoPix` e `Boleto` (duplicidade ou fonte de verdade dupla se mal usado).
- **Lacunas:** em `Pagamento`, sem vencimento/liquidação/cancelamento/provider explícitos; status em string livre — padronizar enum na aplicação ou no schema futuramente.

### `Token` (`tokens`)

- **Risco:** `token String @unique` — se armazenar **refresh token JWT ou opaco em plaintext**, é **risco médio/alto** (reuso, vazamento de DB = sessão comprometida). Melhor prática: hash do refresh token (ou armazenamento opaco apenas em cookie httpOnly sem persistir valor completo, conforme arquitetura).
- **tipo** em string — flexível mas sem enum.

### `afiliacoes`, `campanhas`, `gamificacao_usuario`

- **Produto:** não constam no roteiro prioritário do `AGILBANK-AGENTS-GUIDE.md` — parecem **legado ou escopo paralelo** (marketing/afiliados/gamificação).
- **Técnico:** `campanhas.updatedAt` e `gamificacao_usuario.updatedAt` são `DateTime` **sem** `@updatedAt` — exigem preenchimento manual na aplicação ou podem gerar erro/runtime inconsistente.
- **Recomendação de produto:** manter apenas se houver decisão explícita; caso contrário **adiar ou isolar** para não poluir MVP bancário demo.

---

## Riscos críticos

| Risco | Detalhe |
|--------|---------|
| **CVV persistido** | Campo `Cartao.cvv` — inaceitável para padrão de segurança e para critério de aprovação da demo; mesmo demo não deve normalizar esse anti-padrão. |
| **PAN completo** | `Cartao.numero` completo aumenta superfície; em vazamento, parece dado de cartão real. |

---

## Riscos médios

| Risco | Detalhe |
|--------|---------|
| **Refresh / token em claro** | Modelo `Token.token` provável plaintext; alinhar com hash ou política de sessão. |
| **Saldo vs movimentação** | `User.saldoAtual` + `Movimentacao` sem garantia transacional no schema — risco de inconsistência sob concorrência ou falta de idempotência. |
| **Pix / pagamentos sem idempotência** | `TransacaoPix` e fluxos relacionados sem chave de idempotência no modelo. |
| **Ausência de auditoria dedicada** | Guia pede logs/auditoria de operações críticas; não há tabela `AuditLog` / `FinancialEvent`. |
| **Boleto/Pagamento/TransacaoPix** | Sobreposição conceitual pode gerar duplicidade ou extrato confuso se não houver regra clara. |

---

## Riscos baixos

- Mistura PT/EN em nomes de campos e modelos (`afiliacoes` minúsculo vs `User`).
- `status` e `tipo` amplamente como `String` — falta de enum pode gerar valores inconsistentes.
- `User` “grande” — ainda gerenciável para MVP; normalização extra pode esperar.
- README descreve `prisma/migrations` — ver seção Migrations abaixo.

---

## Tabelas aprovadas (com ressalvas de uso)

- `Notificacao`, `ChavePix` (com ressalva de campos demo/provider), `Endereco`, `ConfiguracoesUsuario` — **aprovadas para demo** desde que API não exponha PII indevidamente.
- `Movimentacao` — **aprovada como extrato simples**, com ressalva de consistência com saldo.
- `Boleto` — **aprovada estruturalmente** para demo, com ressalva de clareza “demo” em produto/API.

---

## Tabelas que precisam ajuste antes de demo

- **`Cartao`** — remover ou nunca preencher CVV; reduzir dados de PAN; alinhar a tokenização/máscara.
- **`Token`** — se for refresh token, tratar como segredo (hash).
- **`TransacaoPix` / `Pagamento`** — idempotência, correlação com `Movimentacao`, flags de ambiente demo.
- **`Emprestimo`** — se o roteiro exibir parcelas, evoluir modelo.

---

## Tabelas que podem ficar para depois

- `afiliacoes`, `campanhas`, `gamificacao_usuario` — fora do foco atual do guia; candidatas a remoção futura ou feature flag de produto.

---

## Recomendações de migration futura (sem executar agora)

1. **Crítico:** migration que elimine `cvv` do modelo cartão (ou substitua por campo não sensível / fluxo que não persista).
2. Adicionar enums Prisma para `status` de Pix, boleto, pagamento, cartão, empréstimo.
3. Campos: `idempotencyKey` em transações Pix e pagamentos; `correlationId` / `movimentacaoId` opcional.
4. Tabela `AuditLog` (ator, ação, entidade, antes/depois resumido, IP, requestId, timestamp).
5. Opcional: `Parcela` ligada a `Emprestimo`.
6. Opcional futuro BaaS: `Organization` / `Tenant` — apenas planejamento, não implementado agora.
7. Corrigir `updatedAt` em `campanhas` e `gamificacao_usuario` com `@updatedAt` ou defaults explícitos, conforme decisão de manter esses modelos.

---

## Checklist de conformidade com `docs/AGILBANK-AGENTS-GUIDE.md`

| Regra / orientação | Status |
|---------------------|--------|
| MVP financeiro demonstrável (conta, saldo, extrato, Pix/boleto/cartão/emprestimo demo, notificações) | Parcial — modelo cobre maioria; faltam auditoria e parcelas. |
| Não prometer banco regulado — clareza demo no **schema** | Não atendido no nível de dados — sem flags explícitas de demo/sandbox nas entidades financeiras. |
| Operações financeiras atômicas saldo + movimentação | Não verificável no schema; modelo permite inconsistência se app falhar. |
| Logs/auditoria operações críticas | **Gap** — sem tabela dedicada. |
| Nunca salvar CVV real | **Violado no schema** (`Cartao.cvv`). |
| Refresh token / token — não logar; armazenamento seguro | Schema permite token em claro em `Token`. |
| Migrations versionadas | **Pendente** — pasta `prisma/migrations` ausente no repositório analisado. |
| `env.example` sem segredo real | Conforme — placeholders genéricos. |

---

## Migrations

- **Situação:** não existe pasta `prisma/migrations` no workspace — indica **ausência de histórico de migrations versionadas** alinhado ao guia.
- **Ação:** necessária **migration inicial** (e processo `migrate dev` / `deploy`) — **somente após aprovação explícita** de mudanças de schema, conforme instrução do solicitante; Ivar não criou migration.

---

## Conclusão

- **Veredito:** **reprovado para demo** (critérios: CVV no schema; tokens prováveis em claro; consistência saldo/extrato e auditoria insuficientes no modelo; falta de marcação explícita demo em entidades financeiras).
- **Principais bloqueios:** `Cartao.cvv`; provável `Token.token` em plaintext; ausência de auditoria estruturada; risco de modelo de saldo sem idempotência/correlação em Pix/pagamentos.
- **Precisa migration?** **Sim** — para persistir o schema atual de forma versionada é necessária pelo menos uma migration inicial; além disso, correções de segurança exigirão migrations futuras após aprovação.

---

*Relatório gerado por Ivar (fiscalização). Nenhuma alteração foi feita no repositório além deste arquivo de relatório.*
