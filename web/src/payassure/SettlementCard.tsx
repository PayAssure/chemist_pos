import type { RetailerProfileData } from "../types";
import { display } from "./payassureUtils";

function SettlementCard({
  profile, onEdit,
}: { profile: RetailerProfileData; onEdit: () => void }) {
  const payment = profile.payment;
  return (
    <article className="panel retailer-card">
      <div className="retailer-card-heading">
        <div><h2>Settlement destination</h2><p>Bank or M-Pesa payout details</p></div>
        <button className="button button-quiet" onClick={onEdit}>Edit</button>
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
      ) : <p className="retailer-empty">No payout destination was provided.</p>}
    </article>
  );
}

export default SettlementCard;
