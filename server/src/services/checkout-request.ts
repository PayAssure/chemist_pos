import type { Request, Response } from "express";
import { checkoutSchema } from "../validation/checkout";
import { getRegisteredPayassureWebhookUrl } from "../payassure";
import { normalizeMpesaPhone } from "./checkout-helpers";
import type { CheckoutInput } from "./checkout-models";

export function parseCheckoutRequest(
  req: Request,
  res: Response,
): { checkout: CheckoutInput; mpesaPhone: string | null } | null {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    if (req.body?.paymentMethod === "credit" || req.body?.paymentMethod === "mpesa") {
      const payerIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === "payerName" || issue.path[0] === "payerPhone",
      );
      if (payerIssue) {
        res.status(400).json({ error: payerIssue.message });
        return null;
      }
    }
    res.status(400).json({ error: "Provide one or more valid checkout items" });
    return null;
  }
  if (!getRegisteredPayassureWebhookUrl()) {
    res.status(503).json({
      code: "PAYASSURE_WEBHOOK_NOT_READY",
      error: "The PayAssure webhook receiver has not been configured for this server session. Sign out and sign in again before checkout.",
    });
    return null;
  }
  let mpesaPhone: string | null = null;
  if (parsed.data.paymentMethod === "mpesa") {
    try {
      mpesaPhone = normalizeMpesaPhone(parsed.data.payerPhone ?? "");
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Enter a valid Kenyan M-Pesa phone number",
      });
      return null;
    }
  }
  return { checkout: parsed.data, mpesaPhone };
}

export function checkoutQuantities(
  checkout: CheckoutInput,
  res: Response,
): Map<number, number> | null {
  const quantities = new Map<number, number>();
  for (const item of checkout.items) {
    const combined = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(combined) || combined > 2147483647) {
      res.status(400).json({ error: "A product quantity is too large" });
      return null;
    }
    quantities.set(item.productId, combined);
  }
  return quantities;
}
