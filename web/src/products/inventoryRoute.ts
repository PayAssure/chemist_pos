export function inventoryRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "product") {
    return { modal: null, productId: null, batchId: null } as const;
  }
  if (segments[1] === "add") {
    return { modal: "product", productId: null, batchId: null } as const;
  }
  const productId = Number(segments[1]);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return { modal: null, productId: null, batchId: null } as const;
  }
  const batchSegmentIndex = segments.indexOf("batch");
  const batchId = batchSegmentIndex >= 0 ? Number(segments[batchSegmentIndex + 1]) : null;
  return {
    modal: "selected-product",
    productId,
    batchId: batchId !== null && Number.isSafeInteger(batchId) && batchId > 0 ? batchId : null,
  } as const;
}
