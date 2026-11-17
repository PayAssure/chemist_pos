import type { RetailerFloatBalanceUpdate } from "../types";

function parseRetailerFloatBalanceUpdate(data: string): RetailerFloatBalanceUpdate {
  const parsed: unknown = JSON.parse(data);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Invalid retailer float balance event");
  }
  const update = parsed as Record<string, unknown>;
  if (
    typeof update.availableBalance !== "number" ||
    !Number.isFinite(update.availableBalance) ||
    typeof update.currency !== "string" ||
    typeof update.asOf !== "string" ||
    !Number.isFinite(Date.parse(update.asOf))
  ) {
    throw new Error("Invalid retailer float balance event");
  }
  return {
    availableBalance: update.availableBalance,
    currency: update.currency,
    asOf: update.asOf,
  };
}

export function openRetailerFloatBalanceStream(
  onUpdate: (update: RetailerFloatBalanceUpdate) => void,
  onInvalidUpdate: (error: Error) => void,
) {
  const source = new EventSource("/api/payassure/float/events", { withCredentials: true });
  source.addEventListener("retailer-float-balance", (event) => {
    try {
      onUpdate(parseRetailerFloatBalanceUpdate((event as MessageEvent<string>).data));
    } catch (reason) {
      onInvalidUpdate(
        reason instanceof Error ? reason : new Error("Invalid retailer float balance event"),
      );
    }
  });
  return {
    close() {
      source.close();
    },
  };
}
