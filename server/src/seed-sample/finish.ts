import type { PoolClient } from "pg";
import { allSampleUsers } from "./constants";
import type { NewCredential } from "./types";
import { printNewCredentials } from "./utils";

export async function finishSeed(
  client: PoolClient,
  newCredentials: NewCredential[],
  message: string,
  recordSeed = true,
): Promise<void> {
  if (recordSeed) {
    await client.query(
      "INSERT INTO sample_seed_runs (seed_name) VALUES ($1)",
      ["sample"],
    );
  }
  await client.query("COMMIT");
  console.log(`Ensured sample login accounts: ${allSampleUsers.join(", ")}`);
  printNewCredentials(newCredentials);
  console.log(message);
}
