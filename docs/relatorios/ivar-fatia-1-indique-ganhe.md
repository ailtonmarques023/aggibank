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
| `./img/fatia-1-hero.png` | `GET` estático | Hero premium FATIA 1 (16:9, identidade AgilBank; ver **Asset imagem**) |
| `./img/propaganda-indique-e-ganhe.png` | *(opcional / legado)* | Cópia da arte em `imagens/`; **não** referenciada no HTML após o hero `fatia-1-hero.png` |

---

## ASSET IMAGEM (HERO — identidade AgilBank)

### Hero principal (em uso na página)

| Item | Valor |
|------|--------|
| **Arquivo servido** | `agilbank-frontend/public/banco/img/fatia-1-hero.png` |
| **URL relativa** | `img/fatia-1-hero.png` (a partir de `banco/indique-ganhe.html`) |
| **Proporção / tratamento CSS** | 16:9; `object-fit: cover`; fundo do bloco `#0a1628` (alinhado a visual escuro) |
| **Origem do arquivo** | Imagem **gerada** para esta fatia a partir de brief interno (estilo premium, azul escuro, neon suave, 3D abstrato, celular com UI sem texto, sem logotipos de bancos reais), **sem** clonar layout de concorrentes |
| **Prompt de criação (resumo)** | *Banner premium para app bancário digital AgilBank, moderno e tecnológico, fundo azul escuro com luzes neon suaves, elementos 3D de finanças digitais, celular com interface abstrata, ícones de segurança e crescimento, visual limpo e sofisticado, alta qualidade, sem textos pequenos, sem logotipos de bancos reais, proporção 16:9.* |

**Arte promocional anterior (repo):** `agilbank-frontend/imagens/propaganda indique e ganhe.png` e cópia `public/banco/img/propaganda-indique-e-ganhe.png` — permanecem como ativos opcioniais; o **hero ativo** na página é `fatia-1-hero.png`.

**Comunicação obrigatória:** imediatamente abaixo do hero, faixa com o texto: *“Programa em ativação. As recompensas ainda não estão disponíveis e as regras oficiais serão comunicadas antes do lançamento.”*

---

## ALTERAÇÕES REALIZADAS

| Item | Ação |
|------|------|
| Página FATIA 1 | Criada `indique-ganhe.html` com texto de programa **em fase de ativação**, **sem** código de indicação e **sem** promessa de dinheiro/recompensa. |
| Card no `index` | Removidos `service-item--soon`, `data-fatia0-nome`, pill “Em breve”, handlers do modal FATIA 0; navegação para `indique-ganhe.html` com suporte a teclado. |
| Smoke | Corrigida divergência: clique abre a página e não o modal “Em breve”. |
| Melhoria visual | Hero **identidade AgilBank** (`fatia-1-hero.png`), faixa de aviso logo abaixo, layout mobile-first; `alt` e cópia **não** prometem produto ativo. |

**Intencionalmente não alterados:** demais CTAs/modais “Em breve” (ex.: Consignado e FGTS, `agilbankFatia0*` em outros itens).

---

## ARQUIVOS CRIADOS / ALTERADOS

| Arquivo | Tipo |
|---------|------|
| `agilbank-frontend/public/banco/indique-ganhe.html` | **Alterado** (hero `fatia-1-hero.png`, bloco 16:9 escuro) |
| `agilbank-frontend/public/banco/img/fatia-1-hero.png` | **Criado** — hero premium FATIA 1 (nome conforme padrão `fatia-1` + `hero`) |
| `agilbank-frontend/public/banco/img/propaganda-indique-e-ganhe.png` | **Legado** (não usado no HTML atual; origem: `imagens/propaganda indique e ganhe.png`) |
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
- **Imagem hero gerada:** revisar visualmente em cada deploy se houve artefato indesejado (texto legível fantasma, marcas); substituir PNG se necessário.

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
