# IVAR — FATIA 1: Indique e Ganhe (AgilBank Internet Banking)

**Data:** 2026-05-18  
**Base:** [ROADMAP_MASTER_AGILBANK_CTA.md](./ROADMAP_MASTER_AGILBANK_CTA.md) — FATIA 1  
**Escopo:** Somente frontend estático. Sem backend, Prisma, migration, ledger. Sem código de indicação real e sem promessa de recompensa em dinheiro.

---

## FLUXO REAL IDENTIFICADO

**UI** (`index.html` → grid de serviços, card “Indique e Ganhe”) → **evento** (`click` / teclado Enter ou Espaço) → **navegação** `GET` estático **`indique-ganhe.html`** (mesmo host/pasta `public/banco`) → **UI** informativa (“programa em ativação”, sem chamadas de API).

**Mapeamento:** UI → evento → `window.location.href` → página estática → **sem** endpoint de produto de indicação nesta fatia.

---

## PROBLEMA ENCONTRADO (SMOKE REAL)

No smoke pós–FATIA 0, o card **Indique e Ganhe** ainda acionava **`agilbankFatia0CtaEmBreveFromEl`** (modal “Em breve”), **em divergência** com o critério da **FATIA 1** (deveria abrir página dedicada). A página `indique-ganhe.html` **não existia** no repositório.

---

## CAUSA

FATIA 1 (página `indique-ganhe.html` + navegação) não tinha sido entregue ou integrada ao card; o card permaneceu classificado como **CTA FATIA 0** (`service-item--soon` + pill “Em breve”).

---

## IMPACTO NO SISTEMA

- **Positivo:** expectativa alinhada ao roadmap (página “em ativação” em vez de modal genérico só neste card).  
- **Risco regulatório / produto:** mitigado por cópia explícita de ausência de código, de garantia de valor e de benefício financeiro.  
- **Backend / ledger:** nenhum.

---

## PESQUISA ONLINE / REFERÊNCIAS USADAS

Não aplicável a alteração pontual (somente navegação + cópia). O plano mestre já trata risco de promessa sem regulamento (FATIA 1 na matriz de risco do `ROADMAP_MASTER_AGILBANK_CTA.md`).

---

## CONTRATO USADO

Nenhum endpoint. Apenas recursos estáticos:

| Recurso | Método | Observação |
|---------|--------|------------|
| `./indique-ganhe.html` | Navegação do browser | HTML + CSS inline + script mínimo (voltar) |
| `./img/propaganda-indique-e-ganhe.png` | `GET` estático | Hero da página (ver **Asset imagem** abaixo) |

---

## ASSET IMAGEM (HERO — melhoria visual)

| Item | Caminho / URL |
|------|----------------|
| **Arquivo original no repositório** | `agilbank-frontend/imagens/propaganda indique e ganhe.png` |
| **Por que há cópia em `public/banco/img/`** | A pasta `imagens/` fica **fora** de `public/`. No fluxo habitual do frontend (Vite: só o conteúdo de `public/` vai para o artefato estático servido com o `banco/`), o browser **não** receberia a imagem se referenciássemos apenas `../imagens/...`. |
| **Arquivo usado no HTML (servido com a página)** | `agilbank-frontend/public/banco/img/propaganda-indique-e-ganhe.png` |
| **URL relativa na página** | `img/propaganda-indique-e-ganhe.png` (a partir de `banco/indique-ganhe.html`) |

**Decisão:** foi criada **cópia** com nome sem espaços (`propaganda-indique-e-ganhe.png`) para URL estável; o **original permanece** em `imagens/` (pode ser removido manualmente se quiser uma única cópia no repo).

**Comunicação obrigatória:** imediatamente abaixo do hero, faixa com o texto: *“Programa em ativação. As recompensas ainda não estão disponíveis e as regras oficiais serão comunicadas antes do lançamento.”*

---

## ALTERAÇÕES REALIZADAS

