

export type PayassureTokens = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

export type PayassureConfig = {
  baseUrl: string;
  identifier: string;
  password: string;
};

export type PayassureSettlementPayload = {
  merchantId: string;
  merchantTransactionReference: string;
  amount: number;
  currency: "KES";
  payment: {
    methods: Array<
      | { type: "CASH"; amount: number }
      | { type: "MPESA"; amount: number; phoneNumber: string }
    >;
  };
  items: Array<{
    supplierMerchantId: string | null;
    itemReference: string;
    supplierAmount: number;
    retailerAmount: number;
  }>;
  metadata: { posSaleId: string };
};

export class PayassureHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
