import { z } from "zod";

export const checkoutSchema = z.object({
  paymentMethod: z.enum(["cash", "mpesa", "credit"]),
  merchantTransactionReference: z.string().trim().min(1).max(120).optional(),
  payerName: z.string().trim().max(120).optional(),
  payerPhone: z.string().trim().max(30).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive().max(2147483647),
      }),
    )
    .min(1)
    .max(100),
}).superRefine((checkout, context) => {
  if (checkout.paymentMethod === "credit") {
    if (!checkout.payerName) {
      context.addIssue({
        code: "custom",
        path: ["payerName"],
        message: "Payer name is required for credit sales",
      });
    }
    if (!checkout.payerPhone || checkout.payerPhone.replace(/\D/g, "").length < 7) {
      context.addIssue({
        code: "custom",
        path: ["payerPhone"],
        message: "A valid payer phone number is required for credit sales",
      });
    }
  }
  if (
    checkout.paymentMethod === "mpesa" &&
    (!checkout.payerPhone || checkout.payerPhone.replace(/\D/g, "").length < 9)
  ) {
    context.addIssue({
      code: "custom",
      path: ["payerPhone"],
      message: "A valid customer phone number is required for M-Pesa",
    });
  }
});
