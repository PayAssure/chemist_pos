import { pool } from "../db";

export function dashboardTransactions(startDate: string, endDate: string) {
  return pool.query(
    `SELECT * FROM (
       SELECT s.id::text AS id, s.payment_method AS "paymentMethod", s.status,
              s.total_cents AS "totalCents", s.created_at AS "createdAt",
              CASE WHEN s.status = 'failed' THEN settlement.last_error END AS "failureReason",
              s.payer_name AS "payerName", s.payer_phone AS "payerPhone",
              settlement.id AS "settlementId", settlement.status AS "settlementStatus",
              settlement.last_error AS "settlementError",
              settlement.attempt_count AS "settlementAttemptCount",
              settlement.next_attempt_at AS "nextRetryAt"
       FROM sales s
       LEFT JOIN payassure_settlements settlement ON settlement.sale_id = s.id
       WHERE (s.created_at >= $1::date
              AND s.created_at < $2::date + INTERVAL '1 day')
          OR settlement.status IN (
            'queued', 'processing', 'accepted', 'failed', 'retrying',
            'partially_failed', 'awaiting_reconciliation'
          )
       UNION ALL
       SELECT ('failed-' || id)::text AS id, payment_method AS "paymentMethod",
              'failed' AS status, total_cents AS "totalCents", created_at AS "createdAt",
              failure_reason AS "failureReason", NULL::text AS "payerName",
              NULL::text AS "payerPhone", NULL::integer AS "settlementId",
              NULL::text AS "settlementStatus", NULL::text AS "settlementError",
              NULL::integer AS "settlementAttemptCount", NULL::timestamptz AS "nextRetryAt"
       FROM failed_checkout_attempts
       WHERE created_at >= $1::date AND created_at < $2::date + INTERVAL '1 day'
     ) AS recent_transactions
     ORDER BY CASE WHEN status = 'pending'
                      OR "settlementStatus" IN (
                        'queued', 'processing', 'accepted', 'failed', 'retrying',
                        'partially_failed', 'awaiting_reconciliation'
                      )
                   THEN 0 ELSE 1 END,
              "createdAt" DESC
     LIMIT 50`,
    [startDate, endDate],
  );
}
