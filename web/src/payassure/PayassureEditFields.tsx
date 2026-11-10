import type { RetailerPaymentData } from "../types";
import { profileFields } from "./payassureUtils";
import type { PayassureEditor } from "./usePayassureEditor";

function PayassureEditFields({ editor }: { editor: PayassureEditor }) {
  return editor.editing === "profile"
    ? <ProfileFields editor={editor} />
    : <PaymentFields editor={editor} />;
}

function ProfileFields({ editor }: { editor: PayassureEditor }) {
  return (
    <div className="retailer-edit-fields">
      {profileFields.map(({ key, label }) => (
        <label key={key}>
          {label}
          <input type={key === "email" ? "email" : "text"} value={editor.draft[key]}
            onChange={(event) => editor.updateProfileField(key, event.target.value)}
            aria-label={label} />
        </label>
      ))}
    </div>
  );
}

function PaymentFields({ editor }: { editor: PayassureEditor }) {
  return (
    <div className="retailer-edit-fields">
      <label>
        Payout type
        <select value={editor.draft.payment?.type ?? "MPESA"}
          onChange={(event) => editor.setPaymentType(event.target.value as RetailerPaymentData["type"])}>
          <option value="MPESA">M-Pesa</option><option value="BANK">Bank</option>
        </select>
      </label>
      <label>Account name
        <input value={editor.draft.payment?.accountName ?? ""}
          onChange={(event) => editor.updatePaymentField("accountName", event.target.value)} />
      </label>
      {editor.draft.payment?.type === "MPESA" ? (
        <label>Phone number
          <input value={editor.draft.payment.phoneNumber}
            onChange={(event) => editor.updatePaymentField("phoneNumber", event.target.value)} />
        </label>
      ) : <BankFields editor={editor} />}
      <label>Provider
        <input value={editor.draft.payment?.provider ?? ""}
          onChange={(event) => editor.updatePaymentField("provider", event.target.value)} />
      </label>
    </div>
  );
}

function BankFields({ editor }: { editor: PayassureEditor }) {
  return (
    <>
      <label>Bank code
        <input value={editor.draft.payment?.bankCode ?? ""}
          onChange={(event) => editor.updatePaymentField("bankCode", event.target.value)} />
      </label>
      <label>Account number
        <input value={editor.draft.payment?.accountNumber ?? ""}
          onChange={(event) => editor.updatePaymentField("accountNumber", event.target.value)} />
      </label>
      <label>Shortcode
        <input value={editor.draft.payment?.shortcode ?? ""}
          onChange={(event) => editor.updatePaymentField("shortcode", event.target.value)} />
      </label>
    </>
  );
}

export default PayassureEditFields;
