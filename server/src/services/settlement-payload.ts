import type { PoolClient } from "pg";
import type { PayassureSettlementPayload } from "../payassure";
import { getSettlementPayloadLines } from "./settlement-payload-query";

export type StoredSettlementPayload = Omit<PayassureSettlementPayload, "items"> & {
  items: Array<
    Omit<PayassureSettlementPayload["items"][number], "supplierAmount" | "retailerAmount"> & {
      supplierAmount: number | null;
      retailerAmount: number | null;
    }
  >;
};

export async function prepareSettlementPayload(
  saleId: number,
  payload: StoredSettlementPayload,
  client?: PoolClient,
): Promise<PayassureSettlementPayload> {
  const lines = await getSettlementPayloadLines(saleId, client);
  if (lines.length === 0) {
    throw new Error("Cannot initiate settlement: the sale has no recorded items");
  }
  const items = lines.map((line) => {
    if (line.missingBuyingPrice || line.supplierAmountCents === null || line.retailerAmountCents === null) {
      throw new Error(
        `Cannot initiate settlement: set a buying price for products supplied by ${line.supplierName}, then retry`,
      );
    }
    if (!line.supplierEnrolled || !line.supplierMerchantId) {
      throw new Error(
        `Cannot initiate settlement: supplier ${line.supplierName} is not enrolled with a PayAssure merchant ID`,
      );
    }
    const supplierAmountCents = Number(line.supplierAmountCents);
    const retailerAmountCents = Number(line.retailerAmountCents);
    if (retailerAmountCents < 0) {
      throw new Error(
        `Cannot initiate settlement: buying price exceeds the sale price for ${line.itemReference}`,
      );
    }
    return {
      supplierMerchantId: line.supplierMerchantId,
      itemReference: line.itemReference,
      supplierAmountCents,
      retailerAmountCents,
      supplierAmount: Number((supplierAmountCents / 100).toFixed(2)),
      retailerAmount: Number((retailerAmountCents / 100).toFixed(2)),
    };
  });
  const itemAmountCents = items.reduce(
    (sum, item) => sum + item.supplierAmountCents + item.retailerAmountCents,
    0,
  );
  if (itemAmountCents !== Number(lines[0].totalCents)) {
    throw new Error("Cannot initiate settlement: item amounts do not match the sale total");
  }
  return {
    ...payload,
    items: items.map(({ supplierAmountCents: _supplierCents, retailerAmountCents: _retailerCents, ...item }) => item),
  };
}
