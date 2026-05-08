const crypto = require('crypto');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireVerification, requireInternalApiKey } = require('../middleware/auth');
const {
  validateCardRequest,
  validateCardShipmentCreate,
  validateShipmentTimelineQuery,
  validateShipmentPhysicalUnlock
} = require('../middleware/validation');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { sendCardNotification } = require('../utils/email');
const { recordAudit } = require('../utils/auditLog');

const router = express.Router();

const SCHEMA_SOLICITACAO = 1;
const SHIPPING_FEE_BRL = 39.90;
/** Remessas encerradas com sucesso operacional ou cancelamento definitivo — permite nova emissão apenas com segunda via explícita. */
const TERMINAL_SHIPMENT_STATUSES = ['DESBLOQUEADO', 'DEVOLVIDO', 'CANCELADO'];

function normalizeLast4Digits(v) {
  return String(v == null ? '' : v).replace(/\D/g, '').slice(-4);
}

/** Resumo seguro para lista de cartões (estado físico ≠ estado financeiro do cartão). */
function publicPhysicalSnapshot(row) {
  if (!row) return null;
  const st = String(row.status || '');
  const trackingAvailable = Boolean(
    row.trackingCode
    && ['REMESSA_CRIADA', 'POSTADO', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA', 'AGUARDANDO_DESBLOQUEIO', 'DESBLOQUEADO'].includes(st)
  );
  return {
    shipmentId: row.id,
    status: row.status,
    shippingFeeStatus: row.shippingFeeStatus,
    shippingFeeAmount: row.shippingFeeAmount,
    trackingAvailable,
    physicalUnlocked: st === 'DESBLOQUEADO',
  };
}

/** Resposta API: sem token interno, sem snapshot de solicitacao nem metadados LGPD persistidos. */
function publicCard(cartao) {
  if (!cartao) return cartao;
  const {
    cardToken: _omitToken,
    dadosSolicitacao: _omitSnap,
    lgpdConsentAt: _omitLgpdAt,
    lgpdConsentVersion: _omitLgpdVer,
    senha: _omitSenha,
    pin: _omitPin,
    cvv: _omitCvv,
    pan: _omitPan,
    password: _omitPassword,
    ...rest
  } = cartao;
  return rest;
}

/** Resposta API de cartao virtual: sem token interno nem hash de CVV. */
function publicVirtualCard(cartaoVirtual) {
  if (!cartaoVirtual) return cartaoVirtual;
  const {
    cardToken: _omitToken,
    cvvHash: _omitCvvHash,
    ...rest
  } = cartaoVirtual;
  return rest;
}

function trimStr(v, max) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s === '') return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function asMoneyNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function sanitizeAddressSnapshot(address) {
  return {
    cep: String(address.cep || '').trim(),
    logradouro: String(address.logradouro || '').trim(),
    numero: String(address.numero || '').trim(),
    complemento: address.complemento ? String(address.complemento).trim() : null,
    bairro: String(address.bairro || '').trim(),
    cidade: String(address.cidade || '').trim(),
    estado: String(address.estado || '').trim().toUpperCase(),
  };
}

