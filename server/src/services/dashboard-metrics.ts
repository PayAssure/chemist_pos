import { pool } from "../db";

export function dashboardSales(startDate: string, endDate: string) {
  return pool.query(
    `SELECT COUNT(*) AS "successfulTransactions",
            COALESCE(SUM(total_cents), 0)::text AS "incomeCents"
     FROM sales
     WHERE status = 'completed' AND created_at >= $1::date
       AND created_at < $2::date + INTERVAL '1 day'`,
    [startDate, endDate],
  );
}

export function dashboardItems(startDate: string, endDate: string) {
  return pool.query(
    `SELECT COALESCE(SUM(i.quantity), 0)::text AS "unitsSold",
            COALESCE(SUM(i.buying_unit_price_cents::bigint * i.quantity)
              FILTER (WHERE i.buying_unit_price_cents IS NOT NULL), 0)::text AS "supplierCostCents",
            COUNT(*) FILTER (WHERE i.buying_unit_price_cents IS NULL) AS "unpricedSaleLines"
     FROM sales s JOIN sale_items i ON i.sale_id = s.id
     WHERE s.status = 'completed' AND s.created_at >= $1::date
       AND s.created_at < $2::date + INTERVAL '1 day'`,
    [startDate, endDate],
  );
}

export function dashboardSupplierCosts(startDate: string, endDate: string) {
  return pool.query(
    `SELECT COALESCE(i.supplier_id, p.supplier_id) AS "supplierId",
            COALESCE(i.supplier_name, supplier.name) AS "supplierName",
            COALESCE(SUM(i.buying_unit_price_cents::bigint * i.quantity)
              FILTER (WHERE i.buying_unit_price_cents IS NOT NULL), 0)::text AS "costCents",
            COALESCE(SUM(i.quantity), 0)::text AS "unitsSold",
            COUNT(*) FILTER (WHERE i.buying_unit_price_cents IS NULL) AS "unpricedSaleLines"
     FROM sales s
     JOIN sale_items i ON i.sale_id = s.id
     JOIN products p ON p.id = i.product_id
     JOIN suppliers supplier ON supplier.id = COALESCE(i.supplier_id, p.supplier_id)
     WHERE s.status = 'completed' AND s.created_at >= $1::date
       AND s.created_at < $2::date + INTERVAL '1 day'
     GROUP BY COALESCE(i.supplier_id, p.supplier_id),
              COALESCE(i.supplier_name, supplier.name)
     ORDER BY SUM(i.buying_unit_price_cents::bigint * i.quantity)
                FILTER (WHERE i.buying_unit_price_cents IS NOT NULL) DESC NULLS LAST,
              "supplierName"`,
    [startDate, endDate],
  );
}

export function dashboardFailures(startDate: string, endDate: string) {
  return pool.query(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(total_cents), 0)::text AS "failedAmountCents"
     FROM failed_checkout_attempts
     WHERE created_at >= $1::date AND created_at < $2::date + INTERVAL '1 day'`,
    [startDate, endDate],
  );
}
