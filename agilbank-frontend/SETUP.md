# Configuração do AgilBank Frontend

## 🚀 Configuração Rápida

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo:

```env
# API Configuration
VITE_API_URL=https://URL-DO-BACKEND-RAILWAY/api

# App Configuration
VITE_APP_NAME=AgilBank
VITE_APP_VERSION=1.0.0

# Development
VITE_DEBUG=true
```

### 3. Executar o projeto
```bash
npm run dev
```

A aplicação estará disponível na URL exibida pelo Vite no terminal.

## 🔐 Credenciais de Teste

Para testar a aplicação, use:

- **Email**: `admin@agilbank.com`
- **Senha**: `123456`

## 📱 Funcionalidades Disponíveis

### ✅ Implementadas
- ✅ Login com autenticação
- ✅ Dashboard com saldo
- ✅ Transferências (modal)
- ✅ Histórico de transações
- ✅ Modal de termos de uso
- ✅ Banner de cookies
- ✅ Design responsivo
- ✅ Dados mock para desenvolvimento

### 🔄 Em Desenvolvimento
- 🔄 Cadastro de usuários
- 🔄 Recuperação de senha
- 🔄 Configurações da conta
- 🔄 PIX
- 🔄 Pagamentos

## 🎨 Design

O frontend segue o design system do AgilBank com:
- Cores: Azul (#0066b3), Verde (#00a86b), Amarelo (#ffc107)
- Tipografia: Inter
- Mobile-first
- Acessibilidade (ARIA, focus states)

## 🔌 Backend

O frontend se conecta ao backend por `VITE_API_URL`. Em produção/staging, use a URL do backend no Railway terminando em `/api`.

## 📁 Estrutura

```
src/
├── components/     # Componentes reutilizáveis
├── hooks/         # Hooks customizados
├── layouts/       # Layouts da aplicação
├── pages/         # Páginas
├── services/      # Serviços de API
├── styles/        # Estilos globais
├── utils/         # Utilitários
└── App.jsx        # Componente principal
```

## 🚀 Deploy

Para fazer deploy:

1. **Build**: `npm run build`
2. **Preview**: `npm run preview`
3. **Deploy**: Upload da pasta `dist/` para seu servidor

## 🆘 Problemas Comuns

### Erro de CORS
Se houver erro de CORS, verifique se o backend está configurado para aceitar requisições da URL pública do frontend.

### Porta em uso
Se a porta 5173 estiver em uso, o Vite automaticamente tentará a próxima porta disponível.

### Dados não carregam
A aplicação funciona offline com dados mock. Se os dados não carregarem, verifique o console do navegador para erros.

## 📞 Suporte

Para dúvidas ou problemas:
- Verifique o console do navegador
- Consulte a documentação do React/Vite
- Abra uma issue no repositório
