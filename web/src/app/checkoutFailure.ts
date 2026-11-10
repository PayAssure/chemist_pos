import { ApiError } from "../lib/api";
import { getCheckoutStatus } from "./checkoutApi";

type FailureOptions = {
  reason: unknown;
  reference: string;
  retrying: boolean;
  acknowledged: boolean;
  resetReference: () => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  refreshData: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  retry: () => Promise<boolean>;
};

export async function handleCheckoutFailure(options: FailureOptions) {
  const { reason, reference, retrying, acknowledged } = options;
  const message = reason instanceof Error ? reason.message : "Checkout failed";
  const conflict = reason instanceof ApiError && reason.code === "CHECKOUT_REFERENCE_CONFLICT";
  const unresolved = reason instanceof ApiError && reason.code === "CHECKOUT_COLLECTION_UNRESOLVED";
  if (conflict) {
    options.resetReference();
    options.setNotice("This checkout reference belonged to a different sale. No new payment was sent. Submit again to use a fresh reference.");
  } else if (unresolved && !retrying) {
    console.warn("[PayAssure] Retrying checkout with a new reference while an earlier collection remains unresolved", { previousReference: reference });
    options.resetReference();
    return options.retry();
  } else {
    options.setError(message);
  }
  if (acknowledged) {
    try {
      if ((await getCheckoutStatus(reference)).collectionStatus === "failed") {
        options.resetReference();
      }
    } catch (statusError) {
      console.warn("Could not verify collection status after checkout error:", statusError);
    }
  }
  try {
    await Promise.all([options.refreshData(), options.refreshDashboard()]);
  } catch (refreshReason) {
    const refreshMessage = refreshReason instanceof Error
      ? refreshReason.message : "Could not refresh POS data";
    options.setError(`${message}. ${refreshMessage}`);
  }
  return false;
}
