import type { FormEvent } from "react";
import { api } from "../lib/api";
import type { InventoryActionDependencies } from "./inventoryActionTypes";

export function useInventorySupplierActions({ refreshData, setError, setNotice }: InventoryActionDependencies) {
  async function saveSupplier(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    try {
      await api("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          payassureEnrolled: form.get("payassureEnrolled") === "true",
          merchantId: form.get("merchantId") ?? "",
          contactName: form.get("contactName") ?? "",
          phone: form.get("phone") ?? "",
          email: form.get("email") ?? "",
          address: form.get("address") ?? "",
        }),
      });
      formElement.reset();
      setNotice("Supplier added.");
      await refreshData();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add supplier");
      return false;
    }
  }

  return { saveSupplier };
}
