import type { Dispatch, SetStateAction } from "react";

export type RefreshData = () => Promise<void>;
export type SetMessage = Dispatch<SetStateAction<string>>;

export type InventoryActionDependencies = {
  refreshData: RefreshData;
  setError: SetMessage;
  setNotice: SetMessage;
};
