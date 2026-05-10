# Contrato — crédito operacional (staging/homologação)

**Escopo:** rota **interna** para testes operacionais. **Não** faz parte do contrato público do aplicativo móvel/web. O frontend público **não** deve chamar este endpoint.

## Endpoint

| Campo | Valor |
|--------|--------|
| Método | `POST` |
| Caminho | `/api/internal/ops/credit-test-balance` |
| Autenticação | Cabeçalho `x-internal-key` igual a `process.env.OPS_CREDIT_INTERNAL_KEY` |
| Ambiente | **Bloqueado** quando `NODE_ENV === 'production'` (HTTP 403, sem crédito) |

## Headers obrigatórios

- `x-internal-key`: chave compartilhada servidor-a-servidor (nunca no browser do cliente).

## Corpo (JSON)

| Campo | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `userId` | string | sim | ID do titular no banco (definido pelo operador/backend de homologação) |
| `valor` | number | sim | Valor positivo a creditar em `saldoAtual` |
| `motivo` | string | sim | Texto livre para rastreio (truncado no backend) |
| `idempotencyKey` | string | sim | Chave global de idempotência (tabela `Movimentacao`) |
| `referenciaOperador` | string | sim | Identificação do operador/cenário (auditoria) |

**Não** há contrato de CPF, nome ou dados sensíveis neste payload; o crédito é sempre amarrado a `userId` já existente.

## Resposta 200

```json
{
  "success": true,
  "data": {
    "movimentacao": { },
    "saldoAtual": 0
  }
}
```

- `movimentacao`: registro criado (ou existente, em caso de retry idempotente) com `valor` **positivo**, `tipo` `credito`, `categoria` `ajuste_operacional_staging`, `referenceType` `operational_credit_staging`.
- `saldoAtual`: saldo disponível do usuário **após** a transação (leitura pós-commit).

## Erros possíveis

| HTTP | `code` | Quando |
|------|--------|--------|
| 403 | `STAGING_CREDIT_FORBIDDEN_IN_PRODUCTION` | `NODE_ENV === 'production'` |
| 403 | `ACCESS_DENIED` | `x-internal-key` ausente ou inválida |
| 503 | `INTERNAL_OPERATION_UNAVAILABLE` | `OPS_CREDIT_INTERNAL_KEY` não configurada |
| 400 | `VALIDATION_ERROR` | Campos obrigatórios ausentes |
| 400 | `LEDGER_INVALID_AMOUNT` | Valor não positivo |
| 404 | `LEDGER_USER_NOT_FOUND` | `userId` inexistente |
| 409 | `LEDGER_IDEMPOTENCY_CONFLICT` | `idempotencyKey` já usada por **outro** usuário |
| 500 | `INTERNAL_ERROR` | Falha não prevista |

## Extrato público (`GET /api/user/statement`)

- **Contrato inalterado:** mesma forma de resposta, paginação e autenticação JWT do titular.
- Linhas geradas por este fluxo aparecem como movimentações do próprio usuário; agregação `origem`: **AJUSTE**, `tipo` no extrato: **CREDITO**.

## Persistência

- Atualização de `User.saldoAtual` e criação de `Movimentacao` ocorrem **somente** dentro de `registrarCreditoSaldoAtual` (transação Prisma).
- Evento de auditoria: `recordAudit` com `action: ops.staging_credit_available`.

## Pix real

Não implementado nesta fase; entrada real de produção deve vir de integração futura (webhook/provedor), não desta rota.
