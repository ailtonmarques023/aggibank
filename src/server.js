const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const logger = require('./utils/logger');
// const { connectRedis } = require('./utils/redis'); // Temporariamente desabilitado
const { connectDatabase, prisma } = require('./config/database');

// Importar rotas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const cardRoutes = require('./routes/cards');
const loanRoutes = require('./routes/loans');
const adminLoanRoutes = require('./routes/adminLoans');
const internalCreditLoanRoutes = require('./routes/internalCreditLoans');
const internalShipmentRoutes = require('./routes/internalShipments');
const internalOpsCreditRoutes = require('./routes/internalOpsCredit');
const internalEfiPixRoutes = require('./routes/internalEfiPix');
const pixRoutes = require('./routes/pix');
const boletoRoutes = require('./routes/boletos');
const notificationRoutes = require('./routes/notifications');
const paymentRoutes = require('./routes/payments');
const chargeRoutes = require('./routes/charges');
const depositRoutes = require('./routes/deposits');
const transferRoutes = require('./routes/transfers');
const emailRoutes = require('./routes/email');
const referralRoutes = require('./routes/referrals');
const meKycRoutes = require('./routes/meKyc');
const internalKycRoutes = require('./routes/internalKyc');
const onboardingRoutes = require('./routes/onboarding');
const { requireInternalApiKey } = require('./middleware/auth');
const { connectRedis, disconnectRedis, isRedisAvailable, getRedis, getRedisHealthSummary } = require('./utils/redis');
const { sanitizeUrlForAccessLog } = require('./utils/logSanitizer');
const { parseCookieHeader } = require('./utils/parseCookieHeader');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const hasRedisUrl = !!(process.env.REDIS_URL && String(process.env.REDIS_URL).trim());
const isProduction = process.env.NODE_ENV === 'production';

const { parseAllowedCorsOrigins, isCorsAllowedOrigin } = require('./utils/corsOrigins');

// CORS antes de helmet e antes de rate limit nas rotas /api/*
// Origens recalculadas por requisição para refletir env após deploy/alteração de variáveis.
app.use(cors({
  origin(origin, callback) {
    if (!isProduction) return callback(null, true);
    const allowedCorsOrigins = parseAllowedCorsOrigins();
    if (isCorsAllowedOrigin(origin, allowedCorsOrigins)) return callback(null, true);
    logger.warn('CORS origin não permitido', {
      category: 'contract_error',
      component: 'cors',
      origin: origin || null,
    });
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cookie',
    'x-request-id',
    'x-internal-key',
    'x-onboarding-token',
    'Idempotency-Key',
  ],
  optionsSuccessStatus: 204,
}));

// Middleware de segurança (após CORS para preflight não competir com CSP aplicada só às camadas seguintes)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limite de requests por IP
  message: {
    error: 'Muitas requisições deste IP, tente novamente em alguns minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});

app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS' || process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Muitas tentativas de autenticação. Tente novamente em alguns minutos.',
    code: 'AUTH_RATE_LIMITED',
    category: 'operational_error',
  },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/refresh', authLimiter);

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, _res, next) => {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
});

// Compressão
app.use(compression());

// Correlacao de requests para observabilidade operacional
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = String(requestId);
  res.setHeader('x-request-id', req.requestId);
  next();
});

const operationalMetrics = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  byStatusGroup: { '2xx': 0, '4xx': 0, '5xx': 0, other: 0 },
  auth: { failures: 0, refreshFailures: 0 },
  readiness: { degradedCount: 0, lastState: 'unknown', lastLatencyMs: null, lastError: null },
};

async function incrOperationalMetricRedis(metricKey) {
  if (!isRedisAvailable()) return;
  try {
    const redis = getRedis();
    const namespaced = `ops:metrics:${metricKey}`;
    const current = await redis.incr(namespaced);
    if (current === 1) {
      const ttl = parseInt(process.env.OPS_METRICS_TTL_SECONDS, 10) || 24 * 60 * 60;
      await redis.expire(namespaced, ttl);
    }
  } catch (error) {
    logger.warn('Falha ao atualizar metrica no Redis', {
      category: 'operational_error',
      component: 'ops_metrics',
      metricKey,
      error: error && error.message ? error.message : String(error || ''),
    });
  }
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    operationalMetrics.requestsTotal += 1;
    const code = res.statusCode;
    if (code >= 200 && code < 300) operationalMetrics.byStatusGroup['2xx'] += 1;
    else if (code >= 400 && code < 500) operationalMetrics.byStatusGroup['4xx'] += 1;
    else if (code >= 500) operationalMetrics.byStatusGroup['5xx'] += 1;
    else operationalMetrics.byStatusGroup.other += 1;

    const routePath = req.originalUrl || req.path || '';
    if (routePath.includes('/api/auth/login') && code === 401) {
      operationalMetrics.auth.failures += 1;
      void incrOperationalMetricRedis('auth:failures');
    }
    if (routePath.includes('/api/auth/refresh') && code === 401) {
      operationalMetrics.auth.refreshFailures += 1;
      void incrOperationalMetricRedis('auth:refresh_failures');
    }
    if (code >= 500) {
      void incrOperationalMetricRedis('http:errors_5xx');
    }

    logger.debug({
      requestId: req.requestId,
      category: 'operational_metric',
      method: req.method,
      path: req.path,
      statusCode: code,
      durationMs: Date.now() - startedAt,
    }, 'Request metric');
  });
  next();
});

