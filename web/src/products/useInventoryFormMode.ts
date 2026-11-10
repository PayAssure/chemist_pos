import { useEffect, useState } from "react";
import { navigate } from "../lib/navigation";
import type { Batch, Product } from "../types";
import type { InventoryModal, ProductEditMode } from "./InventoryFormTypes";

function editModeFromPath(pathname: string): ProductEditMode {
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

export function useInventoryFormMode(
  modal: InventoryModal,
  product: Product | null,
  batch: Batch | null,
) {
  const [mode, setMode] = useState<ProductEditMode>(() => editModeFromPath(window.location.pathname));
  useEffect(() => {
    setMode(editModeFromPath(window.location.pathname));
  }, [modal, product?.id, batch?.id]);
  useEffect(() => {
    function syncMode() {
      setMode(editModeFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", syncMode);
    return () => window.removeEventListener("popstate", syncMode);
  }, []);

  function changeMode(nextMode: ProductEditMode) {
    if (!product) return;
    const path = nextMode === "details"
      ? `/product/${product.id}/edit`
      : nextMode === "buying-price"
        ? `/product/${product.id}/buying-price`
        : nextMode === "add-stock" && batch
          ? `/product/${product.id}/batch/${batch.id}/stock`
          : nextMode === "expiry-date" && batch
            ? `/product/${product.id}/batch/${batch.id}/expiry`
            : productPath(product.id, batch?.id ?? null);
    navigate(path);
  }
  return { mode, changeMode };
}
