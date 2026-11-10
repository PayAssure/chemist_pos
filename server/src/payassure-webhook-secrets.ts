import { pool } from "./db";
import { decrypt, encrypt } from "./payassure-crypto";
import { getPayassureParticipant } from "./payassure-participant";

const webhookSecretCache = new Map<string, { secret: string; expiresAt: number }>();

export async function storePayassureWebhookSecret(
  merchantId: string,
  secret: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO payassure_webhook_credentials (recipient_merchant_id, encrypted_api_secret)
     VALUES ($1, $2)
     ON CONFLICT (recipient_merchant_id) DO UPDATE
       SET encrypted_api_secret = EXCLUDED.encrypted_api_secret, updated_at = NOW()`,
    [merchantId, encrypt(secret)],
  );
  webhookSecretCache.set(merchantId, {
    secret,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export async function getPayassureWebhookSecret(merchantId: string): Promise<string | null> {
  const cached = webhookSecretCache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) return cached.secret;

  const stored = await pool.query<{ encrypted_api_secret: string }>(
    `SELECT encrypted_api_secret
     FROM payassure_webhook_credentials
     WHERE recipient_merchant_id = $1`,
    [merchantId],
  );
  if (stored.rows[0]) {
    try {
      const secret = decrypt(stored.rows[0].encrypted_api_secret);
      if (secret) {
        webhookSecretCache.set(merchantId, {
          secret,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return secret;
      }
    } catch {
      // Re-read and replace an unreadable stored credential from PayAssure below.
    }
  }

  const participantValue = await getPayassureParticipant();
  const participant = Array.isArray(participantValue) ? participantValue[0] : participantValue;
  if (!participant || typeof participant !== "object") return null;
  const integration = (participant as Record<string, unknown>).integration;
  if (!integration || typeof integration !== "object") return null;
  const details = integration as Record<string, unknown>;
  if (details.merchantId !== merchantId || typeof details.apiSecret !== "string" || !details.apiSecret) {
    return null;
  }

  await storePayassureWebhookSecret(merchantId, details.apiSecret);
  return details.apiSecret;
}
