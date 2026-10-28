import { useMemo, useState, type FormEvent } from "react";
import type { Supplier } from "../types";

type SupplierManagementProps = {
  suppliers: Supplier[];
  onSaveSupplier: (event: FormEvent<HTMLFormElement>) => void;
};

function SupplierManagement({ suppliers, onSaveSupplier }: SupplierManagementProps) {
  const [payassureEnrolled, setPayassureEnrolled] = useState(true);
  const [search, setSearch] = useState("");
  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.payassureEnrolled ? "enrolled" : "not enrolled",
        supplier.merchantId ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [search, suppliers]);

  return (
    <section className="management">
      <form className="panel form-panel" onSubmit={onSaveSupplier}>
        <div className="panel-heading">
          <div>
            <h2>Record supplier details</h2>
            <p>Add the supplier and choose whether they are enrolled in PayAssure.</p>
          </div>
        </div>
        <label>
          Supplier name
          <input name="name" required maxLength={120} placeholder="e.g. Northside Wholesale" />
        </label>
        <label>
          PayAssure enrollment
          <select
            name="payassureEnrolled"
            value={String(payassureEnrolled)}
            onChange={(event) => setPayassureEnrolled(event.target.value === "true")}
          >
            <option value="true">Already enrolled in PayAssure</option>
            <option value="false">Not enrolled in PayAssure</option>
          </select>
        </label>
        {payassureEnrolled ? (
          <label>
            PayAssure merchant ID
            <input name="merchantId" required maxLength={200} placeholder="Merchant ID" />
          </label>
        ) : (
          <p className="helper-text">
            Merchant ID is not needed for suppliers who are not enrolled in PayAssure.
          </p>
        )}
        <button className="button button-primary" type="submit">Save supplier</button>
      </form>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Saved suppliers</h2>
            <p>
              {search.trim()
                ? `${filteredSuppliers.length} of ${suppliers.length} suppliers found.`
                : `${suppliers.length} suppliers recorded.`}
            </p>
          </div>
        </div>
        <label className="supplier-search">
          Search suppliers
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, enrollment, or merchant ID"
            aria-label="Search suppliers by name, enrollment status, or merchant ID"
          />
        </label>
        {suppliers.length === 0 ? (
          <div className="empty">Suppliers you add will appear here.</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="empty">No suppliers match “{search}”.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Supplier</th><th>PayAssure status</th><th>Merchant ID</th></tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td><strong>{supplier.name}</strong></td>
                    <td>{supplier.payassureEnrolled ? "Enrolled" : "Not enrolled"}</td>
                    <td>{supplier.merchantId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default SupplierManagement;
