export class PaymentIntegrationNotConfiguredError extends Error {
  constructor() {
    super("M-Pesa checkout is unavailable until the PayAssure API contract is configured.");
    this.name = "PaymentIntegrationNotConfiguredError";
  }
}

export async function startMpesaCheckout(): Promise<never> {
  throw new PaymentIntegrationNotConfiguredError();
}

export async function getMpesaCheckoutStatus(_reference: string): Promise<never> {
  throw new PaymentIntegrationNotConfiguredError();
}
