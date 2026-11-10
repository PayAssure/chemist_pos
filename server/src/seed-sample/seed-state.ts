import type { PoolClient } from "pg";
import { supplierNames } from "./constants";

export async function sampleAlreadyRecorded(client: PoolClient): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM sample_seed_runs WHERE seed_name = $1",
    ["sample"],
  );
  return Boolean(result.rowCount);
}

export async function existingSampleData(client: PoolClient): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM suppliers WHERE name = $1 LIMIT 1",
    [supplierNames[0]],
  );
  return Boolean(result.rowCount);
}

export async function sampleSalesExist(client: PoolClient): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM sales s
     WHERE s.payer_name LIKE 'Demo Dashboard Payer %'
        OR EXISTS (
          SELECT 1
          FROM sale_items si
          JOIN products p ON p.id = si.product_id
          JOIN suppliers sp ON sp.id = p.supplier_id
          WHERE si.sale_id = s.id
            AND sp.payassure_merchant_id LIKE 'DEMO-PA-TEST-MERCHANT-%'
        )
     LIMIT 1`,
  );
  return Boolean(result.rowCount);
}
