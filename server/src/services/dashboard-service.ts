import { pool } from "../db";
import {
  dashboardFailures,
  dashboardItems,
  dashboardSales,
  dashboardSupplierCosts,
} from "./dashboard-metrics";
import { dashboardTransactions } from "./dashboard-transactions";

export type DashboardPeriod = "today" | "week" | "month" | "all-time";

export async function getDashboardData(period: DashboardPeriod) {
  const bounds = await pool.query(
    `WITH activity_dates AS (
       SELECT created_at::date AS activity_date FROM sales
       UNION ALL
       SELECT created_at::date AS activity_date FROM failed_checkout_attempts
     ),
     first_activity AS (
       SELECT MIN(activity_date) AS start_date FROM activity_dates
     ),
     period_bounds AS (
       SELECT CASE $1::text
                WHEN 'today' THEN CURRENT_DATE
                WHEN 'week' THEN date_trunc('week', CURRENT_DATE)::date
                WHEN 'month' THEN date_trunc('month', CURRENT_DATE)::date
                ELSE COALESCE(first_activity.start_date, CURRENT_DATE)
              END AS start_date,
              CURRENT_DATE AS end_date
       FROM first_activity
     )
     SELECT start_date::text AS "startDate", end_date::text AS "endDate",
            GREATEST(end_date - start_date + 1, 1)::int AS "periodDays"
     FROM period_bounds`,
    [period],
  );
  const { startDate, endDate, periodDays } = bounds.rows[0];
  const [sales, items, supplierCosts, failures, transactions] = await Promise.all([
    dashboardSales(startDate, endDate),
    dashboardItems(startDate, endDate),
    dashboardSupplierCosts(startDate, endDate),
    dashboardFailures(startDate, endDate),
    dashboardTransactions(startDate, endDate),
  ]);
  return {
    period,
    date: endDate,
    startDate,
    successfulTransactions: Number(sales.rows[0].successfulTransactions),
    failedTransactions: Number(failures.rows[0].count),
    incomeCents: Number(sales.rows[0].incomeCents),
    averageSalesPerDayCents: Math.round(Number(sales.rows[0].incomeCents) / periodDays),
    unitsSold: Number(items.rows[0].unitsSold),
    supplierCostCents: Number(items.rows[0].supplierCostCents),
    unpricedSaleLines: Number(items.rows[0].unpricedSaleLines),
    failedAmountCents: Number(failures.rows[0].failedAmountCents),
    supplierCosts: supplierCosts.rows.map((row) => ({
      ...row,
      costCents: Number(row.costCents),
      unitsSold: Number(row.unitsSold),
      unpricedSaleLines: Number(row.unpricedSaleLines),
    })),
    transactions: transactions.rows.map((row) => ({
      ...row,
      totalCents: row.totalCents === null ? null : Number(row.totalCents),
    })),
  };
}
