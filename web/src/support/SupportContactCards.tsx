import { supportEmail, supportPhone } from "./supportConstants";

function SupportContactCards() {
  return (
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
  );
}

export default SupportContactCards;
