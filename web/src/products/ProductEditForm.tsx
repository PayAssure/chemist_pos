import type { FormEvent } from "react";
import type { Product } from "../types";

type Props = {
  product: Product;
  onUpdate: (event: FormEvent<HTMLFormElement>, productId: number) => Promise<boolean>;
  onClose: () => void;
};

export function ProductEditForm({ product, onUpdate, onClose }: Props) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    if (await onUpdate(event, product.id)) onClose();
  }
  return (
    <form className="form-panel" onSubmit={submit}>
      <label>Medicine name<input name="name" required maxLength={120} defaultValue={product.name} /></label>
      <div className="field-row">
        <label>Preferred name / tag<input name="preferredName" maxLength={120} defaultValue={product.preferredName} /></label>
        <label>Category<input name="category" required maxLength={80} defaultValue={product.category} /></label>
      </div>
      <div className="field-row">
        <label>Active ingredient<input name="activeIngredient" maxLength={160} defaultValue={product.activeIngredient} /></label>
        <label>Dosage form<input name="dosageForm" maxLength={80} defaultValue={product.dosageForm} /></label>
      </div>
      <label className="checkbox-label">
        <input name="prescriptionRequired" type="checkbox" defaultChecked={product.prescriptionRequired} />
        Prescription required
      </label>
      <div className="field-row">
        <label>Selling unit
          <select name="saleUnit" defaultValue={product.saleUnit}>
            <option value="single">Single</option><option value="kit">Kit</option><option value="bottle">Bottle</option>
            <option value="blister_pack">Blister pack</option><option value="tin">Tin</option>
            <option value="pack">Pack</option><option value="box">Box</option>
          </select>
        </label>
        <label>Units per pack / box<input name="unitsPerPack" type="number" min="1" step="1" defaultValue={product.unitsPerPack ?? ""} /></label>
      </div>
      <div className="field-row">
        <label>Selling price<input name="price" required type="number" min="0.01" step="0.01" defaultValue={(product.priceCents / 100).toFixed(2)} /></label>
        <label>Buying price<input name="buyingPrice" required type="number" min="0.01" step="0.01" defaultValue={product.buyingPriceCents === null ? "" : (product.buyingPriceCents / 100).toFixed(2)} /></label>
      </div>
      <label>Reorder level (selling units)<input name="reorderLevel" required type="number" min="0" step="1" defaultValue={product.reorderLevel} /></label>
      <label>Description<textarea name="description" maxLength={1000} rows={3} defaultValue={product.description} /></label>
      <p className="helper-text">Stock counts and prices stay in the selected selling unit. Batch expiry and stock are managed separately.</p>
      <div className="modal-actions">
        <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
        <button className="button button-primary" type="submit">Save product</button>
      </div>
    </form>
  );
}
