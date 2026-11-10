import type { PoolClient } from "pg";
import { recordFailedCheckout } from "./checkout-helpers";
import { beginCheckoutTransaction } from "./checkout-reference";
import type { CheckoutFailure, CheckoutStageInput, StagedCheckout } from "./checkout-models";
import {
  allocateCheckoutBatches,
  findProductStockFailure,
  lockCheckoutProducts,
} from "./checkout-inventory";
import {
  buildStoredSettlementPayload,
  insertPayassureSettlement,
  insertPendingSale,
  insertSaleItems,
  prepareSettlement,
} from "./checkout-persistence";

async function rollback(
  client: PoolClient,
  state: CheckoutStageInput["state"],
): Promise<void> {
  await client.query("ROLLBACK");
  state.transactionOpen = false;
}

async function failCheckout(
  input: CheckoutStageInput,
  error: string,
  status: number,
  recordAttempt = true,
): Promise<CheckoutFailure> {
  await rollback(input.client, input.state);
  if (recordAttempt) {
    await recordFailedCheckout(
      input.email,
      input.checkout.paymentMethod,
      input.checkout.items,
      error,
    );
  }
  return { status, error, recordAttempt };
}

export async function stageCheckout(
  input: CheckoutStageInput,
): Promise<StagedCheckout | CheckoutFailure> {
  const { client, checkout, quantities, state } = input;
  await beginCheckoutTransaction(client, state);
  const productIds = [...quantities.keys()].sort((a, b) => a - b);
  const products = await lockCheckoutProducts(client, productIds);
  if (products.length !== productIds.length) {
    return failCheckout(input, "One or more products no longer exist", 400);
  }
  const productFailure = await findProductStockFailure(client, products, quantities, productIds);
  if (productFailure) return failCheckout(input, productFailure, 409);

  const { allocations, failure } = await allocateCheckoutBatches(
    client,
    products,
    quantities,
    productIds,
  );
  if (failure) return failCheckout(input, failure, 409);
  const totalCents = products.reduce(
    (sum, product) => sum + Number(product.price_cents) * quantities.get(Number(product.id))!,
    0,
  );
  if (!Number.isSafeInteger(totalCents)) {
    return failCheckout(input, "Checkout total is too large", 400, false);
  }

  const sale = await insertPendingSale(client, checkout, totalCents);
  state.stagedSaleId = sale.saleId;
  await insertSaleItems(client, sale.saleId, products, allocations);
  const payload = await buildStoredSettlementPayload(
    client,
    sale.saleId,
    totalCents,
    checkout,
    state.reference,
    input.mpesaPhone,
  );
  const settlementId = await insertPayassureSettlement(
    client,
    sale.saleId,
    state.reference,
    input.requestFingerprint,
    payload,
  );
  state.stagedSettlementId = settlementId;
  const preparedPayload = await prepareSettlement(client, sale.saleId, payload);
  await client.query("COMMIT");
  state.transactionOpen = false;
  return { saleId: sale.saleId, settlementId, totalCents, createdAt: sale.createdAt, payload: preparedPayload };
}
