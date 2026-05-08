/**
 * Cobranças de produtos AgilBank (seguro de empréstimo, frete de cartão, etc.)
 * Agrega registros reais existentes — sem criar cobrança fictícia.
 */
const express = require('express');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticateToken);
router.use(requireVerification);

const DEFAULT_RECEIVER_PIX_KEY = '96503a78-b304-4934-989e-872a73c455fd';

function receiverPixKey() {
  const k = String(process.env.AGILBANK_COBRANCAS_PIX_KEY || '').trim();
  return k || DEFAULT_RECEIVER_PIX_KEY;
}

function maskCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return 'Não informado';
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function protocolForLoanInsurance(chargeId) {
  const tail = String(chargeId || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  return `AGIL-LI-${tail || '000000'}`;
}

function protocolForCardShipping(shipmentId) {
  const tail = String(shipmentId || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  return `AGIL-FE-${tail || '000000'}`;
}

function mapInsuranceToListItem(row) {
  const amount = Number(row.amount);
  return {
    id: row.id,
    type: 'loan_insurance',
    product: 'Crédito pessoal',
    title: 'Seguro do empréstimo',
    description: 'Cobrança referente ao seguro opcional do crédito pessoal.',
    amount: Number.isFinite(amount) ? amount : 0,
    status: row.status,
    createdAt: row.createdAt,
    dueDate: null,
    loanId: row.loanId,
  };
}

function mapShipmentToListItem(row) {
  const amount = Number(row.shippingFeeAmount);
  return {
    id: row.id,
    type: 'card_shipping',
    product: 'Cartão',
    title: 'Taxa de envio do cartão',
    description: `Frete do cartão final •••• ${String(row.card && row.card.last4 ? row.card.last4 : '----')}`,
    amount: Number.isFinite(amount) ? amount : 0,
    status: row.shippingFeeStatus === 'PENDENTE' ? 'pendente' : String(row.shippingFeeStatus || '').toLowerCase(),
    createdAt: row.createdAt,
    dueDate: null,
    cardId: row.cardId,
  };
}

/**
 * GET /api/charges — cobranças pendentes do usuário autenticado.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const [insuranceRows, shipmentRows] = await Promise.all([
      prisma.loanInsuranceCharge.findMany({
        where: { userId, status: 'pendente' },
        orderBy: { createdAt: 'desc' },
        include: {
          emprestimo: { select: { id: true, status: true } },
        },
      }),
      prisma.cardShipment.findMany({
        where: {
          userId,
          shippingFeeStatus: 'PENDENTE',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          card: { select: { last4: true } },
        },
      }),
    ]);

    const charges = [
      ...insuranceRows.map(mapInsuranceToListItem),
      ...shipmentRows.map(mapShipmentToListItem),
    ];

    charges.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({
      success: true,
      data: { charges },
    });
  } catch (error) {
    logger.error('Erro ao listar cobranças:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

async function loadChargeDetail(id, userId) {
  const lic = await prisma.loanInsuranceCharge.findFirst({
    where: { id, userId },
    include: { emprestimo: { select: { id: true, status: true, valorAprovado: true } } },
  });
  if (lic) {
    const amount = Number(lic.amount);
    return {
      type: 'loan_insurance',
      charge: {
        id: lic.id,
        protocol: protocolForLoanInsurance(lic.id),
        status: lic.status,
        product: 'Seguro do empréstimo',
        description: 'Seguro opcional do crédito pessoal.',
        amount: Number.isFinite(amount) ? amount : 0,
        createdAt: lic.createdAt,
        paidAt: lic.paidAt,
        dueDate: null,
        loanId: lic.loanId,
        canPayPix: lic.status === 'pendente',
      },
    };
  }

  const ship = await prisma.cardShipment.findFirst({
    where: { id, userId },
    include: { card: { select: { last4: true } } },
  });
  if (ship) {
    const amount = Number(ship.shippingFeeAmount);
    const pendente = ship.shippingFeeStatus === 'PENDENTE';
    return {
      type: 'card_shipping',
      charge: {
        id: ship.id,
        protocol: protocolForCardShipping(ship.id),
        status: pendente ? 'pendente' : String(ship.shippingFeeStatus || '').toLowerCase(),
        product: 'Taxa de envio do cartão',
        description: `Frete do cartão final •••• ${String(ship.card && ship.card.last4 ? ship.card.last4 : '----')}`,
        amount: Number.isFinite(amount) ? amount : 0,
        createdAt: ship.createdAt,
        paidAt: null,
        dueDate: null,
        cardId: ship.cardId,
        canPayPix: pendente,
      },
    };
  }

  return null;
}

/**
 * GET /api/charges/:id — detalhe para exibição na guia (dados reais + usuário mascarado).
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const detail = await loadChargeDetail(id, userId);
    if (!detail) {
      return res.status(404).json({
        success: false,
        message: 'Cobrança não encontrada',
        code: 'CHARGE_NOT_FOUND',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { nomeCompleto: true, email: true, cpf: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      data: {
        charge: detail.charge,
        user: {
          name: user.nomeCompleto || 'Não informado',
          cpf: maskCpf(user.cpf),
          email: user.email || 'Não informado',
        },
      },
    });
  } catch (error) {
    logger.error('Erro ao obter cobrança:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /api/charges/:id/pix — retorna chave Pix recebedora (sem gerar EMV/QR falso, sem alterar saldo).
 */
router.post('/:id/pix', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const detail = await loadChargeDetail(id, userId);
    if (!detail || !detail.charge) {
      return res.status(404).json({
        success: false,
        message: 'Cobrança não encontrada',
        code: 'CHARGE_NOT_FOUND',
      });
    }

    if (!detail.charge.canPayPix) {
      return res.status(400).json({
        success: false,
        message: 'Esta cobrança não está pendente de pagamento via esta via',
        code: 'CHARGE_NOT_PAYABLE',
      });
    }

    const pixKey = receiverPixKey();

    return res.json({
      success: true,
      data: {
        chargeId: detail.charge.id,
        pixKey,
        pixMode: 'pix_key',
        message: 'Use a chave Pix para realizar o pagamento.',
      },
    });
  } catch (error) {
    logger.error('Erro ao preparar Pix da cobrança:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
