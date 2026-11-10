import { currencyAmount } from "../lib/money";
import type { RetailerFloatBalance, RetailerFloatData } from "../types";

type Props = {
  data: RetailerFloatData | null;
  balance: RetailerFloatBalance | null;
  loading: boolean;
  error: string;
  checkedAt: string;
  canDeposit: boolean;
  checking: boolean;
  onDeposit: () => void;
  onCheck: () => void;
};

export default function FloatSummary(props: Props) {
  const { data, balance, loading, error, checkedAt, canDeposit, checking, onDeposit, onCheck } = props;
  const currency = balance?.currency ?? data?.currency ?? "KES";
  return (
    <section className="summary-card float-summary-card" aria-label="PayAssure float balance">
      <div className="float-summary-details">
        <span>Available PayAssure float</span>
        <strong>{balance
          ? currencyAmount(balance.availableBalance, currency)
          : data ? currencyAmount(data.availableBalance, currency) : "—"}</strong>
        <small>{data
          ? `Daily float: ${currencyAmount(data.dailyFloat, currency)}`
          : loading ? "Daily float: loading…" : "Daily float: unavailable"}</small>
        {error && <small className="expiry-warning" role="status">{error}</small>}
      </div>
      <div className="float-summary-action-group">
        <div className="float-summary-actions">
          <button className="button button-secondary" type="button" onClick={onDeposit} disabled={!canDeposit}>
            Float deposit
          </button>
          <button className="button button-quiet" type="button" onClick={onCheck} disabled={loading || checking}>
            {checking ? "Checking…" : "Check balance"}
          </button>
        </div>
        <small className="float-balance-checked">
          Balance checked: {checkedAt ? new Date(checkedAt).toLocaleTimeString() : "Not checked yet"}
        </small>
      </div>
    </section>
  );
}
