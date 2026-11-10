import { api } from "../lib/api";
import type { Batch } from "../types";
import type { InventoryActionDependencies } from "./inventoryActionTypes";

export function useInventoryStockActions({ refreshData, setError, setNotice }: InventoryActionDependencies) {
  async function addStock(batch: Batch, incomingStock: number): Promise<boolean> {
    setError("");
    try {
      await api(`/api/batches/${batch.id}/stock`, {
        method: "POST",
        body: JSON.stringify({ incomingStock }),
      });
      setNotice(`Added ${incomingStock} units to stock.`);
      try {
        await refreshData();
      } catch (reason) {
        setError(`Stock was added, but inventory could not be refreshed: ${
          reason instanceof Error ? reason.message : "Could not load POS data"
        }`);
      }
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add stock");
      return false;
    }
  }

  async function updateBatchExpiry(batchId: number, expiryDate: string): Promise<boolean> {
    setError("");
    try {
      await api(`/api/batches/${batchId}/expiry`, {
        method: "PATCH",
        body: JSON.stringify({ expiryDate }),
      });
      setNotice("Batch expiry date updated.");
      await refreshData();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update batch expiry date");
      return false;
    }
  }

  return { addStock, updateBatchExpiry };
}
