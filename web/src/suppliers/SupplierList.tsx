import type { SupplierController } from "./useSupplierManagement";

function SupplierList({ controller: c }: { controller: SupplierController }) {
  const countText = c.search.trim()
    ? `${c.filteredSuppliers.length} of ${c.suppliers.length} suppliers found.`
    : `${c.suppliers.length} suppliers recorded.`;
  return (
    <div className="panel">
      <div className="panel-heading">
        <div><h2>Saved suppliers</h2><p>{countText}</p></div>
      </div>
      <label className="supplier-search">
        Search suppliers
        <input type="search" value={c.search} onChange={(event) => c.setSearch(event.target.value)}
          placeholder="Search by name, enrollment, merchant ID, or contact details"
          aria-label="Search suppliers by name, enrollment status, merchant ID, or contact details" />
      </label>
      {c.suppliers.length === 0 ? (
        <div className="empty">Suppliers you add will appear here.</div>
      ) : c.filteredSuppliers.length === 0 ? (
        <div className="empty">No suppliers match “{c.search}”.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Supplier</th><th>PayAssure status</th><th>Merchant ID</th>
              <th>Contact</th><th>Phone</th><th>Email</th><th>Address</th>
            </tr></thead>
            <tbody>{c.filteredSuppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td><strong>{supplier.name}</strong></td>
                <td>{supplier.payassureEnrolled ? "Enrolled" : "Not enrolled"}</td>
                <td>{supplier.merchantId ?? "—"}</td>
                <td>{supplier.contactName || "—"}</td>
                <td>{supplier.phone || "—"}</td>
                <td>{supplier.email || "—"}</td>
                <td>{supplier.address || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default SupplierList;
