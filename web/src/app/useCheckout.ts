import { useCallback, useRef, useState } from "react";
import { clearCheckoutReference, getCheckoutStatus, initiateCheckout, waitForCheckout } from "./checkoutApi";
import { handleCheckoutFailure } from "./checkoutFailure";
import type { CartItem } from "../types";

type CheckoutMethod = "cash" | "mpesa" | "credit";

export function useCheckout(
  items: CartItem[],
  setCart: (cart: Record<number, number>) => void,
  refreshData: () => Promise<void>,
  refreshDashboard: () => Promise<void>,
  setError: (message: string) => void,
  setNotice: (message: string) => void,
) {
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<"initiating" | "waiting" | null>(null);
  const reference = useRef<string | null>(null);
  if (reference.current === null) {
    try {
      reference.current = window.sessionStorage.getItem("payassure-checkout-reference") ?? "";
    } catch (reason) {
      console.warn("Could not restore the pending checkout reference:", reason);
      reference.current = "";
    }
  }

  const checkout = useCallback(async (
    method: CheckoutMethod,
    mpesaPhone?: string,
    retrying = false,
  ): Promise<boolean> => {
    setError("");
    setNotice("");
    setPending(true);
    setStage("initiating");
    const ref = reference.current || `POS-${window.crypto.randomUUID()}`;
    reference.current = ref;
    try {
      window.sessionStorage.setItem("payassure-checkout-reference", ref);
    } catch (reason) {
      console.warn("Could not persist the checkout reference for a retry:", reason);
    }
    let acknowledged = false;
    try {
      const initial = await initiateCheckout(ref, method, items, payerName, payerPhone, mpesaPhone);
      acknowledged = true;
      const status = await waitForCheckout(ref, initial, () => setStage("waiting"));
      if (status.collectionStatus === "pending") {
        setNotice(retrying
          ? "The new checkout is still pending. The earlier payment attempt also remains unresolved; check both statuses before retrying."
          : "No collection webhook was received within two minutes. This checkout remains pending; do not create a new sale.");
        await Promise.all([refreshData(), refreshDashboard()]).catch((reason) => {
          console.warn("Could not refresh data while checkout remains pending:", reason);
        });
        return false;
      }
      if (status.collectionStatus !== "succeeded") {
        throw new Error(status.settlementError ?? "PayAssure did not confirm collection. The sale was not completed.");
      }
      reference.current = "";
      clearCheckoutReference();
      setCart({});
      setPayerName("");
      setPayerPhone("");
      const message = retrying
        ? "PayAssure confirmed this new checkout. Note: the earlier payment attempt remains unresolved and could also complete."
        : "PayAssure confirmed collection and the sale was saved.";
      setNotice(message);
      try {
        await Promise.all([refreshData(), refreshDashboard()]);
      } catch (reason) {
        console.warn("Checkout succeeded, but POS data could not refresh:", reason);
        setNotice(`${message} POS data could not refresh.`);
      }
      return true;
    } catch (reason) {
      return handleCheckoutFailure({
        reason, reference: ref, retrying, acknowledged, setError, setNotice,
        resetReference: () => {
          reference.current = "";
          clearCheckoutReference();
        },
        refreshData, refreshDashboard,
        retry: () => checkout(method, mpesaPhone, true),
      });
    } finally {
      setPending(false);
      setStage(null);
    }
  }, [items, payerName, payerPhone, refreshData, refreshDashboard, setCart, setError, setNotice]);

  return { payerName, setPayerName, payerPhone, setPayerPhone, pending, stage, checkout };
}
