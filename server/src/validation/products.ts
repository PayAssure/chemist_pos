import { z } from "zod";

export const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  activeIngredient: z.string().trim().max(160).default(""),
  prescriptionRequired: z.boolean().default(false),
  brand: z.string().trim().max(120).default(""),
  preferredName: z.string().trim().max(120).default(""),
  category: z.string().trim().min(1).max(80).default("Medicine"),
  dosageForm: z.string().trim().max(80).default(""),
  strength: z.string().trim().max(80).default(""),
  saleUnit: z.enum(["single", "kit", "bottle", "blister_pack", "tin", "pack", "box"]).default("single"),
  unitsPerPack: z.number().int().positive().max(2147483647).nullable().default(null),
  reorderLevel: z.number().int().min(0).max(2147483647).default(5),
  barcode: z.string().trim().max(120).nullable().default(null),
  stockCode: z.string().trim().max(80).nullable().default(null),
  description: z.string().trim().max(1000).default(""),
  supplierId: z.number().int().positive(),
  priceCents: z.number().int().positive().max(2147483647),
  buyingPriceCents: z.number().int().positive().max(2147483647),
  stockCount: z.number().int().min(0).max(2147483647),
  batchCode: z.string().trim().min(1).max(80),
  expiryDate: z.string().date(),
});

export const productUpdateSchema = productSchema.pick({
  name: true,
  activeIngredient: true,
  prescriptionRequired: true,
  preferredName: true,
  category: true,
  dosageForm: true,
  saleUnit: true,
  unitsPerPack: true,
  reorderLevel: true,
  description: true,
  priceCents: true,
}).extend({
  buyingPriceCents: z.number().int().positive().max(2147483647).nullable(),
});

export const batchStockSchema = z.object({
  stockCount: z.number().int().min(0).max(2147483647),
});

export const incomingStockSchema = z.object({
  incomingStock: z.number().int().positive().max(2147483647),
});

export const batchExpirySchema = z.object({
  expiryDate: z.string().date(),
});

export const buyingPriceSchema = z.object({
  buyingPriceCents: z.number().int().positive().max(2147483647),
});
