import { money } from "../lib/money";
import type { DashboardData, DashboardPeriod } from "../types";

type DashboardProps = {
  data: DashboardData;
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
};

const periodLabels: Record<DashboardPeriod, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  "all-time": "All time",
};

function Dashboard({ data, period, onPeriodChange }: DashboardProps) {
  const dateLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString();
  const rangeLabel = period === "today"
    ? dateLabel(data.date)
    : `${dateLabel(data.startDate)} – ${dateLabel(data.date)}`;
  return (
    <section className="dashboard">
      <div className="panel-heading dashboard-heading">
        <div>
          <h2>{periodLabels[period]} performance</h2>
          <p>{rangeLabel} · completed sales and checkout attempts</p>
        </div>
        <label className="dashboard-period-filter">
          <span>Show</span>
          <select
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as DashboardPeriod)}
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="all-time">All time</option>
          </select>
        </label>
      </div>

      <div className="dashboard-metrics">
        <article className="dashboard-metric">
          <span>Units sold</span>
          <strong>{data.unitsSold}</strong>
        </article>
        <article className="dashboard-metric">
          <span>Sales total</span>
          <strong>{money(data.incomeCents)}</strong>
        </article>
        <article className="dashboard-metric">
          <span>Average sales per day</span>
          <strong>{money(data.averageSalesPerDayCents)}</strong>
        </article>
        <article className="dashboard-metric">
          <span>Supplier buying cost of goods sold</span>
          <strong>{money(data.supplierCostCents)}</strong>
        </article>
        <article className="dashboard-metric">
          <span>Successful transactions</span>
          <strong>{data.successfulTransactions}</strong>
        </article>
        <article className="dashboard-metric dashboard-metric-failed">
          <span>Failed checkout attempts</span>
          <strong>{data.failedTransactions}</strong>
        </article>
      </div>

      {(data.unpricedSaleLines > 0 || data.supplierCosts.some((supplier) => supplier.unpricedSaleLines > 0)) && (
        <div className="alert alert-info" role="note">
          Some products sold in this period do not have a buying price set. Update their buying
          prices to complete supplier cost totals. Historical costs cannot be inferred.
        </div>
      )}
      <p className="dashboard-disclaimer">
        Supplier amounts are calculated from each sold product’s buying price. They are
        not confirmed supplier payments.
      </p>

      <div className="dashboard-panels">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Supplier totals</h2>
              <p>
                Buying cost of products sold {period === "all-time"
                  ? "over all time"
                  : periodLabels[period].toLowerCase()}, grouped by supplier.
              </p>
            </div>
          </div>
          {data.supplierCosts.length ? (
            <div className="table-wrap dashboard-supplier-scroll">
              <table>
                <thead>
                  <tr><th>Supplier</th><th>Units sold</th><th>Buying cost</th></tr>
                </thead>
                <tbody>
                  {data.supplierCosts.map((supplier) => (
                    <tr key={supplier.supplierId}>
                      <td><strong>{supplier.supplierName}</strong></td>
                      <td>{supplier.unitsSold}</td>
                      <td>
                        {money(supplier.costCents)}
                        {supplier.unpricedSaleLines > 0 && (
                          <small className="table-subtitle expiry-warning">Some buying prices are missing</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Supplier costs will appear after products are sold.</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent transactions & settlements</h2>
              <p>Completed sales, checkout failures and PayAssure settlement status.</p>
            </div>
          </div>
          {data.transactions.length ? (
            <div className="dashboard-transactions">
              {data.transactions.map((transaction) => (
                <div className="dashboard-transaction" key={transaction.id}>
                  <div>
                    <strong>
                      {transaction.status === "completed"
                        ? "Sale completed"
                        : transaction.status === "pending"
                          ? "Awaiting PayAssure collection"
                          : "Checkout failed"}
                    </strong>
                    <span>
                      {new Date(transaction.createdAt).toLocaleTimeString()} ·{" "}
                      {transaction.paymentMethod === "cash"
                        ? "Cash"
                        : transaction.paymentMethod === "credit"
                          ? "Credit"
                          : "M-Pesa"}
                    </span>
                    {transaction.payerName && (
                      <small>Payer: {transaction.payerName} · {transaction.payerPhone}</small>
                    )}
                    {transaction.failureReason && (
                      <small className="expiry-warning">{transaction.failureReason}</small>
                    )}
                    {transaction.settlementStatus && (
                      <>
                        <small className={transaction.settlementStatus === "failed" ? "expiry-warning" : ""}>
                          PayAssure settlement: {transaction.settlementStatus}
                          {transaction.settlementAttemptCount !== null
                            ? ` · attempts ${transaction.settlementAttemptCount}`
                            : ""}
                          {transaction.nextRetryAt && transaction.settlementStatus === "failed"
                            ? ` · next retry ${new Date(transaction.nextRetryAt).toLocaleString()}`
                            : ""}
                        </small>
                        {transaction.settlementError && (
                          <small className="expiry-warning">{transaction.settlementError}</small>
                        )}
                      </>
                    )}
                  </div>
                  <div className="dashboard-transaction-result">
                    <strong>
                      {transaction.totalCents === null ? "—" : money(transaction.totalCents)}
                    </strong>
                    <span className={`badge ${transaction.status === "failed" ? "badge-failed" : ""}`}>
                      {transaction.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">No checkout transactions recorded {periodLabels[period].toLowerCase()}.</div>
          )}
        </article>
      </div>
    </section>
  );
}

export default Dashboard;
