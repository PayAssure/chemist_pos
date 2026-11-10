import type { FormEvent } from "react";

type SupportRequestDialogProps = {
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function SupportRequestDialog({ onClose, onSubmit }: SupportRequestDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="panel form-panel support-modal" role="dialog" aria-modal="true"
        aria-labelledby="support-modal-title">
        <div className="modal-heading">
          <div>
            <h2 id="support-modal-title">Send a support request</h2>
            <p>Your email app will open with your message addressed to support.</p>
          </div>
          <button className="modal-close" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        <form className="form-panel" onSubmit={onSubmit}>
          <label>Your name<input name="name" required maxLength={120} autoFocus /></label>
          <label>Your email<input name="replyEmail" type="email" required maxLength={254} /></label>
          <label>Subject<input name="subject" required maxLength={120} /></label>
          <label>How can we help?<textarea name="message" required maxLength={3000} rows={5} /></label>
          <div className="modal-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit">Continue to email</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default SupportRequestDialog;
