# AgilBank Backend

Backend do AgilBank - Sistema Bancário Digital desenvolvido com Node.js, Express e Prisma.

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **Prisma** - ORM para banco de dados
- **PostgreSQL** - Banco de dados (Neon)
- **Redis** - Cache e sessões
- **JWT** - Autenticação
- **bcryptjs** - Criptografia de senhas
- **Jest** - Testes
- **Swagger** - Documentação da API

## 📋 Pré-requisitos

- Node.js >= 18.0.0
- npm >= 8.0.0
- PostgreSQL (ou conta no Neon)
- Redis (opcional)

## 🛠️ Instalação

1. **Clone o repositório**
```bash
git clone <repository-url>
cd agilbank-backend
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp env.example .env
```

Edite o arquivo `.env` com suas configurações:
```env
# Configurações do Servidor
NODE_ENV=development
PORT=5000
HOST=0.0.0.0

# Configurações do Banco de Dados Neon
DATABASE_URL="postgresql://username:password@host:port/database"

# Configurações de Autenticação
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# E-mail — produção (Vercel + Railway): prefira Resend (HTTPS); ver env.example
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_FROM_NAME=AgilBank
FRONTEND_URL=http://127.0.0.1:5173
# Fallback local/dev (Nodemailer) — em muitos PaaS a saída SMTP 587 é bloqueada
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

4. **Configure o banco de dados**
```bash
# Gerar cliente Prisma
npm run build

# Executar migrations
npm run db:migrate

# (Opcional) Popular com dados de exemplo
npm run db:seed
```

5. **Inicie o servidor**
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 📚 Documentação da API

Acesse a documentação interativa da API em:
- **Desenvolvimento**: http://localhost:3001/api/docs
- **Produção**: https://api.agilbank.com/api/docs

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Executar testes em modo watch
npm run test:watch

# Executar testes com coverage
npm test -- --coverage
```

## 📧 E-mail (Resend / SMTP legado) e templates transacionais

O envio está em **`src/utils/email.js`**: com **`RESEND_API_KEY`** + remetente (**`EMAIL_FROM`**, ou `SMTP_USER` se `EMAIL_FROM` vazio) o backend usa **Resend via HTTPS**; caso contrário usa **Nodemailer + `SMTP_*`** (adequado a **dev/local**; em Railway a saída SMTP costuma ser **bloqueada** — preferir Resend em produção). Detalhes: `env.example` e `docs/AGILBANK-EMAIL-PROVIDER-RULE.md`.

**Checar configuração (Resend: presença de variáveis; SMTP: `verify()` quando for o caminho ativo):**

```bash
node -e "require('dotenv').config(); const { testEmailConfiguration } = require('./src/utils/email'); testEmailConfiguration().then(ok => { process.exit(ok ? 0 : 1); });"
```

**Enviar e-mail de teste pela API (rota operacional `/api/email`, requer JWT de usuário autenticado):** com o servidor em execução, `POST /api/email/test` com header `Authorization: Bearer <token>`.

**Disparar os 4 templates oficiais de uma vez (script, sem subir o servidor):**

```bash
npm run email:templates-demo -- seu@email.com
# ou: TEST_EMAIL_TO=seu@email.com npm run email:templates-demo
```

Cada mensagem usa dados fictícios (tokens aleatórios só para preencher o layout); links de verificação/redefinição apontam para `FRONTEND_URL` do `.env`.

Templates oficiais: `welcome`, `passwordReset`, `transactionNotification`, `cardNotification` (HTML + texto simples, rodapé de segurança). Falhas do **provedor de e-mail** (Resend ou SMTP) **não** devem impedir cadastro (201), PIX ou aprovação de cartão onde o código assim definiu — erros são registrados em log, sem expor segredos (`RESEND_API_KEY`, `SMTP_PASS`).

## 📁 Estrutura do Projeto

```
src/
├── config/          # Configurações
│   ├── database.js  # Configuração do Prisma
│   └── swagger.js   # Configuração do Swagger
├── middleware/      # Middlewares
│   ├── auth.js      # Autenticação JWT
│   └── validation.js # Validação de dados
├── routes/          # Rotas da API
│   ├── auth.js      # Autenticação
│   ├── user.js      # Usuários
│   ├── pix.js       # PIX
│   ├── cards.js     # Cartões
│   ├── loans.js     # Empréstimos
│   ├── boletos.js   # Boletos
│   ├── notifications.js # Notificações
│   ├── payments.js  # Pagamentos
│   └── email.js     # Email
├── utils/           # Utilitários
│   ├── logger.js    # Sistema de logs
│   ├── redis.js     # Cache Redis
│   └── email.js     # Envio de emails
└── server.js        # Servidor principal

tests/               # Testes
├── setup.js         # Configuração dos testes
└── *.test.js        # Testes unitários

prisma/              # Schema do banco
├── schema.prisma    # Schema Prisma
└── migrations/      # Migrations
```

## 🔐 Autenticação

O sistema usa JWT para autenticação com refresh tokens:

```javascript
// Login
POST /api/auth/login
{
  "email": "user@example.com",
  "senha": "password"
}

// Resposta
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "jwt-token",
    "refreshToken": "refresh-token"
  }
}
```

## 🏦 Funcionalidades

### 👤 Usuários
- Registro e login
- Perfil do usuário
- Configurações
- Endereço

### 💳 PIX
- Cadastro de chaves PIX
- Envio e recebimento
- Histórico de transações
- Limites diários/mensais

### 🎴 Cartões
- Solicitação de cartões
- Aprovação/rejeição
- Bloqueio/desbloqueio
- Alteração de limites

### 💰 Empréstimos
- Simulação de empréstimos
- Solicitação
- Aprovação baseada em score
- Controle de parcelas

### 📄 Boletos
- Geração de boletos
- Pagamento
- Validação de código de barras
- Histórico

### 🔔 Notificações
- Notificações em tempo real
- Configurações de preferência
- Histórico de notificações

## 🚀 Deploy

### Variáveis de Ambiente para Produção

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=super-secret-key
# E-mail transacional (produção): Resend + domínio verificado
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@seudominio.com
EMAIL_FROM_NAME=AgilBank
FRONTEND_URL=https://seu-frontend.vercel.app
# SMTP legado opcional em produção: defina explicitamente (rede deve permitir 587)
# ALLOW_EMAIL_SMTP_FALLBACK=true
# SMTP_HOST=...
# SMTP_USER=...
# SMTP_PASS=...
```

### Docker (Opcional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

## 📊 Monitoramento

- **Logs**: Sistema de logs estruturado com Pino
- **Health Check**: `/api/health`
- **Métricas**: Logs de operações bancárias
- **Auditoria**: Logs de alterações de dados

## 🔒 Segurança

- Autenticação JWT com refresh tokens
- Criptografia de senhas com bcrypt
- Rate limiting
- Validação de dados com Joi
- CORS configurado
- Headers de segurança com Helmet
- Logs de auditoria

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Suporte

Para suporte, entre em contato:
- Email: contatoagilbank@gmail.com
- Documentação: http://localhost:5000/api/docs

---

**AgilBank** - Seu banco digital de confiança 🏦
