import { money } from "../lib/money";
import type { Batch, Product } from "../types";

type Props = {
  product: Product;
  batch: Batch | null;
  onEdit: (mode: "details" | "buying-price" | "expiry-date" | "add-stock") => void;
};

export function InventoryProductOverview({ product, batch, onEdit }: Props) {
  return (
    <div className="form-panel product-overview">
      <dl className="product-overview-fields">
        <div><dt>Category</dt><dd>{product.category}</dd></div>
        <div><dt>Brand</dt><dd>{product.brand || "Not set"}</dd></div>
        <div><dt>Active ingredient</dt><dd>{product.activeIngredient || "Not set"}</dd></div>
        <div><dt>Strength / form</dt><dd>{[product.strength, product.dosageForm].filter(Boolean).join(" · ") || "Not set"}</dd></div>
        <div><dt>Supplier</dt><dd>{product.supplierName}</dd></div>
        <div><dt>Retail price</dt><dd>{money(product.priceCents)}</dd></div>
        <div><dt>Buying price</dt><dd>{product.buyingPriceCents === null ? "Not set" : money(product.buyingPriceCents)}</dd></div>
        {batch && <div><dt>Batch expiry ({batch.batchCode})</dt><dd>{batch.expiryDate ?? "Not set"}</dd></div>}
        {batch && <div><dt>Batch stock ({batch.batchCode})</dt><dd>{batch.stockCount}</dd></div>}
      </dl>
      <div className="modal-actions">
        {batch && <button className="button button-primary" type="button" onClick={() => onEdit("add-stock")}>Add stock</button>}
        {batch && <button className="button button-secondary" type="button" onClick={() => onEdit("expiry-date")}>Edit expiry date</button>}
        <button className="button button-secondary" type="button" onClick={() => onEdit("buying-price")}>Edit buying price</button>
        <button className="button button-primary" type="button" onClick={() => onEdit("details")}>Edit product details</button>
      </div>
    </div>
  );
}
