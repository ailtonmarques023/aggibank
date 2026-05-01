# AgilBank — Correção de schema (Ragna)

**Data:** 2026-05-01  
**Base:** relatório Ivar (`docs/reports/AGILBANK-IVAR-SCHEMA-AUDIT.md`) e `docs/AGILBANK-AGENTS-GUIDE.md`.  
**Escopo:** apenas `prisma/schema.prisma` + este relatório. Nenhuma migration executada; `.env` intocado; sem commit.

---

## O que foi corrigido

### 1. `Cartao` (`cartoes`)

- **Removidos:** `cvv`, `numero` (PAN completo).
- **Adicionados:** `maskedNumber` (ex.: `**** **** **** 1234`), `last4` (`VarChar(4)`), `cardToken` opcional e único quando preenchido (token de demonstração/provedor, não PAN).
- **Mantidos:** `bandeira`, `validade`, limites, status, tipo, datas — alinhados ao fluxo demo (aprovação segue sendo regra de negócio na API).

### 2. `Token` (`tokens`)

- **Substituído:** campo `token` (texto sensível) por **`tokenHash`** (`String`, `@unique`).
- **Expectativa:** a aplicação deve persistir apenas hash criptográfico do refresh token (ou equivalente), e comparar via hash no refresh/logout — nunca o JWT/refresh em claro no banco.

### 3. `Movimentacao` (`movimentacoes`)

- **Adicionados:** `referenceType`, `referenceId` (ligação semântica a Pix, Pagamento, Boleto, etc.), `idempotencyKey` opcional com `@unique` para deduplicação quando o backend enviar chave.

### 4. `TransacaoPix` e `Pagamento`

- **Adicionados:** `idempotencyKey` opcional `@unique`, `providerReference` opcional, `environment` com default **`"demo"`** (valores sugeridos na aplicação: `demo`, `sandbox`, `production` — convênio documental, não enum no schema para manter mudança mínima).

### 5. `AuditLog` (`audit_logs`) — novo modelo

- Campos: `id`, `userId` opcional, `action`, `entity`, `entityId` opcional, `metadata` (`Json?`), `ip`, `userAgent` opcional, `createdAt`.
- Relação opcional com `User` (`onDelete: SetNull`).

### 6. Legado / desvio de escopo

- **`afiliacoes`**, **`campanhas`**, **`gamificacao_usuario`:** **mantidos intocados** para não quebrar código ou dados existentes. Continuam **fora do MVP bancário** descrito no guia; remoção ou consolidação fica para ciclo futuro com migration planejada.

---

## Por que foi corrigido

- Atende às **regras absolutas** do guia (não normalizar CVV; não tratar armazenamento de segredo de sessão como texto puro).
- Endereça **bloqueadores** do Ivar: PAN/CVV no schema, refresh em claro, falta de rastreio/idempotência no modelo, ausência de tabela de auditoria.
- Mantém **mudança mínima**: sem refatorar rotas, sem migration até aprovação explícita.

---

## Riscos reduzidos

| Antes | Depois |
|--------|--------|
| CVV e PAN completo no modelo | Apenas máscara, últimos 4 e token opcional |
| Refresh token persistível em claro (`token`) | Apenas `tokenHash` no schema |
| Pix/pagamento sem chave de idempotência / ambiente | Campos explícitos para deduplicação e modo demo |
| Movimentação sem vínculo declarativo à origem | `referenceType` / `referenceId` + idempotência opcional |
| Sem entidade de auditoria | `AuditLog` para registrar ações críticas (uso depende da API) |

**Riscos que permanecem:** consistência `User.saldoAtual` vs extrato ainda é responsabilidade transacional da aplicação; PII em `User` sem mascaramento no schema; `environment` é string livre — validação na camada de serviço recomendada.

---

## Precisa migration?

**Sim.** Qualquer banco que reflita o schema antigo precisará de migration que:

- Altera `cartoes` (drop `numero`, `cvv`; add `maskedNumber`, `last4`, `cardToken`).
- Altera `tokens` (rename/replace coluna `token` → `tokenHash` e **migra dados** só se houver política de re-hash; em geral **tokens existentes invalidam** após deploy).
- Altera `movimentacoes`, `transacoes_pix`, `pagamentos` (novas colunas).
- Cria tabela `audit_logs`.

**Não foi criada nem aplicada migration** neste ciclo, conforme instrução.

---

## Comandos a rodar depois (quando aprovado)

```bash
npx prisma validate
npx prisma migrate dev --name schema-security-demo-prep
# ou em CI/staging:
npx prisma migrate deploy
npx prisma generate
```

Após migration: **atualizar o backend** para `tokenHash`, cartões mascarados e gravação de `AuditLog` onde fizer sentido.

---

## Pendências reais (fora deste PR de schema)

1. **`src/routes/auth.js`:** hoje faz `prisma.token.create({ data: { token: refreshToken } })` e `findFirst({ where: { token: refreshToken } })` — **incompatível** com `tokenHash`; implementar hash (ex.: SHA-256 com pepper opcional) antes de usar o schema em runtime.
2. **`src/routes/cards.js`:** usa `numero`, `cvv` na criação e `select: { numero: true }` — **ajustar** para `maskedNumber`, `last4`, opcionalmente `cardToken`; não gerar nem retornar CVV persistido.
3. **Qualquer cliente Prisma** que referencie campos removidos precisa de atualização.
4. **`AuditLog`:** criar chamadas em operações críticas (Pix, pagamento, saldo, login falho, etc.) — schema só habilita a persistência.
5. **Dados existentes:** cartões antigos com PAN/CVV exigem estratégia de migração de dados ou truncagem — definir com Ivar/produto antes da migration em ambiente com dados.

---

## Validação

- `npx prisma validate` — **OK** (schema válido; exit code 0).

---

## Legado documentado (sem remoção)

- `afiliacoes`, `campanhas`, `gamificacao_usuario` permanecem no schema como **legado / fora do escopo MVP** do guia; não foram removidos para evitar quebra.

---

*Ragna — schema alinhado aos bloqueadores do Ivar; recomenda-se **revisão do Ivar** após migration + ajustes de API.*
