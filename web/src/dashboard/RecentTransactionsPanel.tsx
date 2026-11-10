import { money } from "../lib/money";
import type { DashboardData, DashboardPeriod } from "../types";

type Transaction = DashboardData["transactions"][number];
type RecentTransactionsPanelProps = {
  transactions: Transaction[];
  period: DashboardPeriod;
  periodLabels: Record<DashboardPeriod, string>;
};

function RecentTransactionsPanel({
  transactions, period, periodLabels,
}: RecentTransactionsPanelProps) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>Recent transactions &amp; settlements</h2>
          <p>Completed sales, checkout failures and PayAssure settlement status.</p>
        </div>
      </div>
      {transactions.length ? (
        <div className="dashboard-transactions">
          {transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
        </div>
      ) : (
        <div className="empty">
          No checkout transactions recorded {periodLabels[period].toLowerCase()}.
        </div>
      )}
    </article>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const statusLabel = transaction.status === "completed" ? "Sale completed"
    : transaction.status === "pending" ? "Awaiting PayAssure collection" : "Checkout failed";
  const methodLabel = transaction.paymentMethod === "cash" ? "Cash"
    : transaction.paymentMethod === "credit" ? "Credit" : "M-Pesa";
  return (
    <div className="dashboard-transaction">
      <div>
        <strong>{statusLabel}</strong>
        <span>{new Date(transaction.createdAt).toLocaleTimeString()} · {methodLabel}</span>
        {transaction.payerName && (
          <small>Payer: {transaction.payerName} · {transaction.payerPhone}</small>
        )}
        {transaction.failureReason && <small className="expiry-warning">{transaction.failureReason}</small>}
        {transaction.settlementStatus && <SettlementDetails transaction={transaction} />}
      </div>
      <div className="dashboard-transaction-result">
        <strong>{transaction.totalCents === null ? "—" : money(transaction.totalCents)}</strong>
        <span className={`badge ${transaction.status === "failed" ? "badge-failed" : ""}`}>
          {transaction.status}
        </span>
      </div>
    </div>
  );
}

function SettlementDetails({ transaction }: { transaction: Transaction }) {
  return (
    <>
      <small className={transaction.settlementStatus === "failed" ? "expiry-warning" : ""}>
        PayAssure settlement: {transaction.settlementStatus}
        {transaction.settlementAttemptCount !== null
          ? ` · attempts ${transaction.settlementAttemptCount}` : ""}
        {transaction.nextRetryAt && transaction.settlementStatus === "failed"
          ? ` · next retry ${new Date(transaction.nextRetryAt).toLocaleString()}` : ""}
      </small>
      {transaction.settlementError && (
        <small className="expiry-warning">{transaction.settlementError}</small>
      )}
    </>
  );
}

export default RecentTransactionsPanel;
