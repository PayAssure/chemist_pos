import type { FormEvent } from "react";
import PayassureEditFields from "./PayassureEditFields";
import type { PayassureEditor } from "./usePayassureEditor";

function PayassureEditDialog({ editor }: { editor: PayassureEditor }) {
  const { editing, saving, cancelEdit, saveEdit } = editor;
  if (!editing) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) cancelEdit();
    }}>
      <section className="panel form-panel retailer-edit-modal" role="dialog" aria-modal="true"
        aria-labelledby="retailer-edit-title">
        <div className="modal-heading">
          <div>
            <h2 id="retailer-edit-title">
              {editing === "payment" ? "Edit settlement destination" : "Edit business & contact details"}
            </h2>
            <p>Changes are sent directly to PayAssure.</p>
          </div>
          <button className="modal-close" type="button" aria-label="Close dialog"
            onClick={cancelEdit} disabled={saving}>×</button>
        </div>
        <form className="form-panel" onSubmit={(event: FormEvent<HTMLFormElement>) => void saveEdit(event)}>
          <fieldset className="retailer-edit-fieldset" disabled={saving}>
            <PayassureEditFields editor={editor} />
            <div className="modal-actions">
              <button className="button button-quiet" type="button" onClick={cancelEdit}>Cancel</button>
              <button className="button button-primary" type="submit">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}

export default PayassureEditDialog;
