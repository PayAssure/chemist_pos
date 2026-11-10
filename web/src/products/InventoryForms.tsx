import { useEffect, type FormEvent } from "react";
import type { InventoryFormsProps } from "./InventoryFormTypes";
import { InventoryFormContent } from "./InventoryFormContent";
import { InventoryModalShell } from "./InventoryModalShell";
import { inventoryModalDescription, inventoryModalTitle } from "./inventoryModalCopy";
import { useInventoryFormMode } from "./useInventoryFormMode";

function InventoryForms(props: InventoryFormsProps) {
  const { mode, changeMode } = useInventoryFormMode(
    props.modal,
    props.selectedProduct,
    props.selectedBatch,
  );
  useEffect(() => {
    if (!props.modal) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [props.modal, props.onClose]);

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    if (await props.onSaveProduct(event)) props.onClose();
  }
  if (!props.modal || (props.modal === "selected-product" && !props.selectedProduct)) return null;
  return (
    <InventoryModalShell
      title={inventoryModalTitle(props.modal, mode, props.selectedProduct)}
      description={inventoryModalDescription(props.modal, mode, props.selectedBatch)}
      onClose={props.onClose}
    >
      <InventoryFormContent {...props} mode={mode} onSaveProduct={submitProduct}
        onChangeMode={changeMode} />
    </InventoryModalShell>
  );
}

export default InventoryForms;
