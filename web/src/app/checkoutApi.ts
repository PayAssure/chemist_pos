import { api } from "../lib/api";
import type { CartItem } from "../types";
import type { CheckoutStatus } from "./checkoutStatus";

type CheckoutStatusUpdate = Pick<
  CheckoutStatus,
  "status" | "settlementStatus" | "collectionStatus" | "settlementError"
>;

type CheckoutSubmission = CheckoutStatus & { reference: string };

function isSettlementStatus(value: unknown): value is CheckoutStatus["settlementStatus"] {
  return typeof value === "string" && [
    "queued",
    "processing",
    "accepted",
    "failed",
    "retrying",
    "partially_failed",
    "awaiting_reconciliation",
    "completed",
  ].includes(value);
}

function parseCheckoutStatusUpdate(data: string): CheckoutStatusUpdate {
  const parsed: unknown = JSON.parse(data);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Invalid checkout status event");
  }
  const status = parsed as Record<string, unknown>;
  if (
    (status.status !== "pending" && status.status !== "completed" && status.status !== "failed") ||
    !isSettlementStatus(status.settlementStatus) ||
    (status.collectionStatus !== "pending" &&
      status.collectionStatus !== "succeeded" &&
      status.collectionStatus !== "failed") ||
    (status.settlementError !== null && typeof status.settlementError !== "string")
  ) {
    throw new Error("Invalid checkout status event");
  }
  return {
    status: status.status,
    settlementStatus: status.settlementStatus,
    collectionStatus: status.collectionStatus,
    settlementError: status.settlementError,
  };
}

export function openCheckoutStatusStream(reference: string) {
  console.info("[PayAssure checkout] Opening live status stream", {
    merchantTransactionReference: reference,
  });
  const source = new EventSource(
    `/api/checkout/${encodeURIComponent(reference)}/events`,
    { withCredentials: true },
  );
  let latestStatus: CheckoutStatusUpdate | null = null;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveTerminal!: (status: CheckoutStatusUpdate) => void;
  let rejectTerminal!: (error: Error) => void;
  let terminalWaitStarted = false;
  let opened = false;
  let closed = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  source.onopen = () => {
    opened = true;
    console.info("[PayAssure checkout] Live status stream connected", {
      merchantTransactionReference: reference,
      readyState: source.readyState,
    });
    resolveReady();
  };
  source.onerror = () => {
    console.error("[PayAssure checkout] Live status stream error", {
      merchantTransactionReference: reference,
      readyState: source.readyState,
      opened,
    });
    if (!opened) {
      source.close();
      rejectReady(new Error("Could not open the live checkout status stream"));
    }
  };
  source.addEventListener("checkout-status", (event) => {
    try {
      const status = parseCheckoutStatusUpdate((event as MessageEvent<string>).data);
      latestStatus = status;
      console.info("[PayAssure checkout] Live status event received", {
        merchantTransactionReference: reference,
        status: status.status,
        settlementStatus: status.settlementStatus,
        collectionStatus: status.collectionStatus,
        hasSettlementError: Boolean(status.settlementError),
        terminalWaitStarted,
      });
      if (status.status !== "pending" && terminalWaitStarted) {
        resolveTerminal(status);
      }
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error("Invalid checkout status event");
      console.error("[PayAssure checkout] Could not parse live status event", {
        merchantTransactionReference: reference,
        message: error.message,
      });
      if (!opened) rejectReady(error);
      if (terminalWaitStarted) rejectTerminal(error);
    }
  });

  return {
    ready,
    waitForTerminal(
      initial: CheckoutStatus,
      onWaiting: () => void,
    ): Promise<CheckoutStatusUpdate> {
      if (initial.status !== "pending") return Promise.resolve(initial);
      if (latestStatus && latestStatus.status !== "pending") {
        return Promise.resolve(latestStatus);
      }
      onWaiting();
      terminalWaitStarted = true;
      return new Promise((resolve, reject) => {
        resolveTerminal = resolve;
        rejectTerminal = reject;
        if (latestStatus && latestStatus.status !== "pending") resolve(latestStatus);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      source.close();
      console.info("[PayAssure checkout] Live status stream closed", {
        merchantTransactionReference: reference,
      });
    },
  };
}

export async function initiateCheckout(
  reference: string,
  paymentMethod: "cash" | "mpesa" | "credit",
  items: CartItem[],
  payerName: string,
  payerPhone: string,
  mpesaPhone?: string,
) {
  return api<CheckoutSubmission>("/api/checkout", {
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

export function waitForCheckout(
  statusStream: ReturnType<typeof openCheckoutStatusStream>,
  initial: CheckoutStatus,
  onWaiting: () => void,
) {
  return statusStream.waitForTerminal(initial, onWaiting);
}

export function clearCheckoutReference() {
  try {
    window.sessionStorage.removeItem("payassure-checkout-reference");
  } catch (reason) {
    console.warn("Could not clear the checkout reference:", reason);
  }
}
