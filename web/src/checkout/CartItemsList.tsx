import { money } from "../lib/money";
import type { CartItem } from "../types";

type CartItemsListProps = {
  cartItems: CartItem[];
  isCheckingOut: boolean;
  onCartChange: (change: (current: Record<number, number>) => Record<number, number>) => void;
};

function CartItemsList({ cartItems, isCheckingOut, onCartChange }: CartItemsListProps) {
  return (
    <div className="cart-list">
      {cartItems.map(({ product, quantity }) => (
        <div className="cart-row" key={product.id}>
          <div className="cart-name">
            <strong>{product.name}</strong>
            <span>{money(product.priceCents)} each</span>
          </div>
          <div className="quantity">
            <button
              aria-label={`Remove one ${product.name}`}
              disabled={isCheckingOut}
              onClick={() => onCartChange((current) => {
                const next = { ...current };
                if (quantity <= 1) delete next[product.id];
                else next[product.id] = quantity - 1;
                return next;
              })}
            >−</button>
            <span>{quantity}</span>
            <button
              aria-label={`Add one ${product.name}`}
              disabled={isCheckingOut || quantity >= product.saleableCount}
              onClick={() => onCartChange((current) => ({
                ...current, [product.id]: quantity + 1,
              }))}
            >+</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default CartItemsList;
