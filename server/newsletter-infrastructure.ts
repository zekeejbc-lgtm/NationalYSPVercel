import { pool } from "./db";

let setup: Promise<void> | undefined;
export function ensureNewsletterInfrastructure() {
  return (setup ??= initialize().catch((error) => {
    setup = undefined;
    throw error;
  }));
}
async function initialize() {
  if (!pool) throw new Error("Database connection is not configured.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(763251043)");
    await client.query(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK (email = lower(trim(email))), normalized_email text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed')),
      source text NOT NULL CHECK (source IN ('footer','membership')), consent_version text NOT NULL DEFAULT 'newsletter-v1',
      unsubscribe_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      last_subscribed_at timestamptz NOT NULL DEFAULT now(), unsubscribed_at timestamptz
    )`);
    // Older deployments have normalized_email and match counters, but no
    // preferences. CREATE TABLE IF NOT EXISTS alone does not upgrade them.
    await client.query(`ALTER TABLE newsletter_subscribers
      ADD COLUMN IF NOT EXISTS normalized_email text,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'subscribed',
      ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'footer',
      ADD COLUMN IF NOT EXISTS consent_version text NOT NULL DEFAULT 'newsletter-v1',
      ADD COLUMN IF NOT EXISTS unsubscribe_token text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz`);
    await client.query(`UPDATE newsletter_subscribers SET email=lower(trim(email)), normalized_email=lower(trim(email))
      WHERE email IS DISTINCT FROM lower(trim(email)) OR normalized_email IS DISTINCT FROM lower(trim(email))`);
    await client.query(
      "ALTER TABLE newsletter_subscribers ALTER COLUMN normalized_email SET NOT NULL",
    );
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_key ON newsletter_subscribers(email)",
    );
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_unsubscribe_token_key ON newsletter_subscribers(unsubscribe_token)",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS newsletter_drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL, preview_text text NOT NULL DEFAULT '', content text NOT NULL,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','sent','failed')),
      recipient_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(
      "ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS recipient_scope text NOT NULL DEFAULT 'all_subscribers'",
    );
    const legacy = await client.query(
      "SELECT to_regclass('newsletter_email_drafts') AS name",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS newsletter_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const migrated = await client.query(
      "SELECT version FROM newsletter_migrations WHERE version=1",
    );
    if (legacy.rows[0].name && !migrated.rowCount) {
      await client.query(`INSERT INTO newsletter_drafts(id,subject,preview_text,content,status,recipient_count,created_at,updated_at)
        SELECT id,subject,coalesce(preview_text,''),content,
          CASE WHEN status IN ('draft','ready') THEN 'draft' WHEN status='sent' THEN 'sent' ELSE 'failed' END,
          recipient_count,created_at,updated_at FROM newsletter_email_drafts ON CONFLICT(id) DO NOTHING`);
    }
    await client.query(
      "INSERT INTO newsletter_migrations(version) VALUES(1) ON CONFLICT DO NOTHING",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS newsletter_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draft_id uuid NOT NULL REFERENCES newsletter_drafts(id) ON DELETE CASCADE,
      subscriber_id uuid REFERENCES newsletter_subscribers(id), recipient text NOT NULL, is_test boolean NOT NULL DEFAULT false,
      subject text NOT NULL, preview_text text NOT NULL DEFAULT '', content text NOT NULL,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
      attempts integer NOT NULL DEFAULT 0, last_error text, next_attempt_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
    )`);
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS newsletter_delivery_unique_idx ON newsletter_deliveries(draft_id, subscriber_id) WHERE NOT is_test",
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS newsletter_delivery_pending_idx ON newsletter_deliveries(next_attempt_at) WHERE status = 'queued'",
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS newsletter_delivery_draft_idx ON newsletter_deliveries(draft_id)",
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS newsletter_subscription_limits (key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL DEFAULT now())`,
    );
    for (const table of [
      "newsletter_subscribers",
      "newsletter_drafts",
      "newsletter_deliveries",
      "newsletter_subscription_limits",
      "newsletter_migrations",
      ...(legacy.rows[0].name ? ["newsletter_email_drafts"] : []),
    ]) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await client.query(`REVOKE ALL ON ${table} FROM PUBLIC`);
      await client.query(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON ${table} FROM anon; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON ${table} FROM authenticated; END IF;
      END $$`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
