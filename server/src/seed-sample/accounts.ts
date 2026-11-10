import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { requestedSampleUsers, sampleUsers } from "./constants";
import type { NewCredential, SeedUser } from "./types";
import { generatedPassword } from "./utils";

export async function ensureSampleUsers(
  client: PoolClient,
): Promise<{ users: SeedUser[]; newCredentials: NewCredential[] }> {
  const requestedUserPassword = process.env.POS_SAMPLE_USER_PASSWORD;
  if (!requestedUserPassword || requestedUserPassword.length < 12) {
    throw new Error(
      "Set POS_SAMPLE_USER_PASSWORD to a password at least 12 characters long.",
    );
  }
  const requestedUserPasswordHash = await bcrypt.hash(requestedUserPassword, 12);
  for (const email of requestedSampleUsers) {
    await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, requestedUserPasswordHash],
    );
  }

  const users: SeedUser[] = [];
  const newCredentials: NewCredential[] = [];
  for (const email of sampleUsers) {
    const existing = await client.query(
      "SELECT id, email FROM users WHERE email = $1",
      [email],
    );
    if (existing.rowCount) {
      users.push({ id: Number(existing.rows[0].id), email: existing.rows[0].email });
      continue;
    }
    const password = generatedPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash],
    );
    users.push({ id: Number(inserted.rows[0].id), email: inserted.rows[0].email });
    newCredentials.push({ email, password });
  }
  return { users, newCredentials };
}
