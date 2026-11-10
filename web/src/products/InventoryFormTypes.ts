import type { FormEvent } from "react";
import type { Batch, Product, Supplier } from "../types";

export type InventoryModal = "product" | "selected-product" | null;
export type ProductEditMode = "details" | "buying-price" | "expiry-date" | "add-stock" | null;

export type InventoryFormsProps = {
  suppliers: Supplier[];
  selectedProduct: Product | null;
  selectedBatch: Batch | null;
  onSaveProduct: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onUpdateProduct: (event: FormEvent<HTMLFormElement>, productId: number) => Promise<boolean>;
  onUpdateBuyingPrice: (productId: number, buyingPriceCents: number) => Promise<boolean>;
  onUpdateBatchExpiry: (batchId: number, expiryDate: string) => Promise<boolean>;
  onAddStock: (batch: Batch, incomingStock: number) => Promise<boolean>;
  modal: InventoryModal;
  onClose: () => void;
};
