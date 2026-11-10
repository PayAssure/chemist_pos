import type { SupplierController } from "./useSupplierManagement";

function SupplierDirectoryPanel({ controller: c }: { controller: SupplierController }) {
  return (
    <div className="supplier-directory" aria-live="polite">
      {c.selectedSupplier ? (
        <SelectedSupplier supplier={c.selectedSupplier} />
      ) : c.directoryLoading ? (
        <p className="helper-text">Loading suppliers from PayAssure…</p>
      ) : c.directoryError ? (
        <div className="alert alert-error supplier-directory-error" role="alert">
          {c.directoryError}
          <button className="text-button" type="button"
            onClick={() => c.setDirectoryReload((current) => current + 1)}>Retry</button>
        </div>
      ) : c.supplierName.trim() ? (
        c.matchingDirectorySuppliers.length
          ? <DirectoryResults controller={c} />
          : <p className="helper-text">No PayAssure suppliers match “{c.supplierName}”.</p>
      ) : (
        <p className="helper-text">Search the PayAssure supplier directory and select a result.</p>
      )}
      {c.selectionError && (
        <p className="helper-text supplier-selection-error" role="alert">{c.selectionError}</p>
      )}
    </div>
  );
}

function SelectedSupplier({ supplier }: {
  supplier: NonNullable<SupplierController["selectedSupplier"]>;
}) {
  return (
    <div className="supplier-selected-details">
      <p className="helper-text">Selected PayAssure supplier · Merchant ID: {supplier.merchantId}</p>
      <dl>
        <div><dt>Contact</dt><dd>{supplier.contactName || "Not provided"}</dd></div>
        <div><dt>Phone</dt><dd>{supplier.phone || "Not provided"}</dd></div>
        <div><dt>Email</dt><dd>{supplier.email || "Not provided"}</dd></div>
        <div><dt>Address</dt><dd>{supplier.address || "Not provided"}</dd></div>
      </dl>
    </div>
  );
}

function DirectoryResults({ controller: c }: { controller: SupplierController }) {
  return (
    <div className="supplier-directory-results" id="payassure-supplier-results"
      role="group" aria-label="PayAssure supplier search results">
      {c.matchingDirectorySuppliers.map((supplier) => (
        <button className="supplier-directory-option" key={supplier.merchantId}
          type="button" onClick={() => c.chooseSupplier(supplier)}>
          <strong>{supplier.name}</strong>
          <span>Merchant ID: {supplier.merchantId}</span>
          <span>{[supplier.email, supplier.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
        </button>
      ))}
    </div>
  );
}

export default SupplierDirectoryPanel;
