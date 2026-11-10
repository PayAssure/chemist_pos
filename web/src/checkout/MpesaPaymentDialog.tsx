type MpesaPaymentDialogProps = {
  phone: string;
  isCheckingOut: boolean;
  progressLabel: string;
  onPhoneChange: (value: string) => void;
  onClose: () => void;
  onCheckout: () => Promise<void>;
};

function MpesaPaymentDialog({
  phone, isCheckingOut, progressLabel, onPhoneChange, onClose, onCheckout,
}: MpesaPaymentDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (!isCheckingOut && event.target === event.currentTarget) onClose();
    }}>
      <section className="panel form-panel checkout-mpesa-modal" role="dialog" aria-modal="true"
        aria-labelledby="mpesa-modal-title">
        <div className="modal-heading">
          <div>
            <h2 id="mpesa-modal-title">M-Pesa payment</h2>
            <p>Enter the customer’s phone number. The sale is saved only after PayAssure accepts the payment.</p>
          </div>
          <button className="modal-close" type="button" aria-label="Close dialog"
            disabled={isCheckingOut} onClick={onClose}>×</button>
        </div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          await onCheckout();
        }}>
          <label className="prescription-field">
            Customer phone number
            <input type="tel" value={phone} disabled={isCheckingOut}
              onChange={(event) => onPhoneChange(event.target.value)}
              required maxLength={30} placeholder="07XX XXX XXX or 2547XX XXX XXX" autoFocus />
          </label>
          <div className="modal-actions">
            <button className="button button-secondary" type="button" disabled={isCheckingOut}
              onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit"
              disabled={isCheckingOut} aria-busy={isCheckingOut}>
              {isCheckingOut
                ? <><span className="checkout-spinner" aria-hidden="true" />{progressLabel}</>
                : "Initiate M-Pesa payment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default MpesaPaymentDialog;
