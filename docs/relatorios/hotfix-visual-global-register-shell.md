# Hotfix visual global — Register onboarding shell

| Campo | Valor |
|-------|--------|
| **Data** | 2026-05-21 |
| **Escopo** | Frontend (`Register/index.jsx`, `Register.css`) |
| **Backend / API** | Não alterado |
| **Flag** | `VITE_ONBOARDING_APPLICATION_ENABLED=true` (fluxo ON) |

---

## 1. Problema visual

Mesmo após o hotfix KYC parcial, as etapas iniciais do Register (CPF, dados pessoais, endereço, profissional, senha, consentimento, termos finais, sucesso) ainda exibiam aparência de **modal/card dentro da página**:

- fundo externo cinza/azulado (`bg-zinc-200/75`, `bg-agilbank-primary/[0.04]`)
- card branco central com `shadow-2xl`, `rounded-[2rem]`, `border`
- footer com bandeja arredondada, `border-t`, sombra e blur
- botões com `shadow-lg shadow-agilbank-primary/20`
- resumos e checkboxes em caixas `rounded-xl border bg-gray-50`

**Antes (descrição):** laterais escuras/cinzas, tela branca menor no centro, footer separado com borda arredondada, botão dentro de container próprio — sensação de formulário dentro de card.

**Depois (descrição):** superfície branca contínua em 100vw × 100dvh, header integrado sem borda pesada, conteúdo com padding confortável, footer sticky plano (continuação da página), botão azul grande sem sombra pesada, inputs mantêm borda leve.

---

## 2. Classes removidas / condicionadas (flag ON)

| Área | Legado (flag OFF) | Onboarding (flag ON) |
|------|-------------------|----------------------|
| Shell externo | `justify-center px-3`, `bg-zinc-200/75` | `register-shell--onboarding`, `bg-white`, full width |
| Card interno | `shadow-2xl`, `sm:rounded-[2rem]`, `sm:border` | `mx-auto max-w-[430px]`, sem sombra/borda |
| Welcome hero | `register-hero-bg` | fundo branco plano |
| Header | `border-b border-gray-100/90 backdrop-blur` | sem borda inferior |
| Footer | `rounded-t-[1.25rem] border-t shadow backdrop-blur` | `bg-white px-5 pt-3`, sem bandeja |
| Botões primários | `shadow-lg shadow-agilbank-primary/20` | `primaryFooterBtnClass` sem sombra |
| Resumo termos | `rounded-2xl border bg-gray-50/90` | `border-y border-gray-100 py-4` |
| Checkboxes termos finais | cards `rounded-xl border` | `divide-y divide-gray-100`, labels planos |
| E-mail / pending review | caixa cinza arredondada | `border-t border-gray-100 pt-4` |
| Erro TERMS (footer) | card vermelho | texto inline plano |

Legado permanece com visual anterior quando `ONBOARDING_REGISTER` é `false`.

---

## 3. Arquivos alterados

- `agilbank-frontend/src/pages/Register/index.jsx`
  - `isOnboardingFlatShell = ONBOARDING_REGISTER` (todas as etapas)
  - `primaryFooterBtnClass` aplicado em `renderCompactFooterPrimary()`
  - shell, header, footer, scroll area e etapas simplificadas condicionalmente
- `agilbank-frontend/src/pages/Register/Register.css`
  - `.register-scroll-area--onboarding-flat`
  - `.register-shell--onboarding`

---

## 4. Fluxo afetado

`UI → Register (/register) → eventos de navegação → onboardingService → /api/onboarding/* → UI`

**Endpoints (inalterados):**

- `POST /api/onboarding/applications`
- `PATCH /api/onboarding/applications/current`
- `POST /api/onboarding/kyc/presign`, `confirm-upload`, `GET status`, `submit-review`
- `POST /api/onboarding/finalize`

**Comportamento preservado:**

- Flag ON: não chama `/api/auth/register`, não faz login silencioso
- Flag OFF: fluxo legado com card/modal intacto
- KYC: header “Tenho conta” → `/login`, “Voltar depois” → `/login`

---

## 5. Validação executada

```bash
cd agilbank-frontend && npm run build
# ✓ built in ~2.5s (2026-05-21)
```

**Checklist manual (flag ON, pós-deploy):**

- [ ] Etapa 1 (CPF): sem card dentro de fundo cinza
- [ ] Footer: sem bandeja arredondada/sombra; botão integrado
- [ ] Todas as etapas do formulário: mesma superfície branca
- [ ] KYC: header “Tenho conta”, preview/footer planos
- [ ] Network: apenas `/api/onboarding/*` (path com um único `/api`)
- [ ] Flag OFF: visual legado com card central preservado

---

## 6. Riscos / pendências

| Item | Nota |
|------|------|
| E2E visual automatizado | Não executado nesta entrega |
| Desktop > 430px | Coluna centralizada `max-w-[430px]` sobre fundo branco full-width (sem cinza lateral) |
| Inputs `bg-gray-50` | Mantidos — campo precisa de contraste visual |

---

## 7. Status

**Concluído no código** — redeploy frontend (Vercel) recomendado para validação visual em produção.
