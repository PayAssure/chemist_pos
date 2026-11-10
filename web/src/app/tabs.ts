import type { Tab } from "../types";

export const appTabs: Tab[] = [
  "dashboard",
  "checkout",
  "products",
  "suppliers",
  "payassure-data",
  "history",
  "support",
];

export const tabLabels: Record<Tab, string> = {
  dashboard: "Dashboard",
  checkout: "Checkout",
  products: "Products & stock",
  suppliers: "Suppliers",
  "payassure-data": "PayAssure data",
  history: "Sales history",
  support: "Contact support",
};
