import type { PoolClient } from "pg";
import { initializeDatabase, pool } from "../db";
import { ensureSampleUsers } from "./accounts";
import { createMedicines, createSuppliers } from "./catalog-seeding";
import { supplierNames } from "./constants";
import { seedDashboardSampleData } from "./dashboard";
import { insertFailedCheckouts } from "./failed-checkouts";
import { finishSeed } from "./finish";
import { sampleAlreadyRecorded, existingSampleData, sampleSalesExist } from "./seed-state";
import { seedSales, transactionCount } from "./sales";

export async function seedSampleData(): Promise<void> {
  if (process.env.POS_ALLOW_SAMPLE_DATA !== "true") {
    throw new Error(
      "Sample seeding is disabled. Set POS_ALLOW_SAMPLE_DATA=true to enable it.",
    );
  }
  await initializeDatabase();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["payassure:seed-sample"]);
    const { users, newCredentials } = await ensureSampleUsers(client);
    if (await sampleAlreadyRecorded(client)) {
      await finishSeed(
        client, newCredentials,
        "Sample data was already seeded; no sample data was changed.", false,
      );
      return;
    }
    if (await existingSampleData(client)) {
      await seedExistingCatalog(client, newCredentials);
      return;
    }
    await seedNewCatalog(client, users, newCredentials);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedExistingCatalog(
  client: PoolClient,
  newCredentials: Awaited<ReturnType<typeof ensureSampleUsers>>["newCredentials"],
): Promise<void> {
  if (await sampleSalesExist(client)) {
    await finishSeed(
      client, newCredentials,
      "Existing sample data was recorded as seeded; no sample data was changed.",
    );
    return;
  }
  await seedDashboardSampleData(client);
  await finishSeed(
    client, newCredentials,
    "Added 12 sample sales (4 on credit) and 3 failed checkout attempts for the dashboard.",
  );
}

async function seedNewCatalog(
  client: PoolClient,
  users: Awaited<ReturnType<typeof ensureSampleUsers>>["users"],
  newCredentials: Awaited<ReturnType<typeof ensureSampleUsers>>["newCredentials"],
): Promise<void> {
  const suppliers = await createSuppliers(client);
  const medicines = await createMedicines(client, suppliers);
  await seedSales(client, medicines);
  await insertFailedCheckouts(client, users);
  await finishSeed(
    client, newCredentials,
    `Created ${supplierNames.length} suppliers, ${medicines.length} medicines, ` +
      `${medicines.length * 2} batches, and ${transactionCount} completed sale records, ` +
      "including 12 sales (4 on credit) and 3 failed checkout attempts today.",
  );
}
