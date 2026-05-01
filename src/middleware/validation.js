const { body, param, query, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const isLoginEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isLoginCpf = (value) => /^\d{11}$/.test(value);
const hasLoginValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const normalizeLoginIdentifier = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return isLoginCpf(trimmed) ? trimmed : trimmed.toLowerCase();
};

const redactValidationValue = (field, value) => {
  const normalizedField = String(field || '').toLowerCase();
  const isSensitiveField = ['senha', 'password', 'token', 'refreshtoken', 'cpf'].some((sensitive) =>
    normalizedField.includes(sensitive)
  );

  if (isSensitiveField || (typeof value === 'string' && /^\d{11}$/.test(value))) {
    return '[REDACTED]';
  }

  return value;
};

// Middleware para tratar erros de validação
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const validationErrors = errors.array();
    const errorMessages = validationErrors.map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));

    const loggedErrors = validationErrors.map(error => ({
      field: error.path,
      message: error.msg,
      value: redactValidationValue(error.path, error.value)
    }));
    
    console.warn('Erro de validação:', {
      errors: loggedErrors,
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors: errorMessages,
      code: 'VALIDATION_ERROR'
    });
  }
  
  next();
};

// Validações para registro de usuário
const validateUserRegistration = [
  body('nomeCompleto')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nome deve ter entre 2 e 100 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Nome deve conter apenas letras e espaços'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  body('cpf')
    .matches(/^\d{11}$/)
    .withMessage('CPF deve conter exatamente 11 dígitos'),
  
  body('telefone')
    .optional()
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('Telefone deve estar no formato (XX) XXXXX-XXXX'),
  
  body('dataNascimento')
    .isISO8601()
    .withMessage('Data de nascimento inválida')
    .custom((date) => {
      const birthDate = new Date(date);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      
      if (age < 18) {
        throw new Error('Usuário deve ser maior de 18 anos');
      }
      
      if (age > 120) {
        throw new Error('Data de nascimento inválida');
      }
      
      return true;
    }),
  
  body('senha')
    .matches(/^\d{6}$/)
    .withMessage('Senha deve conter exatamente 6 dígitos numéricos'),
  
  // Validações para endereço (opcional)
  body('endereco.cep')
    .optional()
    .matches(/^\d{5}-?\d{3}$/)
    .withMessage('CEP inválido'),
  
  body('endereco.logradouro')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Logradouro deve ter entre 1 e 200 caracteres'),
  
  body('endereco.numero')
    .optional()
    .isLength({ min: 1, max: 20 })
    .withMessage('Número deve ter entre 1 e 20 caracteres'),
  
  body('endereco.bairro')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Bairro deve ter entre 1 e 100 caracteres'),
  
  body('endereco.cidade')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Cidade deve ter entre 1 e 100 caracteres'),
  
  body('endereco.estado')
    .optional()
    .isLength({ min: 2, max: 2 })
    .withMessage('Estado deve ter exatamente 2 caracteres'),
  
  // Validações para dados profissionais (opcional)
  body('dadosProfissionais.profissao')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Profissão deve ter entre 1 e 100 caracteres'),
  
  body('dadosProfissionais.empresa')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Empresa deve ter entre 1 e 100 caracteres'),
  
  body('dadosProfissionais.cargo')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Cargo deve ter entre 1 e 100 caracteres'),
  
  body('dadosProfissionais.rendaMensal')
    .optional()
    .isNumeric()
    .withMessage('Renda mensal deve ser um número válido'),
  
  handleValidationErrors
];

// Validações para login
const validateLogin = [
  body('email')
    .customSanitizer(normalizeLoginIdentifier)
    .custom((email, { req }) => {
      if (hasLoginValue(req.body.identificador)) {
        return true;
      }

      if (!hasLoginValue(email)) {
        throw new Error('E-mail ou CPF é obrigatório');
      }

      if (!isLoginEmail(email) && !isLoginCpf(email)) {
        throw new Error('Informe e-mail válido ou CPF com 11 dígitos');
      }

      return true;
    }),

  body('identificador')
    .customSanitizer(normalizeLoginIdentifier)
    .custom((identificador) => {
      if (!hasLoginValue(identificador)) {
        return true;
      }

      if (!isLoginEmail(identificador) && !isLoginCpf(identificador)) {
        throw new Error('Informe e-mail válido ou CPF com 11 dígitos');
      }

      return true;
    }),
  
  body('senha')
    .matches(/^\d{6}$/)
    .withMessage('Senha deve conter exatamente 6 dígitos numéricos'),
  
  handleValidationErrors
];

// Validações para atualização de perfil
const validateProfileUpdate = [
  body('nomeCompleto')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nome deve ter entre 2 e 100 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Nome deve conter apenas letras e espaços'),
  
  body('telefone')
    .optional()
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('Telefone deve estar no formato (XX) XXXXX-XXXX'),
  
  handleValidationErrors
];

