import type { FormEvent } from "react";
import { money } from "../lib/money";
import type { Batch, Product } from "../types";
import type { ProductEditMode } from "./InventoryFormTypes";

type Props = {
  product: Product;
  batch: Batch | null;
  mode: ProductEditMode;
  onUpdateBuyingPrice: (id: number, price: number) => Promise<boolean>;
  onUpdateBatchExpiry: (id: number, expiry: string) => Promise<boolean>;
  onAddStock: (batch: Batch, quantity: number) => Promise<boolean>;
  onBack: () => void;
  onClose: () => void;
};

function Actions({ onBack, children }: { onBack: () => void; children: string }) {
  return (
    <div className="modal-actions">
      <button className="button button-quiet" type="button" onClick={onBack}>Back</button>
      <button className="button button-primary" type="submit">{children}</button>
    </div>
  );
}

export function InventoryBatchForms(props: Props) {
  const { product, batch, mode, onUpdateBuyingPrice, onUpdateBatchExpiry, onAddStock, onBack, onClose } = props;
  async function submitBuyingPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = Math.round(Number(new FormData(event.currentTarget).get("buyingPrice")) * 100);
    if (await onUpdateBuyingPrice(product.id, cents)) onClose();
  }
  async function submitExpiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const expiry = String(new FormData(event.currentTarget).get("expiryDate"));
    if (batch && await onUpdateBatchExpiry(batch.id, expiry)) onClose();
  }
  async function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(new FormData(event.currentTarget).get("incomingStock"));
    if (batch && await onAddStock(batch, quantity)) onClose();
  }

  if (mode === "buying-price") {
    return (
      <form className="form-panel batch-form" onSubmit={submitBuyingPrice}>
        <p className="helper-text">
          Current buying price: {product.buyingPriceCents === null ? "Not set" : money(product.buyingPriceCents)}
        </p>
        <label>New buying price (KES)
          <input name="buyingPrice" required type="number" min="0.01" step="0.01"
            defaultValue={product.buyingPriceCents === null ? "" : (product.buyingPriceCents / 100).toFixed(2)} />
        </label>
        <Actions onBack={onBack}>Update price</Actions>
      </form>
    );
  }
  if (!batch) return null;
  if (mode === "expiry-date") {
    return (
      <form className="form-panel batch-form" onSubmit={submitExpiry}>
        <label>Expiry date for batch {batch.batchCode}
          <input name="expiryDate" required type="date" defaultValue={batch.expiryDate ?? ""} />
        </label>
        <Actions onBack={onBack}>Save expiry date</Actions>
      </form>
    );
  }
  if (mode === "add-stock") {
    return (
      <form className="form-panel batch-form" onSubmit={submitStock}>
        <p className="helper-text">
          Current batch stock: {batch.stockCount}. The incoming quantity will be added to this amount.
        </p>
        <label>Incoming stock (selling units)
          <input name="incomingStock" required type="number" min="1"
            max={Math.min(2147483647 - batch.stockCount, 2147483647 - product.stockCount)}
            step="1" autoFocus />
        </label>
        <Actions onBack={onBack}>Add stock</Actions>
      </form>
    );
  }
  return null;
}
