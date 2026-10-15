import { pool } from "./db";
let setup: Promise<void> | undefined;
export function ensureCoalitionInfrastructure(): Promise<void> {
  if (!setup)
    setup = initialize().catch((error) => {
      setup = undefined;
      throw error;
    });
  return setup;
}
async function initialize() {
  if (!pool) throw new Error("Database connection is not configured.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(763251042)");
    await client.query(`CREATE TABLE IF NOT EXISTS coalition_registrations (
      id uuid PRIMARY KEY, reference_code text UNIQUE, registration_type text NOT NULL CHECK (registration_type IN ('individual', 'organization')),
      full_name text, organization_name text, organization_type text, representative_name text,
      representative_position text, organization_link text, email text NOT NULL,
      contact_number text NOT NULL DEFAULT '', city text NOT NULL, province text NOT NULL,
      privacy_consent boolean NOT NULL CHECK (privacy_consent = true), authorized_representative boolean NOT NULL DEFAULT false,
      notice_version text NOT NULL, consented_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'submitted', created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((registration_type = 'individual' AND full_name IS NOT NULL) OR
        (registration_type = 'organization' AND organization_name IS NOT NULL AND organization_type IS NOT NULL
         AND representative_name IS NOT NULL AND representative_position IS NOT NULL AND authorized_representative = true))
    )`);
    await client.query(
      `ALTER TABLE coalition_registrations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS legacy_status text`,
    );
    await client.query(
      `ALTER TABLE coalition_registrations ADD COLUMN IF NOT EXISTS reference_code text`,
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS coalition_reference_code_idx ON coalition_registrations (reference_code) WHERE reference_code IS NOT NULL`,
    );
    await client.query(
      `ALTER TABLE coalition_registrations DROP CONSTRAINT IF EXISTS coalition_registrations_status_check`,
    );
    await client.query(
      `UPDATE coalition_registrations SET legacy_status = status, status = CASE WHEN status = 'contacted' THEN 'under_review' ELSE 'submitted' END WHERE status IN ('pending', 'contacted', 'closed')`,
    );
    await client.query(
      `ALTER TABLE coalition_registrations ALTER COLUMN status SET DEFAULT 'submitted'`,
    );
    await client.query(
      `ALTER TABLE coalition_registrations ADD CONSTRAINT coalition_registrations_status_check CHECK (status IN ('submitted','under_review','needs_information','approved','declined','withdrawn'))`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS coalition_created_idx ON coalition_registrations (created_at DESC)`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS coalition_submission_limits (key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL DEFAULT now())`,
    );
    await client.query(`CREATE TABLE IF NOT EXISTS coalition_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL REFERENCES coalition_registrations(id) ON DELETE CASCADE,
      status text NOT NULL, message text NOT NULL DEFAULT '', actor text NOT NULL CHECK (actor IN ('admin','applicant','system')),
      actor_id text, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS coalition_events_registration_idx ON coalition_events (registration_id, created_at)`,
    );
    await client.query(`INSERT INTO coalition_events (registration_id, status, message, actor, created_at)
      SELECT r.id, r.status, CASE WHEN r.legacy_status IS NOT NULL THEN 'Imported from the earlier ' || r.legacy_status || ' status. A formal review decision has not been recorded.' ELSE 'Application received.' END, 'system', r.created_at
      FROM coalition_registrations r WHERE NOT EXISTS (SELECT 1 FROM coalition_events e WHERE e.registration_id = r.id)`);
    await client.query(`CREATE TABLE IF NOT EXISTS coalition_tracking_tokens (
      token_hash text PRIMARY KEY, registration_id uuid NOT NULL REFERENCES coalition_registrations(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('access','session')), expires_at timestamptz NOT NULL
    )`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS coalition_tokens_registration_idx ON coalition_tracking_tokens (registration_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS coalition_tokens_expiry_idx ON coalition_tracking_tokens (expires_at)`,
    );
    await client.query(`CREATE TABLE IF NOT EXISTS coalition_email_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL REFERENCES coalition_registrations(id) ON DELETE CASCADE,
      recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, attempts integer NOT NULL DEFAULT 0,
      sent_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS coalition_outbox_pending_idx ON coalition_email_outbox (next_attempt_at) WHERE sent_at IS NULL`,
    );
    for (const table of [
      "coalition_registrations",
      "coalition_submission_limits",
      "coalition_events",
      "coalition_tracking_tokens",
      "coalition_email_outbox",
    ]) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await client.query(`REVOKE ALL ON ${table} FROM PUBLIC`);
      await client.query(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON ${table} FROM anon; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON ${table} FROM authenticated; END IF;
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
