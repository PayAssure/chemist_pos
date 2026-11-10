import { createHash } from "node:crypto";
import { pool } from "../db";
import { checkoutSchema } from "../validation/checkout";
import { z } from "zod";

export async function recordFailedCheckout(
  email: string,
  paymentMethod: "cash" | "mpesa" | "credit",
  items: Array<{ productId: number; quantity: number }>,
  failureReason: string,
): Promise<void> {
  const total = await pool.query(
    `SELECT COUNT(*) AS "matchedProducts",
            COALESCE(SUM(p.price_cents::bigint * requested.quantity), 0)::text AS "totalCents"
     FROM jsonb_to_recordset($1::jsonb)
       AS requested("productId" integer, quantity integer)
     JOIN products p ON p.id = requested."productId"`,
    [JSON.stringify(items)],
  );
  const totalCents =
    Number(total.rows[0].matchedProducts) === items.length
      ? Number(total.rows[0].totalCents)
      : null;
  await pool.query(
    `INSERT INTO failed_checkout_attempts
       (payment_method, total_cents, failure_reason, created_by)
     VALUES ($1, $2, $3, $4)`,
    [paymentMethod, totalCents, failureReason, email],
  );
}

export function normalizeMpesaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^(07|01)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^(7|1)\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  throw new Error("Enter a valid Kenyan M-Pesa phone number");
}

export function checkoutRequestFingerprint(
  checkout: z.infer<typeof checkoutSchema>,
  normalizedMpesaPhone: string | null,
): string {
  const requestedQuantities = new Map<number, number>();
  for (const item of checkout.items) {
    requestedQuantities.set(
      item.productId,
      (requestedQuantities.get(item.productId) ?? 0) + item.quantity,
    );
  }
  const details = {
    paymentMethod: checkout.paymentMethod,
    items: [...requestedQuantities]
      .sort(([productIdA], [productIdB]) => productIdA - productIdB)
      .map(([productId, quantity]) => ({ productId, quantity })),
    payerName: checkout.payerName?.trim() ?? null,
    payerPhone: normalizedMpesaPhone ?? checkout.payerPhone?.trim() ?? null,
  };
  return createHash("sha256").update(JSON.stringify(details)).digest("hex");
}

export function settlementFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown PayAssure settlement error";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/("(?:apiKey|apiSecret|token|accessToken|refreshToken)"\s*:\s*")[^"]+/gi, "$1[REDACTED]");
}
