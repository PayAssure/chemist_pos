import { money } from "../lib/money";
import type { Product } from "../types";

type CheckoutProductsProps = {
  products: Product[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddProduct: (product: Product) => void;
  isCheckingOut: boolean;
};

function CheckoutProducts({
  products, search, onSearchChange, onAddProduct, isCheckingOut,
}: CheckoutProductsProps) {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matchingProducts = products.filter((product) => {
    const text = [
      product.name, product.brand, product.preferredName, product.category,
      product.activeIngredient, product.dosageForm, product.strength,
      product.supplierName, product.barcode ?? "", product.stockCode ?? "",
    ].join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });

  return (
    <div className="panel">
      <div className="panel-heading checkout-products-heading">
        <div><h2>Products</h2><p>Select items to add to this sale.</p></div>
        {products.length > 0 && (
          <input
            className="checkout-product-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by product, ingredient, category, or supplier"
            aria-label="Search checkout products"
          />
        )}
      </div>
      {products.length === 0 ? (
        <div className="empty">No products yet. Add your first item in Products & stock.</div>
      ) : matchingProducts.length ? (
        <div className="product-grid">
          {matchingProducts.map((product) => (
            <button
              className="product-tile"
              key={product.id}
              disabled={isCheckingOut || product.saleableCount === 0}
              onClick={() => onAddProduct(product)}
            >
              <span className="product-initial">{product.name.slice(0, 1).toUpperCase()}</span>
              <strong>{product.name}</strong>
              <small>
                {[product.brand, product.strength, product.dosageForm || product.activeIngredient]
                  .filter(Boolean).join(" · ") || product.category}
                {product.prescriptionRequired ? " · Prescription" : ""}
              </small>
              <span>{money(product.priceCents)}</span>
              <small>
                {product.saleableCount} unexpired · {product.stockCount} total · sold by{" "}
                {product.saleUnit.replace("_", " ")}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">No products match your search.</div>
      )}
    </div>
  );
}

export default CheckoutProducts;
