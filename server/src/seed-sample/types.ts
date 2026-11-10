export type Medicine = {
  id: number;
  name: string;
  priceCents: number;
  prescriptionRequired: boolean;
  batches: Array<{ id: number; code: string; expiry: string; stock: number }>;
};

export type SeedUser = { id: number; email: string };
export type NewCredential = { email: string; password: string };
