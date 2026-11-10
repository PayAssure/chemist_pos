import type { Batch, Product } from "../types";
import { getInventoryRows, type InventorySortOrder } from "./inventoryRows";
import { InventoryProductRow } from "./InventoryProductRow";

type InventoryTableProps = {
  products: Product[];
  batches: Batch[];
  search: string;
  sortOrder: InventorySortOrder;
  onSelectProduct: (product: Product, batch: Batch | null) => void;
};

function InventoryTable({ products, batches, search, sortOrder, onSelectProduct }: InventoryTableProps) {
  const rows = getInventoryRows(products, batches, search, sortOrder);
  const query = search.trim();
  if (!products.length || !rows.length) {
    return products.length ? (
      <div className="empty">{query ? "No inventory items match your search." : "Your inventory is empty."}</div>
    ) : null;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Medicine details</th><th>Supplier</th><th>Retail / wholesale</th>
            <th>Batch / expiry</th><th>Stock / reorder</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ product, batch }) => (
            <InventoryProductRow
              key={batch?.id ?? product.id}
              product={product}
              batch={batch}
              onSelect={onSelectProduct}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default InventoryTable;