// Validações para PIX
const validatePixTransaction = [
  body('chavePix')
    .notEmpty()
    .withMessage('Chave PIX é obrigatória')
    .custom(async (chavePix) => {
      // Validar formato da chave PIX
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
      const cpfRegex = /^\d{11}$/;
      const randomKeyRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      
      if (!emailRegex.test(chavePix) && 
          !phoneRegex.test(chavePix) && 
          !cpfRegex.test(chavePix) && 
          !randomKeyRegex.test(chavePix)) {
        throw new Error('Formato de chave PIX inválido');
      }
    }),
  
  body('valor')
    .isFloat({ min: 0.01, max: 100000 })
    .withMessage('Valor deve estar entre R$ 0,01 e R$ 100.000,00'),
  
  body('descricao')
    .optional()
    .isLength({ max: 140 })
    .withMessage('Descrição deve ter no máximo 140 caracteres'),
  
  handleValidationErrors
];

// Validações para cartão
const validateCardRequest = [
  body('tipo')
    .isIn(['credito', 'debito'])
    .withMessage('Tipo de cartão deve ser crédito ou débito'),
  
  body('limite')
    .optional()
    .isFloat({ min: 100, max: 50000 })
    .withMessage('Limite deve estar entre R$ 100,00 e R$ 50.000,00'),
  
  handleValidationErrors
];

// Validações para empréstimo
const validateLoanRequest = [
  body('valorSolicitado')
    .isFloat({ min: 100, max: 100000 })
    .withMessage('Valor deve estar entre R$ 100,00 e R$ 100.000,00'),
  
  body('prazoMeses')
    .isInt({ min: 1, max: 60 })
    .withMessage('Prazo deve estar entre 1 e 60 meses'),
  
  handleValidationErrors
];

// Validações para boleto
const validateBoletoPayment = [
  body('codigoBarras')
    .matches(/^\d{44}$/)
    .withMessage('Código de barras deve conter exatamente 44 dígitos'),
  
  body('valor')
    .isFloat({ min: 0.01 })
    .withMessage('Valor deve ser maior que zero'),
  
  handleValidationErrors
];

// Validações para parâmetros de ID
const validateId = [
  param('id')
    .isString()
    .withMessage('ID deve ser uma string')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('ID inválido'),
  
  handleValidationErrors
];

// Validações para paginação
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página deve ser um número inteiro maior que 0'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limite deve estar entre 1 e 100'),
  
  handleValidationErrors
];

// Validações para filtros de data
const validateDateRange = [
  query('dataInicio')
    .optional()
    .isISO8601()
    .withMessage('Data de início inválida'),
  
  query('dataFim')
    .optional()
    .isISO8601()
    .withMessage('Data de fim inválida')
    .custom((dataFim, { req }) => {
      if (req.query.dataInicio && new Date(dataFim) < new Date(req.query.dataInicio)) {
        throw new Error('Data de fim deve ser posterior à data de início');
      }
      return true;
    }),
  
  handleValidationErrors
];

// Validações para alteração de senha
const validatePasswordChange = [
  body('senhaAtual')
    .notEmpty()
    .withMessage('Senha atual é obrigatória'),
  
  body('novaSenha')
    .isLength({ min: 8 })
    .withMessage('Nova senha deve ter pelo menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/)
    .withMessage('Nova senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 símbolo'),
  
  body('confirmarSenha')
    .custom((confirmarSenha, { req }) => {
      if (confirmarSenha !== req.body.novaSenha) {
        throw new Error('Confirmação de senha não confere');
      }
      return true;
    }),
  
  handleValidationErrors
];

// Validações para endereço
const validateAddress = [
  body('cep')
    .matches(/^\d{5}-?\d{3}$/)
    .withMessage('CEP deve estar no formato 00000-000'),
  
  body('logradouro')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Logradouro deve ter entre 3 e 200 caracteres'),
  
  body('numero')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Número deve ter entre 1 e 10 caracteres'),
  
  body('bairro')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Bairro deve ter entre 2 e 100 caracteres'),
  
  body('cidade')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Cidade deve ter entre 2 e 100 caracteres'),
  
  body('estado')
    .isLength({ min: 2, max: 2 })
    .withMessage('Estado deve ter exatamente 2 caracteres')
    .matches(/^[A-Z]{2}$/)
    .withMessage('Estado deve ser uma sigla válida'),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserRegistration,
  validateLogin,
  validateProfileUpdate,
  validatePixTransaction,
  validateCardRequest,
  validateLoanRequest,
  validateBoletoPayment,
  validateId,
  validatePagination,
  validateDateRange,
  validatePasswordChange,
  validateAddress,
};
