export type Sale = {
  id: number;
  paymentMethod: "cash" | "mpesa" | "credit";
  status: string;
  totalCents: number;
  createdAt: string;
  payerName: string | null;
  payerPhone: string | null;
  failureReason?: string | null;
  items: {
    productName: string;
    quantity: number;
    unitPriceCents: number;
    batchCode: string | null;
    batchExpiryDate: string | null;
    buyingUnitPriceCents?: number | null;
    supplierId?: number | null;
    supplierName?: string | null;
  }[];
};

export type DashboardTransaction = {
  id: string;
  paymentMethod: "cash" | "mpesa" | "credit";
  status: "completed" | "pending" | "failed";
  totalCents: number | null;
  createdAt: string;
  failureReason: string | null;
  payerName: string | null;
  payerPhone: string | null;
  collectionStatus: "pending" | "succeeded" | "failed" | null;
  settlementId: number | null;
  settlementStatus:
    | "queued" | "processing" | "accepted" | "failed" | "retrying"
    | "partially_failed" | "awaiting_reconciliation" | "completed" | null;
  settlementError: string | null;
  settlementAttemptCount: number | null;
  nextRetryAt: string | null;
};

export type SupplierCost = {
  supplierId: number;
  supplierName: string;
  costCents: number;
  unitsSold: number;
  unpricedSaleLines: number;
};

export type DashboardPeriod = "today" | "week" | "month" | "all-time";

export type DashboardData = {
  period: DashboardPeriod;
  date: string;
  startDate: string;
  successfulTransactions: number;
  failedTransactions: number;
  incomeCents: number;
  averageSalesPerDayCents: number;
  unitsSold: number;
  supplierCostCents: number;
  unpricedSaleLines: number;
  failedAmountCents: number;
  supplierCosts: SupplierCost[];
  transactions: DashboardTransaction[];
};
