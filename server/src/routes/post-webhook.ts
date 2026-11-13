import { Router } from "express";
import { processWebhookRequest } from "../services/webhook-processing";
import { verifyWebhookRequest } from "../services/webhook-verification";

const router = Router();

router.post("/webhook", async (req, res, next) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  console.info("[PayAssure] Webhook request received", {
    endpoint: req.originalUrl,
    eventId: req.get("x-payassure-event-id"),
    eventType: req.get("x-payassure-event"),
    bodyBytes: rawBody?.length ?? null,
  });
  const event = await verifyWebhookRequest(req, res);
  if (!event) return;
  console.info("[PayAssure] Webhook signature and payload verified", {
    eventId: event.id,
    eventType: event.type,
    ...(event.type === "payment.escrow.deposit.succeeded" ? {
      depositId: event.depositId,
    } : {
      merchantTransactionReference: event.merchantTransactionReference,
      settlementReference: event.settlementReference,
      providerSettlementId: event.settlementId,
    }),
    recipientMerchantId: event.recipientMerchantId,
  });
  await processWebhookRequest(event, res, next);
});

export default router;
