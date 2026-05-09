const express = require('express');
const { authenticateToken, requireVerification, logCriticalOperation } = require('../middleware/auth');
const { validateBoletoPayment } = require('../middleware/validation');
const { prisma, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { getOrCreateGruCobranca } = require('../utils/gruCharge');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);
router.use(requireVerification);

/**
 * @swagger
 * /api/boletos:
 *   get:
 *     summary: Listar boletos do usuário
 *     tags: [Boletos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pendente, pago, vencido]
 *         description: Filtrar por status
 *     responses:
 *       200:
 *         description: Boletos listados com sucesso
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    
    const where = { userId: req.user.id };
    if (status) {
      where.status = status;
    }

    const boletos = await prisma.boleto.findMany({
      where,
      orderBy: { dataVencimento: 'desc' },
      select: {
        id: true,
        codigoBarras: true,
        valor: true,
        dataVencimento: true,
        descricao: true,
        beneficiario: true,
        status: true,
        dataPagamento: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      message: 'Boletos listados com sucesso',
      data: { boletos }
    });

  } catch (error) {
    logger.error('Erro ao listar boletos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/boletos/gru
 * Cobrança GRU (dados reais: boleto vinculado à solicitação ou taxa de remessa pendente).
 * Deve ficar antes de GET /:id para não capturar "gru" como id de boleto.
 */
