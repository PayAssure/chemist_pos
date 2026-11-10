import { supportEmail, supportPhone } from "./supportConstants";

function TermsSection() {
  return (
    <section className="panel terms-panel" aria-labelledby="terms-title">
      <div className="panel-heading">
        <div>
          <h2 id="terms-title">Terms &amp; Conditions</h2>
          <p className="terms-draft-label">Draft — review and approve before relying on these terms.</p>
        </div>
      </div>
      <ol className="terms-list">
        <li>
          <h3>Using the POS</h3>
          <p>
            Use the system only for your authorized business operations and keep your sign-in
            credentials private. You are responsible for activity performed through your account.
          </p>
        </li>
        <li>
          <h3>Inventory and transaction records</h3>
          <p>
            Keep product, batch, expiry, pricing, and stock information accurate. Review
            transactions and stock changes regularly; the system records information based on the
            data entered by your staff.
          </p>
        </li>
        <li>
          <h3>Payments and availability</h3>
          <p>
            Payment processing depends on the configured services and may not always be available.
            Check the payment status shown in the POS before treating a transaction as complete.
          </p>
        </li>
        <li>
          <h3>Support and updates</h3>
          <p>
            Contact support at <a href={`mailto:${supportEmail}`}>{supportEmail}</a> or{" "}
            <a href={`tel:${supportPhone}`}>{supportPhone}</a>. Features and these draft terms may
            be updated as the service changes.
          </p>
        </li>
      </ol>
    </section>
  );
}

export default TermsSection;
