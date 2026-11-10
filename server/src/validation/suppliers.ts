import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  payassureEnrolled: z.boolean(),
  merchantId: z.string().trim().max(200).default(""),
  contactName: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.string().trim().max(254).refine(
    (value) => !value || z.email().safeParse(value).success,
    "Provide a valid supplier email address",
  ).default(""),
  address: z.string().trim().max(300).default(""),
}).superRefine((supplier, context) => {
  if (supplier.payassureEnrolled && !supplier.merchantId) {
    context.addIssue({
      code: "custom",
      path: ["merchantId"],
      message: "A PayAssure merchant ID is required for enrolled suppliers",
    });
  }
  if (!supplier.payassureEnrolled && supplier.merchantId) {
    context.addIssue({
      code: "custom",
      path: ["merchantId"],
      message: "Non-enrolled suppliers cannot have a PayAssure merchant ID",
    });
  }
});
