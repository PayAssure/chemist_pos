import type { SupplierController } from "./useSupplierManagement";

function SupplierIdentityFields({ controller: c }: { controller: SupplierController }) {
  return (
    <div className="supplier-identity-row">
      <label className="supplier-name-field">
        Supplier name
        {c.payassureEnrolled ? (
          <>
            <input type="search" value={c.supplierName}
              onChange={(event) => {
                c.setSupplierName(event.target.value);
                c.setSelectedSupplier(null);
                c.setSelectionError("");
              }}
              required maxLength={120} placeholder="Search PayAssure suppliers" autoComplete="off" />
            <input type="hidden" name="name" value={c.selectedSupplier?.name ?? ""} />
            <input type="hidden" name="merchantId" value={c.selectedSupplier?.merchantId ?? ""} />
            <input type="hidden" name="contactName" value={c.selectedSupplier?.contactName ?? ""} />
            <input type="hidden" name="phone" value={c.selectedSupplier?.phone ?? ""} />
            <input type="hidden" name="email" value={c.selectedSupplier?.email ?? ""} />
            <input type="hidden" name="address" value={c.selectedSupplier?.address ?? ""} />
          </>
        ) : (
          <input name="name" value={c.supplierName}
            onChange={(event) => c.setSupplierName(event.target.value)}
            required maxLength={120} placeholder="e.g. Northside Wholesale" />
        )}
      </label>
      <div className="supplier-source-control" role="group" aria-label="Supplier source">
        <span>Supplier source</span>
        <div className="supplier-source-buttons">
          <button className={`button ${c.payassureEnrolled ? "button-primary" : "button-quiet"}`}
            type="button" aria-pressed={c.payassureEnrolled} onClick={() => selectSource(c, true)}>
            From PayAssure
          </button>
          <button className={`button ${!c.payassureEnrolled ? "button-primary" : "button-quiet"}`}
            type="button" aria-pressed={!c.payassureEnrolled} onClick={() => selectSource(c, false)}>
            Not from PayAssure
          </button>
        </div>
      </div>
    </div>
  );
}

function selectSource(controller: SupplierController, enrolled: boolean) {
  controller.setPayassureEnrolled(enrolled);
  controller.setSupplierName("");
  controller.setSelectedSupplier(null);
  controller.setSelectionError("");
}

export default SupplierIdentityFields;
