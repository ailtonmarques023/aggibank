const pino = require('pino');

// Configuração do logger baseada no ambiente
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Configuração base do logger
const loggerConfig = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
};

// Em desenvolvimento, usar pretty print (se disponível)
if (isDevelopment && process.env.USE_PRETTY_LOGGER === 'true') {
  loggerConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '[{time}] {level}: {msg}',
      errorLikeObjectKeys: ['err', 'error'],
    },
  };
}

// Em produção, adicionar configurações específicas
if (isProduction) {
  loggerConfig.redact = {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'senha', 'token'],
    censor: '[REDACTED]',
  };
}

// Criar instância do logger
const logger = pino(loggerConfig);

// Funções auxiliares para diferentes níveis de log
const loggers = {
  // Log de requisições HTTP
  request: (req, res, responseTime) => {
    logger.info({
      type: 'http_request',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    }, `${req.method} ${req.url} - ${res.statusCode}`);
  },

  // Log de erros
  error: (error, context = {}) => {
    logger.error({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context,
    }, `Erro: ${error.message}`);
  },

  // Log de operações bancárias
  banking: (operation, userId, details = {}) => {
    logger.info({
      type: 'banking_operation',
      operation,
      userId,
      details,
      timestamp: new Date().toISOString(),
    }, `Operação bancária: ${operation} - Usuário: ${userId}`);
  },

  // Log de segurança
  security: (event, details = {}) => {
    logger.warn({
      type: 'security_event',
      event,
      details,
      timestamp: new Date().toISOString(),
    }, `Evento de segurança: ${event}`);
  },

  // Log de performance
  performance: (operation, duration, details = {}) => {
    logger.info({
      type: 'performance',
      operation,
      duration: `${duration}ms`,
      details,
    }, `Performance: ${operation} - ${duration}ms`);
  },

  // Log de auditoria
  audit: (action, userId, resource, details = {}) => {
    logger.info({
      type: 'audit',
      action,
      userId,
      resource,
      details,
      timestamp: new Date().toISOString(),
    }, `Auditoria: ${action} - Usuário: ${userId} - Recurso: ${resource}`);
  },
};

// Middleware para log de requisições
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    loggers.request(req, res, duration);
  });
  
  next();
};

// Função para log de erros não capturados
const logUncaughtError = (error, context = {}) => {
  loggers.error(error, {
    ...context,
    uncaught: true,
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
};

// Função para log de operações críticas do banco
const logCriticalOperation = (operation, userId, amount, details = {}) => {
  logger.warn({
    type: 'critical_banking_operation',
    operation,
    userId,
    amount,
    details,
    timestamp: new Date().toISOString(),
  }, `Operação crítica: ${operation} - Usuário: ${userId} - Valor: R$ ${amount}`);
};

module.exports = {
  ...logger,
  ...loggers,
  requestLogger,
  logUncaughtError,
  logCriticalOperation,
};
