import { api } from "../lib/api";
import type { CartItem } from "../types";
import type { CheckoutStatus } from "./checkoutStatus";

export async function initiateCheckout(
  reference: string,
  paymentMethod: "cash" | "mpesa" | "credit",
  items: CartItem[],
  payerName: string,
  payerPhone: string,
  mpesaPhone?: string,
) {
  return api<CheckoutStatus>("/api/checkout", {
    method: "POST",
    body: JSON.stringify({
      paymentMethod,
      merchantTransactionReference: reference,
      ...(paymentMethod === "credit" ? { payerName, payerPhone } : {}),
      ...(paymentMethod === "mpesa" ? { payerPhone: mpesaPhone } : {}),
      items: items.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
      })),
    }),
  });
}

export function getCheckoutStatus(reference: string) {
  return api<CheckoutStatus>(`/api/checkout/${encodeURIComponent(reference)}/status`, {
    cache: "no-store",
  });
}

export async function waitForCheckout(
  reference: string,
  initial: CheckoutStatus,
  onWaiting: () => void,
) {
  let status = initial;
  if (status.collectionStatus === "pending") onWaiting();
  const deadline = Date.now() + 120_000;
  while (status.collectionStatus === "pending" && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    status = await getCheckoutStatus(reference);
  }
  return status;
}

export function clearCheckoutReference() {
  try {
    window.sessionStorage.removeItem("payassure-checkout-reference");
  } catch (reason) {
    console.warn("Could not clear the checkout reference:", reason);
  }
}
