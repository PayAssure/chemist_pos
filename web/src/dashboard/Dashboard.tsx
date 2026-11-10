import type { DashboardData, DashboardPeriod } from "../types";
import DashboardMetrics from "./DashboardMetrics";
import RecentTransactionsPanel from "./RecentTransactionsPanel";
import SupplierCostsPanel from "./SupplierCostsPanel";

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

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function Dashboard({ data, period, onPeriodChange }: DashboardProps) {
  const rangeLabel = period === "today"
    ? dateLabel(data.date)
    : `${dateLabel(data.startDate)} – ${dateLabel(data.date)}`;
  const hasUnpricedSales = data.unpricedSaleLines > 0 ||
    data.supplierCosts.some((supplier) => supplier.unpricedSaleLines > 0);

  return (
    <section className="dashboard">
      <div className="panel-heading dashboard-heading">
        <div>
          <h2>{periodLabels[period]} performance</h2>
          <p>{rangeLabel} · completed sales and checkout attempts</p>
        </div>
        <label className="dashboard-period-filter">
          <span>Show</span>
          <select value={period}
            onChange={(event) => onPeriodChange(event.target.value as DashboardPeriod)}>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="all-time">All time</option>
          </select>
        </label>
      </div>
      <DashboardMetrics data={data} />
      {hasUnpricedSales && (
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
        <SupplierCostsPanel suppliers={data.supplierCosts} period={period} periodLabels={periodLabels} />
        <RecentTransactionsPanel transactions={data.transactions} period={period} periodLabels={periodLabels} />
      </div>
    </section>
  );
}

export default Dashboard;
