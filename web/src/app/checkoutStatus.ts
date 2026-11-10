export type CheckoutStatus = {
  id: number;
  status: "pending" | "completed" | "failed";
  settlementStatus:
    | "queued" | "processing" | "accepted" | "failed" | "retrying"
    | "partially_failed" | "awaiting_reconciliation" | "completed";
  collectionStatus: "pending" | "succeeded" | "failed";
  settlementError: string | null;
};
