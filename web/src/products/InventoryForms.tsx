import { useEffect, useState, type FormEvent } from "react";
import { money } from "../lib/money";
import { navigate } from "../lib/navigation";
import type { Batch, Product, Supplier } from "../types";

type InventoryFormsProps = {
  suppliers: Supplier[];
  selectedProduct: Product | null;
  selectedBatch: Batch | null;
  onSaveProduct: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onUpdateProduct: (event: FormEvent<HTMLFormElement>, productId: number) => Promise<boolean>;
  onUpdateBuyingPrice: (productId: number, buyingPriceCents: number) => Promise<boolean>;
  onUpdateBatchExpiry: (batchId: number, expiryDate: string) => Promise<boolean>;
  onAddStock: (batch: Batch, incomingStock: number) => Promise<boolean>;
  modal: "product" | "selected-product" | null;
  onClose: () => void;
};

type ProductEditFormProps = {
  product: Product;
  onUpdateProduct: (event: FormEvent<HTMLFormElement>, productId: number) => Promise<boolean>;
  onClose: () => void;
};

function editModeFromPath(pathname: string): "details" | "buying-price" | "expiry-date" | "add-stock" | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "product") return null;
  if (segments[2] === "edit") return "details";
  if (segments[2] === "buying-price") return "buying-price";
  if (segments[2] === "batch" && segments[4] === "expiry") return "expiry-date";
  if (segments[2] === "batch" && segments[4] === "stock") return "add-stock";
  return null;
}

function productPath(productId: number, batchId: number | null) {
  return batchId ? `/product/${productId}/batch/${batchId}` : `/product/${productId}`;
}

function ProductEditForm({ product, onUpdateProduct, onClose }: ProductEditFormProps) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    if (await onUpdateProduct(event, product.id)) onClose();
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
            <option value="single">Single</option>
            <option value="kit">Kit</option>
            <option value="bottle">Bottle</option>
            <option value="blister_pack">Blister pack</option>
            <option value="tin">Tin</option>
            <option value="pack">Pack</option>
            <option value="box">Box</option>
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

