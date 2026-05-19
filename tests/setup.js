const { PrismaClient } = require('@prisma/client');

// Configurar variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/agilbank_test';

// Mock do Prisma para testes
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      cartao: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      cartaoVirtual: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      cardShipment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      cardShipmentEvent: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      emprestimo: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      loanInsuranceCharge: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      transacaoPix: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      boleto: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      notificacao: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      pagamento: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      chavePix: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      movimentacao: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      pixCobranca: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      accountDeposit: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      internalTransfer: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      referralCode: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      referral: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      referralReward: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      identitySubmission: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      identitySubmissionArtifact: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      pixWebhookEvent: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      token: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      endereco: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      dadosProfissionais: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      configuracoesUsuario: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      $on: jest.fn(),
    })),
  };
});

// Mock do logger
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  banking: jest.fn(),
  security: jest.fn(),
  audit: jest.fn(),
  criticalOperation: jest.fn(),
  logCriticalOperation: jest.fn(),
  performance: jest.fn(),
  requestLogger: jest.fn(),
  logUncaughtError: jest.fn(),
}));

// Mock do Redis
jest.mock('../src/utils/redis', () => ({
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
  isRedisAvailable: jest.fn(() => false),
  getRedis: jest.fn(),
  cache: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  },
  session: {
    save: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  },
  rateLimit: {
    check: jest.fn(),
    reset: jest.fn(),
  },
  notifications: {
    publish: jest.fn(),
    subscribe: jest.fn(),
  },
}));

// Mock do email
jest.mock('../src/utils/email', () => ({
  sendEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendTransactionNotification: jest.fn(),
  sendCardNotification: jest.fn(),
  sendCardApprovedEmail: jest.fn(() => Promise.resolve({ success: true })),
  sendLoanApprovedBlockedEmail: jest.fn(() => Promise.resolve({ success: true })),
  testEmailConfiguration: jest.fn(() => Promise.resolve(true)),
}));

// Mock do bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn((password, saltRounds) => Promise.resolve(`hashed_${password}`)),
  compare: jest.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`)),
}));

// Mock do jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload, secret, options) => 'mock-jwt-token'),
  verify: jest.fn((token, secret) => ({ userId: 'test-user-id' })),
}));

// Configurações globais para testes
global.testUser = {
  id: 'test-user-id',
  nomeCompleto: 'Usuário Teste',
  email: 'teste@agilbank.com',
  cpf: '12345678901',
  telefone: '(11) 99999-9999',
  dataNascimento: new Date('1990-01-01'),
  saldoAtual: 1000,
  limiteCartao: 5000,
  limitePixDiario: 1000,
  limitePixMensal: 10000,
  scoreCredito: 750,
  numeroConta: '123456',
  digitoConta: '7',
  agencia: '0001',
  isAtivo: true,
  isVerificado: true,
  identityReviewStatus: 'NONE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

global.testToken = 'mock-jwt-token';

// resetMocks limpa implementações; restaurar JWT usado em login/refresh
beforeEach(() => {
  const jwt = require('jsonwebtoken');
  jwt.sign.mockImplementation(() => 'mock-jwt-token');
  jwt.verify.mockImplementation(() => ({ userId: 'test-user-id' }));
});

afterEach(() => {
  jest.clearAllMocks();
});

// Configurar timeout para testes
jest.setTimeout(10000);