| Item | Ação |
|------|------|
| Página FATIA 1 | Criada `indique-ganhe.html` com texto de programa **em fase de ativação**, **sem** código de indicação e **sem** promessa de dinheiro/recompensa. |
| Card no `index` | Removidos `service-item--soon`, `data-fatia0-nome`, pill “Em breve”, handlers do modal FATIA 0; navegação para `indique-ganhe.html` com suporte a teclado. |
| Smoke | Corrigida divergência: clique abre a página e não o modal “Em breve”. |
| Melhoria visual | Hero com arte existente (cópia servível em `public/banco/img/`), faixa de aviso logo abaixo, layout mobile-first; **sem** alterar promessa de produto ativo. |

**Intencionalmente não alterados:** demais CTAs/modais “Em breve” (ex.: Consignado e FGTS, `agilbankFatia0*` em outros itens).

---

## ARQUIVOS CRIADOS / ALTERADOS

| Arquivo | Tipo |
|---------|------|
| `agilbank-frontend/public/banco/indique-ganhe.html` | **Criado** / **Alterado** (hero + aviso) |
| `agilbank-frontend/public/banco/img/propaganda-indique-e-ganhe.png` | **Criado** (cópia para deploy; origem: `agilbank-frontend/imagens/propaganda indique e ganhe.png`) |
| `agilbank-frontend/public/banco/index.html` | **Alterado** (apenas card Indique e Ganhe) |
| `docs/relatorios/ivar-fatia-1-indique-ganhe.md` | **Criado** (este relatório) |

---

## BACKEND

**Nenhuma alteração.** Página sem `fetch`.

---

## MIGRATIONS

**Nenhuma.**

---

## LEDGER

**Nenhuma alteração.**

---

## TESTES / VALIDAÇÃO

- **Revisão estática:** card único alterado; demais serviços intactos.  
- **Smoke sugerido (manual):** abrir `index.html` → tocar “Indique e Ganhe” → carregar `indique-ganhe.html` → “Voltar” retorna ou vai a `index.html` se não houver histórico.  
- **Network:** sem novas requisições à API na página de indicação.  
- **Console:** apenas listener do botão voltar (sem dependências externas além de Font Awesome / Google Fonts já usados em outras páginas).

---

## RISCOS

- **Dependência de CDN:** Font Awesome e Google Fonts (igual ao restante do `banco`); falha de rede externa pode afetar ícone/fonte, não a navegação.  
- **Conteúdo jurídico:** texto é informativo e conservador; revisão jurídica final permanece recomendada antes de divulgação ampla do programa.

---

## REVISÃO PÓS-SMOKE (código no repositório)

**Verificação em 2026-05-18 (workspace):**

| Verificação | Resultado |
|-------------|-----------|
| Arquivo `indique-ganhe.html` presente em `agilbank-frontend/public/banco/` | Sim |
| Card “Indique e Ganhe” em `index.html` usa `window.location.href='indique-ganhe.html'` (sem `agilbankFatia0CtaEmBreveFromEl`) | Sim |
| Outros CTAs “Em breve” no mesmo grid | **Não** alterados (ex.: Consignado e FGTS mantém pill e modal FATIA 0) |

Se o smoke **ainda** exibir apenas o modal “Em breve”, a divergência tende a ser **artefato fora do repo**: deploy/Vercel sem publicar `indique-ganhe.html`, cache do browser/CDN, ou `index.html` servido de outro diretório/branch. Conferir no DevTools o **conteúdo real** do `onclick` do card e hard refresh (Ctrl+F5).

---

## SMOKE OPERACIONAL (ambiente publicado)

**Data do registro:** 2026-05-18  
**Responsável / ambiente:** validação do operador no host publicado (pós-deploy).

| Critério | Resultado |
|----------|-----------|
| Card “Indique e Ganhe” abre `indique-ganhe.html` | **OK** |
| Não abre modal antigo “Em breve” | **OK** |
| Comunicação: programa em fase de ativação | **OK** |
| Sem promessa de dinheiro, cashback ou benefício garantido | **OK** |
| Sem código de indicação falso | **OK** |
| Sem backend, migration, Prisma ou ledger nesta fatia | **OK** |

**Observação:** melhorias visuais podem ser tratadas em recorte futuro; **entrega funcional e de comunicação aprovadas.**

---

## STATUS FINAL

**FATIA 1 — APROVADA (smoke operacional no ambiente publicado).**

Critérios de navegação, cópia e escopo técnico (somente frontend) atendidos. Registro de smoke acima.
