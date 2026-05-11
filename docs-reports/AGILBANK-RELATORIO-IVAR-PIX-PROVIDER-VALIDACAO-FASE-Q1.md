# AGILBANK — Relatório IVAR — Fase Q.1 Validação pós-provider no Railway

**Data:** 2026-05-12  
**Modo:** somente leitura e health checks HTTP. Nenhum `UPDATE`/`DELETE`, settlement, baixa manual, liberação de seguro/frete, empréstimo ou cartão; nenhum `POST /api/charges/:id/pix` executado (exigiria JWT e poderia gerar efeitos colaterais de emissão).

---

## 1. Fluxo real identificado

1. `railway run npx prisma migrate status` / `generate` contra o `DATABASE_URL` do serviço ligado ao CLI.  
2. `GET https://aggibank-production.up.railway.app/api/health` e `GET .../api/readiness` (liveness + dependência Postgres).  
3. `railway run node scripts/q1-validate-pix-provider-railway-readonly.js` → `findFirst` em `pix_cobrancas` ordenado por `createdAt` desc, campos selecionados sem payload Pix completo.

---

## 2. Problema encontrado

Nenhum bloqueio: schema alinhado à Fase Q; API responde **200** em health/readiness.

---

## 3. Causa

N/A (validação operacional sem falha).

---

## 4. Impacto

Nenhuma alteração de dados realizada nesta sessão; apenas leitura e verificação de rota pública de saúde.

---

## 5. Ação da RAGNA

- Script read-only: `scripts/q1-validate-pix-provider-railway-readonly.js` (reutilizável para Q.1).  
- Evidências coletadas: migrate status, generate, health, readiness, última `PixCobranca`.

---

## 6. Ação da LARGETHA

Não aplicável (nenhuma alteração de UI nesta validação).

---

## 7. Auditoria do IVAR

| Critério | Evidência |
| --- | --- |
| Migration Fase Q aplicada | `prisma migrate status`: **10 migrations** no diretório; mensagem **"Database schema is up to date!"** (inclui `20260511190000_pix_cobranca_provider`). |
| `provider` persistido | Última linha `PixCobranca`: **`provider": "EFI"`** (id `cmp1f8mve0005qt0pdsdhd18e`, status `ATIVA`). |
| Health / Readiness | **200** `healthy` / **200** `ready`, `dependencies.database.status`: **healthy** (latência ~648 ms no instante do teste). |
| Contrato GET `charges/:id` com `pixProvider` | **Não** exercitado com JWT nesta rodada (evita chamada autenticada desnecessária); contrato preservado na Fase Q e coberto por testes automatizados no repositório. |
| `pixCopiaECola` | **Não** consultado nem reproduzido neste relatório. |
| Saldo / settlement / liberação | Nenhum comando de escrita; nenhuma evidência de efeito financeiro nesta validação. |

---

## 8. Relatório gerado

- `docs-reports/AGILBANK-RELATORIO-IVAR-PIX-PROVIDER-VALIDACAO-FASE-Q1.md` (este arquivo).

---

## 9. Validação

| Passo | Resultado |
| --- | --- |
| `railway run npx prisma migrate status` | OK — schema up to date |
| `railway run npx prisma generate` | OK |
| `GET /api/health` | **200**, `status: healthy` |
| `GET /api/readiness` | **200**, `status: ready`, DB healthy |
| Última `PixCobranca` (read-only) | `provider: EFI`, campos listados no §7 |

**Nota:** tentativa local de `fetch()` ao host de produção falhou com `EAI_AGAIN` (DNS transitório no ambiente do agente); **`curl`** no mesmo host concluiu com sucesso.

---

## 10. Status final

**APROVADO** — migration aplicada no banco usado pelo Railway; coluna **`provider`** presente com valor **`EFI`** na amostra; health/readiness **200**; nenhum efeito financeiro executado nesta validação.

**Pendência opcional:** smoke autenticado `GET /api/charges/:id` para confirmar `pixProvider` na resposta JSON em produção com JWT de titular de teste (fora do escopo desta execução read-only).
