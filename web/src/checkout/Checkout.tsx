import { useState, type Dispatch, type SetStateAction } from "react";
import type { CartItem, Product } from "../types";
import CartPanel from "./CartPanel";
import CheckoutProducts from "./CheckoutProducts";
import MpesaPaymentDialog from "./MpesaPaymentDialog";

type CheckoutProps = {
  products: Product[];
  cartItems: CartItem[];
  total: number;
  payerName: string;
  payerPhone: string;
  onCartChange: Dispatch<SetStateAction<Record<number, number>>>;
  onPayerNameChange: (value: string) => void;
  onPayerPhoneChange: (value: string) => void;
  isCheckingOut: boolean;
  checkoutStage: "initiating" | "waiting" | null;
  onCheckout: (paymentMethod: "cash" | "mpesa" | "credit", payerPhone?: string) => Promise<boolean>;
};

function Checkout({
  products, cartItems, total, payerName, payerPhone, onCartChange,
  onPayerNameChange, onPayerPhoneChange, isCheckingOut, checkoutStage, onCheckout,
}: CheckoutProps) {
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit">("cash");
  const [productSearch, setProductSearch] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaModalOpen, setMpesaModalOpen] = useState(false);
  const creditDetailsMissing = !payerName.trim() || payerPhone.replace(/\D/g, "").length < 7;
  const progressLabel = checkoutStage === "initiating"
    ? "Initiating payment…"
    : "Waiting for PayAssure webhook…";

  return (
    <section className="checkout-layout">
      <CheckoutProducts
        products={products}
        search={productSearch}
        onSearchChange={setProductSearch}
        onAddProduct={(product) => onCartChange((current) => ({
          ...current,
          [product.id]: Math.min((current[product.id] ?? 0) + 1, product.saleableCount),
        }))}
        isCheckingOut={isCheckingOut}
      />
      <CartPanel
        cartItems={cartItems}
        total={total}
        payerName={payerName}
        payerPhone={payerPhone}
        paymentMethod={paymentMethod}
        isCheckingOut={isCheckingOut}
        creditDetailsMissing={creditDetailsMissing}
        progressLabel={progressLabel}
        onCartChange={onCartChange}
        onPayerNameChange={onPayerNameChange}
        onPayerPhoneChange={onPayerPhoneChange}
        onPaymentMethodChange={setPaymentMethod}
        onCheckout={() => void onCheckout(paymentMethod)}
        onMpesaOpen={() => setMpesaModalOpen(true)}
      />
      {mpesaModalOpen && (
        <MpesaPaymentDialog
          phone={mpesaPhone}
          isCheckingOut={isCheckingOut}
          progressLabel={progressLabel}
          onPhoneChange={setMpesaPhone}
          onClose={() => setMpesaModalOpen(false)}
          onCheckout={async () => {
            const completed = await onCheckout("mpesa", mpesaPhone);
            if (completed) {
              setMpesaModalOpen(false);
              setMpesaPhone("");
            }
          }}
        />
      )}
    </section>
  );
}

export default Checkout;
