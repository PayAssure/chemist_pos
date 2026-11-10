import type { PoolClient } from "pg";
import type { CheckoutInput } from "./checkout-models";
import type { StoredSettlementPayload } from "./settlement-payload";

export async function buildStoredSettlementPayload(
  client: PoolClient,
  saleId: number,
  totalCents: number,
  checkout: CheckoutInput,
  reference: string,
  mpesaPhone: string | null,
): Promise<StoredSettlementPayload> {
  const lines = await client.query<{
    supplierMerchantId: string;
    itemReference: string;
    supplierAmountCents: string | null;
    retailerAmountCents: string | null;
  }>(
    `SELECT COALESCE(s.payassure_merchant_id, '') AS "supplierMerchantId",
            COALESCE(NULLIF(p.stock_code, ''), NULLIF(p.barcode, ''),
                     'POS-PRODUCT-' || i.product_id::text) AS "itemReference",
            CASE WHEN BOOL_OR(i.buying_unit_price_cents IS NULL)
              THEN NULL ELSE SUM(i.buying_unit_price_cents::bigint * i.quantity)::text
            END AS "supplierAmountCents",
            CASE WHEN BOOL_OR(i.buying_unit_price_cents IS NULL)
              THEN NULL ELSE SUM(
                (i.unit_price_cents::bigint - i.buying_unit_price_cents::bigint)
                * i.quantity
              )::text END AS "retailerAmountCents"
     FROM sale_items i
     JOIN products p ON p.id = i.product_id
     JOIN suppliers s ON s.id = COALESCE(i.supplier_id, p.supplier_id)
     WHERE i.sale_id = $1
     GROUP BY i.product_id, p.stock_code, p.barcode, s.payassure_merchant_id
     ORDER BY i.product_id`,
    [saleId],
  );
  const amount = Number((totalCents / 100).toFixed(2));
  return {
    merchantId: "",
    merchantTransactionReference: reference,
    amount,
    currency: "KES",
    payment: {
      methods: checkout.paymentMethod === "mpesa"
        ? [{ type: "MPESA", amount, phoneNumber: mpesaPhone! }]
        : [{ type: "CASH", amount }],
    },
    items: lines.rows.map((line) => ({
      supplierMerchantId: line.supplierMerchantId,
      itemReference: line.itemReference,
      supplierAmount: line.supplierAmountCents === null
        ? null
        : Number((Number(line.supplierAmountCents) / 100).toFixed(2)),
      retailerAmount: line.retailerAmountCents === null
        ? null
        : Number((Number(line.retailerAmountCents) / 100).toFixed(2)),
    })),
    metadata: { posSaleId: String(saleId) },
  };
}
