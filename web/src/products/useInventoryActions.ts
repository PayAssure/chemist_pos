import type { InventoryActionDependencies } from "./inventoryActionTypes";
import { useInventoryPricingActions } from "./useInventoryPricingActions";
import { useInventoryProductActions } from "./useInventoryProductActions";
import { useInventoryStockActions } from "./useInventoryStockActions";
import { useInventorySupplierActions } from "./useInventorySupplierActions";

export function useInventoryActions(
  refreshData: InventoryActionDependencies["refreshData"],
  setError: InventoryActionDependencies["setError"],
  setNotice: InventoryActionDependencies["setNotice"],
) {
  const dependencies = { refreshData, setError, setNotice };
  return {
    ...useInventorySupplierActions(dependencies),
    ...useInventoryProductActions(dependencies),
    ...useInventoryPricingActions(dependencies),
    ...useInventoryStockActions(dependencies),
  };
}
