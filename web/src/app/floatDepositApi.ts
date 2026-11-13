export type FloatDepositConfirmation = {
  depositId: string;
  amount: number;
  receiptNumber: string | null;
  currency: string;
  completedAt: string | null;
};

function parseFloatDepositConfirmation(data: string): FloatDepositConfirmation {
  const parsed: unknown = JSON.parse(data);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Invalid float deposit status event");
  }
  const status = parsed as Record<string, unknown>;
  if (
    typeof status.depositId !== "string" ||
    typeof status.amount !== "number" ||
    typeof status.currency !== "string" ||
    (status.receiptNumber !== null && typeof status.receiptNumber !== "string") ||
    (status.completedAt !== null && typeof status.completedAt !== "string")
  ) {
    throw new Error("Invalid float deposit status event");
  }
  return {
    depositId: status.depositId,
    amount: status.amount,
    currency: status.currency,
    receiptNumber: status.receiptNumber,
    completedAt: status.completedAt,
  };
}

export function openFloatDepositStatusStream(depositId: string) {
  const source = new EventSource(
    `/api/payassure/float/deposits/${encodeURIComponent(depositId)}/events`,
    { withCredentials: true },
  );
  let latestConfirmation: FloatDepositConfirmation | null = null;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveConfirmation!: (status: FloatDepositConfirmation) => void;
  let rejectConfirmation!: (error: Error) => void;
  let confirmationError: Error | null = null;
  let confirmationWaitStarted = false;
  let opened = false;
  let closed = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  source.onopen = () => {
    opened = true;
    resolveReady();
  };
  source.onerror = () => {
    if (!opened) {
      source.close();
      rejectReady(new Error("Could not open the float deposit status stream"));
    }
  };
  source.addEventListener("float-deposit-status", (event) => {
    try {
      const confirmation = parseFloatDepositConfirmation((event as MessageEvent<string>).data);
      if (confirmation.depositId !== depositId) {
        throw new Error("Float deposit status does not match the requested deposit");
      }
      latestConfirmation = confirmation;
      if (confirmationWaitStarted) resolveConfirmation(confirmation);
    } catch (reason) {
      const error = reason instanceof Error
        ? reason : new Error("Invalid float deposit status event");
      confirmationError = error;
      if (!opened) rejectReady(error);
      if (confirmationWaitStarted) rejectConfirmation(error);
    }
  });

  return {
    ready,
    waitForConfirmation(): Promise<FloatDepositConfirmation> {
      if (latestConfirmation) return Promise.resolve(latestConfirmation);
      if (confirmationError) return Promise.reject(confirmationError);
      confirmationWaitStarted = true;
      return new Promise((resolve, reject) => {
        resolveConfirmation = resolve;
        rejectConfirmation = reject;
        if (latestConfirmation) resolve(latestConfirmation);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      source.close();
    },
  };
}
