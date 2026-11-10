import { useMemo, useState } from "react";
import type { CartItem, Product } from "../types";

export function useCart(products: Product[]) {
  const [cart, setCart] = useState<Record<number, number>>({});
  const items = useMemo<CartItem[]>(
    () => products
      .filter((product) => cart[product.id])
      .map((product) => ({ product, quantity: cart[product.id] })),
    [cart, products],
  );
  const total = items.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity, 0,
  );
  return { cart, setCart, items, total };
}
