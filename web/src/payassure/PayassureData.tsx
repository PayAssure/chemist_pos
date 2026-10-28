import { useState } from "react";
import type {
  RetailerPaymentData,
  RetailerProfileData,
} from "../types";

type PayassureDataProps = {
  profile: RetailerProfileData;
  onChange: (profile: RetailerProfileData) => void;
  onSaved: () => void;
};

type ProfileField =
  | "businessName"
  | "registrationNumber"
  | "kraPin"
  | "businessType"
  | "industry"
  | "physicalAddress"
  | "contactName"
  | "email"
  | "phoneNumber"
  | "settlementMethod"
  | "settlementAccount"
  | "posSystem"
  | "settlementPreference";

type CardSection = "business" | "contact" | "operations" | "payment";
type FieldDefinition = { key: ProfileField; label: string };

const businessFields: FieldDefinition[] = [
  { key: "businessName", label: "Business name" },
  { key: "registrationNumber", label: "Registration number" },
  { key: "kraPin", label: "KRA PIN" },
  { key: "businessType", label: "Business type" },
  { key: "industry", label: "Industry" },
  { key: "physicalAddress", label: "Physical address" },
];

const contactFields: FieldDefinition[] = [
  { key: "contactName", label: "Contact name" },
  { key: "email", label: "Email" },
  { key: "phoneNumber", label: "Phone number" },
];

const operationsFields: FieldDefinition[] = [
  { key: "settlementMethod", label: "Settlement method" },
  { key: "settlementAccount", label: "Settlement account" },
  { key: "posSystem", label: "POS system" },
  { key: "settlementPreference", label: "Settlement preference" },
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

function PayassureData({ profile, onChange, onSaved }: PayassureDataProps) {
  const [editing, setEditing] = useState<CardSection | null>(null);
  const [draft, setDraft] = useState(profile);

  function beginEdit(section: CardSection) {
    setDraft(profile);
    if (section === "payment" && !profile.payment) {
      setDraft({ ...profile, payment: emptyPayment() });
    }
    setEditing(section);
  }

  function saveEdit() {
    onChange(draft);
    setEditing(null);
    onSaved();
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
    section: Exclude<CardSection, "payment">,
    title: string,
    description: string,
    fields: FieldDefinition[],
  ) {
    const isEditing = editing === section;
    return (
      <article className="panel retailer-card">
        <div className="retailer-card-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {isEditing ? (
            <div className="retailer-card-actions">
              <button className="button button-quiet" onClick={cancelEdit}>Cancel</button>
              <button className="button button-primary" onClick={saveEdit}>Save in session</button>
            </div>
          ) : (
            <button className="button button-quiet" onClick={() => beginEdit(section)}>Edit</button>
          )}
        </div>
        <dl className="retailer-fields">
          {fields.map(({ key, label }) => (
            <div className="retailer-field" key={key}>
              <dt>{label}</dt>
              <dd>
                {isEditing ? (
                  <input
                    type={key === "email" ? "email" : "text"}
                    value={draft[key]}
                    onChange={(event) => updateProfileField(key, event.target.value)}
                    aria-label={label}
                  />
                ) : display(profile[key])}
              </dd>
            </div>
          ))}
        </dl>
      </article>
    );
  }

  const paymentIsEditing = editing === "payment";
  const payment = paymentIsEditing ? draft.payment : profile.payment;

  return (
    <section className="management">
      <div className="alert alert-info" role="note">
        No PayAssure API is connected. Fields shown here follow its retailer response
        format; edits are only saved for this browser session.
      </div>

      <div className="retailer-cards">
        {renderProfileCard(
          "business",
          "Business details",
          "Retailer identity and registration",
          businessFields,
        )}
        {renderProfileCard(
          "contact",
          "Contact details",
          "Primary retailer contact information",
          contactFields,
        )}
        {renderProfileCard(
          "operations",
          "Retail operations",
          "Settlement preferences and POS details",
          operationsFields,
        )}

        <article className="panel retailer-card">
          <div className="retailer-card-heading">
            <div>
              <h2>Settlement destination</h2>
              <p>Bank or M-Pesa payout details</p>
            </div>
            {paymentIsEditing ? (
              <div className="retailer-card-actions">
                <button className="button button-quiet" onClick={cancelEdit}>Cancel</button>
                <button className="button button-primary" onClick={saveEdit}>Save in session</button>
              </div>
            ) : (
              <button className="button button-quiet" onClick={() => beginEdit("payment")}>Edit</button>
            )}
          </div>
          {paymentIsEditing ? (
            <div className="retailer-fields retailer-fields-edit">
              <label>
                Payout type
                <select
                  value={payment?.type ?? "MPESA"}
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
                  value={payment?.accountName ?? ""}
                  onChange={(event) => updatePaymentField("accountName", event.target.value)}
                />
              </label>
              {payment?.type === "MPESA" ? (
                <label>
                  Phone number
                  <input
                    value={payment.phoneNumber}
                    onChange={(event) => updatePaymentField("phoneNumber", event.target.value)}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Bank code
                    <input
                      value={payment?.bankCode ?? ""}
                      onChange={(event) => updatePaymentField("bankCode", event.target.value)}
                    />
                  </label>
                  <label>
                    Account number
                    <input
                      value={payment?.accountNumber ?? ""}
                      onChange={(event) => updatePaymentField("accountNumber", event.target.value)}
                    />
                  </label>
                  <label>
                    Shortcode
                    <input
                      value={payment?.shortcode ?? ""}
                      onChange={(event) => updatePaymentField("shortcode", event.target.value)}
                    />
                  </label>
                </>
              )}
              <label>
                Provider
                <input
                  value={payment?.provider ?? ""}
                  onChange={(event) => updatePaymentField("provider", event.target.value)}
                />
              </label>
            </div>
          ) : payment ? (
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

        <article className="panel retailer-card">
          <div className="retailer-card-heading">
            <div>
              <h2>PayAssure record</h2>
              <p>Identifiers and verification state managed by PayAssure</p>
            </div>
          </div>
          <dl className="retailer-fields">
            <div className="retailer-field"><dt>Participant ID</dt><dd>{display(profile.id)}</dd></div>
            <div className="retailer-field"><dt>Participant type</dt><dd>{display(profile.participantType)}</dd></div>
            <div className="retailer-field"><dt>Onboarding status</dt><dd>{display(profile.status)}</dd></div>
            <div className="retailer-field"><dt>Created at</dt><dd>{display(profile.createdAt)}</dd></div>
            <div className="retailer-field"><dt>Updated at</dt><dd>{display(profile.updatedAt)}</dd></div>
            {profile.integration ? (
              <>
                <div className="retailer-field"><dt>Merchant ID</dt><dd>{display(profile.integration.merchantId)}</dd></div>
                <div className="retailer-field"><dt>Environment</dt><dd>{display(profile.integration.environment)}</dd></div>
                <div className="retailer-field"><dt>Integration active</dt><dd>{display(profile.integration.isActive)}</dd></div>
                <div className="retailer-field"><dt>Integration created</dt><dd>{display(profile.integration.createdAt)}</dd></div>
              </>
            ) : (
              <div className="retailer-field"><dt>Integration</dt><dd>Not provided</dd></div>
            )}
          </dl>
        </article>
      </div>
    </section>
  );
}

export default PayassureData;
