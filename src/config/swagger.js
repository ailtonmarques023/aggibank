const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AgilBank API',
      version: '1.0.0',
      description: 'API do AgilBank - Sistema Bancário Digital',
      contact: {
        name: 'AgilBank Team',
        email: 'contatoagilbank@gmail.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.agilbank.com' 
          : `http://localhost:${process.env.PORT || 5000}`,
        description: process.env.NODE_ENV === 'production' 
          ? 'Servidor de Produção' 
          : 'Servidor de Desenvolvimento',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID único do usuário',
            },
            nomeCompleto: {
              type: 'string',
              description: 'Nome completo do usuário',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email do usuário',
            },
            cpf: {
              type: 'string',
              description: 'CPF do usuário',
            },
            telefone: {
              type: 'string',
              description: 'Telefone do usuário',
            },
            dataNascimento: {
              type: 'string',
              format: 'date',
              description: 'Data de nascimento',
            },
            saldoAtual: {
              type: 'number',
              format: 'decimal',
              description: 'Saldo atual da conta',
            },
            isAtivo: {
              type: 'boolean',
              description: 'Status da conta',
            },
            isVerificado: {
              type: 'boolean',
              description: 'Status de verificação',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data de criação',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Email do usuário',
            },
            senha: {
              type: 'string',
              description: 'Senha do usuário',
            },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Status da operação',
            },
            message: {
              type: 'string',
              description: 'Mensagem de resposta',
            },
            data: {
              type: 'object',
              properties: {
                user: {
                  $ref: '#/components/schemas/User',
                },
                token: {
                  type: 'string',
                  description: 'Token de acesso JWT',
                },
                refreshToken: {
                  type: 'string',
                  description: 'Token de refresh',
                },
              },
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['nomeCompleto', 'email', 'cpf', 'dataNascimento', 'senha'],
          properties: {
            nomeCompleto: {
              type: 'string',
              description: 'Nome completo do usuário',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email do usuário',
            },
            cpf: {
              type: 'string',
              description: 'CPF do usuário',
            },
            telefone: {
              type: 'string',
              description: 'Telefone do usuário',
            },
            dataNascimento: {
              type: 'string',
              format: 'date',
              description: 'Data de nascimento',
            },
            senha: {
              type: 'string',
              minLength: 8,
              description: 'Senha do usuário (mínimo 8 caracteres)',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              description: 'Mensagem de erro',
            },
            error: {
              type: 'string',
              description: 'Detalhes do erro',
            },
            code: {
              type: 'string',
              description: 'Código do erro',
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              description: 'Mensagem de sucesso',
            },
            data: {
              type: 'object',
              description: 'Dados da resposta',
            },
          },
        },
        PIXTransaction: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID da transação',
            },
            chavePix: {
              type: 'string',
              description: 'Chave PIX',
            },
            valor: {
              type: 'number',
              format: 'decimal',
              description: 'Valor da transação',
            },
            descricao: {
              type: 'string',
              description: 'Descrição da transação',
            },
            status: {
              type: 'string',
              enum: ['pendente', 'processada', 'falhou'],
              description: 'Status da transação',
            },
            tipo: {
              type: 'string',
              enum: ['envio', 'recebimento'],
              description: 'Tipo da transação',
            },
            dataTransacao: {
              type: 'string',
              format: 'date-time',
              description: 'Data da transação',
            },
          },
        },
        Card: {
          type: 'object',
          description: 'Cartão demo — sem PAN integral nem CVV',
          properties: {
            id: {
              type: 'string',
              description: 'ID do cartão',
            },
            maskedNumber: {
              type: 'string',
              description: 'Número mascarado (ex.: **** **** **** 1234)',
            },
            last4: {
              type: 'string',
              description: 'Últimos 4 dígitos',
            },
            validade: {
              type: 'string',
              description: 'Data de validade',
            },
            limite: {
              type: 'number',
              format: 'decimal',
              description: 'Limite do cartão',
            },
            saldoUtilizado: {
              type: 'number',
              format: 'decimal',
              description: 'Saldo utilizado',
            },
            status: {
              type: 'string',
              enum: ['pendente', 'aprovado', 'rejeitado', 'bloqueado'],
              description: 'Status do cartão',
            },
            tipo: {
              type: 'string',
              enum: ['credito', 'debito'],
              description: 'Tipo do cartão',
            },
            bandeira: {
              type: 'string',
              enum: ['visa', 'mastercard', 'elo'],
              description: 'Bandeira do cartão',
            },
          },
        },
        Loan: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID do empréstimo',
            },
            valorSolicitado: {
              type: 'number',
              format: 'decimal',
              description: 'Valor solicitado',
            },
            valorAprovado: {
              type: 'number',
              format: 'decimal',
              description: 'Valor aprovado',
            },
            prazoMeses: {
              type: 'integer',
              description: 'Prazo em meses',
            },
            taxaJuros: {
              type: 'number',
              format: 'decimal',
              description: 'Taxa de juros',
            },
            valorParcela: {
              type: 'number',
              format: 'decimal',
              description: 'Valor da parcela',
            },
            status: {
              type: 'string',
              enum: ['pendente', 'aprovado', 'rejeitado', 'quitado'],
              description: 'Status do empréstimo',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
    './src/services/*.js',
  ],
};

const specs = swaggerJSDoc(options);

module.exports = specs;
