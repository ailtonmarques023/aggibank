# AgilBank — Reauditoria (Ivar)

**Data:** 2026-05-01  
**Escopo:** fiscalização pós-correção Ragna; alinhamento com `docs/AGILBANK-AGENTS-GUIDE.md`, `prisma/schema.prisma`, `docs/reports/AGILBANK-RAGNA-SCHEMA-FIX.md` e amostra do backend (`src/routes/auth.js`, `src/routes/cards.js`).  
**Método:** revisão estática; nenhuma alteração de código nem migration executada por Ivar neste relatório.

---

## Resumo executivo

O **schema Prisma** foi **substantivamente corrigido** em relação à primeira auditoria: ausência de CVV e PAN completo em `Cartao`, `Token.tokenHash` em vez de segredo em claro, campos de rastreio/idempotência/ambiente em movimentação, Pix e pagamentos, e modelo `AuditLog`. Isso atende aos **critérios de segurança de dados** que Ivar havia bloqueado no nível de modelo.

Porém o **código da API ainda não acompanha o schema**: login/refresh continuam usando `token` no Prisma Client, e cartões usam `numero`/`cvv`. Com o schema atual, **o projeto tende a falhar em tempo de execução** após `prisma generate` (campos inexistentes) ou permanece desatualizado se o client não for regenerado. **Não há pasta de migrations versionada** no repositório analisado — o guia ainda exige histórico de migrations.

**Veredito global para “demo segura e coerente”:** **aprovado com ressalvas** no **schema**; **reprovado** para **stack pronta para rodar** até alinhar backend + migration + geração do client e uso mínimo de `AuditLog` em operações críticas.

---

## 1. Schema — comparativo com auditoria anterior

| Tema | Antes (Ivar v1) | Agora |
|------|------------------|--------|
| Cartão | `cvv`, `numero` completo | `maskedNumber`, `last4`, `cardToken?`, sem CVV/PAN integral |
| Refresh no DB | `token` texto | `tokenHash` |
| Movimentação | Sem referência/idempotência | `referenceType`, `referenceId`, `idempotencyKey?` único |
| Pix / Pagamento | Sem idempotência / ambiente | `idempotencyKey?`, `providerReference?`, `environment` default `demo` |
| Auditoria | Inexistente | `AuditLog` + relação `User.auditLogs` |
| Legado | Sinalizado | Mantido (`afiliacoes`, `campanhas`, `gamificacao_usuario`) — coerente com decisão Ragna de não quebrar |

**Conclusão schema:** os **bloqueadores críticos** identificados na auditoria inicial foram **endereçados no arquivo `schema.prisma`**.

---

## 2. Conformidade com `AGILBANK-AGENTS-GUIDE.md` (checklist)

| Item | Status |
|------|--------|
| Não normalizar CVV no modelo | **OK** (campo removido) |
| Não persistir refresh em claro no modelo | **OK** (`tokenHash`); **depende** da app só gravar hash |
| Saldo/movimentação com rastreio | **Parcial** — campos existem; transações atômicas seguem sendo regra de código |
| Logs/auditoria persistidos | **Parcial** — tabela existe; **nenhum uso** localizado em `src` na amostra (grep `AuditLog`/`auditLog`) |
| Migrations versionadas | **Pendente** — sem `prisma/migrations` no workspace |
| Demo/sandbox explícito em dados financeiros | **Parcial** — `environment` default `demo` em Pix/Pagamento; demais entidades por convenção |
| Legado fora do MVP | **Documentado** (Ragna + este relatório); modelos ainda no schema |

---

## 3. Alinhamento backend ↔ Prisma (risco operacional)

### 3.1 Autenticação (`src/routes/auth.js`)

- `prisma.token.create({ data: { ..., token: refreshToken } })` — campo **`token` não existe** no schema; esperado **`tokenHash`**.
- `prisma.token.findFirst({ where: { token: refreshToken, ... } })` — idem.

**Impacto:** após client gerado do schema atual, **login/refresh quebram** ou o deploy está com schema/client desencontrados (risco grave de configuração).

### 3.2 Cartões (`src/routes/cards.js`)

- `select: { numero: true, ... }` e `create({ data: { numero, cvv, ... } })` — campos **`numero`/`cvv` removidos**; esperados **`maskedNumber`**, **`last4`**, etc.

**Impacto:** **criação e listagem de cartões incompatíveis** com o schema corrigido.

### 3.3 `AuditLog`

- Não há criação de registros `prisma.auditLog.create` identificada na busca por padrões relevantes em `src`.

**Impacto:** requisito de “logs/auditoria” do guia **não cumprido em persistência**, apenas possível via logger em arquivo.

---

## 4. Riscos (atualizados)

### Críticos (stack)

1. **Descompasso schema × API** — falha de runtime ou ambiente com Prisma antigo mascarando o problema.
2. **Ausência de migrations versionadas** — risco de drift entre ambientes e de `migrate deploy` sem histórico.

### Médios

3. **`environment` como string livre** — necessidade de validação na aplicação (`demo` / `sandbox` / `production`).
4. **Saldo denormalizado** — inalterado; continua exigindo disciplina transacional e idempotência na API (campos novos ajudam, mas não substituem código).

### Baixos

5. **Modelos legados** no mesmo banco — ruído de produto, sem bloqueio técnico imediato.
6. **Swagger** pode ainda descrever payloads antigos (ex.: cartão com `numero`) — revisar quando Ragna atualizar rotas.

---

## 5. Critérios de aprovação para demo (Ivar)

Critérios usados na auditoria original:

- Não haver segredo no schema em forma de CVV/PAN integral — **atendido no schema**.
- Refresh não persistido em claro **no banco** — **atendido no schema** se a API gravar só hash; **não atendido na API** na revisão atual (ainda usa `token`).
- Movimentações/saldo com consistência mínima — **habilitado** por campos; **não auditado** em testes de concorrência nesta rodada.
- Riscos de dinheiro real claramente marcados — **parcialmente** no schema (`environment`); UX/docs não escopo deste relatório.

**Para declarar “aprovado para demo” no sentido fim-a-fim:** é necessário **fechar o gap de código** (auth, cartões, demais usos do Prisma), **aplicar migration inicial**, **gerar client** e **passar smoke tests** (cadastro, login, refresh, cartão demo).

---

## 6. Conclusão formal

| Camada | Conclusão |
|--------|------------|
| `prisma/schema.prisma` | **Aprovado com ressalvas** (migration pendente; legado mantido; `AuditLog` ainda não alimentado pela API) |
| Repositório executável alinhado ao schema | **Reprovado até** correções Ragna nas rotas + migration + generate |

**Principais bloqueios restantes:**

1. Atualizar `auth.js` (e qualquer outro uso de `Token`) para **`tokenHash`**.
2. Atualizar `cards.js` para **`maskedNumber`/`last4`** (e política de não expor dados sensíveis).
3. Criar e versionar **migration inicial** (e política para tokens/cartões já existentes no banco, se houver).
4. Introduzir **escrita em `AuditLog`** em operações críticas, conforme guia.

**Precisa Ivar revisar de novo?** **Sim**, após Ragna concluir alinhamento backend + migration aplicada em staging e evidências de teste (ou checklist assinado).

---

## 7. Referências internas

- Primeira auditoria: `docs/reports/AGILBANK-IVAR-SCHEMA-AUDIT.md`
- Correção schema: `docs/reports/AGILBANK-RAGNA-SCHEMA-FIX.md`
- Guia: `docs/AGILBANK-AGENTS-GUIDE.md`

---

*Ivar — fiscalização; sem mudanças em arquivos de produto além deste relatório.*
