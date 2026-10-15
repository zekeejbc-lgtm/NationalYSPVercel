import { pool } from "./db";

export function coalitionMailConfigured() {
  return !!(
    process.env.GOOGLE_APPS_SCRIPT_URL && process.env.COALITION_MAIL_SECRET
  );
}
// Called synchronously by submissions, decisions, recovery and the admin retry
// action. Failed messages remain in the private outbox for later delivery.
export async function flushCoalitionMail(registrationId?: string) {
  if (!coalitionMailConfigured()) return;
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const messages = await client.query(
      `SELECT * FROM coalition_email_outbox WHERE sent_at IS NULL
      AND next_attempt_at <= now() AND attempts < 12 AND created_at > now() - interval '7 days'
      AND ($1::uuid IS NULL OR registration_id = $1) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      [registrationId || null],
    );
    for (const message of messages.rows) {
      try {
        const response = await fetch(process.env.GOOGLE_APPS_SCRIPT_URL!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "coalition_mail",
            secret: process.env.COALITION_MAIL_SECRET,
            messageId: message.id,
            to: message.recipient,
            subject: message.subject,
            body: message.body,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success)
          throw new Error(
            "GAS could not send this message. Check authorization, quota, and mail secret.",
          );
        await client.query(
          `UPDATE coalition_email_outbox SET sent_at = now(), body = '', last_error = NULL WHERE id = $1`,
          [message.id],
        );
      } catch {
        await client.query(
          `UPDATE coalition_email_outbox SET attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes', last_error = 'Delivery failed. Check GAS authorization, quota, and shared secret.' WHERE id = $1`,
          [message.id],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
