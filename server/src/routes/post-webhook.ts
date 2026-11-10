import { Router } from "express";
import { processWebhookRequest } from "../services/webhook-processing";
import { verifyWebhookRequest } from "../services/webhook-verification";

const router = Router();

router.post("/webhook", async (req, res, next) => {
  const event = await verifyWebhookRequest(req, res);
  if (event) await processWebhookRequest(event, res, next);
});

export default router;
