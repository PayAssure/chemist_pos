import { Router } from "express";
import { processWebhookRequest } from "../services/webhook-processing";
import { verifyWebhookRequest } from "../services/webhook-verification";

const router = Router();

router.post("/webhook", async (req, res, next) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : null;
  console.info("[PayAssure] Webhook request received", {
    endpoint: req.originalUrl,
    eventId: req.get("x-payassure-event-id"),
    eventType: req.get("x-payassure-event"),
    body: rawBody,
  });
  const event = await verifyWebhookRequest(req, res);
  if (event) await processWebhookRequest(event, res, next);
});

export default router;
