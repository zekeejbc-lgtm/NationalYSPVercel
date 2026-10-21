import "dotenv/config";
import { ensureCoalitionInfrastructure } from "../server/coalition";
import { pool } from "../server/db";

try {
  await ensureCoalitionInfrastructure();
  const result = await pool!.query(`SELECT relname, relrowsecurity FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname IN ('coalition_registrations', 'coalition_documents', 'coalition_submission_limits', 'coalition_events', 'coalition_tracking_tokens', 'coalition_email_outbox')`);
  if (
    result.rows.length !== 6 ||
    result.rows.some((row) => !row.relrowsecurity)
  )
    throw new Error("Coalition security verification failed.");
  const grants = await pool!
    .query(`SELECT count(*)::integer AS exposed FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name IN ('coalition_registrations', 'coalition_documents', 'coalition_submission_limits', 'coalition_events', 'coalition_tracking_tokens', 'coalition_email_outbox') AND grantee IN ('anon','authenticated','PUBLIC')`);
  if (grants.rows[0].exposed !== 0)
    throw new Error("Unexpected public grants.");
  console.log(
    "Coalition tables created and verified: RLS enabled, no public grants.",
  );
} catch (error) {
  console.error("Coalition setup failed:", {
    code: (error as { code?: string }).code,
    message:
      error instanceof Error
        ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")
        : "Unknown error",
  });
  process.exitCode = 1;
} finally {
  await pool?.end();
}
