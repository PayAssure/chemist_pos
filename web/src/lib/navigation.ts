import type { Tab } from "../types";

const tabPaths: Record<Tab, string> = {
  dashboard: "/dashboard",
  checkout: "/checkout",
  products: "/product",
  suppliers: "/suppliers",
  "payassure-data": "/payassure-data",
  history: "/sales-history",
  support: "/contact-support",
};

export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function tabFromPath(path: string): Tab {
  const firstSegment = path.split("/").filter(Boolean)[0];
  if (firstSegment === "checkout") return "checkout";
  if (firstSegment === "product") return "products";
  if (firstSegment === "suppliers") return "suppliers";
  if (firstSegment === "payassure-data") return "payassure-data";
  if (firstSegment === "sales-history") return "history";
  if (firstSegment === "contact-support") return "support";
  return "dashboard";
}

export function pathForTab(tab: Tab) {
  return tabPaths[tab];
}
