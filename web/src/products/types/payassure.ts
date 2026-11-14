export type RetailerPaymentData = {
  type: "MPESA" | "BANK";
  accountName: string;
  phoneNumber: string;
  bankCode: string;
  accountNumber: string;
  shortcode: string;
  provider: string;
  status: string;
  isVerified: boolean;
};

export type RetailerIntegrationData = {
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  environment: string;
  isActive: boolean;
  createdAt: string;
};

export type RetailerProfileData = {
  id: string;
  participantType: string;
  businessName: string;
  businessType: string;
  contactName: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  integration: RetailerIntegrationData | null;
  payment: RetailerPaymentData | null;
};

export type RetailerFloatData = {
  merchantId: string;
  currency: string;
  dailyFloat: number;
  depositedBalance: number;
  paidOutBalance: number;
  reservedBalance: number;
  availableBalance: number;
  updatedAt: string;
};

export type RetailerFloatBalance = Pick<
  RetailerFloatData,
  | "merchantId"
  | "currency"
  | "dailyFloat"
  | "depositedBalance"
  | "paidOutBalance"
  | "reservedBalance"
  | "availableBalance"
> & { asOf: string };

export type RetailerFloatDeposit = {
  depositId: string;
  merchantId: string;
  amount: number;
  payerPhoneNumber: string;
  receiptNumber?: string;
  completedAt?: string;
  status: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  responseCode?: string;
  responseDescription?: string;
};

export type PayassureParticipantUpdate = Partial<
  Pick<RetailerProfileData, "businessName" | "businessType" | "contactName" | "email">
> & {
  settlementMethod?: string;
  settlementAccount?: string;
  payment?: Partial<
    Pick<RetailerPaymentData, "type" | "accountName" | "phoneNumber" | "bankCode" | "accountNumber" | "shortcode" | "provider">
  >;
};