function InventoryForms({
  suppliers,
  selectedProduct,
  selectedBatch,
  onSaveProduct,
  onUpdateProduct,
  onUpdateBuyingPrice,
  onUpdateBatchExpiry,
  onAddStock,
  modal,
  onClose,
}: InventoryFormsProps) {
  const [productEditMode, setProductEditMode] = useState<
    "details" | "buying-price" | "expiry-date" | "add-stock" | null
  >(() => editModeFromPath(window.location.pathname));
  useEffect(() => {
    if (!modal) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modal, onClose]);
  useEffect(() => {
    setProductEditMode(editModeFromPath(window.location.pathname));
  }, [modal, selectedProduct?.id, selectedBatch?.id]);

  useEffect(() => {
    function syncEditMode() {
      setProductEditMode(editModeFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", syncEditMode);
    return () => window.removeEventListener("popstate", syncEditMode);
  }, []);

  function changeEditMode(mode: "details" | "buying-price" | "expiry-date" | "add-stock" | null) {
    if (!selectedProduct) return;
    const path = mode === "details"
      ? `/product/${selectedProduct.id}/edit`
      : mode === "buying-price"
        ? `/product/${selectedProduct.id}/buying-price`
        : mode === "add-stock" && selectedBatch
          ? `/product/${selectedProduct.id}/batch/${selectedBatch.id}/stock`
        : mode === "expiry-date" && selectedBatch
          ? `/product/${selectedProduct.id}/batch/${selectedBatch.id}/expiry`
          : productPath(selectedProduct.id, selectedBatch?.id ?? null);
    navigate(path);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    if (await onSaveProduct(event)) onClose();
  }

  async function submitBuyingPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const buyingPriceCents = Math.round(Number(form.get("buyingPrice")) * 100);
    if (selectedProduct && await onUpdateBuyingPrice(selectedProduct.id, buyingPriceCents)) onClose();
  }

  async function submitExpiryDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiryDate = String(form.get("expiryDate"));
    if (selectedBatch && await onUpdateBatchExpiry(selectedBatch.id, expiryDate)) onClose();
  }

  async function submitAddStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const incomingStock = Number(form.get("incomingStock"));
    if (selectedBatch && await onAddStock(selectedBatch, incomingStock)) onClose();
  }

  if (!modal) return null;
  if (modal === "selected-product" && !selectedProduct) return null;
  const editingProductDetails = modal === "selected-product" && productEditMode === "details";
  const editingBuyingPrice = modal === "selected-product" && productEditMode === "buying-price";
  const editingExpiryDate = modal === "selected-product" && productEditMode === "expiry-date";
  const addingStock = modal === "selected-product" && productEditMode === "add-stock";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="panel form-panel inventory-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-modal-title"
      >
        <div className="modal-heading">
          <div className="panel-heading">
            <div>
              <h2 id="inventory-modal-title">
                {modal === "product"
                  ? "Add product"
                  : modal === "selected-product"
                    ? editingProductDetails
                      ? "Edit product details"
                      : editingBuyingPrice
                        ? "Edit buying price"
                        : editingExpiryDate
                          ? "Edit expiry date"
                          : addingStock
                            ? "Add stock"
                          : selectedProduct?.preferredName || selectedProduct?.name || "Product details"
                    : ""}
              </h2>
              <p>
                {modal === "product"
                  ? "Add a medicine with its product details, supplier, and initial batch."
                  : modal === "selected-product"
                    ? editingProductDetails
                      ? "Update catalog details without changing recorded batch stock."
                      : editingBuyingPrice
                        ? "Update the supplier cost used in future sales reports."
                        : editingExpiryDate
                          ? `Update expiry date for batch ${selectedBatch?.batchCode ?? ""}.`
                          : addingStock
                            ? `Receive incoming stock into batch ${selectedBatch?.batchCode ?? ""}.`
                          : "Review this medicine or choose what you would like to edit."
                    : ""}
              </p>
            </div>
          </div>
          <button className="modal-close" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        {modal === "product" ? (
      <form className="form-panel" onSubmit={submitProduct}>
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
                <option value="single">Single</option>
                <option value="kit">Kit</option>
                <option value="bottle">Bottle</option>
                <option value="blister_pack">Blister pack</option>
                <option value="tin">Tin</option>
                <option value="pack">Pack</option>
                <option value="box">Box</option>
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
        ) : modal === "selected-product" && selectedProduct ? (
          editingProductDetails ? (
            <ProductEditForm
              key={selectedProduct.id}
              product={selectedProduct}
              onUpdateProduct={onUpdateProduct}
              onClose={onClose}
            />
          ) : editingBuyingPrice ? (
            <form className="form-panel batch-form" onSubmit={submitBuyingPrice}>
              <p className="helper-text">
                Current buying price: {selectedProduct.buyingPriceCents === null
                  ? "Not set"
                  : money(selectedProduct.buyingPriceCents)}
              </p>
              <label>
                New buying price (KES)
                <input
                  name="buyingPrice"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={selectedProduct.buyingPriceCents === null
                    ? ""
                    : (selectedProduct.buyingPriceCents / 100).toFixed(2)}
                />
              </label>
              <div className="modal-actions">
                <button className="button button-quiet" type="button" onClick={() => changeEditMode(null)}>Back</button>
                <button className="button button-primary" type="submit">Update price</button>
              </div>
            </form>
          ) : editingExpiryDate && selectedBatch ? (
            <form className="form-panel batch-form" onSubmit={submitExpiryDate}>
              <label>
                Expiry date for batch {selectedBatch.batchCode}
                <input
                  name="expiryDate"
                  required
                  type="date"
                  defaultValue={selectedBatch.expiryDate ?? ""}
                />
              </label>
              <div className="modal-actions">
                <button className="button button-quiet" type="button" onClick={() => changeEditMode(null)}>Back</button>
                <button className="button button-primary" type="submit">Save expiry date</button>
              </div>
            </form>
          ) : addingStock && selectedBatch ? (
            <form className="form-panel batch-form" onSubmit={submitAddStock}>
              <p className="helper-text">
                Current batch stock: {selectedBatch.stockCount}. The incoming quantity will be added to this amount.
              </p>
              <label>
                Incoming stock (selling units)
                <input
                  name="incomingStock"
                  required
                  type="number"
                  min="1"
                  max={Math.min(
                    2147483647 - selectedBatch.stockCount,
                    2147483647 - selectedProduct.stockCount,
                  )}
                  step="1"
                  autoFocus
                />
              </label>
              <div className="modal-actions">
                <button className="button button-quiet" type="button" onClick={() => changeEditMode(null)}>Back</button>
                <button className="button button-primary" type="submit">Add stock</button>
              </div>
            </form>
          ) : (
            <div className="form-panel product-overview">
              <dl className="product-overview-fields">
                <div><dt>Category</dt><dd>{selectedProduct.category}</dd></div>
                <div><dt>Brand</dt><dd>{selectedProduct.brand || "Not set"}</dd></div>
                <div><dt>Active ingredient</dt><dd>{selectedProduct.activeIngredient || "Not set"}</dd></div>
                <div><dt>Strength / form</dt><dd>{[selectedProduct.strength, selectedProduct.dosageForm].filter(Boolean).join(" · ") || "Not set"}</dd></div>
                <div><dt>Supplier</dt><dd>{selectedProduct.supplierName}</dd></div>
                <div><dt>Retail price</dt><dd>{money(selectedProduct.priceCents)}</dd></div>
                <div><dt>Buying price</dt><dd>{selectedProduct.buyingPriceCents === null ? "Not set" : money(selectedProduct.buyingPriceCents)}</dd></div>
                {selectedBatch && (
                  <div><dt>Batch expiry ({selectedBatch.batchCode})</dt><dd>{selectedBatch.expiryDate ?? "Not set"}</dd></div>
                )}
                {selectedBatch && (
                  <div><dt>Batch stock ({selectedBatch.batchCode})</dt><dd>{selectedBatch.stockCount}</dd></div>
                )}
              </dl>
              <div className="modal-actions">
                {selectedBatch && (
                  <button className="button button-primary" type="button" onClick={() => changeEditMode("add-stock")}>Add stock</button>
                )}
                {selectedBatch && (
                  <button className="button button-secondary" type="button" onClick={() => changeEditMode("expiry-date")}>Edit expiry date</button>
                )}
                <button className="button button-secondary" type="button" onClick={() => changeEditMode("buying-price")}>Edit buying price</button>
                <button className="button button-primary" type="button" onClick={() => changeEditMode("details")}>Edit product details</button>
              </div>
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}

export default InventoryForms;
