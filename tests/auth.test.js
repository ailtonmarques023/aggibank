const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../src/utils/logger');
const { sendPasswordResetEmail, sendEmail } = require('../src/utils/email');
const referralService = require('../src/services/referralService');

jest.mock('../src/services/referralService', () => ({
  attachReferralToNewUser: jest.fn(() => Promise.resolve(null)),
  qualifyReferralForVerifiedUser: jest.fn(() => Promise.resolve(null)),
}));

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
      expect(response.body.data.verificationEmail).toMatchObject({ status: 'sent' });
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

    it('vincula cadastro a código de indicação quando enviado', async () => {
      const userData = {
        nomeCompleto: 'Ana Silva',
        email: 'ana@test.com',
        cpf: '12345678902',
        telefone: '(11) 99999-9999',
        dataNascimento: '1990-01-01',
        senha: '123456',
        referralCode: 'ABCD1234',
      };

      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        ...userData,
        tokenVerificacao: 'verification-token',
        saldoAtual: 0,
        saldoBloqueado: 0,
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

      referralService.attachReferralToNewUser.mockResolvedValueOnce({
        referralCode: 'ABCD1234',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(referralService.attachReferralToNewUser).toHaveBeenCalledWith({
        referredUserId: 'new-user-id',
        referralCode: 'ABCD1234',
      });
      expect(response.body.data.referral).toEqual({
        status: 'registered',
        code: 'ABCD1234',
      });
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
      expect(response.body.data.verificationEmail).toMatchObject({ status: 'sent' });
    });

    it('retorna 201 com verificationEmail.failed quando envio de email falha', async () => {
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
      expect(response.body.data.verificationEmail).toMatchObject({
        status: 'failed',
        code: 'EMAIL_SEND_FAILED',
      });

      expect(sendEmail).toHaveBeenCalled();
    });

    it('retorna 201 com verificationEmail.not_configured quando provedor ausente', async () => {
      const userData = {
        nomeCompleto: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
        telefone: '(11) 99999-9999',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      sendEmail.mockImplementation(() => Promise.reject(new Error('EMAIL_PROVIDER_NOT_CONFIGURED')));

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

      expect(response.body.data.verificationEmail).toMatchObject({
        status: 'not_configured',
        code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      });

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
      expect(response.body.message).toBe(
        'Não foi possível concluir o cadastro no momento. Tente novamente mais tarde.'
      );
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
      expect(response.body.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(response.body.duplicateField).toBe('email');
      expect(response.body.message).toBe('E-mail já cadastrado. Faça login ou use outro e-mail.');
      expect(response.body.fields).toBeUndefined();
    });

    it('should return error when create fails with unique constraint on cpf', async () => {
      const userData = {
        nomeCompleto: 'Maria Silva',
        email: 'maria-nova@test.com',
        cpf: '52998224725',
        telefone: '11999998888',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      prisma.user.create.mockRejectedValue({ code: 'P2002', meta: { target: ['cpf'] } });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('CPF_ALREADY_EXISTS');
      expect(response.body.duplicateField).toBe('cpf');
      expect(response.body.message).toBe('CPF já cadastrado. Faça login ou use outro CPF.');
      expect(response.body.fields).toBeUndefined();
    });

    it('retorna 409 quando email e cpf aparecem juntos na violacao UNIQUE', async () => {
      const userData = {
        nomeCompleto: 'Fulano Silva',
        email: 'dup@example.com',
        cpf: '52998224725',
        telefone: '11999998888',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      prisma.user.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['email', 'cpf'] },
      });

      const response = await request(app).post('/api/auth/register').send(userData).expect(409);

      expect(response.body.code).toBe('EMAIL_AND_CPF_ALREADY_EXIST');
      expect(response.body.duplicateField).toBe('email;cpf');
      expect(response.body.message).toBe(
        'E-mail e CPF já cadastrados. Verifique os dados ou faça login.'
      );
      expect(response.body.fields).toBeUndefined();
    });

    it('retorna 409 com mensagem especifica quando numeroConta duplica', async () => {
      const userData = {
        nomeCompleto: 'Outro Silva',
        email: 'nova@example.com',
        cpf: '39053344705',
        telefone: '11988887777',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      prisma.user.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['numeroConta'] },
      });

      const response = await request(app).post('/api/auth/register').send(userData).expect(409);

      expect(response.body.code).toBe('NUMERO_CONTA_CONFLICT');
      expect(response.body.message).toBe('Não foi possível gerar uma conta agora. Tente novamente.');
      expect(response.body.fields).toBeUndefined();
    });

    it('retorna 409 com mensagem amigavel quando Prisma envia apenas constraint desconhecida', async () => {
      const userData = {
        nomeCompleto: 'Outro Silva',
        email: 'x@example.com',
        cpf: '85351346893',
        telefone: '11977776666',
        dataNascimento: '1990-01-01',
        senha: '123456',
      };

      prisma.user.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['usuarioId'] },
      });

      const response = await request(app).post('/api/auth/register').send(userData).expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.fields).toBeUndefined();
      expect(response.body.message).toContain('em uso');
      expect(JSON.stringify(response.body)).not.toMatch(/P2002|Prisma/i);
    });

    it('should return error for invalid data', async () => {
      const invalidData = {
        nomeCompleto: 'João Silva',
        email: 'invalid-email',
        cpf: '123',
        telefone: '(11) 98888-8888',
        dataNascimento: '1990-01-01',
        senha: '123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.errors).toBeDefined();
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(5);
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
      expect(response.body.message).toBe(
        'Não encontramos uma conta com esses dados ou a senha está incorreta.'
      );
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
      expect(response.body.message).toBe(
        'Não encontramos uma conta com esses dados ou a senha está incorreta.'
      );
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
      expect(response.body.message).toBe(
        'Não encontramos uma conta com esses dados ou a senha está incorreta.'
      );
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

    it('returns 503 EMAIL_PROVIDER_NOT_CONFIGURED when provider not configured', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...global.testUser, isVerificado: false });
      prisma.user.update.mockResolvedValue({});
      sendEmail.mockRejectedValue(new Error('EMAIL_PROVIDER_NOT_CONFIGURED'));

      const response = await request(app)
        .post('/api/auth/resend-verification-email')
        .set('Authorization', `Bearer ${global.testToken}`)
        .send({})
        .expect(503);

      expect(response.body.code).toBe('EMAIL_PROVIDER_NOT_CONFIGURED');
    });

    it('returns 503 EMAIL_SEND_FAILED when send fails', async () => {
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
