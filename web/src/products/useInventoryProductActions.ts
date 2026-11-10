import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { InventoryActionDependencies } from "./inventoryActionTypes";

export function useInventoryProductActions({ refreshData, setError, setNotice }: InventoryActionDependencies) {
  async function saveProduct(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const price = Number(form.get("price"));
    const buyingPrice = Number(form.get("buyingPrice"));
    setError("");
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          activeIngredient: form.get("activeIngredient"),
          prescriptionRequired: form.get("prescriptionRequired") === "on",
          preferredName: form.get("preferredName"),
          category: form.get("category"),
          dosageForm: form.get("dosageForm"),
          saleUnit: form.get("saleUnit"),
          unitsPerPack: form.get("unitsPerPack") ? Number(form.get("unitsPerPack")) : null,
          reorderLevel: Number(form.get("reorderLevel")),
          description: form.get("description"),
          supplierId: Number(form.get("supplierId")),
          priceCents: Math.round(price * 100),
          buyingPriceCents: Math.round(buyingPrice * 100),
          stockCount: Number(form.get("stockCount")),
          batchCode: form.get("batchCode"),
          expiryDate: form.get("expiryDate"),
        }),
      });
      formElement.reset();
      setNotice("Product added to inventory.");
      await refreshData();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add product");
      return false;
    }
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>, productId: number): Promise<boolean> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await api(`/api/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          activeIngredient: form.get("activeIngredient"),
          prescriptionRequired: form.get("prescriptionRequired") === "on",
          preferredName: form.get("preferredName"),
          category: form.get("category"),
          dosageForm: form.get("dosageForm"),
          saleUnit: form.get("saleUnit"),
          unitsPerPack: form.get("unitsPerPack") ? Number(form.get("unitsPerPack")) : null,
          reorderLevel: Number(form.get("reorderLevel")),
          description: form.get("description"),
          priceCents: Math.round(Number(form.get("price")) * 100),
          buyingPriceCents: form.get("buyingPrice")
            ? Math.round(Number(form.get("buyingPrice")) * 100)
            : null,
        }),
      });
      setNotice("Product details updated.");
      await refreshData();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update product");
      return false;
    }
  }

  return { saveProduct, updateProduct };
}
