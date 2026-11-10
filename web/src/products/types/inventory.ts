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

export type CartItem = { product: Product; quantity: number };
