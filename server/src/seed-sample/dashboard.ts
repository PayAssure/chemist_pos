import type { PoolClient } from "pg";
import { sampleUsers } from "./constants";
import { insertDashboardFailures } from "./dashboard-failures";
import { insertDashboardSale } from "./dashboard-sale";

export async function seedDashboardSampleData(client: PoolClient): Promise<void> {
  const existing = await client.query(
    "SELECT 1 FROM sales WHERE payer_name LIKE 'Demo Dashboard Payer %' LIMIT 1",
  );
  if (existing.rowCount) {
    throw new Error("Dashboard sample transactions already exist; no data was changed.");
  }
  const todaySales = await client.query(
    `SELECT 1 FROM sales WHERE created_at >= CURRENT_DATE
     AND created_at < CURRENT_DATE + INTERVAL '1 day' LIMIT 1`,
  );
  if (todaySales.rowCount) {
    throw new Error("Today's sales already exist; refusing to mix sample data with them.");
  }
  const sampleUserRows = await client.query(
    "SELECT email FROM users WHERE email = ANY($1::text[]) ORDER BY email",
    [sampleUsers],
  );
  if (sampleUserRows.rowCount !== sampleUsers.length) {
    throw new Error("Create the sample users before seeding dashboard transactions.");
  }
  await client.query(
    `UPDATE products p
     SET buying_price_cents = (p.price_cents * 3 / 5)::integer
     FROM suppliers s
     WHERE p.supplier_id = s.id
       AND s.payassure_merchant_id LIKE 'DEMO-PA-TEST-MERCHANT-%'
       AND p.buying_price_cents IS NULL`,
  );
  const products = await client.query(
    `SELECT p.id, p.name, p.price_cents, p.prescription_required
     FROM products p JOIN suppliers s ON s.id = p.supplier_id
     WHERE s.payassure_merchant_id LIKE 'DEMO-PA-TEST-MERCHANT-%'
     ORDER BY p.id LIMIT 12`,
  );
  if (products.rowCount !== 12) {
    throw new Error("Expected the complete sample product catalog before dashboard seeding.");
  }
  for (let index = 0; index < products.rows.length; index += 1) {
    await insertDashboardSale(client, products.rows[index], index, products.rows.length);
  }
  await insertDashboardFailures(client, sampleUserRows.rows);
}
