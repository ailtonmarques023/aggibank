const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

// Configuração do Prisma Client
const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Event listeners para monitoramento (simplificado)
prisma.$on('error', (e) => {
  logger.warn({
    category: 'operational_error',
    component: 'prisma',
    event: 'prisma_error',
    error: e,
  }, 'Erro do Prisma');
});

prisma.$on('warn', (e) => {
  logger.warn({
    category: 'operational_error',
    component: 'prisma',
    event: 'prisma_warn',
    details: e,
  }, 'Warning do Prisma');
});

// Função para conectar ao banco de dados
const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Conexão com banco de dados estabelecida via Prisma');
    
    // Testar conexão
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Teste de conexão com banco de dados bem-sucedido');
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com banco de dados:', error);
    throw error;
  }
};

// Função para desconectar do banco de dados
const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect();
    logger.info('✅ Desconectado do banco de dados');
  } catch (error) {
    logger.error('❌ Erro ao desconectar do banco de dados:', error);
    throw error;
  }
};

// Função para executar transações
const transaction = async (callback) => {
  try {
    return await prisma.$transaction(callback);
  } catch (error) {
    logger.error('Erro na transação:', error);
    throw error;
  }
};

// Função para executar queries raw quando necessário
const queryRaw = async (query, params = []) => {
  try {
    const result = await prisma.$queryRawUnsafe(query, ...params);
    return result;
  } catch (error) {
    logger.error('Erro na query raw:', { query, error: error.message });
    throw error;
  }
};

// Função para verificar saúde do banco
const healthCheck = async () => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW() as timestamp, version() as version`;
    return {
      status: 'healthy',
      timestamp: result[0].timestamp,
      version: result[0].version,
    };
  } catch (error) {
    logger.error('Health check do banco falhou:', error);
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
};

// Função para limpar dados de teste (apenas em desenvolvimento)
const cleanTestData = async () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Limpeza de dados de teste só é permitida em desenvolvimento');
  }

  try {
    await prisma.$transaction([
      prisma.auditLog.deleteMany(),
      prisma.token.deleteMany(),
      prisma.pagamento.deleteMany(),
      prisma.boleto.deleteMany(),
      prisma.chavePix.deleteMany(),
      prisma.transacaoPix.deleteMany(),
      prisma.notificacao.deleteMany(),
      prisma.movimentacao.deleteMany(),
      prisma.emprestimo.deleteMany(),
      prisma.cartao.deleteMany(),
      prisma.configuracoesUsuario.deleteMany(),
      prisma.dadosProfissionais.deleteMany(),
      prisma.endereco.deleteMany(),
      prisma.user.deleteMany(),
    ]);
    
    logger.info('✅ Dados de teste limpos com sucesso');
  } catch (error) {
    logger.error('❌ Erro ao limpar dados de teste:', error);
    throw error;
  }
};

// Graceful shutdown sem loop recursivo no beforeExit
let isDisconnecting = false;
const safeDisconnectDatabase = async () => {
  if (isDisconnecting) return;
  isDisconnecting = true;
  try {
    await disconnectDatabase();
  } catch (error) {
    logger.error('Erro no safe disconnect do banco de dados:', error);
  } finally {
    isDisconnecting = false;
  }
};

process.on('SIGINT', async () => {
  await safeDisconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await safeDisconnectDatabase();
  process.exit(0);
});

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
  transaction,
  queryRaw,
  healthCheck,
  cleanTestData,
};
