import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { pool } from "../server/db";
import {
  registerCoalitionRoutes,
  ensureCoalitionInfrastructure,
} from "../server/coalition";
import { COALITION_NOTICE_VERSION } from "../shared/coalition";

const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const original = {
  secret: process.env.SESSION_SECRET,
  gas: process.env.GOOGLE_APPS_SCRIPT_URL,
  mail: process.env.COALITION_MAIL_SECRET,
};
process.env.SESSION_SECRET = crypto.randomUUID();
process.env.COALITION_MAIL_SECRET = crypto.randomUUID();
const authToken = crypto.randomUUID();
const sent: Array<{ messageId: string; body: string; to: string }> = [];
let mailFailure = false;
const app = express();
app.use(express.json());
app.post("/test-mail", (req, res) => {
  assert.equal(req.body.secret, process.env.COALITION_MAIL_SECRET);
  if (mailFailure) return res.json({ success: false });
  sent.push(req.body);
  res.json({ success: true });
});
registerCoalitionRoutes(app, (req, res, next) => {
  if (req.headers["x-test-admin"] !== authToken) {
    res.status(401).json({ error: "Admin access required" });
    return;
  }
  next();
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
process.env.GOOGLE_APPS_SCRIPT_URL = origin + "/test-mail";
const base = {
  requestId: ids[0],
  registrationType: "individual",
  fullName: "Coalition automated verification",
  email: "coalition-test@example.invalid",
  city: "Test City",
  province: "Test Province",
  privacyConsent: true,
  noticeVersion: COALITION_NOTICE_VERSION,
};
async function req(
  method: string,
  path: string,
  body?: unknown,
  admin = false,
  cookie?: string,
) {
  return fetch(origin + "/api/coalition/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(admin ? { "x-test-admin": authToken } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signup(body: unknown) {
  return req("POST", "registrations", body);
}
async function decide(id: string, status: string, message = "") {
  return req("PATCH", `registrations/${id}`, { status, message }, true);
}
try {
  await ensureCoalitionInfrastructure();
  for (const method of ["GET", "PATCH", "DELETE"])
    assert.equal(
      (
        await req(
          method,
          method === "GET" ? "registrations" : `registrations/${ids[0]}`,
          method === "PATCH" ? { status: "approved" } : undefined,
        )
      ).status,
      401,
    );
  for (const invalid of [
    { privacyConsent: false },
    { noticeVersion: "old" },
    { website: "spam" },
    { email: "invalid" },
  ])
    assert.equal((await signup({ ...base, ...invalid })).status, 400);
  const org = {
    ...base,
    requestId: ids[1],
    registrationType: "organization",
    organizationName: "Coalition test organization",
    organizationType: "Youth organization",
    representativeName: "Test Representative",
    representativePosition: "Coordinator",
    authorizedRepresentative: true,
    organizationLink: "https://example.invalid",
  };
  assert.equal(
    (await signup({ ...org, authorizedRepresentative: false })).status,
    400,
  );
  assert.equal(
    (await signup({ ...org, organizationLink: "javascript:alert(1)" })).status,
    400,
  );
  const initial = await signup(base);
  assert.equal(initial.status, 201);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  const receipt = await initial.json();
  assert.match(receipt.reference, /^YSC-[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.match(receipt.trackingToken, /^[a-f0-9]{64}$/);
  assert.equal(receipt.emailQueued, true);
  const orgReceipt = await (await signup(org)).json();
  assert.match(orgReceipt.reference, /^YSC-[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.equal((await signup(base)).status, 200);
  assert.equal(
    (
      await pool!.query(
        "SELECT count(*)::integer AS count FROM coalition_email_outbox WHERE registration_id=$1",
        [ids[0]],
      )
    ).rows[0].count,
    1,
    "Retry must not enqueue another email.",
  );
  assert.equal(
    (
      await pool!.query(
        "SELECT count(*)::integer AS count FROM coalition_registrations WHERE id=ANY($1::uuid[])",
        [ids],
      )
    ).rows[0].count,
    2,
  );
  assert.equal((await req("GET", "tracking/application")).status, 401);
  assert.equal(
    (
      await req("POST", "tracking/access", {
        reference: ids[1],
        token: receipt.trackingToken,
      })
    ).status,
    401,
    "A token cannot access another applicant.",
  );
  const access = await req("POST", "tracking/access", {
    reference: ids[0],
    token: receipt.trackingToken,
  });
  assert.equal(access.status, 200);
  const cookie = access.headers.get("set-cookie")!.split(";")[0];
  assert(access.headers.get("set-cookie")!.includes("HttpOnly"));
  let view = await (
    await req("GET", "tracking/application", undefined, false, cookie)
  ).json();
  assert.equal(view.reference, receipt.reference);
  assert.equal(view.status, "submitted");
  assert.equal(view.events.length, 1);
  assert(!("email" in view));
  assert.equal(
    (await decide(ids[0], "approved")).status,
    409,
    "Approval requires an initial review.",
  );
  assert.equal((await decide(ids[0], "under_review")).status, 200);
  assert.equal(
    (await decide(ids[0], "needs_information")).status,
    400,
    "An information request needs an explanation.",
  );
  assert.equal(
    (
      await decide(
        ids[0],
        "needs_information",
        "Please describe your community service interests.",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "POST",
        "tracking/action",
        { action: "respond", message: "Education and volunteer service." },
        false,
        cookie,
      )
    ).status,
    200,
  );
  view = await (
    await req("GET", "tracking/application", undefined, false, cookie)
  ).json();
  assert.equal(view.status, "under_review");
  assert(
    view.events.some(
      (e: { actor: string; message: string }) =>
        e.actor === "applicant" && e.message.includes("Education"),
    ),
  );
  assert.equal(
    (await decide(ids[0], "approved", "Welcome to the coalition.")).status,
    200,
  );
  assert.equal(
    (await decide(ids[0], "declined", "Invalid reversal.")).status,
    409,
  );
  assert.equal(
    (
      await req(
        "POST",
        "tracking/action",
        { action: "withdraw" },
        false,
        cookie,
      )
    ).status,
    200,
  );
  assert.equal((await decide(ids[0], "under_review")).status, 409);
  const list = await (
    await req("GET", "registrations?type=organization", undefined, true)
  ).json();
  assert(
    list.items.every(
      (r: { registrationType: string }) =>
        r.registrationType === "organization",
    ),
  );
  assert.equal(
    (await decide(ids[1], "declined", "Not eligible at this time.")).status,
    200,
  );
  assert.equal(
    (await decide(ids[1], "under_review", "Reconsideration requested.")).status,
    200,
  );
  const noMatch = await req("POST", "tracking/recover", {
    reference: ids[1],
    email: "different@example.invalid",
  });
  const noMatchBody = await noMatch.json();
  const recover = await req("POST", "tracking/recover", {
    reference: ids[1],
    email: base.email,
  });
  assert.deepEqual(
    await recover.json(),
    noMatchBody,
    "Recovery must not reveal whether a record exists.",
  );
  const recoveryMessage = (
    await pool!.query(
      "SELECT body FROM coalition_email_outbox WHERE registration_id=$1 ORDER BY created_at DESC LIMIT 1",
      [ids[1]],
    )
  ).rows[0].body as string;
  const recoveryToken = new URLSearchParams(
    recoveryMessage.split("#")[1].split("\n")[0],
  ).get("token")!;
  assert.equal(
    (
      await req("POST", "tracking/access", {
        reference: ids[1],
        token: recoveryToken,
      })
    ).status,
    200,
  );
  await pool!.query(
    "UPDATE coalition_tracking_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [crypto.createHash("sha256").update(recoveryToken).digest("hex")],
  );
  assert.equal(
    (
      await req("POST", "tracking/access", {
        reference: ids[1],
        token: recoveryToken,
      })
    ).status,
    401,
  );
  assert.equal(
    (await req("POST", "tracking/logout", {}, false, cookie)).status,
    200,
  );
  assert.equal(
    (await req("GET", "tracking/application", undefined, false, cookie)).status,
    401,
  );
  mailFailure = true;
  assert.equal(
    (await decide(ids[1], "approved", "Approved after review.")).status,
    200,
  );
  assert.equal(
    (
      await pool!.query(
        "SELECT count(*)::integer AS count FROM coalition_email_outbox WHERE registration_id=$1 AND sent_at IS NULL",
        [ids[1]],
      )
    ).rows[0].count,
    1,
  );
  mailFailure = false; // Retry only the test record, never real users' queued messages.
  await pool!.query(
    "UPDATE coalition_email_outbox SET next_attempt_at=now() WHERE registration_id=$1 AND sent_at IS NULL",
    [ids[1]],
  );
  const { flushCoalitionMail } = await import("../server/coalition-mail");
  await flushCoalitionMail(ids[1]);
  assert.equal(
    (
      await pool!.query(
        "SELECT count(*)::integer AS count FROM coalition_email_outbox WHERE registration_id=$1 AND sent_at IS NULL",
        [ids[1]],
      )
    ).rows[0].count,
    0,
  );
  await pool!.query(
    "UPDATE coalition_registrations SET created_at=now()-interval '13 months' WHERE id=$1",
    [ids[1]],
  );
  assert.equal((await decide(ids[1], "withdrawn")).status, 404);
  for (let i = 0; i < 7; i++) assert.equal((await signup(base)).status, 200);
  assert.equal((await signup({ ...base, requestId: ids[2] })).status, 429);
  assert.equal(
    (await req("DELETE", `registrations/${ids[0]}`, undefined, true)).status,
    200,
  );
  for (const table of [
    "coalition_events",
    "coalition_tracking_tokens",
    "coalition_email_outbox",
  ])
    assert.equal(
      (
        await pool!.query(
          `SELECT count(*)::integer AS count FROM ${table} WHERE registration_id=$1`,
          [ids[0]],
        )
      ).rows[0].count,
      0,
      "Deletion must remove related private records.",
    );
  const roles = await pool!.query(
    "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')",
  );
  for (const { rolname } of roles.rows) {
    for (const table of [
      "coalition_registrations",
      "coalition_submission_limits",
      "coalition_events",
      "coalition_tracking_tokens",
      "coalition_email_outbox",
    ]) {
      for (const statement of [
        `SELECT * FROM ${table} LIMIT 1`,
        `INSERT INTO ${table} DEFAULT VALUES`,
        `UPDATE ${table} SET ${table === "coalition_submission_limits" ? "attempts=0" : table === "coalition_tracking_tokens" ? "kind='session'" : table === "coalition_email_outbox" ? "attempts=0" : "status='submitted'"} WHERE false`,
        `DELETE FROM ${table} WHERE false`,
      ]) {
        const client = await pool!.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL ROLE ${rolname}`);
          await assert.rejects(
            client.query(statement),
            (e: { code: string }) => e.code === "42501",
          );
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      }
    }
  }
  console.log(
    "Passed: signup, consent, idempotency, all review transitions, applicant replies and withdrawal, private tracking sessions, cross-applicant denial, recovery privacy, token expiry, mocked GAS mail and outage retries, rate limits, cascade deletion, and all-operation public-role denial for all five tables.",
  );
} finally {
  await pool?.query(
    "DELETE FROM coalition_registrations WHERE id=ANY($1::uuid[])",
    [ids],
  );
  for (const category of ["signup", "access", "recovery", "applicant-action"]) {
    const key = crypto
      .createHmac("sha256", process.env.SESSION_SECRET!)
      .update(category + ":127.0.0.1")
      .digest("hex");
    await pool?.query("DELETE FROM coalition_submission_limits WHERE key=$1", [
      key,
    ]);
  }
  process.env.SESSION_SECRET = original.secret;
  process.env.GOOGLE_APPS_SCRIPT_URL = original.gas;
  process.env.COALITION_MAIL_SECRET = original.mail;
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  await pool?.end();
}
