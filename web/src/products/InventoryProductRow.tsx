import type { KeyboardEvent, MouseEvent } from "react";
import { money } from "../lib/money";
import type { Batch, Product } from "../types";

type Props = {
  product: Product;
  batch: Batch | null;
  onSelect: (product: Product, batch: Batch | null) => void;
};

function formatExpiryDate(value: string | null): string | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function MedicineDetails({ product }: { product: Product }) {
  return (
    <td>
      <strong>{product.preferredName || product.name}</strong>
      <small className="table-subtitle">
        {[product.brand, product.category, product.dosageForm, product.strength, product.activeIngredient]
          .filter(Boolean).join(" · ")}
        {product.prescriptionRequired ? " · Rx" : ""}
      </small>
      <small className="table-subtitle">
        {product.unitsPerPack ? `${product.unitsPerPack} units per pack · ` : ""}
        Sold by {product.saleUnit.replace("_", " ")}
        {product.barcode ? ` · Barcode ${product.barcode}` : ""}
        {product.stockCode ? ` · SKU ${product.stockCode}` : ""}
      </small>
    </td>
  );
}

function StockSummary({ product, stockCount }: { product: Product; stockCount: number }) {
  return (
    <div className="stock-summary">
      <strong>{stockCount}</strong>
      {product.saleableCount === 0
        ? <span className="stock-status stock-status-empty">Out of stock</span>
        : product.saleableCount <= product.reorderLevel
          ? <span className="stock-status stock-status-empty">Reorder</span>
          : null}
    </div>
  );
}

export function InventoryProductRow({ product, batch, onSelect }: Props) {
  const formattedExpiryDate = batch ? formatExpiryDate(batch.expiryDate) : null;
  const rowProps = {
    className: "inventory-product-row",
    tabIndex: 0,
    role: "button" as const,
    "aria-label": `Open ${product.preferredName || product.name} details`,
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      onSelect(product, batch);
    },
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(product, batch);
      }
    },
  };
  return (
    <tr key={batch?.id ?? product.id} {...rowProps}>
      <MedicineDetails product={product} />
      <td>{product.supplierName}</td>
      <td>
        <strong>{money(product.priceCents)}</strong>
        <small className="table-subtitle">
          Wholesale {product.buyingPriceCents === null ? "not set" : money(product.buyingPriceCents)}
        </small>
      </td>
      {batch ? (
        <td>
          <strong>{batch.batchCode}</strong>
          <small className={`table-subtitle ${batch.expired || batch.expiryUnknown || !formattedExpiryDate ? "expiry-warning" : ""}`}>
            {batch.expiryUnknown || !formattedExpiryDate
              ? "Expiry unknown · not saleable"
              : `${batch.expired ? "Expired" : "Expires"} ${formattedExpiryDate}`}
          </small>
        </td>
      ) : <td>No batch entered</td>}
      <td><StockSummary product={product} stockCount={batch?.stockCount ?? product.stockCount} /></td>
    </tr>
  );
}
