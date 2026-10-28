import { money } from "../lib/money";
import type { DashboardData } from "../types";

type DashboardProps = { data: DashboardData };

function Dashboard({ data }: DashboardProps) {
  const dateLabel = new Date(`${data.date}T00:00:00`).toLocaleDateString();

  return (
    <section className="dashboard">
      <div className="panel-heading dashboard-heading">
        <div>
          <h2>Today’s performance</h2>
          <p>{dateLabel} · completed sales and checkout attempts</p>
        </div>
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
          Some products sold today do not have a buying price set. Update their buying
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
              <p>Buying cost of products sold today, grouped by supplier.</p>
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
              <h2>Today’s transactions</h2>
              <p>Completed sales and failed checkout attempts.</p>
            </div>
          </div>
          {data.transactions.length ? (
            <div className="dashboard-transactions">
              {data.transactions.map((transaction) => (
                <div className="dashboard-transaction" key={transaction.id}>
                  <div>
                    <strong>
                      {transaction.status === "completed" ? "Sale completed" : "Checkout failed"}
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
            <div className="empty">No checkout transactions recorded today.</div>
          )}
        </article>
      </div>
    </section>
  );
}

export default Dashboard;