// Logging (simplificado)
morgan.token('request-id', (req) => req.requestId || '-');
morgan.token('safe-url', (req) => sanitizeUrlForAccessLog(req.originalUrl || req.url || req.path || '/'));
app.use(morgan(':method :safe-url :status :response-time ms reqId=:request-id'));

async function runDatabaseReadinessProbe() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Prova transacional minima para validar ciclo begin/commit no banco alvo.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
    });

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      mode: 'healthy',
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      mode: 'degraded',
      error: error && error.message ? error.message : 'database_unavailable',
    };
  }
}

// Health check (liveness + visão agregada do Redis sem segredos)
app.get('/api/health', (req, res) => {
  const redisHealth = getRedisHealthSummary();
  res.json({
    status: 'healthy',
    mode: 'liveness',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    redis: redisHealth,
  });
});

// Readiness check (dependencias reais)
app.get('/api/readiness', async (req, res) => {
  const db = await runDatabaseReadinessProbe();
  const status = db.ok ? 'ready' : 'degraded';
  const payload = {
    status,
    mode: 'readiness',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    dependencies: {
      database: {
        status: db.mode,
        latencyMs: db.latencyMs,
        ...(db.ok ? {} : { error: db.error }),
      },
    },
  };

  if (!db.ok) {
    operationalMetrics.readiness.degradedCount += 1;
    operationalMetrics.readiness.lastState = 'degraded';
    operationalMetrics.readiness.lastLatencyMs = db.latencyMs;
    operationalMetrics.readiness.lastError = db.error;
    void incrOperationalMetricRedis('readiness:degraded');
    logger.warn('Readiness degradado: banco indisponível', {
      component: 'database',
      latencyMs: db.latencyMs,
      error: db.error,
    });
    return res.status(503).json(payload);
  }

  operationalMetrics.readiness.lastState = 'ready';
  operationalMetrics.readiness.lastLatencyMs = db.latencyMs;
  operationalMetrics.readiness.lastError = null;

  return res.status(200).json(payload);
});

app.get('/api/ops/metrics', requireInternalApiKey('OPS_METRICS_INTERNAL_KEY'), (req, res) => {
  const base = {
    ...operationalMetrics,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    redis: {
      configured: hasRedisUrl,
      available: isRedisAvailable(),
      fallback: !isRedisAvailable(),
      connectivity: getRedisHealthSummary(),
    },
  };

  /** Sem Redis configurado — apenas métricas em processo (comportamento legado). */
  if (!hasRedisUrl) {
    return res.status(200).json({
      success: true,
      category: 'operational_metric',
      data: base,
    });
  }

  /** Redis obrigatório para contadores distribuídos: degrade explícito. */
  if (!isRedisAvailable()) {
    return res.status(503).json({
      success: false,
      category: 'operational_error',
      code: 'REDIS_UNAVAILABLE',
      message: 'Métricas distribuídas temporariamente indisponíveis (Redis).',
      data: base,
    });
  }

  let redisInst;
  try {
    redisInst = getRedis();
  } catch (syncErr) {
    return res.status(503).json({
      success: false,
      category: 'operational_error',
      code: 'REDIS_UNAVAILABLE',
      message: 'Métricas distribuídas temporariamente indisponíveis (Redis).',
      data: base,
    });
  }

  return redisInst.mget(
    'ops:metrics:auth:failures',
    'ops:metrics:auth:refresh_failures',
    'ops:metrics:http:errors_5xx',
    'ops:metrics:readiness:degraded',
  ).then((vals) => {
    return res.status(200).json({
      success: true,
      category: 'operational_metric',
      data: {
        ...base,
        distributed: {
          authFailures: parseInt(vals[0] || '0', 10) || 0,
          authRefreshFailures: parseInt(vals[1] || '0', 10) || 0,
          http5xx: parseInt(vals[2] || '0', 10) || 0,
          readinessDegraded: parseInt(vals[3] || '0', 10) || 0,
        },
      },
    });
  }).catch((error) => {
    logger.warn('Falha ao ler metricas distribuidas no Redis', {
      category: 'operational_error',
      component: 'ops_metrics',
      error: error && error.message ? error.message : String(error || ''),
    });
    return res.status(503).json({
      success: false,
      category: 'operational_error',
      code: 'REDIS_UNAVAILABLE',
      message: 'Métricas distribuídas temporariamente indisponíveis (Redis).',
      data: base,
    });
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/usuarios', userRoutes); // Alias para compatibilidade com frontend
app.use('/api/cards', cardRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/internal/credit/loans', internalCreditLoanRoutes);
app.use('/api/internal/shipments', internalShipmentRoutes);
app.use('/api/internal/ops', internalOpsCreditRoutes);
app.use('/api/internal/efi/pix', internalEfiPixRoutes);
app.use('/api/admin/loans', adminLoanRoutes);
app.use('/api/pix', pixRoutes);
app.use('/api/boletos', boletoRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/charges', chargeRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/me', meKycRoutes);
app.use('/api/internal/kyc', internalKycRoutes);

// Documentação Swagger
if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./config/swagger');
  
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'AgilBank API Documentation'
  }));
}

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  logger.error(new Error(err.message || 'Unhandled error'), {
    requestId: req.requestId,
    category: 'operational_error',
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message,
    code: err.code || 'INTERNAL_ERROR',
    category: err.category || 'operational_error',
    requestId: req.requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint não encontrado',
    code: 'ENDPOINT_NOT_FOUND',
    category: 'contract_error',
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method
  });
});

