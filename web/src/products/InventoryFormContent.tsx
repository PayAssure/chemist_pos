import type { FormEvent } from "react";
import type { InventoryFormsProps, ProductEditMode } from "./InventoryFormTypes";
import { AddProductForm } from "./AddProductForm";
import { InventoryBatchForms } from "./InventoryBatchForms";
import { InventoryProductOverview } from "./InventoryProductOverview";
import { ProductEditForm } from "./ProductEditForm";

type Props = Omit<InventoryFormsProps, "onSaveProduct"> & {
  mode: ProductEditMode;
  onSaveProduct: (event: FormEvent<HTMLFormElement>) => void;
  onChangeMode: (mode: ProductEditMode) => void;
};

export function InventoryFormContent(props: Props) {
  if (props.modal === "product") {
    return <AddProductForm suppliers={props.suppliers} onSave={props.onSaveProduct} onClose={props.onClose} />;
  }
  const product = props.selectedProduct;
  if (!product) return null;
  if (props.mode === "details") {
    return <ProductEditForm key={product.id} product={product}
      onUpdate={props.onUpdateProduct} onClose={props.onClose} />;
  }
  if (props.mode === "buying-price" ||
    (props.selectedBatch && (props.mode === "expiry-date" || props.mode === "add-stock"))) {
    return <InventoryBatchForms
      product={product} batch={props.selectedBatch} mode={props.mode}
      onUpdateBuyingPrice={props.onUpdateBuyingPrice}
      onUpdateBatchExpiry={props.onUpdateBatchExpiry} onAddStock={props.onAddStock}
      onBack={() => props.onChangeMode(null)} onClose={props.onClose}
    />;
  }
  return <InventoryProductOverview product={product} batch={props.selectedBatch}
    onEdit={props.onChangeMode} />;
}
