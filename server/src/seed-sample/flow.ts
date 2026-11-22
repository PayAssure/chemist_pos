import type { PoolClient } from "pg";
import { initializeDatabase, pool } from "../db";
import { ensureSampleUsers } from "./accounts";
import { allSampleUsers } from "./constants";
import { printNewCredentials } from "./utils";

export async function seedSampleData(): Promise<void> {
  if (process.env.POS_ALLOW_SAMPLE_DATA !== "true") {
    throw new Error(
      "Login credential seeding is disabled. Set POS_ALLOW_SAMPLE_DATA=true to enable it.",
    );
  }
  await initializeDatabase();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["payassure:seed-sample"]);
    const { newCredentials } = await ensureSampleUsers(client);
    await client.query("COMMIT");
    console.log(`Ensured login accounts: ${allSampleUsers.join(", ")}`);
    printNewCredentials(newCredentials);
    console.log("No sample inventory, sales, or checkout data was created.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
