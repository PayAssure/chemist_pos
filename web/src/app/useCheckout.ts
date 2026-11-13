import { useCallback, useRef, useState } from "react";
import {
  clearCheckoutReference,
  initiateCheckout,
  openCheckoutStatusStream,
  waitForCheckout,
} from "./checkoutApi";
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
    let ref = reference.current || `POS-${window.crypto.randomUUID()}`;
    reference.current = ref;
    try {
      window.sessionStorage.setItem("payassure-checkout-reference", ref);
    } catch (reason) {
      console.warn("Could not persist the checkout reference for a retry:", reason);
    }
    let acknowledged = false;
    let statusStream: ReturnType<typeof openCheckoutStatusStream> | null = null;
    try {
      statusStream = openCheckoutStatusStream(ref);
      await statusStream.ready;
      console.info("[PayAssure checkout] Starting payment request after stream is ready", {
        merchantTransactionReference: ref,
      });
      const initial = await initiateCheckout(ref, method, items, payerName, payerPhone, mpesaPhone);
      acknowledged = true;
      if (initial.reference !== ref) {
        statusStream.close();
        ref = initial.reference;
        reference.current = ref;
        try {
          window.sessionStorage.setItem("payassure-checkout-reference", ref);
        } catch (reason) {
          console.warn("Could not persist the canonical checkout reference for a retry:", reason);
        }
        statusStream = openCheckoutStatusStream(ref);
        await statusStream.ready;
      }
      console.info("[PayAssure checkout] Payment request accepted by POS", {
        merchantTransactionReference: ref,
        saleId: initial.id,
        saleStatus: initial.status,
        settlementStatus: initial.settlementStatus,
        collectionStatus: initial.collectionStatus,
      });
      const status = await waitForCheckout(statusStream, initial, () => setStage("waiting"));
      console.info("[PayAssure checkout] Terminal checkout status applied", {
        merchantTransactionReference: ref,
        saleStatus: status.status,
        settlementStatus: status.settlementStatus,
        collectionStatus: status.collectionStatus,
      });
      if (status.status !== "completed" || status.settlementStatus !== "completed") {
        const message =
          status.settlementError ?? "PayAssure settlement did not complete. The sale was not completed.";
        reference.current = "";
        clearCheckoutReference();
        setError(message);
        setPending(false);
        setStage(null);
        void Promise.all([refreshData(), refreshDashboard()]).catch((reason) => {
          console.warn("Could not refresh data after checkout failure:", reason);
        });
        return false;
      }
      reference.current = "";
      clearCheckoutReference();
      setCart({});
      setPayerName("");
      setPayerPhone("");
      const message = retrying
        ? "PayAssure completed settlement for this new checkout. Note: the earlier payment attempt remains unresolved and could also complete."
        : "PayAssure completed settlement and the sale was saved.";
      setNotice(message);
      setPending(false);
      setStage(null);
      void Promise.all([refreshData(), refreshDashboard()]).catch((reason) => {
        console.warn("Checkout succeeded, but POS data could not refresh:", reason);
      });
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
      statusStream?.close();
      setPending(false);
      setStage(null);
    }
  }, [items, payerName, payerPhone, refreshData, refreshDashboard, setCart, setError, setNotice]);

  return { payerName, setPayerName, payerPhone, setPayerPhone, pending, stage, checkout };
}
