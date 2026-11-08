import "dotenv/config";
import express from "express";
import { pool } from "../server/db";
import { registerNewsletterRoutes } from "../server/newsletter";
import { ensureNewsletterInfrastructure } from "../server/newsletter-infrastructure";

// No send/process endpoints are called. Output contains counts and schema
// metadata only, never addresses, message contents, tokens, or credentials.
const app = express();
app.use(express.json());
registerNewsletterRoutes(app, (_req, _res, next) => next());
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Diagnostic listener failed");
try {
  await ensureNewsletterInfrastructure();
  console.log("Database initialization/migration: PASS");
  for (const path of ["subscribers", "drafts", "status"]) {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/newsletter/${path}`,
    );
    const data = await response.json();
    console.log(
      `${path}: HTTP ${response.status}; ${Array.isArray(data) ? `${data.length} records` : JSON.stringify(data)}`,
    );
    if (!response.ok) process.exitCode = 1;
  }
  const security = await pool!
    .query(`SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND c.relname LIKE 'newsletter_%' AND c.relkind='r'`);
  console.log("Table access:", JSON.stringify(security.rows));
  const grants = await pool!
    .query(`SELECT count(*)::int AS exposed FROM information_schema.role_table_grants
    WHERE table_schema=current_schema() AND table_name LIKE 'newsletter_%' AND grantee IN ('PUBLIC','anon','authenticated')`);
  console.log("Public table grants:", grants.rows[0].exposed);
  if (
    grants.rows[0].exposed ||
    security.rows.some((row) => !row.relrowsecurity)
  )
    process.exitCode = 1;
  if (process.env.GOOGLE_APPS_SCRIPT_URL && process.env.COALITION_MAIL_SECRET) {
    for (const action of ["coalition_mail_check", "newsletter_mail"]) {
      try {
        const response = await fetch(process.env.GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            secret: process.env.COALITION_MAIL_SECRET,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const payload = await response.json();
        const supported =
          action === "coalition_mail_check"
            ? response.ok && payload.success === true
            : String(payload.error).includes("Invalid newsletter HTML payload");
        console.log(
          `${action}: ${supported ? "PASS" : "FAIL"}${action === "coalition_mail_check" && supported ? `; remaining mail quota ${payload.remainingQuota}` : ""}`,
        );
        if (!supported) process.exitCode = 1;
      } catch {
        console.log(
          `${action}: FAIL (bridge unavailable or non-JSON response)`,
        );
        process.exitCode = 1;
      }
    }
  } else {
    console.log("Mail bridge: NOT CONFIGURED");
    process.exitCode = 1;
  }
  console.log("No email was sent by this diagnostic.");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool?.end();
}
