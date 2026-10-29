import { useEffect, useState, type FormEvent } from "react";

const supportEmail = "kimaniwilfred95@gmail.com";
const supportPhone = "0791614036";

function ContactSupport() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!isModalOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsModalOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isModalOpen]);

  function submitSupportRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`POS support request: ${form.get("subject")}`);
    const body = encodeURIComponent(
      `Name: ${form.get("name")}\nReply email: ${form.get("replyEmail")}\n\n${form.get("message")}`,
    );
    window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
    setIsModalOpen(false);
  }

  return (
    <>
      <section className="support-page">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Contact support</h2>
              <p>Get in touch with us for help with your POS.</p>
            </div>
          </div>
          <div className="support-contact-grid">
            <article className="support-contact-card">
              <span className="eyebrow">CALL US</span>
              <a href={`tel:${supportPhone}`}>{supportPhone}</a>
              <p>Call us if you need assistance.</p>
            </article>
            <article className="support-contact-card">
              <span className="eyebrow">EMAIL US</span>
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              <p>Send an email directly to our support team.</p>
            </article>
          </div>
          <div className="support-request">
            <div>
              <h3>Need help with something?</h3>
              <p>Send us a support request with a few details and we’ll follow up by email.</p>
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setIsModalOpen(true)}
            >
              Contact support
            </button>
          </div>
        </div>

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
              <p>Use the system only for your authorized business operations and keep your sign-in credentials private. You are responsible for activity performed through your account.</p>
            </li>
            <li>
              <h3>Inventory and transaction records</h3>
              <p>Keep product, batch, expiry, pricing, and stock information accurate. Review transactions and stock changes regularly; the system records information based on the data entered by your staff.</p>
            </li>
            <li>
              <h3>Payments and availability</h3>
              <p>Payment processing depends on the configured services and may not always be available. Check the payment status shown in the POS before treating a transaction as complete.</p>
            </li>
            <li>
              <h3>Support and updates</h3>
              <p>Contact support at <a href={`mailto:${supportEmail}`}>{supportEmail}</a> or <a href={`tel:${supportPhone}`}>{supportPhone}</a>. Features and these draft terms may be updated as the service changes.</p>
            </li>
          </ol>
        </section>
      </section>

      {isModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsModalOpen(false);
          }}
        >
          <section
            className="panel form-panel support-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
          >
            <div className="modal-heading">
              <div>
                <h2 id="support-modal-title">Send a support request</h2>
                <p>Your email app will open with your message addressed to support.</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close dialog"
                onClick={() => setIsModalOpen(false)}
              >
                ×
              </button>
            </div>
            <form className="form-panel" onSubmit={submitSupportRequest}>
              <label>
                Your name
                <input name="name" required maxLength={120} autoFocus />
              </label>
              <label>
                Your email
                <input name="replyEmail" type="email" required maxLength={254} />
              </label>
              <label>
                Subject
                <input name="subject" required maxLength={120} />
              </label>
              <label>
                How can we help?
                <textarea name="message" required maxLength={3000} rows={5} />
              </label>
              <div className="modal-actions">
                <button className="button button-quiet" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit">Continue to email</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export default ContactSupport;