router.get('/gru', async (req, res) => {
  try {
    const result = await getOrCreateGruCobranca(prisma, req.user.id);
    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Nenhuma cobrança GRU pendente encontrada para esta conta.',
        code: 'GRU_COBRANCA_NOT_FOUND',
      });
    }
    return res.json({
      success: true,
      message: 'Cobrança GRU obtida com sucesso',
      data: { cobranca: result.cobranca },
    });
  } catch (error) {
    logger.error('Erro ao obter cobrança GRU:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
    });
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/boletos:
 *   post:
 *     summary: Gerar novo boleto
 *     tags: [Boletos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - valor
 *               - dataVencimento
 *               - descricao
 *               - beneficiario
 *             properties:
 *               valor:
 *                 type: number
 *               dataVencimento:
 *                 type: string
 *                 format: date
 *               descricao:
 *                 type: string
 *               beneficiario:
 *                 type: string
 *     responses:
 *       201:
 *         description: Boleto gerado com sucesso
 */
router.post('/', async (req, res) => {
  try {
    const { valor, dataVencimento, descricao, beneficiario } = req.body;

    // Gerar código de barras único
    const codigoBarras = generateBarcode();

    const boleto = await prisma.boleto.create({
      data: {
        userId: req.user.id,
        codigoBarras,
        valor,
        dataVencimento: new Date(dataVencimento),
        descricao,
        beneficiario,
        status: 'pendente'
      }
    });

    logger.banking('boleto_generated', req.user.id, {
      valor,
      beneficiario,
      dataVencimento
    });

    res.status(201).json({
      success: true,
      message: 'Boleto gerado com sucesso',
      data: { boleto }
    });

  } catch (error) {
    logger.error('Erro ao gerar boleto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/boletos/{id}/pay:
 *   post:
 *     summary: Pagar boleto
 *     tags: [Boletos]
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
 *         description: Boleto pago com sucesso
 */
router.post('/:id/pay', logCriticalOperation('boleto_payment'), async (req, res) => {
  try {
    const { id } = req.params;

    const boleto = await prisma.boleto.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'pendente'
      }
    });

    if (!boleto) {
      return res.status(404).json({
        success: false,
        message: 'Boleto não encontrado ou já pago',
        code: 'BOLETO_NOT_FOUND'
      });
    }

    // Verificar se boleto está vencido
    if (new Date() > boleto.dataVencimento) {
      return res.status(400).json({
        success: false,
        message: 'Boleto vencido',
        code: 'BOLETO_EXPIRED'
      });
    }

    // Verificar saldo disponível
    if (req.user.saldoAtual < boleto.valor) {
      return res.status(400).json({
        success: false,
        message: 'Saldo insuficiente',
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    // Executar pagamento
    const resultado = await transaction(async (prisma) => {
      // Atualizar boleto
      const boletoAtualizado = await prisma.boleto.update({
        where: { id },
        data: {
          status: 'pago',
          dataPagamento: new Date()
        }
      });

      // Debitar valor da conta
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          saldoAtual: {
            decrement: boleto.valor
          }
        }
      });

      // Registrar movimentação
      await prisma.movimentacao.create({
        data: {
          userId: req.user.id,
          tipo: 'boleto',
          descricao: `Pagamento de boleto - ${boleto.descricao}`,
          valor: -boleto.valor,
          saldoAnterior: req.user.saldoAtual,
          saldoAtual: req.user.saldoAtual - boleto.valor,
          categoria: 'pagamento'
        }
      });

      return boletoAtualizado;
    });

    logger.criticalOperation('boleto_paid', req.user.id, boleto.valor, {
      boletoId: id,
      beneficiario: boleto.beneficiario
    });

    res.json({
      success: true,
      message: 'Boleto pago com sucesso',
      data: { boleto: resultado }
    });

  } catch (error) {
    logger.error('Erro ao pagar boleto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/boletos/validate:
 *   post:
 *     summary: Validar código de barras
 *     tags: [Boletos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - codigoBarras
 *             properties:
 *               codigoBarras:
 *                 type: string
 *     responses:
 *       200:
 *         description: Código de barras validado com sucesso
 */
router.post('/validate', async (req, res) => {
  try {
    const { codigoBarras } = req.body;

    if (!codigoBarras || codigoBarras.length !== 44) {
      return res.status(400).json({
        success: false,
        message: 'Código de barras inválido',
        code: 'INVALID_BARCODE'
      });
    }

    // Simular validação de código de barras
    const boletoInfo = validateBarcode(codigoBarras);

    if (!boletoInfo) {
      return res.status(400).json({
        success: false,
        message: 'Código de barras não encontrado',
        code: 'BARCODE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Código de barras validado com sucesso',
      data: { boletoInfo }
    });

  } catch (error) {
    logger.error('Erro ao validar código de barras:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/boletos/{id}:
 *   get:
 *     summary: Obter detalhes do boleto
 *     tags: [Boletos]
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
 *         description: Detalhes do boleto obtidos com sucesso
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const boleto = await prisma.boleto.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!boleto) {
      return res.status(404).json({
        success: false,
        message: 'Boleto não encontrado',
        code: 'BOLETO_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Detalhes do boleto obtidos com sucesso',
      data: { boleto }
    });

  } catch (error) {
    logger.error('Erro ao obter detalhes do boleto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/boletos/{id}/pdf:
 *   get:
 *     summary: Gerar PDF do boleto
 *     tags: [Boletos]
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
 *         description: PDF gerado com sucesso
 */
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;

    const boleto = await prisma.boleto.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!boleto) {
      return res.status(404).json({
        success: false,
        message: 'Boleto não encontrado',
        code: 'BOLETO_NOT_FOUND'
      });
    }

    // Aqui você implementaria a geração do PDF
    // Por enquanto, retornamos os dados do boleto
    res.json({
      success: true,
      message: 'PDF do boleto gerado com sucesso',
      data: { 
        boleto,
        pdfUrl: `/api/boletos/${id}/download` // URL fictícia para download
      }
    });

  } catch (error) {
    logger.error('Erro ao gerar PDF do boleto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Funções auxiliares
function generateBarcode() {
  // Gerar código de barras de 44 dígitos
  let barcode = '';
  for (let i = 0; i < 44; i++) {
    barcode += Math.floor(Math.random() * 10);
  }
  return barcode;
}

function validateBarcode(codigoBarras) {
  // Simular validação de código de barras
  // Em um sistema real, você faria a validação com o banco emissor
  
  if (codigoBarras.length !== 44) {
    return null;
  }

  // Simular dados do boleto
  return {
    valor: parseFloat(codigoBarras.substring(9, 19)) / 100,
    dataVencimento: calculateDueDate(codigoBarras),
    beneficiario: 'Beneficiário Exemplo',
    descricao: 'Pagamento de boleto'
  };
}

function calculateDueDate(codigoBarras) {
  // Simular cálculo de data de vencimento baseado no código
  const fatorVencimento = parseInt(codigoBarras.substring(5, 9));
  const dataBase = new Date('1997-10-07'); // Data base do sistema bancário
  const dataVencimento = new Date(dataBase.getTime() + (fatorVencimento * 24 * 60 * 60 * 1000));
  return dataVencimento;
}

module.exports = router;
