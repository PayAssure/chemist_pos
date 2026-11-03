import { useState, type Dispatch, type SetStateAction } from "react";
import { money } from "../lib/money";
import type { CartItem, Product } from "../types";

type CheckoutProps = {
  products: Product[];
  cartItems: CartItem[];
  total: number;
  prescriptionRequired: boolean;
  prescriptionReference: string;
  payerName: string;
  payerPhone: string;
  onCartChange: Dispatch<SetStateAction<Record<number, number>>>;
  onPrescriptionReferenceChange: (value: string) => void;
  onPayerNameChange: (value: string) => void;
  onPayerPhoneChange: (value: string) => void;
  isCheckingOut: boolean;
  onCheckout: (paymentMethod: "cash" | "mpesa" | "credit", payerPhone?: string) => Promise<boolean>;
};

function Checkout({
  products,
  cartItems,
  total,
  prescriptionRequired,
  prescriptionReference,
  payerName,
  payerPhone,
  onCartChange,
  onPrescriptionReferenceChange,
  onPayerNameChange,
  onPayerPhoneChange,
  isCheckingOut,
  onCheckout,
}: CheckoutProps) {
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit">("cash");
  const [productSearch, setProductSearch] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaModalOpen, setMpesaModalOpen] = useState(false);
  const creditDetailsMissing =
    !payerName.trim() || payerPhone.replace(/\D/g, "").length < 7;
  const searchTerms = productSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matchingProducts = products.filter((product) => {
    const searchableText = [
      product.name,
      product.brand,
      product.preferredName,
      product.category,
      product.activeIngredient,
      product.dosageForm,
      product.strength,
      product.supplierName,
      product.barcode ?? "",
      product.stockCode ?? "",
    ].join(" ").toLocaleLowerCase();
    return searchTerms.every((term) => searchableText.includes(term));
  });
  return (
    <section className="checkout-layout">
      <div className="panel">
        <div className="panel-heading checkout-products-heading">
          <div><h2>Products</h2><p>Select items to add to this sale.</p></div>
          {products.length > 0 && (
            <input
              className="checkout-product-search"
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search by product, ingredient, category, or supplier"
              aria-label="Search checkout products"
            />
          )}
        </div>
        {products.length === 0 ? (
          <div className="empty">No products yet. Add your first item in Products & stock.</div>
        ) : (
          <>
            {matchingProducts.length ? (
              <div className="product-grid">
                {matchingProducts.map((product) => (
              <button
                className="product-tile"
                key={product.id}
                disabled={isCheckingOut || product.saleableCount === 0}
                onClick={() =>
                  onCartChange((current) => ({
                    ...current,
                    [product.id]: Math.min(
                      (current[product.id] ?? 0) + 1,
                      product.saleableCount,
                    ),
                  }))
                }
              >
                <span className="product-initial">{product.name.slice(0, 1).toUpperCase()}</span>
                <strong>{product.name}</strong>
                <small>
                  {[product.brand, product.strength, product.dosageForm || product.activeIngredient]
                    .filter(Boolean)
                    .join(" · ") || product.category}
                  {product.prescriptionRequired ? " · Prescription" : ""}
                </small>
                <span>{money(product.priceCents)}</span>
                <small>{product.saleableCount} unexpired · {product.stockCount} total · sold by {product.saleUnit.replace("_", " ")}</small>
              </button>
                ))}
              </div>
            ) : (
              <div className="empty">No products match your search.</div>
            )}
          </>
        )}
      </div>
      <aside className="panel cart-panel">
        <div className="panel-heading">
          <div><h2>Current sale</h2><p>{cartItems.length} different items</p></div>
          <button className="text-button" disabled={isCheckingOut} onClick={() => onCartChange({})}>Clear</button>
        </div>
        {cartItems.length === 0 ? (
          <div className="empty cart-empty">Choose a product to begin checkout.</div>
        ) : (
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
                    onClick={() =>
                      onCartChange((current) => {
                        const next = { ...current };
                        if (quantity <= 1) delete next[product.id];
                        else next[product.id] = quantity - 1;
                        return next;
                      })
                    }
                  >−</button>
                  <span>{quantity}</span>
                  <button
                    aria-label={`Add one ${product.name}`}
                    disabled={isCheckingOut || quantity >= product.saleableCount}
                    onClick={() =>
                      onCartChange((current) => ({ ...current, [product.id]: quantity + 1 }))
                    }
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="total-row"><span>Total</span><strong>{money(total)}</strong></div>
        {prescriptionRequired && (
          <label className="prescription-field">
            Prescription reference
            <input
              value={prescriptionReference}
              disabled={isCheckingOut}
              onChange={(event) => onPrescriptionReferenceChange(event.target.value)}
              required
              maxLength={120}
              placeholder="Enter prescription reference"
            />
            <span className="helper-text">Confirm the prescription before completing this sale.</span>
          </label>
        )}
        <label className="prescription-field">
          Payment method
          <select
            value={paymentMethod}
            disabled={isCheckingOut}
            onChange={(event) => {
              const nextMethod = event.target.value === "credit" ? "credit" : "cash";
              setPaymentMethod(nextMethod);
              if (nextMethod === "cash") {
                onPayerNameChange("");
                onPayerPhoneChange("");
              }
            }}
          >
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
        </label>
        {paymentMethod === "credit" && (
          <>
            <label className="prescription-field">
              Payer name
              <input
                value={payerName}
                disabled={isCheckingOut}
                onChange={(event) => onPayerNameChange(event.target.value)}
                required
                maxLength={120}
                placeholder="Enter payer's full name"
              />
            </label>
            <label className="prescription-field">
              Payer phone number
              <input
                type="tel"
                value={payerPhone}
                disabled={isCheckingOut}
                onChange={(event) => onPayerPhoneChange(event.target.value)}
                required
                minLength={7}
                maxLength={30}
                placeholder="Enter payer's phone number"
              />
            </label>
          </>
        )}
        <button
          className="button button-primary pay-button"
          disabled={
            isCheckingOut ||
            cartItems.length === 0 ||
            (paymentMethod === "credit" && creditDetailsMissing) ||
            (prescriptionRequired && !prescriptionReference.trim())
          }
          onClick={() => onCheckout(paymentMethod)}
          aria-busy={isCheckingOut}
        >
          {isCheckingOut ? <><span className="checkout-spinner" aria-hidden="true" />Waiting for PayAssure…</> : paymentMethod === "credit" ? "Complete sale on credit" : "Complete cash sale"}
        </button>
        <button
          className="button button-secondary pay-button"
          disabled={isCheckingOut || cartItems.length === 0 || (prescriptionRequired && !prescriptionReference.trim())}
          onClick={() => setMpesaModalOpen(true)}
        >{isCheckingOut ? "Waiting for PayAssure…" : "Pay with M-Pesa"}</button>
        <p className="helper-text">Credit sales require the payer’s name and phone number. All sales are saved only after PayAssure accepts the payment.</p>
      </aside>
      {mpesaModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (!isCheckingOut && event.target === event.currentTarget) setMpesaModalOpen(false);
        }}>
          <section className="panel form-panel checkout-mpesa-modal" role="dialog" aria-modal="true" aria-labelledby="mpesa-modal-title">
            <div className="modal-heading">
              <div>
                <h2 id="mpesa-modal-title">M-Pesa payment</h2>
                <p>Enter the customer’s phone number. The sale is saved only after PayAssure accepts the payment.</p>
              </div>
              <button className="modal-close" type="button" aria-label="Close dialog" disabled={isCheckingOut} onClick={() => setMpesaModalOpen(false)}>×</button>
            </div>
            <form onSubmit={async (event) => {
              event.preventDefault();
              const completed = await onCheckout("mpesa", mpesaPhone);
              if (completed) {
                setMpesaModalOpen(false);
                setMpesaPhone("");
              }
            }}>
              <label className="prescription-field">
                Customer phone number
                <input
                  type="tel"
                  value={mpesaPhone}
                  disabled={isCheckingOut}
                  onChange={(event) => setMpesaPhone(event.target.value)}
                  required
                  maxLength={30}
                  placeholder="07XX XXX XXX or 2547XX XXX XXX"
                  autoFocus
                />
              </label>
              <div className="modal-actions">
                <button className="button button-secondary" type="button" disabled={isCheckingOut} onClick={() => setMpesaModalOpen(false)}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={isCheckingOut} aria-busy={isCheckingOut}>
                  {isCheckingOut ? <><span className="checkout-spinner" aria-hidden="true" />Waiting for PayAssure…</> : "Initiate M-Pesa payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default Checkout;
