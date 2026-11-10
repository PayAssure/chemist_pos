import type { FormEvent } from "react";
import type { Supplier } from "../types";

type Props = { suppliers: Supplier[]; onSave: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void };

export function AddProductForm({ suppliers, onSave, onClose }: Props) {
  return (
    <form className="form-panel" onSubmit={onSave}>
      <label>Medicine name<input name="name" required maxLength={120} placeholder="e.g. Paracetamol 500 mg tablets" /></label>
      <div className="field-row">
        <label>Preferred name / tag<input name="preferredName" maxLength={120} placeholder="Optional display name or tag" /></label>
        <label>Category<input name="category" required maxLength={80} defaultValue="Medicine" placeholder="e.g. Antiviral" /></label>
      </div>
      <div className="field-row">
        <label>Active ingredient<input name="activeIngredient" maxLength={160} placeholder="Generic ingredient" /></label>
        <label>Dosage form<input name="dosageForm" maxLength={80} placeholder="e.g. Tablets, syrup, cream" /></label>
      </div>
      <label className="checkbox-label"><input name="prescriptionRequired" type="checkbox" /> Prescription required</label>
      <div className="field-row">
        <label>Selling unit
          <select name="saleUnit" defaultValue="single" required>
            <option value="single">Single</option><option value="kit">Kit</option><option value="bottle">Bottle</option>
            <option value="blister_pack">Blister pack</option><option value="tin">Tin</option>
            <option value="pack">Pack</option><option value="box">Box</option>
          </select>
        </label>
        <label>Units per pack / box<input name="unitsPerPack" type="number" min="1" step="1" placeholder="Optional" /></label>
      </div>
      <label>Supplier
        <select name="supplierId" required defaultValue="" disabled={suppliers.length === 0}>
          <option value="" disabled>{suppliers.length ? "Select supplier" : "Add a supplier in Suppliers first"}</option>
          <optgroup label="Enrolled in PayAssure">
            {suppliers.filter((supplier) => supplier.payassureEnrolled).map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.merchantId}</option>
            ))}
          </optgroup>
          <optgroup label="Not enrolled in PayAssure">
            {suppliers.filter((supplier) => !supplier.payassureEnrolled).map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="field-row">
        <label>Selling price<input name="price" required type="number" min="0.01" step="0.01" placeholder="0.00" /></label>
        <label>Buying price<input name="buyingPrice" required type="number" min="0.01" step="0.01" placeholder="0.00" /></label>
      </div>
      <div className="field-row">
        <label>Initial batch stock (selling units)<input name="stockCount" required type="number" min="0" step="1" placeholder="0" /></label>
        <label>Reorder level (selling units)<input name="reorderLevel" required type="number" min="0" step="1" defaultValue="5" /></label>
      </div>
      <div className="field-row">
        <label>Batch code<input name="batchCode" required maxLength={80} placeholder="e.g. BATCH-001" /></label>
        <label>Expiry date<input name="expiryDate" required type="date" /></label>
      </div>
      <label>Description<textarea name="description" maxLength={1000} rows={3} placeholder="Optional product notes" /></label>
      <div className="modal-actions">
        <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
        <button className="button button-primary" type="submit" disabled={suppliers.length === 0}>Save medicine</button>
      </div>
    </form>
  );
}
