import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { pool } from "../server/db";
import { registerExternalAuthRoutes } from "../server/external-auth";

// Integration checks use temporary accounts and always remove them in finally.
if (process.env.RUN_EXTERNAL_AUTH_TESTS !== "true") throw new Error("Set RUN_EXTERNAL_AUTH_TESTS=true to run the database/Auth integration checks.");
assert(pool);
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const email = `auth-enroll-${ids[0]}@example.invalid`;
const subject = crypto.randomUUID();
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const id = req.get("x-test-account");
  (req as any).session = ids.includes(id as string) ? { userId: id, role: "admin" } : {};
  next();
});
process.env.GOOGLE_AUTH_ENABLED = "true";
registerExternalAuthRoutes(app, (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: "Unauthorized" }));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
async function enroll(accountId?: string, selectedEmail: string = email) {
  return fetch(origin + "/api/auth/external/enroll", {
    method: "POST", headers: { "Content-Type": "application/json", ...(accountId ? { "x-test-account": accountId } : {}) },
    body: JSON.stringify({ accountId, email: selectedEmail }),
  });
}
const event = (provider = "google", selectedEmail = email) => ({ user: { id: subject, email: selectedEmail, app_metadata: { provider }, user_metadata: { provider: "google" } } });
try {
  await pool.query("insert into admin_users (id, username, password) values ($1,$2,$3),($4,$5,$3)", [ids[0], `auth-enrollment-test-${ids[0]}`, crypto.randomUUID(), ids[1], `auth-enrollment-test-${ids[1]}`]);
  assert.equal((await enroll()).status, 401);
  assert.equal((await enroll(ids[0], "invalid-email")).status, 400);
  assert.equal((await enroll(ids[0], ` ${email.toUpperCase()} `)).status, 200);
  assert.equal((await enroll(ids[1])).status, 400);
  console.log("PASS: only an authenticated YSP account can authorize an email; invalid and conflicting requests are rejected");

  const connection = await pool.connect();
  try {
    await connection.query("begin");

    const call = async (input: unknown) => (await connection.query("select public.ysp_before_user_created($1::jsonb) as result", [JSON.stringify(input)])).rows[0].result;
    assert((await call(event("google", `unapproved-${email}`))).error);
    assert((await call(event("email"))).error, "Editable metadata must not bypass the provider check");

    await connection.query("update ysp_auth.google_enrollments set expires_at = now() - interval '1 minute' where email = $1", [email]);

    assert((await call(event())).error, "Expired enrollment must be blocked");

    await connection.query("update ysp_auth.google_enrollments set expires_at = now() + interval '10 minutes', account_id = $2 where email = $1", [email, crypto.randomUUID()]);

    assert((await call(event())).error, "A deleted YSP account must not authorize creation");

    await connection.query("update ysp_auth.google_enrollments set account_id = $2 where email = $1", [email, ids[0]]);

    assert.deepEqual(await call(event()), {});
    assert((await call(event())).error, "An enrollment must only work once");

    const linked = await connection.query("select account_id, provider_subject from external_auth_identities where provider_subject = $1", [subject]);
    assert.equal(linked.rows[0]?.account_id, ids[0]);
    assert.equal((await connection.query("select count(*)::int as n from ysp_auth.google_enrollments where email = $1", [email])).rows[0].n, 0);
    const permissions = await connection.query("select has_function_privilege('anon','public.ysp_before_user_created(jsonb)','execute') as anon, has_function_privilege('authenticated','public.ysp_before_user_created(jsonb)','execute') as authenticated, has_schema_privilege('anon','ysp_auth','usage') as schema_access");
    assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, schema_access: false });
    console.log("PASS: the actual hook blocks unapproved, expired, deleted-account and forged-metadata events; authorized Google creation binds the correct account exactly once");
    console.log("PASS: clients cannot execute the hook or access private enrollment data");
  } finally {
    await connection.query("rollback");
    connection.release();
  }

  const publicAuth = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const blockedEmail = `unapproved-${email}`;
  const signup = await publicAuth.auth.signUp({ email: blockedEmail, password: crypto.randomUUID() + "Aa1!", options: { data: { provider: "google", ysp_account_id: ids[0] } } });
  assert(signup.error, "Public signup unexpectedly succeeded");
  assert.equal((await pool.query("select count(*)::int as n from auth.users where email = $1", [blockedEmail])).rows[0].n, 0);
  assert.match(signup.error.message, /not authorized|YSP|signup/i);
  console.log("PASS: the live Supabase public signup endpoint rejects unauthorized registration without creating an Auth user");
} finally {
  await pool.query("delete from ysp_auth.google_enrollments where account_id = any($1::varchar[])", [ids]);
  await pool.query("delete from external_auth_identities where account_id = any($1::varchar[])", [ids]);
  await pool.query("delete from admin_users where id = any($1::varchar[])", [ids]);
  await pool.end();
  await new Promise<void>(resolve => server.close(() => resolve()));
  console.log("Temporary enrollment fixtures removed");
}