function publicShipment(shipment) {
  if (!shipment) return null;
  return {
    id: shipment.id,
    cardId: shipment.cardId,
    userId: shipment.userId,
    status: shipment.status,
    shippingFeeAmount: shipment.shippingFeeAmount,
    shippingFeeStatus: shipment.shippingFeeStatus,
    shippingFeeMovementId: shipment.shippingFeeMovementId,
    carrierCode: shipment.carrierCode,
    carrierName: shipment.carrierName,
    trackingCode: shipment.trackingCode,
    trackingUrl: shipment.trackingUrl,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt,
    postedAt: shipment.postedAt,
    deliveredAt: shipment.deliveredAt,
    returnedAt: shipment.returnedAt,
    deliveryAttempts: shipment.deliveryAttempts,
    isSecondIssue: shipment.isSecondIssue,
    originShipmentId: shipment.originShipmentId,
    addressSnapshot: shipment.addressSnapshot,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

/**
 * Monta objeto persistivel em dadosSolicitacao (apenas whitelist; sem PIN/CVV/PAN).
 */
function sanitizeDadosAnaliseForStorage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const out = {};

  if (raw.rendaMensalDeclarada !== undefined && raw.rendaMensalDeclarada !== null) {
    const n = Number(raw.rendaMensalDeclarada);
    if (Number.isFinite(n) && n >= 0 && n <= 50_000_000) {
      out.rendaMensalDeclarada = Math.round(n * 100) / 100;
    }
  }

  const tempo = trimStr(raw.tempoEmprego, 80);
  if (tempo !== undefined) out.tempoEmprego = tempo;

  const empresa = trimStr(raw.empresa, 200);
  if (empresa !== undefined) out.empresa = empresa;

  const empresaAtual = trimStr(raw.empresaAtual, 200);
  if (empresaAtual !== undefined) out.empresaAtual = empresaAtual;

  if (typeof raw.enderecoEntregaDiferente === 'boolean') {
    out.enderecoEntregaDiferente = raw.enderecoEntregaDiferente;
  }

  const obs = trimStr(raw.observacao, 500);
  if (obs !== undefined) out.observacao = obs;

  if (raw.endereco && typeof raw.endereco === 'object' && !Array.isArray(raw.endereco)) {
    const e = {};
    const rua = trimStr(raw.endereco.rua, 200);
    const bairro = trimStr(raw.endereco.bairro, 100);
    const cidade = trimStr(raw.endereco.cidade, 100);
    const estado = trimStr(raw.endereco.estado, 2);
    const cep = trimStr(raw.endereco.cep, 20);
    if (rua !== undefined) e.rua = rua;
    if (bairro !== undefined) e.bairro = bairro;
    if (cidade !== undefined) e.cidade = cidade;
    if (estado !== undefined) e.estado = estado.toUpperCase();
    if (cep !== undefined) e.cep = cep;
    if (Object.keys(e).length) out.endereco = e;
  }

  return Object.keys(out).length ? out : null;
}

/** Renda mensal declarada >= este valor (BRL) → status inicial `aprovado` (regra explícita, sem score). */
const REGRA_RENDA_MIN_APROVACAO = 2000;

/**
 * Limite sugerido: 30% da renda declarada, entre R$ 300 e R$ 10.000.
 * @param {number} renda
 * @returns {number|null}
 */
function limiteSugeridoPorRenda030(renda) {
  const r = Number(renda);
  if (!Number.isFinite(r) || r < 0) return null;
  const raw = r * 0.3;
  const rounded = Math.round(raw * 100) / 100;
  return Math.min(10_000, Math.max(300, rounded));
}

/**
 * Define limite final e status inicial a partir de `dadosAnalise` sanitizado (renda) e corpo do POST.
 * Transparência: retorna rótulos de critério para persistir em `dadosSolicitacao.decisaoAutomatica`.
 *
 * @param {{ limiteBody: unknown, analiseSan: object|null, scoreCredito: number }} p
 */
function resolveLimiteEStatusCriacaoCard({ limiteBody, analiseSan, scoreCredito }) {
  const rendaVal = analiseSan && analiseSan.rendaMensalDeclarada != null
    ? analiseSan.rendaMensalDeclarada
    : null;
  const rendaN = rendaVal != null && Number.isFinite(Number(rendaVal)) ? Number(rendaVal) : null;

  const limiteSugerido = rendaN != null ? limiteSugeridoPorRenda030(rendaN) : null;

  let limiteFonte = 'score_credito';
  let limiteFinal;
  if (limiteBody !== undefined && limiteBody !== null && limiteBody !== '') {
    limiteFinal = Number(limiteBody);
    limiteFonte = 'cliente';
  } else if (limiteSugerido != null) {
    limiteFinal = limiteSugerido;
    limiteFonte = 'sugerido_renda_0_3';
  } else {
    limiteFinal = calculateCreditLimit(scoreCredito);
    limiteFonte = 'score_credito';
  }

  let statusInicial = 'pendente';
  let statusCriterio = 'pendente_sem_renda_declarada';
  if (rendaN != null && Number.isFinite(rendaN)) {
    if (rendaN >= REGRA_RENDA_MIN_APROVACAO) {
      statusInicial = 'aprovado';
      statusCriterio = 'aprovado_renda_maior_igual_2000';
    } else {
      statusInicial = 'pendente';
      statusCriterio = 'pendente_renda_menor_2000';
    }
  }

  const dataAprovacao = statusInicial === 'aprovado' ? new Date() : null;

  return {
    limiteFinal,
    statusInicial,
    dataAprovacao,
    limiteFonte,
    statusCriterio,
    limiteSugerido,
    rendaN,
  };
}

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);
router.use(requireVerification);

