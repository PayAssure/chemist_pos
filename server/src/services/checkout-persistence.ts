import type { PoolClient } from "pg";
import type { PayassureSettlementPayload } from "../payassure";
import type { CheckoutInput } from "./checkout-models";
import type { StoredSettlementPayload } from "./settlement-payload";
import { prepareSettlementPayload } from "./settlement-payload";
import { buildStoredSettlementPayload } from "./checkout-payload";
import { insertPendingSale } from "./checkout-sale";
import { insertSaleItems } from "./checkout-sale-items";

export { buildStoredSettlementPayload, insertPendingSale, insertSaleItems };

export async function insertPayassureSettlement(
  client: PoolClient,
  saleId: number,
  reference: string,
  fingerprint: string,
  payload: StoredSettlementPayload,
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO payassure_settlements
       (sale_id, merchant_transaction_reference, request_fingerprint, request_payload)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id`,
    [saleId, reference, fingerprint, JSON.stringify(payload)],
  );
  return Number(result.rows[0].id);
}

export async function prepareSettlement(
  client: PoolClient,
  saleId: number,
  payload: StoredSettlementPayload,
): Promise<PayassureSettlementPayload> {
  return prepareSettlementPayload(saleId, payload, client);
}
