import type { useFloatDeposit } from "./useFloatDeposit";

type Props = { deposit: ReturnType<typeof useFloatDeposit> };

export default function FloatDepositDialog({ deposit }: Props) {
  if (!deposit.open) return null;
  const busy = deposit.loading || deposit.awaitingWebhook;
  const hasPendingDeposit = deposit.pendingDeposit !== null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy && !hasPendingDeposit) deposit.close();
    }}>
      <section
        className={`panel form-panel float-deposit-modal${deposit.awaitingWebhook ? " float-deposit-modal-waiting" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="float-deposit-title"
      >
        <div className="modal-heading">
          <div>
            <h2 id="float-deposit-title">Deposit retailer float</h2>
            {!deposit.awaitingWebhook && (
              <p>Request an M-Pesa STK prompt for this retailer’s PayAssure float.</p>
            )}
          </div>
          <button className="modal-close" type="button" aria-label="Close dialog" onClick={deposit.close} disabled={busy || hasPendingDeposit}>×</button>
        </div>
        {deposit.awaitingWebhook ? (
          <div
            className="float-deposit-waiting"
            role="status"
          >
            <div className="float-deposit-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>Awaiting PayAssure response…</p>
          </div>
        ) : (
          <>
            <p className="helper-text">
              {hasPendingDeposit
                ? "The deposit request was accepted. This screen will update the float balance after PayAssure confirms it by webhook."
                : "A submitted request is not a successful deposit. Available balance changes only after PayAssure verifies a successful provider callback."}
            </p>
            <form className="form-panel" onSubmit={deposit.submit}>
              <label>Amount (KES)<input type="number" min="1" max="2147483647" step="1" required
                value={deposit.amount} disabled={busy || hasPendingDeposit}
                onChange={(event) => deposit.setAmount(event.target.value)} /></label>
              <label>Payer phone number<input type="tel" autoComplete="tel" maxLength={30} required
                value={deposit.phone} disabled={busy || hasPendingDeposit}
                onChange={(event) => deposit.setPhone(event.target.value)} /></label>
              {deposit.error && <p className="alert alert-error" role="alert">{deposit.error}</p>}
              <div className="modal-actions">
                <button className="button button-quiet" type="button" onClick={deposit.close} disabled={busy || hasPendingDeposit}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={busy}>
                  {deposit.loading
                    ? "Submitting deposit…"
                    : hasPendingDeposit
                      ? "Reconnect to deposit confirmation"
                      : "Request deposit"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