/**
 * @swagger
 * /api/cards:
 *   get:
 *     summary: Listar cartões do usuário
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cartões listados com sucesso
 */
router.get('/', async (req, res) => {
  try {
    const cartoes = await prisma.cartao.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        maskedNumber: true,
        last4: true,
        validade: true,
        limite: true,
        saldoUtilizado: true,
        status: true,
        tipo: true,
        bandeira: true,
        dataSolicitacao: true,
        dataAprovacao: true,
        createdAt: true,
      },
    });

    const shipments = await prisma.cardShipment.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        cardId: true,
        status: true,
        shippingFeeStatus: true,
        shippingFeeAmount: true,
        trackingCode: true,
      },
    });
    const latestShipmentByCard = new Map();
    for (const s of shipments) {
      if (!latestShipmentByCard.has(s.cardId)) latestShipmentByCard.set(s.cardId, s);
    }

    res.json({
      success: true,
      message: 'Cartões listados com sucesso',
      data: {
        cartoes: cartoes.map((c) => ({
          ...publicCard(c),
          physicalShipment: publicPhysicalSnapshot(latestShipmentByCard.get(c.id) || null),
        })),
      },
    });

  } catch (error) {
    logger.error('Erro ao listar cartões:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards:
 *   post:
 *     summary: Solicitar novo cartão
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Card'
 *     responses:
 *       201:
 *         description: Cartão solicitado com sucesso
 */
router.post('/', validateCardRequest, async (req, res) => {
  try {
    const { tipo, limite, dadosAnalise, lgpd } = req.body;

    const analiseSan = sanitizeDadosAnaliseForStorage(dadosAnalise);

    const decisao = resolveLimiteEStatusCriacaoCard({
      limiteBody: limite,
      analiseSan,
      scoreCredito: req.user.scoreCredito,
    });

    let dadosSolicitacao = null;
    if (analiseSan) {
      dadosSolicitacao = {
        schemaVersion: SCHEMA_SOLICITACAO,
        dadosAnalise: analiseSan,
        decisaoAutomatica: {
          versaoRegra: '202605-v1',
          limiteFonte: decisao.limiteFonte,
          statusCriterio: decisao.statusCriterio,
          limiteSugeridoRenda030: decisao.limiteSugerido,
        },
      };
    }

    let lgpdConsentAt = null;
    let lgpdConsentVersion = null;
    if (lgpd && typeof lgpd === 'object' && lgpd.aceito === true && lgpd.versao) {
      lgpdConsentAt = new Date();
      lgpdConsentVersion = String(lgpd.versao).trim().slice(0, 64);
    }

    // Verificar se usuário já tem cartão ativo do mesmo tipo
    const cartaoExistente = await prisma.cartao.findFirst({
      where: {
        userId: req.user.id,
        tipo,
        status: { in: ['aprovado', 'pendente', 'ativo'] }
      }
    });

    if (cartaoExistente) {
      return res.status(400).json({
        success: false,
        message: `Você já possui um cartão de ${tipo} ativo ou pendente`,
        code: 'CARD_ALREADY_EXISTS'
      });
    }

    const { maskedNumber, last4, bandeira, validade, cardToken } = generateDemoCardFields();

    const cartao = await prisma.cartao.create({
      data: {
        userId: req.user.id,
        maskedNumber,
        last4,
        validade,
        bandeira,
        cardToken,
        limite: decisao.limiteFinal,
        tipo,
        status: decisao.statusInicial,
        dataAprovacao: decisao.dataAprovacao,
        ...(dadosSolicitacao ? { dadosSolicitacao } : {}),
        ...(lgpdConsentAt ? { lgpdConsentAt, lgpdConsentVersion } : {}),
      },
    });

    logger.banking('card_requested', req.user.id, {
      tipo,
      limite: decisao.limiteFinal,
      status: decisao.statusInicial,
      bandeira,
      limiteFonte: decisao.limiteFonte,
      statusCriterio: decisao.statusCriterio,
      temSnapshotSolicitacao: Boolean(dadosSolicitacao),
      temConsentimentoLgpd: Boolean(lgpdConsentAt),
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.requested',
      entity: 'Cartao',
      entityId: cartao.id,
      metadata: {
        tipo,
        bandeira,
        temDadosAnalise: Boolean(analiseSan),
        statusInicial: decisao.statusInicial,
        limiteFonte: decisao.limiteFonte,
        statusCriterio: decisao.statusCriterio,
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (lgpdConsentAt) {
      await recordAudit({
        userId: req.user.id,
        action: 'card.application.lgpd_accepted',
        entity: 'Cartao',
        entityId: cartao.id,
        metadata: { versao: lgpdConsentVersion },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }

    res.status(201).json({
      success: true,
      message: 'Cartão solicitado com sucesso',
      data: { cartao: publicCard(cartao) },
    });

  } catch (error) {
    logger.error('Erro ao solicitar cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/approve:
 *   post:
 *     summary: Aprovar cartão (admin)
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cartão aprovado com sucesso
 */
router.post('/:id/approve', requireInternalApiKey('CARD_APPROVAL_INTERNAL_KEY'), async (req, res) => {
  try {
    const { id } = req.params;

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'pendente'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou já processado',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: {
        status: 'aprovado',
        dataAprovacao: new Date()
      }
    });

    // Enviar notificação por email
    try {
      await sendCardNotification(
        { nome: req.user.nomeCompleto, email: req.user.email },
        {
          status: 'aprovado',
          tipo: cartao.tipo,
          bandeira: cartao.bandeira,
          limite: cartao.limite,
          dataAprovacao: cartaoAtualizado.dataAprovacao
        }
      );
    } catch (emailError) {
      logger.warn('Erro ao enviar notificação de cartão:', emailError);
    }

    logger.banking('card_approved', req.user.id, {
      cartaoId: id,
      tipo: cartao.tipo,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.approved',
      entity: 'Cartao',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão aprovado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao aprovar cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/block:
 *   post:
 *     summary: Bloquear cartão
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cartão bloqueado com sucesso
 */
router.post('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'aprovado'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou não está ativo',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: { status: 'bloqueado' }
    });

    logger.banking('card_blocked', req.user.id, {
      cartaoId: id,
      tipo: cartao.tipo,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.blocked',
      entity: 'Cartao',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão bloqueado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao bloquear cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/unblock:
 *   post:
 *     summary: Desbloquear cartão
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cartão desbloqueado com sucesso
 */
router.post('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'bloqueado'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou não está bloqueado',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: { status: 'aprovado' }
    });

    logger.banking('card_unblocked', req.user.id, {
      cartaoId: id,
      tipo: cartao.tipo,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.unblocked',
      entity: 'Cartao',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão desbloqueado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao desbloquear cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/limit:
 *   put:
 *     summary: Alterar limite do cartão
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - novoLimite
 *             properties:
 *               novoLimite:
 *                 type: number
 *     responses:
 *       200:
 *         description: Limite alterado com sucesso
 */
router.put('/:id/limit', async (req, res) => {
  try {
    const { id } = req.params;
    const { novoLimite } = req.body;

    if (novoLimite < 100 || novoLimite > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Limite deve estar entre R$ 100,00 e R$ 50.000,00',
        code: 'INVALID_LIMIT'
      });
    }

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'aprovado'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou não está ativo',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: { limite: novoLimite }
    });

    logger.banking('card_limit_changed', req.user.id, {
      cartaoId: id,
      limiteAnterior: cartao.limite,
      novoLimite,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.limit_changed',
      entity: 'Cartao',
      entityId: id,
      metadata: { novoLimite },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Limite alterado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao alterar limite do cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.post('/:id/virtual', async (req, res) => {
  try {
    const { id } = req.params;

    const cartaoBase = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: { in: ['aprovado', 'ativo'] },
      },
    });

    if (!cartaoBase) {
      return res.status(400).json({
        success: false,
        message: 'Cartão base não elegível para cartão virtual',
        code: 'BASE_CARD_NOT_ELIGIBLE'
      });
    }

    const existente = await prisma.cartaoVirtual.findFirst({
      where: {
        cartaoId: id,
        userId: req.user.id,
        status: { in: ['ativo', 'bloqueado'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existente) {
      return res.status(409).json({
        success: false,
        message: 'Você já possui cartão virtual ativo para este cartão',
        code: 'VIRTUAL_CARD_ALREADY_EXISTS'
      });
    }

    const fields = generateDemoVirtualCardFields(cartaoBase.bandeira);
    const cartaoVirtual = await prisma.cartaoVirtual.create({
      data: {
        cartaoId: cartaoBase.id,
        userId: req.user.id,
        maskedNumber: fields.maskedNumber,
        last4: fields.last4,
        validade: fields.validade,
        bandeira: fields.bandeira,
        cardToken: fields.cardToken,
        cvvHash: fields.cvvHash,
        status: 'ativo',
      }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.virtual.created',
      entity: 'CartaoVirtual',
      entityId: cartaoVirtual.id,
      metadata: { cartaoId: cartaoBase.id },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      success: true,
      message: 'Cartão virtual criado com sucesso',
      data: { cartaoVirtual: publicVirtualCard(cartaoVirtual) },
    });
  } catch (error) {
    logger.error('Erro ao criar cartão virtual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.get('/:id/virtual', async (req, res) => {
  try {
    const { id } = req.params;
    const cartaoBase = await prisma.cartao.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true }
    });

    if (!cartaoBase) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoVirtual = await prisma.cartaoVirtual.findFirst({
      where: {
        cartaoId: id,
        userId: req.user.id,
        status: { in: ['ativo', 'bloqueado'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!cartaoVirtual) {
      return res.status(404).json({
        success: false,
        message: 'Cartão virtual não encontrado',
        code: 'VIRTUAL_CARD_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Cartão virtual consultado com sucesso',
      data: { cartaoVirtual: publicVirtualCard(cartaoVirtual) },
    });
  } catch (error) {
    logger.error('Erro ao consultar cartão virtual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.post('/:id/virtual/block', async (req, res) => {
  try {
    const { id } = req.params;
    const cartaoVirtual = await prisma.cartaoVirtual.findFirst({
      where: {
        cartaoId: id,
        userId: req.user.id,
        status: 'ativo',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!cartaoVirtual) {
      return res.status(404).json({
        success: false,
        message: 'Cartão virtual não encontrado ou já bloqueado',
        code: 'VIRTUAL_CARD_NOT_FOUND'
      });
    }

    const atualizado = await prisma.cartaoVirtual.update({
      where: { id: cartaoVirtual.id },
      data: { status: 'bloqueado', dataBloqueio: new Date() }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.virtual.blocked',
      entity: 'CartaoVirtual',
      entityId: atualizado.id,
      metadata: { cartaoId: id },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão virtual bloqueado com sucesso',
      data: { cartaoVirtual: publicVirtualCard(atualizado) },
    });
  } catch (error) {
    logger.error('Erro ao bloquear cartão virtual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.post('/:id/virtual/unblock', async (req, res) => {
  try {
    const { id } = req.params;
    const cartaoBase = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: { in: ['aprovado', 'ativo'] },
      },
      select: { id: true }
    });

    if (!cartaoBase) {
      return res.status(400).json({
        success: false,
        message: 'Cartão base não elegível para desbloqueio virtual',
        code: 'BASE_CARD_NOT_ELIGIBLE'
      });
    }

    const cartaoVirtual = await prisma.cartaoVirtual.findFirst({
      where: {
        cartaoId: id,
        userId: req.user.id,
        status: 'bloqueado',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!cartaoVirtual) {
      return res.status(404).json({
        success: false,
        message: 'Cartão virtual não encontrado ou não está bloqueado',
        code: 'VIRTUAL_CARD_NOT_FOUND'
      });
    }

    const atualizado = await prisma.cartaoVirtual.update({
      where: { id: cartaoVirtual.id },
      data: { status: 'ativo', dataBloqueio: null }
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.virtual.unblocked',
      entity: 'CartaoVirtual',
      entityId: atualizado.id,
      metadata: { cartaoId: id },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão virtual desbloqueado com sucesso',
      data: { cartaoVirtual: publicVirtualCard(atualizado) },
    });
  } catch (error) {
    logger.error('Erro ao desbloquear cartão virtual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.post('/:id/shipment/unlock', validateShipmentPhysicalUnlock, async (req, res) => {
  try {
    const { id } = req.params;
    const { last4 } = req.body;

    const cartao = await prisma.cartao.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true, last4: true, status: true }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado',
        code: 'CARD_NOT_FOUND'
      });
    }

    if (normalizeLast4Digits(cartao.last4) !== normalizeLast4Digits(last4)) {
      return res.status(400).json({
        success: false,
        message: 'Os últimos 4 dígitos não conferem com o cartão selecionado',
        code: 'LAST4_MISMATCH'
      });
    }

    const latestDone = await prisma.cardShipment.findFirst({
      where: {
        cardId: id,
        userId: req.user.id,
        status: 'DESBLOQUEADO'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (latestDone) {
      return res.json({
        success: true,
        message: 'Cartão físico já estava desbloqueado',
        data: {
          shipment: publicShipment(latestDone),
          idempotent: true
        }
      });
    }

    const shipment = await prisma.cardShipment.findFirst({
      where: {
        cardId: id,
        userId: req.user.id,
        status: 'AGUARDANDO_DESBLOQUEIO'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!shipment) {
      return res.status(409).json({
        success: false,
        message: 'Desbloqueio indisponível: entrega ainda não confirmada ou fluxo logístico incompleto',
        code: 'SHIPMENT_NOT_READY_FOR_UNLOCK'
      });
    }

    const unlockedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.cardShipment.update({
        where: { id: shipment.id },
        data: { status: 'DESBLOQUEADO' }
      });
      await tx.cardShipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          userId: req.user.id,
          eventType: 'STATUS_ATUALIZADO',
          shipmentStatus: 'DESBLOQUEADO',
          eventAt: unlockedAt,
          description: 'Titular confirmou os dados e desbloqueou o cartão físico no app.',
          createdByType: 'USER',
          createdById: req.user.id
        }
      });
      return row;
    });

    await recordAudit({
      userId: req.user.id,
      action: 'shipment.physical.unlocked',
      entity: 'CardShipment',
      entityId: updated.id,
      metadata: { cardId: id },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.json({
      success: true,
      message: 'Cartão físico desbloqueado com sucesso',
      data: { shipment: publicShipment(updated) }
    });
  } catch (error) {
    logger.error('Erro ao desbloquear cartão físico:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.post('/:id/shipment', validateCardShipmentCreate, async (req, res) => {
  try {
    const { id } = req.params;
    const { idempotencyKey, deliveryAddressSnapshot, isSecondIssue, originShipmentId, reason } = req.body;
    const shipmentChargeIdempotencyKey = `card-shipment-charge:${String(idempotencyKey).trim()}`;

    const existingByIdempotency = await prisma.cardShipment.findUnique({
      where: { idempotencyKeyCharge: shipmentChargeIdempotencyKey },
      include: {
        events: { orderBy: { eventAt: 'asc' } }
      }
    });

    if (existingByIdempotency) {
      if (existingByIdempotency.userId !== req.user.id || existingByIdempotency.cardId !== id) {
        return res.status(409).json({
          success: false,
          message: 'Chave de idempotência já utilizada',
          code: 'IDEMPOTENCY_KEY_CONFLICT'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Remessa já registrada para esta chave de idempotência',
        data: {
          shipment: publicShipment(existingByIdempotency),
          timeline: existingByIdempotency.events,
          idempotent: true
        }
      });
    }

    const card = await prisma.cartao.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado',
        code: 'CARD_NOT_FOUND'
      });
    }

    if (!['aprovado', 'ativo'].includes(card.status)) {
      return res.status(422).json({
        success: false,
        message: 'Cartão ainda não elegível para envio físico',
        code: 'CARD_NOT_ELIGIBLE'
      });
    }

    const openShipment = await prisma.cardShipment.findFirst({
      where: {
        cardId: id,
        userId: req.user.id,
        status: { notIn: TERMINAL_SHIPMENT_STATUSES }
      }
    });

    if (openShipment) {
      return res.status(409).json({
        success: false,
        message: 'Já existe uma remessa logística em andamento para este cartão',
        code: 'SHIPMENT_ALREADY_EXISTS'
      });
    }

    const safeAddressSnapshot = sanitizeAddressSnapshot(deliveryAddressSnapshot);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.user.findUnique({
        where: { id: req.user.id },
        select: { saldoAtual: true }
      });

      const saldoAtual = asMoneyNumber(account?.saldoAtual);
      const saldoAposTarifa = roundMoney(saldoAtual - SHIPPING_FEE_BRL);

      if (saldoAposTarifa < 0) {
        const shipment = await tx.cardShipment.create({
          data: {
            cardId: id,
            userId: req.user.id,
            status: 'AGUARDANDO_COBRANCA',
            shippingFeeAmount: SHIPPING_FEE_BRL,
            shippingFeeStatus: 'PENDENTE',
            idempotencyKeyCharge: shipmentChargeIdempotencyKey,
            addressSnapshot: safeAddressSnapshot,
            isSecondIssue: Boolean(isSecondIssue),
            originShipmentId: originShipmentId || null,
          }
        });

        const event = await tx.cardShipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            userId: req.user.id,
            eventType: 'STATUS_ATUALIZADO',
            shipmentStatus: 'AGUARDANDO_COBRANCA',
            eventAt: now,
            description:
              'Taxa de emissão e frete (R$ 39,90) não debitada: saldo insuficiente. Limite do cartão permanece aprovado; o cartão físico só entra em produção após pagamento.',
            createdByType: 'USER',
            createdById: req.user.id
          }
        });

        return {
          shipment,
          timeline: [event],
          insufficientBalance: true,
          balance: {
            saldoAtual,
            shippingFeeAmount: SHIPPING_FEE_BRL
          }
        };
      }

      const movement = await tx.movimentacao.create({
        data: {
          userId: req.user.id,
          tipo: 'tarifa',
          descricao: 'Taxa de emissão e frete — cartão físico (R$ 39,90)',
          valor: -SHIPPING_FEE_BRL,
          saldoAnterior: saldoAtual,
          saldoAtual: saldoAposTarifa,
          categoria: 'cartao_fisico_emissao_frete',
          referenceType: 'card_shipment',
          idempotencyKey: shipmentChargeIdempotencyKey
        }
      });

      await tx.user.update({
        where: { id: req.user.id },
        data: {
          saldoAtual: saldoAposTarifa
        }
      });

      const shipment = await tx.cardShipment.create({
        data: {
          cardId: id,
          userId: req.user.id,
          status: 'EM_PRODUCAO',
          shippingFeeAmount: SHIPPING_FEE_BRL,
          shippingFeeStatus: 'DEBITADO',
          shippingFeeMovementId: movement.id,
          idempotencyKeyCharge: shipmentChargeIdempotencyKey,
          addressSnapshot: safeAddressSnapshot,
          isSecondIssue: Boolean(isSecondIssue),
          originShipmentId: originShipmentId || null,
        }
      });

      await tx.movimentacao.update({
        where: { id: movement.id },
        data: { referenceId: shipment.id }
      });

      const t0 = now;
      const t1 = new Date(now.getTime() + 1);
      const chargedEvent = await tx.cardShipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          userId: req.user.id,
          eventType: 'FRETE_COBRADO',
          shipmentStatus: 'COBRANCA_CONFIRMADA',
          eventAt: t0,
          description: 'Pagamento da taxa de emissão e frete (R$ 39,90) confirmado no saldo da conta.',
          createdByType: 'SYSTEM',
        }
      });
      const productionEvent = await tx.cardShipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          userId: req.user.id,
          eventType: 'STATUS_ATUALIZADO',
          shipmentStatus: 'EM_PRODUCAO',
          eventAt: t1,
          description: 'Cartão físico em produção. A remessa e o rastreamento serão criados quando a logística registrar os dados reais.',
          createdByType: 'SYSTEM',
        }
      });

      return {
        shipment,
        timeline: [chargedEvent, productionEvent],
        insufficientBalance: false,
        movement
      };
    });

    await recordAudit({
      userId: req.user.id,
      action: result.insufficientBalance ? 'shipment.freight.charge_failed' : 'shipment.freight.charged',
      entity: 'CardShipment',
      entityId: result.shipment.id,
      metadata: {
        cardId: id,
        shippingFeeAmount: SHIPPING_FEE_BRL,
        shippingFeeStatus: result.shipment.shippingFeeStatus,
        reason: reason || null
      },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (result.insufficientBalance) {
      return res.status(402).json({
        success: false,
        message: 'Saldo insuficiente para cobrança do frete do cartão físico',
        code: 'INSUFFICIENT_BALANCE',
        data: {
          shipment: publicShipment(result.shipment),
          timeline: result.timeline,
          financial: result.balance
        }
      });
    }

    logger.banking('card_shipment_created', req.user.id, {
      cardId: id,
      shipmentId: result.shipment.id,
      shippingFeeAmount: SHIPPING_FEE_BRL
    });

    return res.status(201).json({
      success: true,
      message: 'Remessa de cartão físico criada e frete debitado',
      data: {
        shipment: publicShipment(result.shipment),
        timeline: result.timeline,
        financial: {
          movementId: result.movement.id,
          amount: -SHIPPING_FEE_BRL,
          category: 'cartao_fisico_emissao_frete'
        }
      }
    });
  } catch (error) {
    if (error && error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Chave de idempotência já utilizada',
        code: 'IDEMPOTENCY_KEY_CONFLICT'
      });
    }

    logger.error('Erro ao criar remessa de cartão físico:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.get('/:id/shipment', async (req, res) => {
  try {
    const { id } = req.params;
    const card = await prisma.cartao.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true }
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado',
        code: 'CARD_NOT_FOUND'
      });
    }

    const shipment = await prisma.cardShipment.findFirst({
      where: { cardId: id, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        events: {
          orderBy: { eventAt: 'desc' },
          take: 20
        }
      }
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Remessa não encontrada para este cartão',
        code: 'SHIPMENT_NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      message: 'Status logístico do cartão consultado com sucesso',
      data: {
        shipment: publicShipment(shipment),
        timeline: shipment.events
      }
    });
  } catch (error) {
    logger.error('Erro ao consultar remessa do cartão:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.get('/:id/shipment/timeline', validateShipmentTimelineQuery, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const shipment = await prisma.cardShipment.findFirst({
      where: { cardId: id, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Remessa não encontrada para este cartão',
        code: 'SHIPMENT_NOT_FOUND'
      });
    }

    const [timeline, total] = await Promise.all([
      prisma.cardShipmentEvent.findMany({
        where: { shipmentId: shipment.id },
        orderBy: { eventAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.cardShipmentEvent.count({
        where: { shipmentId: shipment.id }
      })
    ]);

    return res.json({
      success: true,
      message: 'Timeline logística consultada com sucesso',
      data: {
        shipmentId: shipment.id,
        timeline,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao consultar timeline logística:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

function generateExpiryDate() {
  const now = new Date();
  const year = now.getFullYear() + 5;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${month}/${year}`;
}

function hashCvv(cvv) {
  return crypto.createHash('sha256').update(String(cvv)).digest('hex');
}

/** Demo: últimos 4 dígitos e máscara; PAN completo nunca é persistido. */
function generateDemoCardFields() {
  const brands = ['visa', 'mastercard', 'elo'];
  const bandeira = brands[Math.floor(Math.random() * brands.length)];
  const last4 = String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
  const maskedNumber = `**** **** **** ${last4}`;
  const cardToken = `demo_${uuidv4()}`;
  const validade = generateExpiryDate();
  return { maskedNumber, last4, bandeira, cardToken, validade };
}

/** Demo: PAN mascarado e CVV somente em hash persistido. */
function generateDemoVirtualCardFields(bandeiraBase) {
  const bandeira = bandeiraBase || 'visa';
  const last4 = String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
  const maskedNumber = `**** **** **** ${last4}`;
  const cardToken = `virtual_${uuidv4()}`;
  const validade = generateExpiryDate();
  const cvv = String(Math.floor(100 + Math.random() * 900));
  const cvvHash = hashCvv(cvv);
  return { maskedNumber, last4, validade, bandeira, cardToken, cvvHash };
}

function calculateCreditLimit(scoreCredito) {
  // Calcular limite baseado no score de crédito
  if (scoreCredito >= 800) return 10000;
  if (scoreCredito >= 700) return 5000;
  if (scoreCredito >= 600) return 2000;
  return 1000;
}

module.exports = router;
