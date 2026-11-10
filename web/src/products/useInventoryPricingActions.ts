import { api } from "../lib/api";
import type { InventoryActionDependencies } from "./inventoryActionTypes";

export function useInventoryPricingActions({ refreshData, setError, setNotice }: InventoryActionDependencies) {
  async function updateBuyingPrice(productId: number, buyingPriceCents: number): Promise<boolean> {
    setError("");
    try {
      await api(`/api/products/${productId}/buying-price`, {
        method: "PATCH",
        body: JSON.stringify({ buyingPriceCents }),
      });
      setNotice("Buying price updated.");
      await refreshData();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update buying price");
      return false;
    }
  }

  return { updateBuyingPrice };
}
