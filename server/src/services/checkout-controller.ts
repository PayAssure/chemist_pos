import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { checkoutRequestFingerprint } from "./checkout-helpers";
import { handleCheckoutError } from "./checkout-errors";
import type { CheckoutState } from "./checkout-models";
import { parseCheckoutRequest, checkoutQuantities } from "./checkout-request";
import { stageCheckout } from "./checkout-staging";
import { submitStagedCheckout } from "./checkout-submit";

export async function handleCheckout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = parseCheckoutRequest(req, res);
  if (!parsed) return;
  const { checkout, mpesaPhone } = parsed;
  const quantities = checkoutQuantities(checkout, res);
  if (!quantities) return;
  const state: CheckoutState = {
    reference: checkout.merchantTransactionReference ?? `POS-${randomUUID()}`,
    transactionOpen: false,
    clientReleased: false,
    payassureRequestStarted: false,
    payassureAccepted: false,
    stagedSaleId: null,
    stagedSettlementId: null,
  };
  const requestFingerprint = checkoutRequestFingerprint(checkout, mpesaPhone);
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    next(error);
    return;
  }
  try {
    const staged = await stageCheckout({
      client,
      checkout,
      quantities,
      state,
      requestFingerprint,
      mpesaPhone,
      email: req.session.email!,
    });
    if ("error" in staged) {
      res.status(staged.status).json({ error: staged.error });
      return;
    }
    client.release();
    state.clientReleased = true;
    await submitStagedCheckout(staged, checkout, state, res);
  } catch (error) {
    await handleCheckoutError(
      error,
      client,
      state,
      checkout,
      req.session.email!,
      res,
      next,
    );
  } finally {
    if (!state.clientReleased) client.release();
  }
}
