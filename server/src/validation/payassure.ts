import { z } from "zod";

export const payassurePaymentUpdateSchema = z.object({
  type: z.enum(["BANK", "MPESA"]).optional(),
  accountName: z.string().trim().max(120).optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  bankCode: z.string().trim().max(30).optional(),
  accountNumber: z.string().trim().max(80).optional(),
  shortcode: z.string().trim().max(30).optional(),
  provider: z.string().trim().max(120).optional(),
}).strict().refine((payment) => Object.keys(payment).length > 0);

export const payassureParticipantUpdateSchema = z.object({
  businessName: z.string().trim().min(1).max(200).optional(),
  registrationNumber: z.string().trim().max(120).optional(),
  kraPin: z.string().trim().max(80).optional(),
  businessType: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(120).optional(),
  physicalAddress: z.string().trim().max(300).optional(),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().email().max(254).optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  settlementMethod: z.string().trim().max(40).optional(),
  settlementAccount: z.string().trim().max(120).optional(),
  payment: payassurePaymentUpdateSchema.optional(),
}).strict().refine((participant) => Object.keys(participant).length > 0);

export const retailerFloatDepositRequestSchema = z.object({
  amount: z.number().int().positive().max(2147483647),
  payerPhoneNumber: z.string().trim().min(1).max(30),
}).strict();

export const retailerFloatBalanceSchema = z.object({
  merchantId: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  depositedBalance: z.number(),
  paidOutBalance: z.number(),
  reservedBalance: z.number(),
  availableBalance: z.number(),
});

export const retailerFloatSchema = retailerFloatBalanceSchema.extend({
  dailyFloat: z.number(),
  updatedAt: z.string(),
}).passthrough();

export const retailerFloatCheckSchema = retailerFloatBalanceSchema.extend({
  asOf: z.string(),
}).passthrough();

export const retailerFloatDepositSchema = z.object({
  depositId: z.string().min(1),
  merchantId: z.string().min(1),
  amount: z.number(),
  payerPhoneNumber: z.string().min(1),
  status: z.string().min(1),
}).passthrough();