// Inicialização do servidor
async function startServer() {
  try {
    // Em testes (supertest) não escutar porta — evita EADDRINUSE ao importar `server` em vários ficheiros.
    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, HOST, () => {
        console.log(`🚀 Servidor AgilBank iniciado na porta ${PORT}`);
        console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📚 Documentação: http://${HOST}:${PORT}/api/docs`);
        console.log(`🔍 Health Check: http://${HOST}:${PORT}/api/health`);
      });
    }

    // Conectar ao banco de dados (opcional)
    try {
      await connectDatabase();
      console.log('✅ Conexão com banco de dados estabelecida');
    } catch (dbError) {
      console.warn('⚠️ Banco de dados não disponível, continuando sem banco:', dbError.message);
    }

    // Redis e opcional; falhas de conexao nao abortam o bootstrap — a aplicacao degrada graciosamente.
    if (hasRedisUrl) {
      try {
        await connectRedis();
        logger.info('Redis habilitado para hardening distribuido', {
          category: 'operational_metric',
          component: 'redis',
        });
      } catch (redisError) {
        logger.warn('Redis indisponivel; iniciando sem cache distribuido', {
          category: 'operational_error',
          component: 'redis',
          reason: isProduction ? 'redis_connect_failed_production' : 'redis_connect_failed',
          error: redisError && redisError.message ? redisError.message : String(redisError || ''),
        });
      }
    } else if (isProduction) {
      logger.warn('REDIS_URL ausente em producao; iniciando sem cache distribuido', {
        category: 'operational_error',
        component: 'redis',
        reason: 'redis_not_configured_production',
      });
    } else {
      logger.warn('REDIS_URL ausente; fallback seguro em memoria ativo', {
        category: 'operational_error',
        component: 'redis',
        reason: 'redis_not_configured',
      });
    }

  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
// Graceful shutdown: encerra cliente Redis antes de sair (evita `beforeExit`/loops async no processo Node).
process.on('SIGTERM', () => {
  logger.info({
    category: 'operational_metric',
    component: 'process',
    signal: 'SIGTERM',
  }, 'Recebido SIGTERM, encerrando servidor');
  disconnectRedis().catch(() => {}).finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  logger.info({
    category: 'operational_metric',
    component: 'process',
    signal: 'SIGINT',
  }, 'Recebido SIGINT, encerrando servidor');
  disconnectRedis().catch(() => {}).finally(() => process.exit(0));
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  logger.fatal({
    category: 'operational_error',
    event: 'uncaught_exception',
    error: error && error.message ? error.message : String(error || ''),
    stack: error && error.stack ? error.stack : null,
  }, 'Erro não capturado');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({
    category: 'operational_error',
    event: 'unhandled_rejection',
    reason: reason && reason.message ? reason.message : String(reason || ''),
  }, 'Promise rejeitada não tratada');
  process.exit(1);
});

startServer();

module.exports = app;
