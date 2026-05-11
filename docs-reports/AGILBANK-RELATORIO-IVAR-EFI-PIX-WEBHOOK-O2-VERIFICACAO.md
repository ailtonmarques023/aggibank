# AGILBANK — Relatório IVAR — Fase O.2 Verificação webhook Pix após pagamento real

**Data:** 2026-05-11  
**Modo:** somente leitura (Prisma `findMany`, sem `update`/`delete`). Nenhuma nova cobrança Pix criada nesta fase.

**Cópia versionada:** este arquivo em `docs-reports/` (a pasta `docs/` está no `.gitignore`). Cópia de trabalho equivalente: `docs/reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-WEBHOOK-O2-VERIFICACAO.md`.

---

## 1. Fluxo real identificado

1. Consulta read-only a `pix_cobrancas` e `pix_webhook_events` no banco ligado ao Railway (`railway run node scripts/o2-verify-pix-webhook-readonly.js`).
2. Conferência de logs do serviço `aggibank` (produção) via `railway logs --json` (amostra recente).
3. Cruzamento: cobrança **PAGA** + `paidAt` + `endToEndId` + evento `PROCESSED` correlato → critério de **APROVADO**.

---

## 2. Problema encontrado

- No banco **não** há `PixCobranca` com `status = PAGA` nem linhas em `pix_webhook_events`.
- Há **duas** cobranças recentes apenas **ATIVA** (txids distintos, `paidAt` e `endToEndId` nulos).
- Nos logs Railway aparece **HTTP 403** em um `POST` ao endpoint de webhook Pix **após** um `POST .../charges/.../pix` 200 (linha de tempo compatível com tentativa de notificação ou retentativa da Efí).

---

## 3. Causa (hipótese técnica alinhada aos logs)

- **403:** autenticação do webhook falhou (`efiwk` inválido ou rota incorreta). O log de acesso mostra padrão `.../webhook?ignorar=&efiwk=<token>/pix`, sugerindo que o sufixo `/pix` da Efí pode ter sido concatenado de forma a **alterar o valor** do query param `efiwk` (ex.: sufixo `/pix` colado ao token), invalidando a comparação no middleware — **revisão de URL cadastrada e de rota `/webhook/pix` recomendada** (fora do escopo deste relatório somente leitura).
- **Sem eventos na tabela:** nenhum processamento persistido de webhook com payload de Pix recebido (ou o callback não chegou autenticado / não chegou com corpo processável).

---

## 4. Impacto

- Pagamento real **não** se reflete, neste recorte de dados, em `PixCobranca` **PAGA** nem em `pix_webhook_events`.
- Risco operacional: notificações Pix podem estar **perdidas ou recusadas** enquanto persistir **403** no webhook em produção.

---

## 5. Ação da RAGNA

- Script read-only: `scripts/o2-verify-pix-webhook-readonly.js` (consultas + veredito automático heurístico).
- Nenhuma migration, nenhum `update`/`delete`, nenhum settlement executado nesta fase.

---

## 6. Ação da LARGETHA

Não aplicável.

---

## 7. Auditoria IVAR

| Critério | Evidência |
| --- | --- |
| APROVADO (PAGA + paidAt + evento) | **Não** atendido — sem `PAGA`, sem linhas em `pix_webhook_events`. |
| PENDENTE (só ATIVA, sem eventos) | **Atendido** no banco. |
| REPROVADO (erro / mismatch / orphan / 4xx/5xx webhook) | **403** em `POST` webhook nos logs Railway → **REPROVADO** por critério explícito de falha HTTP no webhook. |

**Privacidade:** em um log de acesso, a query string continha `efiwk` em claro — **não reproduzir em relatórios públicos**; recomenda-se mascarar query em logs de produção (melhoria futura).

---

## 8. Relatório gerado

- `docs/reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-WEBHOOK-O2-VERIFICACAO.md` (cópia local; `docs/` ignorada no git)
- `docs-reports/AGILBANK-RELATORIO-IVAR-EFI-PIX-WEBHOOK-O2-VERIFICACAO.md` (cópia versionada)

---

## 9. Validação

| Passo | Resultado |
| --- | --- |
| `pix_cobrancas` (últimas 25) | 2 registros, ambos `ATIVA`, `paidAt` null, `endToEndId` null |
| `pix_webhook_events` (últimos 40) | 0 registros |
| Logs Railway (amostra) | `efi_pix_webhook_validation_ok` + `POST .../webhook?... 200` (ping); depois `POST .../webhook?.../pix 403` |

**Txids observados (somente identificadores operacionais):** `mOjeTK3Ba2OEQnuKRmBSa4pjkZ5s`, `FD5ituHzE3KoABakpo7mDqKlFODG` (ambos ATIVA).

---

## 10. Status final

**REPROVADO** — por **HTTP 403** no webhook em produção (critério O.2), **em conjunto** com estado de banco **PENDENTE** (sem `PAGA`, sem eventos).

**Próximos passos sugeridos (operacional / engenharia, sem executar aqui):** corrigir URL cadastrada na Efí ou ordem de query params para o sufixo `/pix` não invalidar `efiwk`; validar que notificações reais usam `POST /api/internal/efi/pix/webhook/pix` com query intacta; repetir O.2 após pagamento de teste controlado.
