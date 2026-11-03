import { useState, type FormEvent } from "react";
import type {
  PayassureParticipantUpdate,
  RetailerPaymentData,
  RetailerProfileData,
} from "../types";

type PayassureDataProps = {
  profile: RetailerProfileData;
  loading: boolean;
  onSave: (update: PayassureParticipantUpdate) => Promise<RetailerProfileData>;
};

type ProfileField =
  | "businessName"
  | "businessType"
  | "contactName"
  | "email";

type CardSection = "profile" | "payment";
type FieldDefinition = { key: ProfileField; label: string };

const profileFields: FieldDefinition[] = [
  { key: "businessName", label: "Business name" },
  { key: "businessType", label: "Business type" },
  { key: "contactName", label: "Contact name" },
  { key: "email", label: "Email" },
];

const emptyPayment = (): RetailerPaymentData => ({
  type: "MPESA",
  accountName: "",
  phoneNumber: "",
  bankCode: "",
  accountNumber: "",
  shortcode: "",
  provider: "",
  status: "",
  isVerified: false,
});

function display(value: string | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

function displayDateTime(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return display(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PayassureData({ profile, loading, onSave }: PayassureDataProps) {
  const [editing, setEditing] = useState<CardSection | null>(null);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);

  function beginEdit(section: CardSection) {
    setDraft(profile);
    if (section === "payment" && !profile.payment) {
      setDraft({ ...profile, payment: emptyPayment() });
    }
    setEditing(section);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    let update: PayassureParticipantUpdate;
    if (editing === "payment") {
      const payment = draft.payment ?? emptyPayment();
      update = {
        settlementMethod: payment.type,
        settlementAccount: payment.type === "BANK" ? payment.accountNumber : payment.phoneNumber,
        payment: {
          type: payment.type,
          accountName: payment.accountName,
          ...(payment.type === "BANK"
            ? {
                bankCode: payment.bankCode,
                accountNumber: payment.accountNumber,
                shortcode: payment.shortcode,
              }
            : { phoneNumber: payment.phoneNumber }),
          provider: payment.provider,
        },
      };
    } else {
      update = Object.fromEntries(
        profileFields
          .filter(({ key }) => draft[key] !== profile[key])
          .map(({ key }) => [key, draft[key]]),
      ) as PayassureParticipantUpdate;
    }

    if (Object.keys(update).length === 0) {
      setEditing(null);
      return;
    }

    setSaving(true);
    try {
      const updatedProfile = await onSave(update);
      setDraft(updatedProfile);
      setEditing(null);
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setDraft(profile);
    setEditing(null);
  }

  function updateProfileField(key: ProfileField, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePaymentField(
    key: keyof RetailerPaymentData,
    value: string | boolean,
  ) {
    setDraft((current) => {
      const payment = current.payment ?? emptyPayment();
      return { ...current, payment: { ...payment, [key]: value } };
    });
  }

  function renderProfileCard(
    section: "profile",
    title: string,
    description: string,
    fields: FieldDefinition[],
  ) {
    return (
      <article className="panel retailer-card">
        <div className="retailer-card-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="button button-quiet" onClick={() => beginEdit(section)}>Edit</button>
        </div>
        <dl className="retailer-fields">
          {fields.map(({ key, label }) => (
            <div className="retailer-field" key={key}>
              <dt>{label}</dt>
              <dd>{display(profile[key])}</dd>
            </div>
          ))}
        </dl>
      </article>
    );
  }

  const payment = profile.payment;

  return (
    <section className="management">
      <div className="alert alert-info" role="note">
        {loading
          ? "Loading participant data from PayAssure…"
          : profile.id
            ? "Participant data loaded from PayAssure. Saved changes are sent to PayAssure."
            : "No PayAssure participant data is available."}
      </div>

      <div className="retailer-cards">
        {renderProfileCard(
          "profile",
          "Business & contact details",
          "Retailer identity and primary contact information",
          profileFields,
        )}

        <article className="panel retailer-card">
          <div className="retailer-card-heading">
            <div>
              <h2>PayAssure record</h2>
              <p>Participant identity and onboarding state</p>
            </div>
          </div>
          <dl className="retailer-fields">
            <div className="retailer-field"><dt>Participant ID</dt><dd>{display(profile.id)}</dd></div>
            <div className="retailer-field"><dt>Participant type</dt><dd>{display(profile.participantType)}</dd></div>
            <div className="retailer-field"><dt>Onboarding status</dt><dd>{display(profile.status)}</dd></div>
            <div className="retailer-field"><dt>Updated at</dt><dd>{displayDateTime(profile.updatedAt)}</dd></div>
          </dl>
        </article>

        <article className="panel retailer-card">
          <div className="retailer-card-heading">
            <div>
              <h2>Integration</h2>
              <p>PayAssure merchant connection</p>
            </div>
          </div>
          {profile.integration ? (
            <dl className="retailer-fields">
              <div className="retailer-field"><dt>API key</dt><dd>{display(profile.integration.apiKey)}</dd></div>
              <div className="retailer-field"><dt>API secret</dt><dd>{display(profile.integration.apiSecret)}</dd></div>
              <div className="retailer-field"><dt>Merchant ID</dt><dd>{display(profile.integration.merchantId)}</dd></div>
              <div className="retailer-field"><dt>Environment</dt><dd>{display(profile.integration.environment)}</dd></div>
              <div className="retailer-field"><dt>Integration active</dt><dd>{display(profile.integration.isActive)}</dd></div>
              <div className="retailer-field"><dt>Created at</dt><dd>{displayDateTime(profile.integration.createdAt)}</dd></div>
            </dl>
          ) : (
            <p className="retailer-empty">No integration was provided.</p>
          )}
        </article>

        <article className="panel retailer-card">
          <div className="retailer-card-heading">
            <div>
              <h2>Settlement destination</h2>
              <p>Bank or M-Pesa payout details</p>
            </div>
            <button className="button button-quiet" onClick={() => beginEdit("payment")}>Edit</button>
          </div>
          {payment ? (
            <dl className="retailer-fields">
              <div className="retailer-field"><dt>Type</dt><dd>{display(payment.type)}</dd></div>
              <div className="retailer-field"><dt>Account name</dt><dd>{display(payment.accountName)}</dd></div>
              {payment.type === "MPESA" ? (
                <div className="retailer-field"><dt>Phone number</dt><dd>{display(payment.phoneNumber)}</dd></div>
              ) : (
                <>
                  <div className="retailer-field"><dt>Bank code</dt><dd>{display(payment.bankCode)}</dd></div>
                  <div className="retailer-field"><dt>Account number</dt><dd>{display(payment.accountNumber)}</dd></div>
                  <div className="retailer-field"><dt>Shortcode</dt><dd>{display(payment.shortcode)}</dd></div>
                </>
              )}
              <div className="retailer-field"><dt>Provider</dt><dd>{display(payment.provider)}</dd></div>
              <div className="retailer-field"><dt>Verification status</dt><dd>{display(payment.status)}</dd></div>
              <div className="retailer-field"><dt>Verified</dt><dd>{display(payment.isVerified)}</dd></div>
            </dl>
          ) : (
            <p className="retailer-empty">No payout destination was provided.</p>
          )}
        </article>
      </div>

      {editing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) cancelEdit();
          }}
        >
          <section
            className="panel form-panel retailer-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="retailer-edit-title"
          >
            <div className="modal-heading">
              <div>
                <h2 id="retailer-edit-title">
                  {editing === "payment"
                    ? "Edit settlement destination"
                    : "Edit business & contact details"}
                </h2>
                <p>Changes are sent directly to PayAssure.</p>
              </div>
              <button className="modal-close" type="button" aria-label="Close dialog" onClick={cancelEdit} disabled={saving}>
                ×
              </button>
            </div>
            <form className="form-panel" onSubmit={saveEdit}>
              <fieldset className="retailer-edit-fieldset" disabled={saving}>
              {editing === "profile" ? (
                <div className="retailer-edit-fields">
                  {profileFields.map(({ key, label }) => (
                    <label key={key}>
                      {label}
                      <input
                        type={key === "email" ? "email" : "text"}
                        value={draft[key]}
                        onChange={(event) => updateProfileField(key, event.target.value)}
                        aria-label={label}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="retailer-edit-fields">
                  <label>
                    Payout type
                    <select
                      value={draft.payment?.type ?? "MPESA"}
                      onChange={(event) => {
                        const type = event.target.value as RetailerPaymentData["type"];
                        setDraft((current) => ({
                          ...current,
                          payment: { ...emptyPayment(), type },
                        }));
                      }}
                    >
                      <option value="MPESA">M-Pesa</option>
                      <option value="BANK">Bank</option>
                    </select>
                  </label>
                  <label>
                    Account name
                    <input
                      value={draft.payment?.accountName ?? ""}
                      onChange={(event) => updatePaymentField("accountName", event.target.value)}
                    />
                  </label>
                  {draft.payment?.type === "MPESA" ? (
                    <label>
                      Phone number
                      <input
                        value={draft.payment.phoneNumber}
                        onChange={(event) => updatePaymentField("phoneNumber", event.target.value)}
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        Bank code
                        <input
                          value={draft.payment?.bankCode ?? ""}
                          onChange={(event) => updatePaymentField("bankCode", event.target.value)}
                        />
                      </label>
                      <label>
                        Account number
                        <input
                          value={draft.payment?.accountNumber ?? ""}
                          onChange={(event) => updatePaymentField("accountNumber", event.target.value)}
                        />
                      </label>
                      <label>
                        Shortcode
                        <input
                          value={draft.payment?.shortcode ?? ""}
                          onChange={(event) => updatePaymentField("shortcode", event.target.value)}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Provider
                    <input
                      value={draft.payment?.provider ?? ""}
                      onChange={(event) => updatePaymentField("provider", event.target.value)}
                    />
                  </label>
                </div>
              )}
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
      )}
    </section>
  );
}

export default PayassureData;
