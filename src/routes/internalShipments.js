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

    if (status === 'REMESSA_CRIADA') {
      const tc = trackingCode != null ? String(trackingCode).trim() : '';
      if (tc.length < 4) {
        return res.status(400).json({
          success: false,
          message: 'Remessa criada exige código de rastreamento informado pela transportadora',
          code: 'TRACKING_REQUIRED'
        });
      }
    }

    const eventDate = eventAt ? new Date(eventAt) : new Date();
    const shouldIncrementAttempts = status === 'FALHA_ENTREGA';
    const incomingStatus = status || null;
    const isDeliveryComplete = incomingStatus === 'ENTREGUE';

    const result = await prisma.$transaction(async (tx) => {
      const dataPatch = {
        ...(incomingStatus && !isDeliveryComplete ? { status: incomingStatus } : {}),
        ...(isDeliveryComplete ? { status: 'AGUARDANDO_DESBLOQUEIO' } : {}),
        ...(carrierCode ? { carrierCode } : {}),
        ...(carrierName ? { carrierName } : {}),
        ...(trackingCode ? { trackingCode } : {}),
        ...(trackingUrl ? { trackingUrl } : {}),
        ...(incomingStatus === 'POSTADO' ? { postedAt: eventDate } : {}),
        ...(isDeliveryComplete ? { deliveredAt: eventDate } : {}),
        ...(incomingStatus === 'ENTREGUE' ? {} : {}),
        ...(incomingStatus === 'DEVOLVIDO' ? { returnedAt: eventDate } : {}),
        ...(incomingStatus === 'CANCELADO' ? { returnedAt: eventDate } : {}),
        ...(shouldIncrementAttempts
          ? { deliveryAttempts: { increment: 1 } }
          : {})
      };

      const shipmentUpdated = await tx.cardShipment.update({
        where: { id: shipmentId },
        data: dataPatch
      });

      const firstEvent = await tx.cardShipmentEvent.create({
        data: {
          shipmentId,
          userId: shipment.userId,
          eventType,
          shipmentStatus: isDeliveryComplete ? 'ENTREGUE' : (incomingStatus || shipmentUpdated.status),
          eventAt: eventDate,
          description: description || null,
          providerPayload: providerPayload || undefined,
          createdByType: 'INTERNAL_API',
        }
      });

      let secondEvent = null;
      if (isDeliveryComplete) {
        secondEvent = await tx.cardShipmentEvent.create({
          data: {
            shipmentId,
            userId: shipment.userId,
            eventType: 'STATUS_ATUALIZADO',
            shipmentStatus: 'AGUARDANDO_DESBLOQUEIO',
            eventAt: new Date(eventDate.getTime() + 1),
            description: 'Entrega confirmada. Confirme os dados do cartão no app para desbloquear o cartão físico.',
            createdByType: 'INTERNAL_API',
          }
        });
      }

      return { shipmentUpdated, firstEvent, secondEvent };
    });

    const { shipmentUpdated, firstEvent, secondEvent } = result;

    await recordAudit({
      userId: shipment.userId,
      action: 'shipment.status.updated',
      entity: 'CardShipment',
      entityId: shipmentId,
      metadata: {
        eventType,
        status: incomingStatus || shipmentUpdated.status,
        trackingCode: trackingCode || shipmentUpdated.trackingCode || null,
        carrierCode: carrierCode || shipmentUpdated.carrierCode || null
      }
    });

    const events = secondEvent ? [firstEvent, secondEvent] : [firstEvent];
    return res.status(201).json({
      success: true,
      message: 'Evento logístico registrado com sucesso',
      data: {
        shipment: shipmentUpdated,
        events,
        event: events[0],
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
