import type { PoolClient } from "pg";
import { pool } from "../db";

export interface SettlementPayloadLine {
  totalCents: string;
  supplierMerchantId: string;
  supplierName: string;
  supplierEnrolled: boolean;
  itemReference: string;
  supplierAmountCents: string | null;
  retailerAmountCents: string | null;
  missingBuyingPrice: boolean;
}

const query = `SELECT s.total_cents::text AS "totalCents",
          COALESCE(supplier.payassure_merchant_id, '') AS "supplierMerchantId",
          supplier.name AS "supplierName",
          supplier.payassure_enrolled AS "supplierEnrolled",
          COALESCE(NULLIF(p.stock_code, ''), NULLIF(p.barcode, ''),
                   'POS-PRODUCT-' || i.product_id::text) AS "itemReference",
          CASE WHEN BOOL_OR(COALESCE(
            i.buying_unit_price_cents, p.buying_price_cents
          ) IS NULL) THEN NULL ELSE SUM(
            COALESCE(i.buying_unit_price_cents, p.buying_price_cents)::bigint * i.quantity
          )::text END AS "supplierAmountCents",
          CASE WHEN BOOL_OR(COALESCE(
            i.buying_unit_price_cents, p.buying_price_cents
          ) IS NULL) THEN NULL ELSE SUM(
            (i.unit_price_cents::bigint -
              COALESCE(i.buying_unit_price_cents, p.buying_price_cents)::bigint)
            * i.quantity
          )::text END AS "retailerAmountCents",
          BOOL_OR(COALESCE(
            i.buying_unit_price_cents, p.buying_price_cents
          ) IS NULL) AS "missingBuyingPrice"
   FROM sale_items i
   JOIN sales s ON s.id = i.sale_id
   JOIN products p ON p.id = i.product_id
   JOIN suppliers supplier ON supplier.id = COALESCE(i.supplier_id, p.supplier_id)
   WHERE i.sale_id = $1
   GROUP BY s.total_cents, i.product_id, p.stock_code, p.barcode,
            supplier.payassure_merchant_id, supplier.name, supplier.payassure_enrolled
   ORDER BY i.product_id`;

export async function getSettlementPayloadLines(
  saleId: number,
  client?: PoolClient,
): Promise<SettlementPayloadLine[]> {
  const result = client
    ? await client.query<SettlementPayloadLine>(query, [saleId])
    : await pool.query<SettlementPayloadLine>(query, [saleId]);
  return result.rows;
}
