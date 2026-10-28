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
  prescriptionReference: string | null;
  prescriptionCheckedBy: string | null;
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
  status: "completed" | "failed";
  totalCents: number | null;
  createdAt: string;
  failureReason: string | null;
  payerName: string | null;
  payerPhone: string | null;
};

export type SupplierCost = {
  supplierId: number;
  supplierName: string;
  costCents: number;
  unitsSold: number;
  unpricedSaleLines: number;
};

export type DashboardData = {
  date: string;
  successfulTransactions: number;
  failedTransactions: number;
  incomeCents: number;
  unitsSold: number;
  supplierCostCents: number;
  unpricedSaleLines: number;
  failedAmountCents: number;
  supplierCosts: SupplierCost[];
  transactions: DashboardTransaction[];
};

export type Tab = "dashboard" | "checkout" | "products" | "suppliers" | "payassure-data" | "history";

export type CartItem = { product: Product; quantity: number };

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
  id: string;
  merchantId: string;
  environment: string;
  isActive: boolean;
  createdAt: string;
};

export type RetailerProfileData = {
  id: string;
  participantType: "RETAILER";
  businessName: string;
  registrationNumber: string;
  kraPin: string;
  businessType: string;
  industry: string;
  physicalAddress: string;
  contactName: string;
  email: string;
  phoneNumber: string;
  settlementMethod: string;
  settlementAccount: string;
  posSystem: string;
  settlementPreference: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  integration: RetailerIntegrationData | null;
  payment: RetailerPaymentData | null;
};
