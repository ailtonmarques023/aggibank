const Redis = require('ioredis');

let redis = null;

// Configuração do Redis
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnClusterDown: 300,
  enableOfflineQueue: false,
  maxLoadingTimeout: 5000,
  retryStrategy: () => null,
};

// Função para conectar ao Redis
const connectRedis = async () => {
  try {
    if (process.env.REDIS_URL) {
      redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        retryStrategy: () => null,
      });
    } else {
      redis = new Redis(redisConfig);
    }
    
    // Event listeners
    redis.on('connect', () => {
      console.log('✅ Conectado ao Redis');
    });
    
    redis.on('ready', () => {
      console.log('✅ Redis pronto para uso');
    });
    
    redis.on('error', (error) => {
      console.error('❌ Erro no Redis:', error);
    });
    
    redis.on('close', () => {
      console.warn('⚠️ Conexão com Redis fechada');
    });
    
    redis.on('reconnecting', () => {
      console.log('🔄 Reconectando ao Redis...');
    });
    
    // Testar conexão
    await redis.ping();
    console.log('✅ Teste de conexão com Redis bem-sucedido');
    
    return redis;
  } catch (error) {
    console.error('❌ Erro ao conectar com Redis:', error);
    if (redis) {
      try {
        redis.disconnect();
      } catch (_) {}
      redis = null;
    }
    throw error;
  }
};

// Função para desconectar do Redis
const disconnectRedis = async () => {
  if (redis) {
    try {
      await redis.quit();
      console.log('✅ Desconectado do Redis');
    } catch (error) {
      console.error('❌ Erro ao desconectar do Redis:', error);
    }
  }
};

// Função para verificar se Redis está disponível
const isRedisAvailable = () => {
  return !!(redis && redis.status === 'ready');
};

// Função para obter instância do Redis
const getRedis = () => {
  if (!redis || redis.status !== 'ready') {
    throw new Error('Redis não está disponível');
  }
  return redis;
};

// Funções auxiliares para cache
const cache = {
  // Definir valor no cache
  set: async (key, value, ttl = 3600) => {
    if (!isRedisAvailable()) {
      console.warn('Redis não disponível, pulando cache');
      return false;
    }
    
    try {
      const serializedValue = JSON.stringify(value);
      await redis.setex(key, ttl, serializedValue);
      console.debug(`Cache definido: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      console.error('Erro ao definir cache:', error);
      return false;
    }
  },
  
  // Obter valor do cache
  get: async (key) => {
    if (!isRedisAvailable()) {
      return null;
    }
    
    try {
      const value = await redis.get(key);
      if (value) {
        console.debug(`Cache encontrado: ${key}`);
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      console.error('Erro ao obter cache:', error);
      return null;
    }
  },
  
  // Deletar valor do cache
  del: async (key) => {
    if (!isRedisAvailable()) {
      return false;
    }
    
    try {
      await redis.del(key);
      console.debug(`Cache removido: ${key}`);
      return true;
    } catch (error) {
      console.error('Erro ao remover cache:', error);
      return false;
    }
  },
  
  // Verificar se chave existe
  exists: async (key) => {
    if (!isRedisAvailable()) {
      return false;
    }
    
    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Erro ao verificar existência no cache:', error);
      return false;
    }
  },
  
  // Definir TTL para uma chave
  expire: async (key, ttl) => {
    if (!isRedisAvailable()) {
      return false;
    }
    
    try {
      await redis.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('Erro ao definir TTL no cache:', error);
      return false;
    }
  },
  
  // Obter TTL de uma chave
  ttl: async (key) => {
    if (!isRedisAvailable()) {
      return -1;
    }
    
    try {
      return await redis.ttl(key);
    } catch (error) {
      console.error('Erro ao obter TTL do cache:', error);
      return -1;
    }
  },
};

// Funções específicas para sessões
const session = {
  // Salvar sessão
  save: async (sessionId, data, ttl = 86400) => { // 24 horas
    return await cache.set(`session:${sessionId}`, data, ttl);
  },
  
  // Obter sessão
  get: async (sessionId) => {
    return await cache.get(`session:${sessionId}`);
  },
  
  // Deletar sessão
  delete: async (sessionId) => {
    return await cache.del(`session:${sessionId}`);
  },
  
  // Verificar se sessão existe
  exists: async (sessionId) => {
    return await cache.exists(`session:${sessionId}`);
  },
};

// Funções específicas para rate limiting
const rateLimit = {
  // Verificar rate limit
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
      console.error('Erro ao verificar rate limit:', error);
      return { allowed: true, remaining: limit };
    }
  },
  
  // Resetar rate limit
  reset: async (key) => {
    if (!isRedisAvailable()) {
      return false;
    }
    
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Erro ao resetar rate limit:', error);
      return false;
    }
  },
};

// Funções específicas para notificações em tempo real
const notifications = {
  // Publicar notificação
  publish: async (channel, message) => {
    if (!isRedisAvailable()) {
      return false;
    }
    
    try {
      await redis.publish(channel, JSON.stringify(message));
      console.debug(`Notificação publicada no canal: ${channel}`);
      return true;
    } catch (error) {
      console.error('Erro ao publicar notificação:', error);
      return false;
    }
  },
  
  // Subscrever a canal
  subscribe: (channel, callback) => {
    if (!isRedisAvailable()) {
      return null;
    }
    
    try {
      const subscriber = redis.duplicate();
      subscriber.subscribe(channel);
      
      subscriber.on('message', (ch, message) => {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          console.error('Erro ao processar mensagem do Redis:', error);
        }
      });
      
      return subscriber;
    } catch (error) {
      console.error('Erro ao subscrever canal:', error);
      return null;
    }
  },
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectRedis();
});

process.on('SIGINT', async () => {
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectRedis();
  process.exit(0);
});

module.exports = {
  connectRedis,
  disconnectRedis,
  isRedisAvailable,
  getRedis,
  cache,
  session,
  rateLimit,
  notifications,
};
