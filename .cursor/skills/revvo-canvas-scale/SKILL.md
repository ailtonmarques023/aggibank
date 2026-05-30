---
name: revvo-canvas-scale
description: Implementa e revisa o padrão Revvo de canvas fixo 430px com scale proporcional em previews (sem reflow por @media). Use ao criar ou alterar telas Revvo, /dev/revvo-*, revvo-*-preview, canvas escalável, mobile-first preview, ou quando o usuário pedir "mesmo desenho só menor".
---

# Revvo canvas scale (preview/design)

## Quando usar

- Nova tela Revvo em modo **preview/dev** (não produção bancária).
- Correção de layout que quebra em 360px (3+2 botões, cards empilhados).
- Alinhar HTML estático `/banco/revvo-*.html` com rotas React `/dev/revvo-*`.

**Escopo:** só frontend/CSS/JS de preview. Não alterar backend, API, Pix, KYC ou fluxos AgilBank reais.

## Regra em uma frase

Canvas lógico **430px** → viewport menor aplica **`scale`** → **nunca** reorganizar colunas por `@media`.

`@media` é permitido apenas no utilitário de canvas para atualizar `--revvo-canvas-scale`; nunca para reestruturar grids, cards, busca, atalhos, stats ou botões principais.

## Implementação React (padrão do repo)

### 1. Importar CSS + hook

```jsx
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './MinhaTelaRevvo.css'; // CSS com @import '../../styles/revvo-canvas-scale.css'
```

No CSS da página:

```css
@import '../../styles/revvo-canvas-scale.css';

.minha-app.revvo-canvas-app {
  --revvo-canvas-design-width: 430px; /* ou var(--minha-design-width) */
  /* estilos de fundo/fonte da app */
}

.minha-surface {
  min-height: 100dvh;
  /* estilos visuais do canvas; SEM width: min(100vw) nem @media estrutural */
}
```

### 2. JSX (três camadas)

```jsx
const { scaleRef, innerRef } = useRevvoCanvasScale();

return (
  <div className="minha-app revvo-canvas-app">
    <div className="minha__scale revvo-canvas-scale" ref={scaleRef}>
      <div className="minha-surface revvo-canvas-surface" ref={innerRef}>
        {/* conteúdo */}
      </div>
    </div>
  </div>
);
```

O hook:
- **Não** altera `--revvo-canvas-scale` (escala é só CSS)
- Ajusta **apenas** `height` do wrapper (evita corte vertical após scale)

### 3. Linhas de ação (5 botões, chips, etc.)

```css
/* 5 itens numa linha — manter sempre */
.minha__atalhos {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

/* Chips — scroll horizontal, não quebrar linha */
.minha__chips {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.minha__chip { flex-shrink: 0; }
```

### 4. Bottom nav fixo

```css
.minha__bottomNav {
  position: fixed;
  left: 50%;
  bottom: 0;
  width: calc(var(--revvo-canvas-design-width) * var(--revvo-canvas-scale));
  max-width: 100vw;
  transform: translateX(-50%);
}
```

## HTML estático (`public/banco`)

1. Incluir `css/revvo-canvas-scale.css` (cópia em `/banco/css/`).
2. Classes: `revvo-canvas-app`, `revvo-canvas-scale`, `revvo-canvas-surface` no HTML.
3. Script: `js/revvo-canvas-scale.js` (só altura do wrapper; antes do JS da página).

## O que NÃO fazer

| ❌ Evitar | ✅ Fazer |
|----------|---------|
| `@media (max-width: 389px) { grid-template-columns: 1fr }` | Manter grid do Figma; escala encolhe |
| Canvas 943px em tela mobile-first | **430px** salvo decisão explícita |
| `flex-wrap: wrap` em chips críticos | `nowrap` + scroll horizontal |
| JS com `setProperty('--revvo-canvas-scale')` | Proibido — escala só no CSS |
| `transform-origin: top center` causando corte lateral | `top left` no utilitário |
| `width: min(100vw, 430px)` no surface | `width: 430px` fixo no surface |

## Validação

### Manual

Abrir `http://localhost:5180` (porta **5180**, não 5173):

- `/dev/revvo-home` — 5 atalhos em 1 linha
- `/dev/revvo-criar-missao` — 5 tipos em 1 linha
- `/dev/revvo-missions` — busca+filtro lado a lado; stats 3 colunas

Larguras: **430, 390, 375, 360, 320px**.

### Script (opcional)

```bash
cd agilbank-frontend
npm install -D playwright && npx playwright install chromium
node scripts/revvo-canvas-validate.mjs
```

Screenshots em `tmp/revvo-canvas-validate/`.

## Telas de referência no repo

| Tela | React | Estático |
|------|-------|----------|
| Home | `RevvoHomePreview` | `revvo-home-v2-preview.html` |
| Criar missão | `RevvoCreateMissionPreview` | `revvo-criar-missao-v2-preview.html` |
| Missões | `RevvoMissionsPreview` | — |

## Rule Cursor

Detalhes curtos para o agente em contexto de arquivo: `.cursor/rules/revvo-canvas-scale.mdc`
