# AgilBank - Dashboard Moderno

Dashboard bancário moderno inspirado no Nubank, integrado com serviços gov.br.

## 🚀 Funcionalidades

### 🏦 Serviços Bancários
- **Conta Digital**: Saldo, extrato, transferências
- **PIX**: Transferências instantâneas
- **Cartão de Crédito**: Fatura, limite, pagamentos
- **Investimentos**: Caixinhas, CDB, criptomoedas
- **Empréstimos**: Simulação e contratação
- **Cashback**: Parcerias com lojas (Magalu, Amazon, etc.)

### 🏛️ Integração Gov.br
- **Documentos Digitais**: CPF, CNH, Carteira de Trabalho
- **Agendamentos**: INSS, órgãos públicos
- **Comprovantes**: Download de documentos oficiais
- **Notificações**: Serviços integrados

## 🎨 Design

- **Estilo Nubank**: Layout moderno com roxo e branco
- **Mobile-First**: Responsivo para todos os dispositivos
- **Navegação Inferior**: Estilo app mobile
- **Cards Modernos**: Interface limpa e intuitiva
- **Gradientes**: Visual atrativo e profissional

## 🛠️ Tecnologias

- **React 18**: Framework frontend
- **TailwindCSS**: Estilização
- **Heroicons**: Ícones modernos
- **React Router**: Navegação
- **Vite**: Build tool

## 📱 Como Usar

### 1. Instalar Dependências
```bash
npm install
```

### 2. Iniciar Desenvolvimento
```bash
npm run dev
```

### 3. Acessar
- Frontend: URL exibida pelo Vite ao rodar `npm run dev`
- Backend: configure `VITE_API_URL` apontando para a URL do backend com `/api`

## 🔐 Login

Use as credenciais:
- **Email**: ailtonmarques023@gmail.com
- **Senha**: 123456 (6 dígitos)

## 📂 Estrutura

```
src/
├── components/
│   ├── Dashboard/          # Componentes do dashboard
│   ├── GovBR/             # Componentes gov.br
│   └── Navigation/        # Navegação
├── pages/                 # Páginas principais
├── hooks/                 # Hooks customizados
└── utils/                 # Utilitários
```

## 🎯 Funcionalidades Implementadas

### ✅ Dashboard Principal
- Header com perfil e saldo
- Ações rápidas (PIX, Transferir, etc.)
- Cartão de crédito
- Investimentos
- Cashback carousel

### ✅ Integração Gov.br
- Documentos digitais
- Serviços públicos
- Agendamentos
- Comprovantes

### ✅ Navegação
- Bottom navigation
- Tabs responsivas
- Mobile-first

### ✅ Autenticação
- Login com backend real
- Dados do usuário
- Proteção de rotas

## 🔄 Próximos Passos

1. **Funcionalidades Bancárias**: Implementar PIX, transferências
2. **Gov.br OAuth**: Integração real com gov.br
3. **Notificações**: Push notifications
4. **PWA**: App instalável
5. **Testes**: Unit e integration tests

## 🎨 Paleta de Cores

- **Primária**: Purple (#9333ea)
- **Secundária**: Purple-800 (#6b21a8)
- **Background**: Gray-50 (#f9fafb)
- **Texto**: Gray-900 (#111827)

## 📱 Responsividade

- **Mobile**: 320px - 768px
- **Tablet**: 768px - 1024px
- **Desktop**: 1024px+

## 🚀 Deploy

```bash
npm run build
```

O build será gerado na pasta `dist/` e pode ser servido por qualquer servidor web estático.

---

**AgilBank** - Seu banco digital confiável 🏦