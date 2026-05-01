const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

/** HMAC-SHA256 do refresh token; nunca persistir o token em claro. */
const hashRefreshToken = (refreshToken) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', secret).update(refreshToken).digest('hex');
};

// Middleware para verificar token JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de acesso necessário',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuário no banco
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        cpf: true,
        telefone: true,
        dataNascimento: true,
        saldoAtual: true,
        limiteCartao: true,
        limitePixDiario: true,
        limitePixMensal: true,
        scoreCredito: true,
        numeroConta: true,
        digitoConta: true,
        agencia: true,
        isAtivo: true,
        isVerificado: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isAtivo) {
      return res.status(401).json({
        success: false,
        message: 'Conta desativada',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Adicionar usuário ao request
    req.user = user;
    next();

  } catch (error) {
    logger.error('Erro na autenticação:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware para verificar se usuário está verificado
const requireVerification = (req, res, next) => {
  if (!req.user.isVerificado) {
    return res.status(403).json({
      success: false,
      message: 'Conta não verificada. Verifique seu email para continuar.',
      code: 'ACCOUNT_NOT_VERIFIED'
    });
  }
  next();
};

// Middleware para verificar permissões específicas
const requirePermission = (permission) => {
  return (req, res, next) => {
    // Aqui você pode implementar lógica de permissões baseada em roles
    // Por enquanto, todos os usuários autenticados têm as mesmas permissões
    next();
  };
};

// Middleware para verificar se é o próprio usuário ou admin
const requireOwnershipOrAdmin = (req, res, next) => {
  const userId = req.params.userId || req.params.id;
  
  if (req.user.id === userId) {
    return next();
  }
  
  // Aqui você pode verificar se é admin
  // Por enquanto, apenas o próprio usuário pode acessar seus dados
  return res.status(403).json({
    success: false,
    message: 'Acesso negado',
    code: 'ACCESS_DENIED'
  });
};

// Middleware para rate limiting específico por usuário
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Limpar requisições antigas
    if (requests.has(userId)) {
      const userRequests = requests.get(userId).filter(time => time > windowStart);
      requests.set(userId, userRequests);
    } else {
      requests.set(userId, []);
    }
    
    const userRequests = requests.get(userId);
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Muitas requisições. Tente novamente em alguns minutos.',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
    
    userRequests.push(now);
    next();
  };
};

// Middleware para log de operações críticas
const logCriticalOperation = (operation) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log apenas se a operação foi bem-sucedida
      if (res.statusCode >= 200 && res.statusCode < 300) {
        logger.banking(operation, req.user.id, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        });
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// Função para gerar token JWT
const generateToken = (userId, expiresIn = process.env.JWT_EXPIRES_IN || '24h') => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

// Função para gerar refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

// Função para verificar refresh token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  } catch (error) {
    throw error;
  }
};

// Middleware opcional - não bloqueia se não tiver token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          nomeCompleto: true,
          email: true,
          isAtivo: true,
          isVerificado: true
        }
      });

      if (user && user.isAtivo) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignorar erros de token em autenticação opcional
  }
  
  next();
};

module.exports = {
  authenticateToken,
  requireVerification,
  requirePermission,
  requireOwnershipOrAdmin,
  userRateLimit,
  logCriticalOperation,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  optionalAuth,
};
