export type Product = {
  id: number;
  name: string;
  priceCents: number;
  buyingPriceCents: number | null;
  stockCount: number;
  supplierId: number;
  supplierName: string;
  merchantId: string | null;
  activeIngredient: string;
  prescriptionRequired: boolean;
  brand: string;
  preferredName: string;
  category: string;
  dosageForm: string;
  strength: string;
  saleUnit: "single" | "kit" | "bottle" | "blister_pack" | "tin" | "pack" | "box";
  unitsPerPack: number | null;
  reorderLevel: number;
  barcode: string | null;
  stockCode: string | null;
  description: string;
  saleableCount: number;
};

export type Supplier = {
  id: number;
  name: string;
  merchantId: string | null;
  payassureEnrolled: boolean;
  contactName: string;
  phone: string;
  email: string;
  address: string;
};

export type PayassureDirectorySupplier = {
  name: string;
  merchantId: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
};

export type Batch = {
  id: number;
  productId: number;
  productName: string;
  batchCode: string;
  expiryDate: string | null;
  stockCount: number;
  expiryUnknown: boolean;
  expired: boolean;
};

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
  settlementId: number | null;
  settlementStatus:
    | "queued"
    | "processing"
    | "accepted"
    | "failed"
    | "retrying"
    | "partially_failed"
    | "awaiting_reconciliation"
    | "completed"
    | null;
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

export type Tab = "dashboard" | "checkout" | "products" | "suppliers" | "payassure-data" | "history" | "support";

export type CartItem = { product: Product; quantity: number };

export type PayassureParticipant = {
  id?: string;
  participantType?: string;
  businessName?: string;
  businessType?: string;
  contactName?: string;
  email?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  integration?: {
    apiKey?: string | null;
    apiSecret?: string | null;
    merchantId?: string | null;
    environment?: string | null;
    isActive?: boolean | null;
    createdAt?: string | null;
  } | null;
  payment?: {
    type?: string | null;
    accountName?: string | null;
    phoneNumber?: string | null;
    bankCode?: string | null;
    accountNumber?: string | null;
    shortcode?: string | null;
    provider?: string | null;
    status?: string | null;
    isVerified?: boolean | null;
  } | null;
};

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
  | "depositedBalance"
  | "paidOutBalance"
  | "reservedBalance"
  | "availableBalance"
> & {
  asOf: string;
};

export type RetailerFloatDeposit = {
  depositId: string;
  merchantId: string;
  amount: number;
  payerPhoneNumber: string;
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
  payment?: Partial<Pick<
    RetailerPaymentData,
    "type" | "accountName" | "phoneNumber" | "bankCode" | "accountNumber" | "shortcode" | "provider"
  >>;
};
