const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../src/utils/logger');

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        nomeCompleto: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
        telefone: '(11) 99999-9999',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      // Mock do Prisma
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-id',
        ...userData,
        saldoAtual: 0,
        isAtivo: true,
        isVerificado: false,
        createdAt: new Date()
      });
      prisma.configuracoesUsuario.create.mockResolvedValue({});

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('registrado com sucesso');
      expect(response.body.data.user.email).toBe(userData.email);
    });

    it('should return error when create fails with unique constraint', async () => {
      const userData = {
        nomeCompleto: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
        telefone: '(11) 99999-9999',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      prisma.user.create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ACCOUNT_ALREADY_EXISTS');
      expect(response.body.message).toBe('Este e-mail ou CPF já está sendo usado. Faça login ou use outros dados.');
    });

    it('should return error for invalid data', async () => {
      const invalidData = {
        nomeCompleto: 'João Silva',
        email: 'invalid-email',
        cpf: '123',
        dataNascimento: '1990-01-01',
        senha: '123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with email and valid credentials', async () => {
      const loginData = {
        email: 'joao@test.com',
        senha: '123456',
      };

      const mockUser = {
        id: 'user-id',
        email: loginData.email,
        senha: 'hashed_123456',
        isAtivo: true,
        isVerificado: true,
        configuracoes: {}
      };

      // Mock do Prisma
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.token.create.mockResolvedValue({});

      // Mock do bcrypt
      bcrypt.compare.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(loginData.email);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
        include: {
          configuracoes: true
        }
      });
    });

    it('should login successfully with CPF and valid credentials', async () => {
      const loginData = {
        identificador: '09504464408',
        senha: '123456',
      };

      const mockUser = {
        id: 'user-id',
        email: 'joao@test.com',
        cpf: loginData.identificador,
        senha: 'hashed_123456',
        isAtivo: true,
        isVerificado: true,
        configuracoes: {}
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.token.create.mockResolvedValue({});
      bcrypt.compare.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(mockUser.email);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { cpf: loginData.identificador },
        include: {
          configuracoes: true
        }
      });
    });

    it('should login successfully with CPF sent in email field for compatibility', async () => {
      const loginData = {
        email: '09504464408',
        senha: '123456',
      };

      const mockUser = {
        id: 'user-id',
        email: 'joao@test.com',
        cpf: loginData.email,
        senha: 'hashed_123456',
        isAtivo: true,
        isVerificado: true,
        configuracoes: {}
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.token.create.mockResolvedValue({});
      bcrypt.compare.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(mockUser.email);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { cpf: loginData.email },
        include: {
          configuracoes: true
        }
      });
    });

    it('should return error for wrong password', async () => {
      const loginData = {
        email: 'joao@test.com',
        senha: '654321',
      };

      const mockUser = {
        id: 'user-id',
        email: loginData.email,
        senha: 'hashed_123456',
        isAtivo: true,
        isVerificado: true,
        configuracoes: {}
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Senha incorreta. Confira os 6 dígitos.');
      expect(prisma.token.create).not.toHaveBeenCalled();
    });

    it('should return error when account is not found', async () => {
      const loginData = {
        identificador: '09504464408',
        senha: '123456'
      };

      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Conta não encontrada. Abra sua conta AgilBank.');
      expect(logger.security).toHaveBeenCalledWith('login_failed', {
        identifierType: 'cpf',
        reason: 'user_not_found'
      });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return error for inactive account', async () => {
      const loginData = {
        email: 'joao@test.com',
        senha: '123456',
      };

      const mockUser = {
        id: 'user-id',
        email: loginData.email,
        senha: 'hashed_123456',
        isAtivo: false,
        isVerificado: true
      };

      // Mock do Prisma
      prisma.user.findUnique.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('desativada');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const refreshData = {
        refreshToken: 'valid-refresh-token'
      };

      const mockTokenRecord = {
        id: 'token-record-id',
        userId: 'user-id',
        tokenHash: 'hashed',
        tipo: 'refresh',
        isAtivo: true,
        expiraEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: {
          id: 'user-id',
          nomeCompleto: 'João Silva',
          email: 'joao@test.com',
          isAtivo: true,
        },
      };

      // Mock do Prisma
      prisma.token.findFirst.mockResolvedValue(mockTokenRecord);

      // Mock do JWT
      jwt.verify.mockReturnValue({ userId: 'user-id', type: 'refresh' });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send(refreshData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
    });

    it('should return error for invalid refresh token', async () => {
      const refreshData = {
        refreshToken: 'invalid-refresh-token'
      };

      // Mock do Prisma - token não encontrado
      prisma.token.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send(refreshData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('inválido');
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify email successfully', async () => {
      const verifyData = {
        token: 'valid-verification-token'
      };

      const mockUser = {
        id: 'user-id',
        tokenVerificacao: verifyData.token,
        isVerificado: false
      };

      // Mock do Prisma
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        isVerificado: true,
        dataVerificacao: new Date()
      });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send(verifyData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('verificado com sucesso');
    });

    it('should return error for invalid verification token', async () => {
      const verifyData = {
        token: 'invalid-token'
      };

      // Mock do Prisma - usuário não encontrado
      prisma.user.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send(verifyData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('inválido');
    });
  });
});
