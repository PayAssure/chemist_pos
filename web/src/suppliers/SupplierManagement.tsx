import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { PayassureDirectorySupplier, Supplier } from "../types";

type SupplierManagementProps = {
  suppliers: Supplier[];
  onSaveSupplier: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
};

function SupplierManagement({ suppliers, onSaveSupplier }: SupplierManagementProps) {
  const [payassureEnrolled, setPayassureEnrolled] = useState(true);
  const [directorySuppliers, setDirectorySuppliers] = useState<PayassureDirectorySupplier[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryReload, setDirectoryReload] = useState(0);
  const [supplierName, setSupplierName] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<PayassureDirectorySupplier | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!payassureEnrolled) {
      setDirectoryLoading(false);
      return;
    }

    let active = true;
    setDirectoryLoading(true);
    setDirectoryError("");
    api<{ suppliers: PayassureDirectorySupplier[] }>("/api/payassure/suppliers")
      .then(({ suppliers: queriedSuppliers }) => {
        if (active) setDirectorySuppliers(queriedSuppliers);
      })
      .catch((reason: unknown) => {
        if (active) {
          setDirectoryError(
            reason instanceof Error ? reason.message : "Could not load PayAssure suppliers",
          );
        }
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [payassureEnrolled, directoryReload]);

  const matchingDirectorySuppliers = useMemo(() => {
    const query = supplierName.trim().toLocaleLowerCase();
    if (!query || selectedSupplier) return [];
    return directorySuppliers
      .filter((supplier) =>
        [supplier.name, supplier.merchantId].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ),
      )
      .slice(0, 8);
  }, [directorySuppliers, selectedSupplier, supplierName]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.payassureEnrolled ? "enrolled" : "not enrolled",
        supplier.merchantId ?? "",
        supplier.contactName,
        supplier.phone,
        supplier.email,
        supplier.address,
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [search, suppliers]);

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    if (payassureEnrolled && !selectedSupplier) {
      event.preventDefault();
      setSelectionError("Choose a supplier from the PayAssure search results.");
      return;
    }

    setSelectionError("");
    const saved = await onSaveSupplier(event);
    if (saved) {
      setSupplierName("");
      setSelectedSupplier(null);
    }
  }

  function chooseSupplier(supplier: PayassureDirectorySupplier) {
    setSelectedSupplier(supplier);
    setSupplierName(supplier.name);
    setSelectionError("");
  }

  return (
    <section className="management">
      <form className="panel form-panel" onSubmit={(event) => void submitSupplier(event)}>
        <div className="panel-heading">
          <div>
            <h2>Record supplier details</h2>
            <p>Add the supplier and choose whether they are enrolled in PayAssure.</p>
          </div>
        </div>
        <div className="supplier-identity-row">
          <label className="supplier-name-field">
            Supplier name
            {payassureEnrolled ? (
              <>
                <input
                  type="search"
                  value={supplierName}
                  onChange={(event) => {
                    setSupplierName(event.target.value);
                    setSelectedSupplier(null);
                    setSelectionError("");
                  }}
                  required
                  maxLength={120}
                  placeholder="Search PayAssure suppliers"
                  autoComplete="off"
                />
                <input type="hidden" name="name" value={selectedSupplier?.name ?? ""} />
                <input type="hidden" name="merchantId" value={selectedSupplier?.merchantId ?? ""} />
                <input type="hidden" name="contactName" value={selectedSupplier?.contactName ?? ""} />
                <input type="hidden" name="phone" value={selectedSupplier?.phone ?? ""} />
                <input type="hidden" name="email" value={selectedSupplier?.email ?? ""} />
                <input type="hidden" name="address" value={selectedSupplier?.address ?? ""} />
              </>
            ) : (
              <input
                name="name"
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                required
                maxLength={120}
                placeholder="e.g. Northside Wholesale"
              />
            )}
          </label>
          <div className="supplier-source-control" role="group" aria-label="Supplier source">
            <span>Supplier source</span>
            <div className="supplier-source-buttons">
              <button
                className={`button ${payassureEnrolled ? "button-primary" : "button-quiet"}`}
                type="button"
                aria-pressed={payassureEnrolled}
                onClick={() => {
                  setPayassureEnrolled(true);
                  setSupplierName("");
                  setSelectedSupplier(null);
                  setSelectionError("");
                }}
              >
                From PayAssure
              </button>
              <button
                className={`button ${!payassureEnrolled ? "button-primary" : "button-quiet"}`}
                type="button"
                aria-pressed={!payassureEnrolled}
                onClick={() => {
                  setPayassureEnrolled(false);
                  setSupplierName("");
                  setSelectedSupplier(null);
                  setSelectionError("");
                }}
              >
                Not from PayAssure
              </button>
            </div>
          </div>
        </div>
        <input type="hidden" name="payassureEnrolled" value={String(payassureEnrolled)} />
        {payassureEnrolled ? (
          <div className="supplier-directory" aria-live="polite">
            {selectedSupplier ? (
              <div className="supplier-selected-details">
                <p className="helper-text">
                  Selected PayAssure supplier · Merchant ID: {selectedSupplier.merchantId}
                </p>
                <dl>
                  <div><dt>Contact</dt><dd>{selectedSupplier.contactName || "Not provided"}</dd></div>
                  <div><dt>Phone</dt><dd>{selectedSupplier.phone || "Not provided"}</dd></div>
                  <div><dt>Email</dt><dd>{selectedSupplier.email || "Not provided"}</dd></div>
                  <div><dt>Address</dt><dd>{selectedSupplier.address || "Not provided"}</dd></div>
                </dl>
              </div>
            ) : directoryLoading ? (
              <p className="helper-text">Loading suppliers from PayAssure…</p>
            ) : directoryError ? (
              <div className="alert alert-error supplier-directory-error" role="alert">
                {directoryError}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setDirectoryReload((current) => current + 1)}
                >
                  Retry
                </button>
              </div>
            ) : supplierName.trim() ? (
              matchingDirectorySuppliers.length ? (
                <div
                  className="supplier-directory-results"
                  id="payassure-supplier-results"
                  role="group"
                  aria-label="PayAssure supplier search results"
                >
                  {matchingDirectorySuppliers.map((supplier) => (
                    <button
                      className="supplier-directory-option"
                      key={supplier.merchantId}
                      type="button"
                      onClick={() => chooseSupplier(supplier)}
                    >
                      <strong>{supplier.name}</strong>
                      <span>Merchant ID: {supplier.merchantId}</span>
                      <span>
                        {[supplier.email, supplier.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="helper-text">No PayAssure suppliers match “{supplierName}”.</p>
              )
            ) : (
              <p className="helper-text">
                Search the PayAssure supplier directory and select a result.
              </p>
            )}
            {selectionError && <p className="helper-text supplier-selection-error" role="alert">{selectionError}</p>}
          </div>
        ) : (
          <>
            <div className="supplier-contact-fields">
              <label>
                Contact name
                <input name="contactName" maxLength={120} placeholder="Supplier contact name" />
              </label>
              <label>
                Phone number
                <input name="phone" type="tel" maxLength={30} placeholder="Supplier phone number" />
              </label>
              <label>
                Email
                <input name="email" type="email" maxLength={254} placeholder="Supplier email address" />
              </label>
              <label>
                Address
                <input name="address" maxLength={300} placeholder="Supplier physical address" />
              </label>
            </div>
            <p className="helper-text">PayAssure merchant details are not needed for this supplier.</p>
          </>
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
            placeholder="Search by name, enrollment, merchant ID, or contact details"
            aria-label="Search suppliers by name, enrollment status, merchant ID, or contact details"
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
                <tr>
                  <th>Supplier</th><th>PayAssure status</th><th>Merchant ID</th>
                  <th>Contact</th><th>Phone</th><th>Email</th><th>Address</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td><strong>{supplier.name}</strong></td>
                    <td>{supplier.payassureEnrolled ? "Enrolled" : "Not enrolled"}</td>
                    <td>{supplier.merchantId ?? "—"}</td>
                    <td>{supplier.contactName || "—"}</td>
                    <td>{supplier.phone || "—"}</td>
                    <td>{supplier.email || "—"}</td>
                    <td>{supplier.address || "—"}</td>
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
