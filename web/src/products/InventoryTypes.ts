import type { FormEvent } from "react";
import type { Batch, Product, Supplier } from "../types";

export type InventoryProps = {
  products: Product[];
  batches: Batch[];
  suppliers: Supplier[];
  onSaveProduct: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onUpdateProduct: (event: FormEvent<HTMLFormElement>, productId: number) => Promise<boolean>;
  onUpdateBuyingPrice: (productId: number, buyingPriceCents: number) => Promise<boolean>;
  onUpdateBatchExpiry: (batchId: number, expiryDate: string) => Promise<boolean>;
  onAddStock: (batch: Batch, incomingStock: number) => Promise<boolean>;
};
