const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../src/utils/logger');
const { sendPasswordResetEmail, sendEmail } = require('../src/utils/email');

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === 'function') {
        return arg({ user: prisma.user });
      }
      return Promise.all(arg);
    });
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
        tokenVerificacao: 'verification-token',
        saldoAtual: 0,
        limiteCartao: null,
        limitePixDiario: 1000,
        limitePixMensal: 10000,
        scoreCredito: 0,
        numeroConta: '123456',
        digitoConta: '78',
        agencia: '0001',
        isAtivo: true,
        isVerificado: false,
        dataVerificacao: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        endereco: null,
        dadosProfissionais: null,
        configuracoes: {}
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('registrado com sucesso');
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.senha).toBeUndefined();
      expect(response.body.data.user.tokenVerificacao).toBeUndefined();
      expect(response.body.data.user.token).toBeUndefined();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            configuracoes: {
              create: expect.objectContaining({
                notificacoesEmail: true,
                notificacoesSms: true,
                notificacoesPush: true,
                temaInterface: 'claro',
                idioma: 'pt-BR',
              }),
            },
          }),
        })
      );
      expect(prisma.configuracoesUsuario.create).not.toHaveBeenCalled();
    });

    it('retorna 201 com endereco, dadosProfissionais e configuracoes no user publico', async () => {
      const userData = {
        nomeCompleto: 'Maria Silva',
        email: 'maria@test.com',
        cpf: '52998224725',
        telefone: '11988887777',
        dataNascimento: '1990-06-15',
        senha: '123456',
        endereco: {
          cep: '01310100',
          logradouro: 'Av Paulista',
          numero: '1000',
          complemento: 'Apto 1',
          bairro: 'Bela Vista',
          cidade: 'São Paulo',
          estado: 'SP',
        },
        dadosProfissionais: {
          profissao: 'Engenheira',
          empresa: 'Tech Co',
          cargo: 'Dev',
          rendaMensal: '5000',
        },
      };

      prisma.user.create.mockResolvedValue({
        id: 'u-full',
        nomeCompleto: userData.nomeCompleto,
        email: userData.email,
        cpf: userData.cpf,
        telefone: userData.telefone,
        dataNascimento: new Date(userData.dataNascimento),
        saldoAtual: 0,
        limiteCartao: null,
        limitePixDiario: 1000,
        limitePixMensal: 10000,
        scoreCredito: 0,
        numeroConta: '123456',
        digitoConta: '12',
        agencia: '0001',
        isAtivo: true,
        isVerificado: false,
        dataVerificacao: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        endereco: {
          id: 'e1',
          userId: 'u-full',
          cep: '01310100',
          logradouro: 'Av Paulista',
          numero: '1000',
          complemento: 'Apto 1',
          bairro: 'Bela Vista',
          cidade: 'São Paulo',
          estado: 'SP',
          pais: 'Brasil',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        dadosProfissionais: {
          id: 'd1',
          userId: 'u-full',
          profissao: 'Engenheira',
          empresa: 'Tech Co',
          cargo: 'Dev',
          rendaMensal: 5000,
          tempoTrabalho: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        configuracoes: {
          id: 'c1',
          userId: 'u-full',
          notificacoesEmail: true,
          notificacoesSms: true,
          notificacoesPush: true,
          temaInterface: 'claro',
          idioma: 'pt-BR',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.data.user.endereco).toMatchObject({
        cep: '01310100',
        logradouro: 'Av Paulista',
      });
      expect(response.body.data.user.dadosProfissionais).toMatchObject({
        profissao: 'Engenheira',
        rendaMensal: 5000,
      });
      expect(response.body.data.user.configuracoes).toMatchObject({
        idioma: 'pt-BR',
      });
    });

    it('retorna 201 mesmo quando envio de email falha (assincrono)', async () => {
      const userData = {
        nomeCompleto: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
        telefone: '(11) 99999-9999',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      sendEmail.mockImplementation(() => Promise.reject(new Error('SMTP indisponível')));

      prisma.user.create.mockResolvedValue({
        id: 'user-id',
        ...userData,
        tokenVerificacao: 'verification-token',
        saldoAtual: 0,
        limiteCartao: null,
        limitePixDiario: 1000,
        limitePixMensal: 10000,
        scoreCredito: 0,
        numeroConta: '123456',
        digitoConta: '78',
        agencia: '0001',
        isAtivo: true,
        isVerificado: false,
        dataVerificacao: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        endereco: null,
        dadosProfissionais: null,
        configuracoes: {},
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);

      await new Promise((resolve) => setImmediate(resolve));
      expect(sendEmail).toHaveBeenCalled();
    });

    it('retorna 500 quando a transacao de registro falha (sem persistir user no mock)', async () => {
      const userData = {
        nomeCompleto: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
        telefone: '(11) 99999-9999',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      prisma.$transaction.mockRejectedValueOnce(new Error('falha simulada no banco'));

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(500);

      expect(response.body.code).toBe('INTERNAL_ERROR');
      expect(prisma.user.create).not.toHaveBeenCalled();
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

  describe('POST /api/auth/forgot-password', () => {
    const forgotBody = {
      email: 'joao@test.com',
      cpf: '12345678901',
    };

    it('returns generic 200 and creates password_reset token when user exists', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-id',
        nomeCompleto: 'João Silva',
        email: 'joao@test.com',
      });
      prisma.token.updateMany.mockResolvedValue({ count: 0 });
      prisma.token.create.mockResolvedValue({ id: 'pr-token' });
      sendPasswordResetEmail.mockResolvedValue({});

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(forgotBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        'Se os dados estiverem corretos, enviaremos as instruções para o e-mail cadastrado.'
      );
      expect(prisma.token.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-id',
          tipo: 'password_reset',
          isAtivo: true,
        }),
      });
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'joao@test.com',
          token: expect.any(String),
        })
      );
    });

    it('returns same generic 200 when user does not exist and does not create token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(forgotBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        'Se os dados estiverem corretos, enviaremos as instruções para o e-mail cadastrado.'
      );
      expect(prisma.token.create).not.toHaveBeenCalled();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR for invalid body', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email', cpf: '123' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/verify-reset-token', () => {
    it('returns valid true and nome for active token', async () => {
      prisma.token.findFirst.mockResolvedValue({
        id: 't1',
        user: { nomeCompleto: 'Maria Souza', isAtivo: true },
      });

      const response = await request(app)
        .post('/api/auth/verify-reset-token')
        .send({ token: 'some-plain-token' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.nome).toBe('Maria Souza');
    });

    it('returns valid false for invalid or expired token', async () => {
      prisma.token.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/verify-reset-token')
        .send({ token: 'bad' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.message).toBe('Token inválido ou expirado.');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('resets password and invalidates token when token is valid', async () => {
      prisma.token.findFirst.mockResolvedValue({
        id: 'reset-id',
        userId: 'user-id',
        user: { id: 'user-id', isAtivo: true },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.token.update.mockResolvedValue({});
      prisma.token.updateMany.mockResolvedValue({ count: 1 });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'plain-reset', new_password: '654321' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Senha redefinida com sucesso.');
      expect(bcrypt.hash).toHaveBeenCalledWith('654321', expect.any(Number));
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('fails on reused or invalid token', async () => {
      prisma.token.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'used', new_password: '123456' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_RESET_TOKEN');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR for invalid new_password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'abc', new_password: '12' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/resend-verification-email', () => {
    it('returns 400 ALREADY_VERIFIED when account is already verified', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...global.testUser, isVerificado: true });

      const response = await request(app)
        .post('/api/auth/resend-verification-email')
        .set('Authorization', `Bearer ${global.testToken}`)
        .send({})
        .expect(400);

      expect(response.body.code).toBe('ALREADY_VERIFIED');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('returns 200, persists new token and sends welcome email when unverified', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...global.testUser, isVerificado: false });
      prisma.user.update.mockResolvedValue({});
      sendEmail.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/auth/resend-verification-email')
        .set('Authorization', `Bearer ${global.testToken}`)
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: global.testUser.id },
          data: expect.objectContaining({ tokenVerificacao: expect.any(String) }),
        }),
      );
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'welcome',
          to: global.testUser.email,
        }),
      );
    });

    it('returns 503 EMAIL_SEND_FAILED when SMTP fails', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...global.testUser, isVerificado: false });
      prisma.user.update.mockResolvedValue({});
      sendEmail.mockRejectedValue(new Error('SMTP indisponível'));

      const response = await request(app)
        .post('/api/auth/resend-verification-email')
        .set('Authorization', `Bearer ${global.testToken}`)
        .send({})
        .expect(503);

      expect(response.body.code).toBe('EMAIL_SEND_FAILED');
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
