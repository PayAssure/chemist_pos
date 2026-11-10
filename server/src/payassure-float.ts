

import { requestRetailerFloat } from "./payassure-float-client";

export function getPayassureRetailerFloat(): Promise<unknown> {
  return requestRetailerFloat("retailer-float", "GET", "/escrow/retailer/float");
}

export function checkPayassureRetailerFloatBalance(): Promise<unknown> {
  return requestRetailerFloat(
    "retailer-float-balance",
    "POST",
    "/escrow/retailer/float/balance",
  );
}

export function initiatePayassureRetailerFloatDeposit(
  amount: number,
  payerPhoneNumber: string,
): Promise<unknown> {
  return requestRetailerFloat(
    "retailer-float-deposit",
    "POST",
    "/escrow/retailer/float/deposits",
    { amount, payerPhoneNumber },
  );
}
