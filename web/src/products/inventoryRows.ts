import type { Batch, Product } from "../types";

export type InventoryRow = { product: Product; batch: Batch | null };
export type InventorySortOrder = "expiry-asc" | "expiry-desc" | "stock-asc" | "stock-desc";

function matchesSearch(values: string[], query: string) {
  return values.some((value) => value.toLocaleLowerCase().includes(query));
}

function productMatches(product: Product, query: string) {
  return matchesSearch([
    product.name, product.brand, product.preferredName, product.category, product.dosageForm,
    product.strength, product.activeIngredient, product.supplierName, product.barcode ?? "",
    product.stockCode ?? "", product.saleUnit, product.description, String(product.priceCents / 100),
    product.buyingPriceCents === null ? "" : String(product.buyingPriceCents / 100),
    String(product.stockCount), product.prescriptionRequired ? "prescription rx" : "",
    product.stockCount === 0 ? "out of stock" : "",
  ], query);
}

function batchMatches(batch: Batch, query: string) {
  return matchesSearch([
    batch.batchCode, batch.expiryDate ?? "expiry unknown", String(batch.stockCount),
    batch.expired ? "expired" : "not expired", batch.stockCount === 0 ? "out of stock" : "",
  ], query);
}

function compareRows(a: InventoryRow, b: InventoryRow, sortOrder: InventorySortOrder) {
  if (sortOrder === "stock-asc" || sortOrder === "stock-desc") {
    const direction = sortOrder === "stock-asc" ? 1 : -1;
    const difference = (a.batch?.stockCount ?? a.product.stockCount) -
      (b.batch?.stockCount ?? b.product.stockCount);
    if (difference) return difference * direction;
  } else {
    const direction = sortOrder === "expiry-asc" ? 1 : -1;
    const aDate = a.batch?.expiryDate ?? null;
    const bDate = b.batch?.expiryDate ?? null;
    if (aDate !== bDate) {
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.localeCompare(bDate) * direction;
    }
  }
  return a.product.name.localeCompare(b.product.name) ||
    (a.batch?.batchCode ?? "").localeCompare(b.batch?.batchCode ?? "");
}

export function getInventoryRows(
  products: Product[],
  batches: Batch[],
  search: string,
  sortOrder: InventorySortOrder,
): InventoryRow[] {
  const query = search.trim().toLocaleLowerCase();
  const rows = products.flatMap<InventoryRow>((product): InventoryRow[] => {
    const productBatches = batches.filter((batch) => batch.productId === product.id);
    if (!query || productMatches(product, query)) {
      return productBatches.length
        ? productBatches.map((batch) => ({ product, batch }))
        : [{ product, batch: null }];
    }
    return productBatches.filter((batch) => batchMatches(batch, query))
      .map((batch) => ({ product, batch }));
  });
  return rows.sort((a, b) => compareRows(a, b, sortOrder));
}
