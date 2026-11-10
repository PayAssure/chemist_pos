import type { PoolClient } from "pg";
import { pool } from "./db";
import type { PayassureTokens } from "./payassure-types";
import { PayassureHttpError } from "./payassure-types";
import { decrypt, encrypt } from "./payassure-crypto";
import { getConfig } from "./payassure-config";
import { login, refresh } from "./payassure-auth-request";

async function readStoredTokens(client: PoolClient): Promise<PayassureTokens | null> {
  await client.query(
    `INSERT INTO payassure_tokens (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );
  const result = await client.query<{
    access_token: string | null;
    refresh_token: string | null;
    user_id: string | null;
  }>("SELECT access_token, refresh_token, user_id FROM payassure_tokens WHERE id = 1 FOR UPDATE");
  try {
    const accessToken = decrypt(result.rows[0]?.access_token ?? null);
    const refreshToken = decrypt(result.rows[0]?.refresh_token ?? null);
    const userId = result.rows[0]?.user_id;
    return accessToken && refreshToken && userId
      ? { accessToken, refreshToken, userId }
      : null;
  } catch {
    return null;
  }
}

async function storeTokens(client: PoolClient, tokens: PayassureTokens): Promise<void> {
  await client.query(
    `UPDATE payassure_tokens
      SET access_token = $1, refresh_token = $2, user_id = $3, updated_at = NOW()
     WHERE id = 1`,
        [encrypt(tokens.accessToken), encrypt(tokens.refreshToken), tokens.userId],
  );
}

export async function refreshPayassureSession(): Promise<void> {
  const config = getConfig();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stored = await readStoredTokens(client);
    let tokens: PayassureTokens;
    if (stored) {
      try {
        tokens = await refresh(config, stored.refreshToken, stored.userId);
      } catch (error) {
        if (!(error instanceof PayassureHttpError) || error.status !== 401) throw error;
        tokens = await login(config);
      }
    } else {
      tokens = await login(config);
    }
    await storeTokens(client, tokens);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function currentPayassureSession(): Promise<PayassureTokens> {
  const result = await pool.query<{ access_token: string | null; user_id: string | null }>(
    "SELECT access_token, user_id FROM payassure_tokens WHERE id = 1",
  );
  const token = decrypt(result.rows[0]?.access_token ?? null);
  const userId = result.rows[0]?.user_id;
  if (token && userId) {
    const stored = await pool.query<{ refresh_token: string | null }>(
      "SELECT refresh_token FROM payassure_tokens WHERE id = 1",
    );
    const refreshToken = decrypt(stored.rows[0]?.refresh_token ?? null);
    if (refreshToken) return { accessToken: token, refreshToken, userId };
  }
  await refreshPayassureSession();
  return currentPayassureSession();
}
