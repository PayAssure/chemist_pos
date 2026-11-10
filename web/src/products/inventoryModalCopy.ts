import type { Batch, Product } from "../types";
import type { InventoryModal, ProductEditMode } from "./InventoryFormTypes";

export function inventoryModalTitle(modal: InventoryModal, mode: ProductEditMode, product: Product | null) {
  if (modal === "product") return "Add product";
  if (mode === "details") return "Edit product details";
  if (mode === "buying-price") return "Edit buying price";
  if (mode === "expiry-date") return "Edit expiry date";
  if (mode === "add-stock") return "Add stock";
  return product?.preferredName || product?.name || "Product details";
}

export function inventoryModalDescription(
  modal: InventoryModal,
  mode: ProductEditMode,
  batch: Batch | null,
) {
  if (modal === "product") return "Add a medicine with its product details, supplier, and initial batch.";
  if (mode === "details") return "Update catalog details without changing recorded batch stock.";
  if (mode === "buying-price") return "Update the supplier cost used in future sales reports.";
  if (mode === "expiry-date") return `Update expiry date for batch ${batch?.batchCode ?? ""}.`;
  if (mode === "add-stock") return `Receive incoming stock into batch ${batch?.batchCode ?? ""}.`;
  return "Review this medicine or choose what you would like to edit.";
}
