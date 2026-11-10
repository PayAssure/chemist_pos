import type { PoolClient } from "pg";
import type { z } from "zod";
import type { checkoutSchema } from "../validation/checkout";
import type { StoredSettlementPayload } from "./settlement-payload";
import type { PayassureSettlementPayload } from "../payassure";

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface CheckoutProduct {
  id: string;
  name: string;
  price_cents: number;
  buying_price_cents: number | null;
  supplier_id: number;
  stock_count: number;
  prescription_required: boolean;
}

export interface CheckoutBatch {
  id: number;
  product_id: number;
  batch_code: string;
  expiry_date: string;
  stock_count: number;
}

export type CheckoutAllocations = Map<
  number,
  Array<{ batch: CheckoutBatch; quantity: number }>
>;

export interface StagedCheckout {
  saleId: number;
  settlementId: number;
  totalCents: number;
  createdAt: string;
  payload: PayassureSettlementPayload;
}

export interface CheckoutState {
  transactionOpen: boolean;
  clientReleased: boolean;
  payassureRequestStarted: boolean;
  payassureAccepted: boolean;
  stagedSaleId: number | null;
  stagedSettlementId: number | null;
  reference: string;
}

export interface CheckoutStageInput {
  client: PoolClient;
  checkout: CheckoutInput;
  quantities: Map<number, number>;
  state: CheckoutState;
  requestFingerprint: string;
  mpesaPhone: string | null;
  email: string;
}

export interface CheckoutFailure {
  status: number;
  error: string;
  recordAttempt: boolean;
}
