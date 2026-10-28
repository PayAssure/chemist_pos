import type { KeyboardEvent, MouseEvent } from "react";
import { money } from "../lib/money";
import type { Batch, Product } from "../types";

type InventoryTableProps = {
  products: Product[];
  batches: Batch[];
  search: string;
  sortOrder: "expiry-asc" | "expiry-desc" | "stock-asc" | "stock-desc";
  onUpdateStock: (batch: Batch, change: number) => void;
  onSelectProduct: (product: Product, batch: Batch | null) => void;
};

type InventoryRow = { product: Product; batch: Batch | null };

function formatExpiryDate(value: string | null): string | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function InventoryTable({
  products,
  batches,
  search,
  sortOrder,
  onUpdateStock,
  onSelectProduct,
}: InventoryTableProps) {
  const query = search.trim().toLocaleLowerCase();
  const rows: InventoryRow[] = [];
  products.forEach((product) => {
    const productBatches = batches.filter((batch) => batch.productId === product.id);
    const matchesProduct = [
      product.name,
      product.brand,
      product.preferredName,
      product.category,
      product.dosageForm,
      product.strength,
      product.activeIngredient,
      product.supplierName,
      product.barcode ?? "",
      product.stockCode ?? "",
      product.saleUnit,
      product.description,
      String(product.priceCents / 100),
      product.buyingPriceCents === null ? "" : String(product.buyingPriceCents / 100),
      String(product.stockCount),
      product.prescriptionRequired ? "prescription rx" : "",
      product.stockCount === 0 ? "out of stock" : "",
    ].some((value) => value.toLocaleLowerCase().includes(query));
    const matchingBatches = productBatches.filter((batch) =>
      [
        batch.batchCode,
        batch.expiryDate ?? "expiry unknown",
        String(batch.stockCount),
        batch.expired ? "expired" : "not expired",
        batch.stockCount === 0 ? "out of stock" : "",
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
    if (!query || matchesProduct) {
      if (productBatches.length) {
        productBatches.forEach((batch) => rows.push({ product, batch }));
      } else {
        rows.push({ product, batch: null });
      }
      return;
    }
    matchingBatches.forEach((batch) => rows.push({ product, batch }));
  });
  rows.sort((a, b) => {
    if (sortOrder === "stock-asc" || sortOrder === "stock-desc") {
      const direction = sortOrder === "stock-asc" ? 1 : -1;
      const stockDifference =
        (a.batch?.stockCount ?? a.product.stockCount) -
        (b.batch?.stockCount ?? b.product.stockCount);
      if (stockDifference !== 0) return stockDifference * direction;
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
  });

  return (
    <>
      {products.length ? rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Medicine details</th><th>Supplier</th><th>Retail / wholesale</th><th>Batch / expiry</th><th>Stock / reorder</th></tr></thead>
            <tbody>
              {rows.map(({ product, batch }) => {
                const formattedExpiryDate = batch ? formatExpiryDate(batch.expiryDate) : null;
                const rowProps = {
                  className: "inventory-product-row",
                  tabIndex: 0,
                  role: "button" as const,
                  "aria-label": `Open ${product.preferredName || product.name} details`,
                  onClick: (event: MouseEvent<HTMLTableRowElement>) => {
                    if (event.target instanceof Element && event.target.closest("button")) return;
                    onSelectProduct(product, batch);
                  },
                  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectProduct(product, batch);
                    }
                  },
                };
                return batch
                  ? (
                    <tr key={batch.id} {...rowProps}>
                      <td>
                        <strong>{product.preferredName || product.name}</strong>
                        <small className="table-subtitle">
                          {[product.brand, product.category, product.dosageForm, product.strength, product.activeIngredient]
                            .filter(Boolean)
                            .join(" · ")}
                          {product.prescriptionRequired ? " · Rx" : ""}
                        </small>
                        <small className="table-subtitle">
                          {product.unitsPerPack ? `${product.unitsPerPack} units per pack · ` : ""}
                          Sold by {product.saleUnit.replace("_", " ")}
                          {product.barcode ? ` · Barcode ${product.barcode}` : ""}
                          {product.stockCode ? ` · SKU ${product.stockCode}` : ""}
                        </small>
                      </td>
                      <td>{product.supplierName}</td>
                      <td>
                        <strong>{money(product.priceCents)}</strong>
                        <small className="table-subtitle">Wholesale {product.buyingPriceCents === null ? "not set" : money(product.buyingPriceCents)}</small>
                      </td>
                      <td>
                        <strong>{batch.batchCode}</strong>
                        <small className={`table-subtitle ${batch.expired || batch.expiryUnknown || !formattedExpiryDate ? "expiry-warning" : ""}`}>
                          {batch.expiryUnknown || !formattedExpiryDate
                            ? "Expiry unknown · not saleable"
                            : `${batch.expired ? "Expired" : "Expires"} ${formattedExpiryDate}`}
                        </small>
                      </td>
                      <td>
                        <div className="stock-stepper">
                          <button aria-label={`Decrease ${batch.batchCode} stock`} disabled={batch.stockCount === 0} onClick={() => onUpdateStock(batch, -1)}>−</button>
                          <strong>{batch.stockCount}</strong>
                          <button aria-label={`Increase ${batch.batchCode} stock`} onClick={() => onUpdateStock(batch, 1)}>+</button>
                          {product.saleableCount === 0
                            ? <span className="stock-status stock-status-empty">Out of stock</span>
                            : product.saleableCount <= product.reorderLevel
                              ? <span className="stock-status stock-status-empty">Reorder</span>
                              : null}
                        </div>
                      </td>
                    </tr>
                  )
                  : <tr key={product.id} {...rowProps}>
                    <td>
                      <strong>{product.preferredName || product.name}</strong>
                      <small className="table-subtitle">
                        {[product.brand, product.category, product.dosageForm, product.strength, product.activeIngredient]
                          .filter(Boolean)
                          .join(" · ")}
                        {product.prescriptionRequired ? " · Rx" : ""}
                      </small>
                      <small className="table-subtitle">
                        {product.unitsPerPack ? `${product.unitsPerPack} units per pack · ` : ""}
                        Sold by {product.saleUnit.replace("_", " ")}
                        {product.barcode ? ` · Barcode ${product.barcode}` : ""}
                        {product.stockCode ? ` · SKU ${product.stockCode}` : ""}
                      </small>
                    </td>
                    <td>{product.supplierName}</td>
                    <td>
                      <strong>{money(product.priceCents)}</strong>
                      <small className="table-subtitle">
                        Wholesale {product.buyingPriceCents === null ? "not set" : money(product.buyingPriceCents)}
                      </small>
                    </td>
                    <td>No batch entered</td>
                    <td>
                      <div className="stock-stepper">
                        <strong>{product.stockCount}</strong>
                        {product.saleableCount === 0
                          ? <span className="stock-status stock-status-empty">Out of stock</span>
                          : product.saleableCount <= product.reorderLevel
                            ? <span className="stock-status stock-status-empty">Reorder</span>
                            : null}
                      </div>
                    </td>
                  </tr>;
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="empty">{query ? "No inventory items match your search." : "Your inventory is empty."}</div> : null}
    </>
  );
}

export default InventoryTable;
