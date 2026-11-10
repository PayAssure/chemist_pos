import { useEffect, useState, type FormEvent } from "react";
import { supportEmail } from "./supportConstants";
import SupportContactCards from "./SupportContactCards";
import SupportRequestDialog from "./SupportRequestDialog";
import TermsSection from "./TermsSection";

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
            <div><h2>Contact support</h2><p>Get in touch with us for help with your POS.</p></div>
          </div>
          <SupportContactCards />
          <div className="support-request">
            <div>
              <h3>Need help with something?</h3>
              <p>Send us a support request with a few details and we’ll follow up by email.</p>
            </div>
            <button className="button button-primary" type="button" onClick={() => setIsModalOpen(true)}>
              Contact support
            </button>
          </div>
        </div>
        <TermsSection />
      </section>
      {isModalOpen && (
        <SupportRequestDialog
          onClose={() => setIsModalOpen(false)}
          onSubmit={submitSupportRequest}
        />
      )}
    </>
  );
}

export default ContactSupport;
