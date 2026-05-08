const express = require('express');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { requireInternalApiKey } = require('../middleware/auth');
const { validateInternalShipmentEvent } = require('../middleware/validation');
const { recordAudit } = require('../utils/auditLog');

const router = express.Router();

router.use(requireInternalApiKey('SHIPMENT_INTERNAL_API_KEY'));

router.post('/:shipmentId/events', validateInternalShipmentEvent, async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const {
      eventType,
      status,
      eventAt,
      carrierCode,
      carrierName,
      trackingCode,
      trackingUrl,
      description,
      providerPayload,
    } = req.body;

    const shipment = await prisma.cardShipment.findUnique({
      where: { id: shipmentId }
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Remessa não encontrada',
        code: 'SHIPMENT_NOT_FOUND'
      });
    }

    const eventDate = eventAt ? new Date(eventAt) : new Date();
    const shouldIncrementAttempts = status === 'FALHA_ENTREGA';

    const shipmentUpdated = await prisma.cardShipment.update({
      where: { id: shipmentId },
      data: {
        ...(status ? { status } : {}),
        ...(carrierCode ? { carrierCode } : {}),
        ...(carrierName ? { carrierName } : {}),
        ...(trackingCode ? { trackingCode } : {}),
        ...(trackingUrl ? { trackingUrl } : {}),
        ...(status === 'POSTADO' ? { postedAt: eventDate } : {}),
        ...(status === 'ENTREGUE' ? { deliveredAt: eventDate } : {}),
        ...(status === 'DEVOLVIDO' ? { returnedAt: eventDate } : {}),
        ...(shouldIncrementAttempts
          ? { deliveryAttempts: { increment: 1 } }
          : {})
      }
    });

    const timelineEvent = await prisma.cardShipmentEvent.create({
      data: {
        shipmentId,
        userId: shipment.userId,
        eventType,
        shipmentStatus: status || shipmentUpdated.status,
        eventAt: eventDate,
        description: description || null,
        providerPayload: providerPayload || undefined,
        createdByType: 'INTERNAL_API',
      }
    });

    await recordAudit({
      userId: shipment.userId,
      action: 'shipment.status.updated',
      entity: 'CardShipment',
      entityId: shipmentId,
      metadata: {
        eventType,
        status: status || shipmentUpdated.status,
        trackingCode: trackingCode || shipmentUpdated.trackingCode || null,
        carrierCode: carrierCode || shipmentUpdated.carrierCode || null
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Evento logístico registrado com sucesso',
      data: {
        shipment: shipmentUpdated,
        event: timelineEvent
      }
    });
  } catch (error) {
    logger.error('Erro ao registrar evento logístico interno:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
