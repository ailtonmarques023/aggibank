const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  ensureReferralCode,
  getReferralDashboard,
} = require('../services/referralService');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const dashboard = await getReferralDashboard(req.user.id);
    return res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Erro ao carregar painel de indicações:', error);
    return res.status(500).json({
      success: false,
      message: 'Não foi possível carregar seu Indique e Ganhe agora.',
      code: 'INTERNAL_ERROR',
    });
  }
});

router.post('/ensure-code', authenticateToken, async (req, res) => {
  try {
    const code = await ensureReferralCode(req.user.id);
    return res.status(201).json({
      success: true,
      data: {
        code: code.code,
      },
    });
  } catch (error) {
    logger.error('Erro ao gerar código de indicação:', error);
    return res.status(500).json({
      success: false,
      message: 'Não foi possível gerar seu código de convite agora.',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
