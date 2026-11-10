import type { Request, Response } from "express";
import {
  getPayassureWebhookSecret,
} from "../payassure";
import {
  parsePayassureWebhookEvent,
  readPayassureWebhookRecipient,
  verifyPayassureWebhookSignature,
  type PayassureWebhookEvent,
} from "../payassure-webhook";

export async function verifyWebhookRequest(
  req: Request,
  res: Response,
): Promise<PayassureWebhookEvent | null> {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  if (!rawBody) {
    console.warn("[PayAssure] Rejected webhook without a raw JSON body");
    res.status(400).json({ error: "Expected a JSON webhook body" });
    return null;
  }
  const recipientMerchantId = readPayassureWebhookRecipient(rawBody);
  if (!recipientMerchantId) {
    console.warn("[PayAssure] Rejected malformed webhook recipient");
    res.status(400).json({ error: "Webhook recipient is missing or malformed" });
    return null;
  }
  const timestamp = req.get("x-payassure-timestamp") ?? undefined;
  const signature = req.get("x-payassure-signature") ?? undefined;
  let secret: string | null;
  try {
    secret = await getPayassureWebhookSecret(recipientMerchantId);
  } catch (error) {
    console.error("[PayAssure] Could not load webhook verification credentials", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    res.status(503).json({ error: "PayAssure webhook verification is temporarily unavailable" });
    return null;
  }
  if (!secret) {
    console.warn("[PayAssure] Rejected webhook for unknown merchant", { recipientMerchantId });
    res.status(401).json({ error: "Unknown PayAssure webhook recipient" });
    return null;
  }
  if (!verifyPayassureWebhookSignature(rawBody, timestamp, signature, secret)) {
    console.warn("[PayAssure] Rejected webhook with invalid or stale signature", {
      recipientMerchantId,
    });
    res.status(401).json({ error: "Invalid PayAssure webhook signature" });
    return null;
  }
  try {
    return parsePayassureWebhookEvent(
      rawBody,
      req.get("x-payassure-event-id") ?? undefined,
      req.get("x-payassure-event") ?? undefined,
    );
  } catch (error) {
    console.warn("[PayAssure] Rejected malformed webhook", {
      recipientMerchantId,
      message: error instanceof Error ? error.message : "Invalid event",
    });
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid PayAssure webhook event",
    });
    return null;
  }
}
