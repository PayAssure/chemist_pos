import type { SupplierController } from "./useSupplierManagement";
import SupplierContactFields from "./SupplierContactFields";
import SupplierDirectoryPanel from "./SupplierDirectoryPanel";
import SupplierIdentityFields from "./SupplierIdentityFields";

function SupplierEntryForm({ controller }: { controller: SupplierController }) {
  return (
    <form className="panel form-panel" onSubmit={(event) => void controller.submitSupplier(event)}>
      <div className="panel-heading">
        <div>
          <h2>Record supplier details</h2>
          <p>Add the supplier and choose whether they are enrolled in PayAssure.</p>
        </div>
      </div>
      <SupplierIdentityFields controller={controller} />
      <input type="hidden" name="payassureEnrolled" value={String(controller.payassureEnrolled)} />
      {controller.payassureEnrolled
        ? <SupplierDirectoryPanel controller={controller} />
        : <SupplierContactFields />}
      <button className="button button-primary" type="submit">Save supplier</button>
    </form>
  );
}

export default SupplierEntryForm;
