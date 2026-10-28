import { useEffect, useState, type FormEvent } from "react";
import InventoryForms from "./InventoryForms";
import InventoryTable from "./InventoryTable";
import type { Batch, Product, Supplier } from "../types";
import { navigate } from "../lib/navigation";

function inventoryRoute(pathname: string) {
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

type InventoryProps = {
  products: Product[];
  batches: Batch[];
  suppliers: Supplier[];
  onSaveProduct: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onUpdateProduct: (event: FormEvent<HTMLFormElement>, productId: number) => Promise<boolean>;
  onUpdateBuyingPrice: (productId: number, buyingPriceCents: number) => Promise<boolean>;
  onUpdateBatchExpiry: (batchId: number, expiryDate: string) => Promise<boolean>;
  onUpdateStock: (batch: Batch, change: number) => void;
};

function Inventory(props: InventoryProps) {
  const [route, setRoute] = useState(() => inventoryRoute(window.location.pathname));
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<
    "expiry-asc" | "expiry-desc" | "stock-asc" | "stock-desc"
  >("expiry-asc");
  const selectedProduct = props.products.find((product) => product.id === route.productId) ?? null;
  const selectedBatch = props.batches.find((batch) => batch.id === route.batchId) ?? null;

  useEffect(() => {
    function syncRoute() {
      setRoute(inventoryRoute(window.location.pathname));
    }
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  return (
    <section className="management">
      <div className="panel">
        <div className="inventory-toolbar-controls">
          <label className="inventory-search">
            Search products and stock
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search medicine, supplier, batch, ingredient, or stock"
              aria-label="Search products and stock"
            />
          </label>
          <label className="inventory-sort">
            Order by
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
            >
              <option value="expiry-asc">Expiry date: earliest first</option>
              <option value="expiry-desc">Expiry date: latest first</option>
              <option value="stock-asc">Stock quantity: lowest first</option>
              <option value="stock-desc">Stock quantity: highest first</option>
            </select>
          </label>
          <div className="inventory-actions">
            <button
              className="button button-primary"
              disabled={!props.suppliers.length}
              onClick={() => navigate("/product/add")}
            >
              Add product
            </button>
          </div>
        </div>
        <InventoryTable
          products={props.products}
          batches={props.batches}
          search={search}
          sortOrder={sortOrder}
          onUpdateStock={props.onUpdateStock}
          onSelectProduct={(product, batch) => {
            navigate(batch
              ? `/product/${product.id}/batch/${batch.id}`
              : `/product/${product.id}`);
          }}
        />
      </div>
      <InventoryForms
        suppliers={props.suppliers}
        selectedProduct={selectedProduct}
        selectedBatch={selectedBatch}
        onSaveProduct={props.onSaveProduct}
        onUpdateProduct={props.onUpdateProduct}
        onUpdateBuyingPrice={props.onUpdateBuyingPrice}
        onUpdateBatchExpiry={props.onUpdateBatchExpiry}
        modal={route.modal}
        onClose={() => navigate("/product")}
      />
    </section>
  );
}

export default Inventory;
