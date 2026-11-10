import { randomInt } from "node:crypto";
import type { Medicine } from "./types";

export type SaleItem = {
  medicine: Medicine;
  batch: Medicine["batches"][number];
  quantity: number;
};

export function selectSaleItems(
  medicines: Medicine[],
  saleIndex: number,
  transactionCount: number,
): { items: SaleItem[]; isTodaySale: boolean } {
  const isTodaySale = saleIndex >= transactionCount - 12;
  const selected = new Set<number>();
  const desiredLines = isTodaySale ? 1 : randomInt(1, 4);
  if (isTodaySale) {
    selected.add((saleIndex - (transactionCount - 12)) % 12);
  } else {
    while (selected.size < desiredLines) selected.add(randomInt(0, medicines.length));
  }

  const items: SaleItem[] = [];
  for (const medicineIndex of selected) {
    const medicine = medicines[medicineIndex];
    let remaining = isTodaySale ? 1 : randomInt(1, 4);
    for (const batch of medicine.batches.sort((a, b) => a.expiry.localeCompare(b.expiry))) {
      if (!remaining) break;
      const quantity = Math.min(remaining, batch.stock);
      if (!quantity) continue;
      batch.stock -= quantity;
      remaining -= quantity;
      items.push({ medicine, batch, quantity });
    }
    if (remaining > 0) restoreUnfillableItems(items, medicine);
  }
  return { items, isTodaySale };
}

function restoreUnfillableItems(items: SaleItem[], medicine: Medicine): void {
  for (const item of items.filter((saleItem) => saleItem.medicine.id === medicine.id)) {
    item.batch.stock += item.quantity;
  }
  items.splice(
    0,
    items.length,
    ...items.filter((saleItem) => saleItem.medicine.id !== medicine.id),
  );
}
