import { money } from "../lib/money";
import type { DashboardData, DashboardPeriod } from "../types";

type SupplierCostsPanelProps = {
  suppliers: DashboardData["supplierCosts"];
  period: DashboardPeriod;
  periodLabels: Record<DashboardPeriod, string>;
};

function SupplierCostsPanel({ suppliers, period, periodLabels }: SupplierCostsPanelProps) {
  return (
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
      {suppliers.length ? (
        <div className="table-wrap dashboard-supplier-scroll">
          <table>
            <thead><tr><th>Supplier</th><th>Units sold</th><th>Buying cost</th></tr></thead>
            <tbody>
              {suppliers.map((supplier) => (
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
  );
}

export default SupplierCostsPanel;
