import { money } from "../lib/money";
import type { DashboardData } from "../types";

function DashboardMetrics({ data }: { data: DashboardData }) {
  return (
    <div className="dashboard-metrics">
      <article className="dashboard-metric"><span>Units sold</span><strong>{data.unitsSold}</strong></article>
      <article className="dashboard-metric"><span>Sales total</span><strong>{money(data.incomeCents)}</strong></article>
      <article className="dashboard-metric">
        <span>Average sales per day</span><strong>{money(data.averageSalesPerDayCents)}</strong>
      </article>
      <article className="dashboard-metric">
        <span>Supplier buying cost of goods sold</span><strong>{money(data.supplierCostCents)}</strong>
      </article>
      <article className="dashboard-metric">
        <span>Successful transactions</span><strong>{data.successfulTransactions}</strong>
      </article>
      <article className="dashboard-metric dashboard-metric-failed">
        <span>Failed checkout attempts</span><strong>{data.failedTransactions}</strong>
      </article>
    </div>
  );
}

export default DashboardMetrics;
