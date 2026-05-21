const Redis = require('ioredis');
const logger = require('./logger');

const redisLog = logger.child({ component: 'redis' });

let redis = null;
let connectInFlight = null;

const hasConfiguredRedisUrl = () =>
  !!(process.env.REDIS_URL && String(process.env.REDIS_URL).trim());

function sanitizeRedisLogFields(err) {
  if (!err) {
    return { message: 'unknown_error', code: null, errno: null };
  }

  try {
    const rawMsg = String(err.message || err);
    /** Nunca logar URL completa, host interno Railway ou parte de URI com credencial. */
    const safeMsg = rawMsg
      .replace(/redis:\/\/[^\s'"]+/gi, '[redis-uri]')
      .replace(/redis:[/][/][^\s'"]+/gi, '[redis-uri]')
      .replace(/\b[^\s:/@]+\.(railway|up\.railway)\.[a-z.]+(?::\d+)?\b/gi, '[redis-host]')
      .slice(0, 500);

    return {
      message: safeMsg,
      code: err.code ? String(err.code) : null,
      errno: err.errno !== undefined ? err.errno : null,
      name: err.name ? String(err.name) : null,
    };
  } catch (_) {
    return { message: 'sanitize_failed', code: null, errno: null };
  }
}

function redisRetryDelayMs(times) {
  const tRaw = Number(times);
  /** ioredis: times começa em 1 para a primeira retentativa. */
  const t = Number.isFinite(tRaw) ? Math.floor(tRaw) : 1;
  const expo = Math.max(0, t - 1);
  /** 200 ms → até 60 s com backoff + jitter modesto */
  const base = Math.min(200 * Math.pow(2, Math.min(expo, 14)), 60000);
  const jitter = expo > 0 ? Math.floor(Math.random() * Math.min(base, 1000)) : 0;
  return Math.min(base + jitter, 60000);
}

function buildRedisOptions() {
  const connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '30000', 10) || 30000;

  return {
    /** Railway private network (redis.railway.internal): dual-stack IPv4/IPv6. */
    family: 0,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '20', 10) || 20,
    connectTimeout,
    keepAlive: 30000,
    /** Reconnect em quedas transientes (ECONNRESET, etc.). */
    retryStrategy: (attempts) => redisRetryDelayMs(attempts),
    reconnectOnError(err) {
      const code = String(err.code || '').toUpperCase();
      const msg = String(err.message || '');
      if (
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        code === 'EPIPE' ||
        code === 'READONLY'
      ) {
        return true;
      }
      if (/READONLY|ECONNRESET|ETIMEDOUT|broken pipe|EPIPE/i.test(msg)) {
        return true;
      }
      return false;
    },
  };
}



function withTimeout(promise, ms, label) {
  const timeoutMs = Math.max(100, ms);
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(new Error(`redis_${label}_timeout_${timeoutMs}`), {
          code: 'REDIS_TIMEOUT',
        }),
      );
    }, timeoutMs);
  });
  const wrapped = promise.finally(() => {
    if (timer) clearTimeout(timer);
  });
  return Promise.race([wrapped, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

function attachRuntimeListeners(instance) {
  instance.on('connect', () => {
    redisLog.info('Socket TCP do Redis estabelecido');
  });

  instance.on('ready', () => {
    redisLog.info({ ioredisStatus: instance.status }, 'Redis disponível para comandos');
  });

  instance.on('error', (err) => {
    const sanitized = sanitizeRedisLogFields(err);
    redisLog.warn(
      Object.assign({}, sanitized, { ioredisStatus: instance.status }),
      'Erro no Redis',
    );
  });

  instance.on('close', () => {
    redisLog.warn({ ioredisStatus: instance.status }, 'Conexão com Redis fechada');
  });

  /** ioredis v5 emits `end`. Mesma mensagem agregada de fechamento. */
  instance.on('end', () => {
    redisLog.warn({ ioredisStatus: instance.status }, 'Conexão com Redis fechada');
  });

  /** delay em ms até a próxima tentativa quando aplicável */
  instance.on('reconnecting', (delay) => {
    redisLog.warn(
      { delayMs: delay !== undefined ? delay : null, ioredisStatus: instance.status },
      'Redis em reconexão',
    );
  });
}

async function destroyClientSilently() {
  const c = redis;
  redis = null;
  if (!c) return;
  try {
    c.removeAllListeners();
  } catch (_) {
    /* ignore */
  }
  try {
    await c.quit();
  } catch (_) {
    try {
      c.disconnect();
    } catch (__) {
      /* ignore */
    }
  }
}

async function bootstrapClient(instance) {
  const connectBudget = parseInt(process.env.REDIS_BOOT_CONNECT_MS || '45000', 10) || 45000;
  const pingBudget = parseInt(process.env.REDIS_BOOT_PING_MS || '30000', 10) || 30000;

  await withTimeout(instance.connect(), connectBudget, 'connect');
  await withTimeout(instance.ping(), pingBudget, 'ping');
  redisLog.info('Ping inicial do Redis concluído com sucesso');
}

/**
 * Produção deve abortar apenas se esse ping inicial falhar (Railway/redis indisponível no boot).
 * Quedas após ready são tratadas com reconexão automática pelo ioredis — sem encerrar o processo.
 */
async function connectRedisInternal() {
  if (!hasConfiguredRedisUrl()) {
    if (redis) await destroyClientSilently();
    return null;
  }

  if (redis && redis.status === 'ready') {
    return redis;
  }

  if (redis) {
    await destroyClientSilently();
  }

  const common = buildRedisOptions();
  const url = String(process.env.REDIS_URL || '').trim();
  if (!url) {
    await destroyClientSilently();
    return null;
  }

  redis = new Redis(url, common);

  attachRuntimeListeners(redis);

  await bootstrapClient(redis).catch(async (err) => {
    const sanitized = sanitizeRedisLogFields(err);
    redisLog.error(sanitized, 'Falha no bootstrap do Redis');
    await destroyClientSilently();
    throw err;
  });

  return redis;
}

const connectRedis = async () => {
  const url = String(process.env.REDIS_URL || '').trim();
  if (!url) {
    return null;
  }
  if (redis && redis.status === 'ready') {
    return redis;
  }

  if (connectInFlight) {
    return connectInFlight;
  }

  connectInFlight = (async () => {
    try {
      return await connectRedisInternal();
    } finally {
      connectInFlight = null;
    }
  })();

  return connectInFlight;
};

const disconnectRedis = async () => {
  if (!redis) return;
  redisLog.info('Disconnect Redis solicitado');
  await destroyClientSilently();
};

const isRedisAvailable = () => !!(redis && redis.status === 'ready');

const getRedis = () => {
  if (!redis || redis.status !== 'ready') {
    const err = new Error('Redis não está disponível');
    err.code = 'REDIS_UNAVAILABLE';
    throw err;
  }
  return redis;
};

/**
 * Estado agregado para health checks (sem credenciais e sem REDIS_URL).
 * `status`: connected | reconnecting | disconnected | not_configured
 */
function getRedisHealthSummary() {
  const configured = hasConfiguredRedisUrl();
  if (!configured) {
    return { configured: false, status: 'not_configured' };
  }

  if (!redis) {
    return { configured: true, status: 'disconnected' };
  }

  const s = redis.status;
  if (s === 'ready') {
    return { configured: true, status: 'connected' };
  }
  /** Conectando / reconectando são expostos como reconnecting */
  if (s === 'reconnecting' || s === 'connect' || s === 'wait') {
    return { configured: true, status: 'reconnecting' };
  }
  return { configured: true, status: 'disconnected' };
}

const cache = {
  set: async (key, value, ttl = 3600) => {
    if (!isRedisAvailable()) {
      redisLog.warn('Redis indisponível; operação cache.set ignorada');
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      await redis.setex(key, ttl, serializedValue);
      redisLog.debug(`Cache definido: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao definir cache');
      return false;
    }
  },

  get: async (key) => {
    if (!isRedisAvailable()) {
      return null;
    }

    try {
      const value = await redis.get(key);
      if (value) {
        redisLog.debug(`Cache encontrado: ${key}`);
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao obter cache');
      return null;
    }
  },

  del: async (key) => {
    if (!isRedisAvailable()) {
      return false;
    }

    try {
      await redis.del(key);
      redisLog.debug(`Cache removido: ${key}`);
      return true;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao remover cache');
      return false;
    }
  },

  exists: async (key) => {
    if (!isRedisAvailable()) {
      return false;
    }

    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao verificar existência no cache');
      return false;
    }
  },

  expire: async (key, ttl) => {
    if (!isRedisAvailable()) {
      return false;
    }

    try {
      await redis.expire(key, ttl);
      return true;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao definir TTL no cache');
      return false;
    }
  },

  ttl: async (key) => {
    if (!isRedisAvailable()) {
      return -1;
    }

    try {
      return await redis.ttl(key);
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao obter TTL do cache');
      return -1;
    }
  },
};

const session = {
  save: async (sessionId, data, ttl = 86400) => {
    return await cache.set(`session:${sessionId}`, data, ttl);
  },

  get: async (sessionId) => {
    return await cache.get(`session:${sessionId}`);
  },

  delete: async (sessionId) => {
    return await cache.del(`session:${sessionId}`);
  },

  exists: async (sessionId) => {
    return await cache.exists(`session:${sessionId}`);
  },
};

const rateLimit = {
  check: async (key, limit, window) => {
    if (!isRedisAvailable()) {
      return { allowed: true, remaining: limit };
    }

    try {
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, window);
      }

      const remaining = Math.max(0, limit - current);
      const allowed = current <= limit;

      return { allowed, remaining, current };
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao verificar rate limit');
      return { allowed: true, remaining: limit };
    }
  },

  reset: async (key) => {
    if (!isRedisAvailable()) {
      return false;
    }

    try {
      await redis.del(key);
      return true;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao resetar rate limit');
      return false;
    }
  },
};

const notifications = {
  publish: async (channel, message) => {
    if (!isRedisAvailable()) {
      return false;
    }

    try {
      await redis.publish(channel, JSON.stringify(message));
      redisLog.debug(`Notificação publicada no canal: ${channel}`);
      return true;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao publicar notificação');
      return false;
    }
  },

  subscribe: (channel, callback) => {
    if (!isRedisAvailable()) {
      return null;
    }

    try {
      const subscriber = redis.duplicate();
      subscriber.subscribe(channel);

      subscriber.on('message', (ch, incoming) => {
        try {
          const data = JSON.parse(incoming);
          callback(data);
        } catch (error) {
          redisLog.error(sanitizeRedisLogFields(error), 'Erro ao processar mensagem do Redis');
        }
      });

      return subscriber;
    } catch (error) {
      redisLog.error(sanitizeRedisLogFields(error), 'Erro ao subscrever canal');
      return null;
    }
  },
};

module.exports = {
  connectRedis,
  disconnectRedis,
  isRedisAvailable,
  getRedis,
  getRedisHealthSummary,
  cache,
  session,
  rateLimit,
  notifications,
};
