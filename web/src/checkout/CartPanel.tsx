import type { Dispatch, SetStateAction } from "react";
import { money } from "../lib/money";
import type { CartItem } from "../types";
import CartItemsList from "./CartItemsList";
import CreditPayerFields from "./CreditPayerFields";

type CartPanelProps = {
  cartItems: CartItem[];
  total: number;
  payerName: string;
  payerPhone: string;
  paymentMethod: "cash" | "credit";
  isCheckingOut: boolean;
  creditDetailsMissing: boolean;
  progressLabel: string;
  onCartChange: Dispatch<SetStateAction<Record<number, number>>>;
  onPayerNameChange: (value: string) => void;
  onPayerPhoneChange: (value: string) => void;
  onPaymentMethodChange: (value: "cash" | "credit") => void;
  onCheckout: () => void;
  onMpesaOpen: () => void;
};

function CartPanel(props: CartPanelProps) {
  const { cartItems, total, payerName, payerPhone, paymentMethod, isCheckingOut,
    creditDetailsMissing, progressLabel, onCartChange, onPayerNameChange,
    onPayerPhoneChange, onPaymentMethodChange, onCheckout, onMpesaOpen } = props;
  return (
    <aside className="panel cart-panel">
      <div className="panel-heading">
        <div><h2>Current sale</h2><p>{cartItems.length} different items</p></div>
        <button className="text-button" disabled={isCheckingOut} onClick={() => onCartChange({})}>
          Clear
        </button>
      </div>
      {cartItems.length === 0
        ? <div className="empty cart-empty">Choose a product to begin checkout.</div>
        : <CartItemsList cartItems={cartItems} isCheckingOut={isCheckingOut} onCartChange={onCartChange} />}
      <div className="total-row"><span>Total</span><strong>{money(total)}</strong></div>
      <label className="prescription-field">
        Payment method
        <select
          value={paymentMethod}
          disabled={isCheckingOut}
          onChange={(event) => {
            const next = event.target.value === "credit" ? "credit" : "cash";
            onPaymentMethodChange(next);
            if (next === "cash") {
              onPayerNameChange("");
              onPayerPhoneChange("");
            }
          }}
        >
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
        </select>
      </label>
      {paymentMethod === "credit" && <CreditPayerFields
        payerName={payerName}
        payerPhone={payerPhone}
        disabled={isCheckingOut}
        onNameChange={onPayerNameChange}
        onPhoneChange={onPayerPhoneChange}
      />}
      <button
        className="button button-primary pay-button"
        disabled={isCheckingOut || cartItems.length === 0 ||
          (paymentMethod === "credit" && creditDetailsMissing)}
        onClick={onCheckout}
        aria-busy={isCheckingOut}
      >
        {isCheckingOut
          ? <><span className="checkout-spinner" aria-hidden="true" />{progressLabel}</>
          : paymentMethod === "credit" ? "Complete sale on credit" : "Complete cash sale"}
      </button>
      <button
        className="button button-secondary pay-button"
        disabled={isCheckingOut || cartItems.length === 0}
        onClick={onMpesaOpen}
      >{isCheckingOut ? progressLabel : "Pay with M-Pesa"}</button>
      <p className="helper-text">
        Credit sales require the payer’s name and phone number. All sales are saved only after
        PayAssure accepts the payment.
      </p>
    </aside>
  );
}

export default CartPanel;
