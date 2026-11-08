import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import express from "express";
import { Pool } from "pg";
import { pool } from "../server/db";
import {
  registerNewsletterRoutes,
  syncNewsletterMembers,
  flushNewsletterMail,
} from "../server/newsletter";
import { renderNewsletterHtml } from "../shared/newsletter";

if (!pool) throw new Error("A database connection is required.");
const schema = `newsletter_test_${crypto.randomBytes(12).toString("hex")}`;
const admin = new Pool({ ...pool.options, max: 1 });
const env = { ...process.env };
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const sent: Array<{
  messageId: string;
  to: string;
  body: string;
  htmlBody: string;
}> = [];
let fail = false;
app.post("/mock-mail", (req, res) => {
  assert.equal(req.body.action, "newsletter_mail");
  if (fail) {
    res.json({ success: false });
    return;
  }
  sent.push(req.body);
  res.json({ success: true });
});
registerNewsletterRoutes(app, (req, res, next) => {
  if (req.headers["x-test-admin"] !== "test") {
    res.status(401).json({ error: "Admin required" });
    return;
  }
  next();
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
process.env.GOOGLE_APPS_SCRIPT_URL = `${origin}/mock-mail`;
process.env.COALITION_MAIL_SECRET = "mock-secret";
process.env.PUBLIC_SITE_URL = "https://example.invalid";
const req = (method: string, path: string, body?: unknown, auth = true) =>
  fetch(`${origin}/api/newsletter/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { "x-test-admin": "test" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const draft = {
  subject: "Community updates",
  previewText: "This month",
  content: "Hello!\nhttps://example.invalid/volunteer",
  requestId: crypto.randomUUID(),
};
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool.options.options = `-c search_path=${schema}`;
  await pool.query(`CREATE TABLE members(id uuid DEFAULT gen_random_uuid(), email text, newsletter_opt_in boolean);
    CREATE TABLE chapters(email text); CREATE TABLE chapter_officers(chapter_email text)`);
  if (process.argv.includes("--legacy")) {
    await pool.query(`CREATE TABLE newsletter_subscribers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL,normalized_email text NOT NULL UNIQUE,
      is_member boolean NOT NULL DEFAULT false,is_directory_email boolean NOT NULL DEFAULT false,
      matched_member_count integer NOT NULL DEFAULT 0,matched_officer_count integer NOT NULL DEFAULT 0,matched_chapter_count integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now(),last_subscribed_at timestamp NOT NULL DEFAULT now());
      INSERT INTO newsletter_subscribers(email,normalized_email) VALUES('Footer@Example.invalid','footer@example.invalid');
      CREATE TABLE newsletter_email_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subject text NOT NULL,preview_text text,content text NOT NULL,status text NOT NULL DEFAULT 'draft',recipient_count integer NOT NULL DEFAULT 0,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
      INSERT INTO newsletter_email_drafts(subject,content,status) VALUES('Legacy sent newsletter','Preserved content','sent')`);
  }
  assert.equal((await req("GET", "subscribers", undefined, false)).status, 401);
  assert.equal((await req("POST", "drafts", draft, false)).status, 401);
  assert.equal((await req("GET", "process", undefined, false)).status, 401);
  assert.equal(
    (await req("POST", "subscribe", { email: "invalid", consent: true }, false))
      .status,
    400,
  );
  assert.equal(
    (await req("POST", "subscribe", { email: "footer@example.invalid" }, false))
      .status,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        "subscribe",
        { email: " Footer@Example.invalid ", consent: true },
        false,
      )
    ).status,
    200,
  );
  await req(
    "POST",
    "subscribe",
    { email: "footer@example.invalid", consent: true },
    false,
  );
  await pool.query(`INSERT INTO members(email,newsletter_opt_in) VALUES ('member@example.invalid',true),('no-consent@example.invalid',false),('footer@example.invalid',true);
    INSERT INTO chapters(email) VALUES ('directory@example.invalid')`);
  const subscribers = await (await req("GET", "subscribers")).json();
  assert.equal(subscribers.length, 2);
  assert(!JSON.stringify(subscribers).includes("unsubscribeToken"));
  assert(
    subscribers.every(
      (s: { email: string }) => s.email !== "directory@example.invalid",
    ),
  );
  const {
    rows: [footer],
  } = await pool.query(
    "SELECT * FROM newsletter_subscribers WHERE email='footer@example.invalid'",
  );
  assert.equal(
    (
      await req(
        "GET",
        `unsubscribe?token=${footer.unsubscribe_token}`,
        undefined,
        false,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT status FROM newsletter_subscribers WHERE id=$1",
        [footer.id],
      )
    ).rows[0].status,
    "subscribed",
  );
  assert.equal(
    (
      await req(
        "POST",
        "unsubscribe",
        { token: footer.unsubscribe_token },
        false,
      )
    ).status,
    200,
  );
  await req("POST", "subscribe", { email: footer.email, consent: true }, false);
  await syncNewsletterMembers();
  assert.equal(
    (
      await pool.query(
        "SELECT status FROM newsletter_subscribers WHERE id=$1",
        [footer.id],
      )
    ).rows[0].status,
    "unsubscribed",
  );
  assert.equal(
    (await req("POST", "drafts", { ...draft, subject: "bad\nsubject" })).status,
    400,
  );
  const { id } = await (await req("POST", "drafts", draft)).json();
  assert.equal((await (await req("POST", "drafts", draft)).json()).id, id);
  const testRequest = {
    email: "test@example.invalid",
    requestId: crypto.randomUUID(),
  };
  assert.equal(
    (await req("POST", `drafts/${id}/test`, testRequest)).status,
    202,
  );
  await req("POST", `drafts/${id}/test`, testRequest);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM newsletter_deliveries"))
      .rows[0].n,
    1,
  );
  await flushNewsletterMail();
  assert.equal(sent.length, 1);
  assert(!sent[0].htmlBody.includes("unsubscribe?token="));
  assert.equal(
    (
      await req("PATCH", `drafts/${id}`, {
        ...draft,
        content: "Updated content",
      })
    ).status,
    200,
  );
  const queued = await Promise.all([
    req("POST", `drafts/${id}/send`),
    req("POST", `drafts/${id}/send`),
  ]);
  assert.deepEqual(queued.map((r) => r.status).sort(), [202, 409]);
  assert.equal((await req("PATCH", `drafts/${id}`, draft)).status, 409);
  assert.equal((await req("DELETE", `drafts/${id}`)).status, 409);
  await Promise.all([flushNewsletterMail(), flushNewsletterMail()]);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].to, "member@example.invalid");
  assert(sent[1].htmlBody.includes("unsubscribe?token="));
  assert.equal((await (await req("GET", "drafts")).json())[0].status, "sent");
  if (process.argv.includes("--legacy")) {
    const preserved = await pool.query(
      "SELECT status,content FROM newsletter_drafts WHERE subject='Legacy sent newsletter'",
    );
    assert.equal(preserved.rows[0].status, "sent");
    assert.equal(preserved.rows[0].content, "Preserved content");
  }
  // Opting out after queueing must suppress delivery.
  const second = await (
    await req("POST", "drafts", { ...draft, requestId: crypto.randomUUID() })
  ).json();
  await req("POST", `drafts/${second.id}/send`);
  const {
    rows: [member],
  } = await pool.query(
    "SELECT * FROM newsletter_subscribers WHERE email='member@example.invalid'",
  );
  await req("POST", "unsubscribe", { token: member.unsubscribe_token }, false);
  await flushNewsletterMail();
  assert.equal(sent.length, 2);
  assert.equal(
    (
      await pool.query(
        "SELECT status FROM newsletter_deliveries WHERE draft_id=$1",
        [second.id],
      )
    ).rows[0].status,
    "skipped",
  );
  // Retry, then eventual success retains the original message ID.
  const third = await (
    await req("POST", "drafts", { ...draft, requestId: crypto.randomUUID() })
  ).json();
  await req("POST", `drafts/${third.id}/test`, {
    email: "retry@example.invalid",
    requestId: crypto.randomUUID(),
  });
  fail = true;
  await flushNewsletterMail();
  assert.equal(
    (
      await pool.query(
        "SELECT attempts FROM newsletter_deliveries WHERE draft_id=$1",
        [third.id],
      )
    ).rows[0].attempts,
    1,
  );
  fail = false;
  await pool.query(
    "UPDATE newsletter_deliveries SET next_attempt_at=now() WHERE draft_id=$1",
    [third.id],
  );
  await flushNewsletterMail();
  assert.equal(sent.length, 3);
  await req("POST", `drafts/${third.id}/test`, {
    email: "expired@example.invalid",
    requestId: crypto.randomUUID(),
  });
  await pool.query(
    "UPDATE newsletter_deliveries SET created_at=now()-interval '25 hours' WHERE status='queued'",
  );
  await flushNewsletterMail();
  assert.equal(sent.length, 3);
  const html = renderNewsletterHtml({
    subject: "<script>alert(1)</script>",
    previewText: "",
    content: '<img onerror=alert(1)> https://example.invalid/?q="',
  });
  assert(!html.includes("<script>"));
  assert(!html.includes("<img onerror"));
  assert(html.includes("&lt;img"));
  // Exercise the actual Apps Script mail action with stubbed Google services.
  const properties: Record<string, string> = {};
  const bridgeSent: Array<{ htmlBody: string }> = [];
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => properties[key],
        setProperty: (key: string, value: string) => {
          properties[key] = value;
        },
        getProperties: () => properties,
        deleteProperty: (key: string) => {
          delete properties[key];
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
    },
    MailApp: {
      getRemainingDailyQuota: () => 10,
      sendEmail: (payload: { htmlBody: string }) => {
        bridgeSent.push(payload);
      },
    },
  });
  vm.runInContext(
    fs.readFileSync("scripts/google-drive-upload.gs", "utf8"),
    context,
  );
  context.testPayload = {
    action: "newsletter_mail",
    messageId: crypto.randomUUID(),
    to: "bridge@example.invalid",
    subject: "Newsletter",
    body: "Message",
    htmlBody: html,
  };
  assert.equal(
    vm.runInContext("sendCoalitionMail(testPayload).success", context),
    true,
  );
  assert.equal(
    vm.runInContext("sendCoalitionMail(testPayload).duplicate", context),
    true,
  );
  assert.equal(bridgeSent.length, 1);
  assert.equal(bridgeSent[0].htmlBody, html);
  // Newsletter preview and delivery retain the coalition email's branding.
  const coalitionHtml = vm.runInContext(
    'buildCoalitionEmailHtml_("Subject", "Message")',
    context,
  ) as string;
  for (const marker of [
    "images/ysp-logo.png",
    "images/mail/facebook.png",
    "images/mail/instagram.png",
    "images/mail/youtube.png",
    "Open YSP portal",
    "SEC Registration No. 2023010080782-00",
    "padding:28px 32px;background:#12334a",
    "max-width:600px",
  ]) {
    assert(coalitionHtml.includes(marker));
    assert(html.includes(marker));
  }
  assert(html.includes("NATIONAL NEWSLETTER"));
  assert(!html.includes("Keep your application link private"));
  assert.equal(
    (await req("GET", `drafts/${id}/deliveries`, undefined, false)).status,
    401,
  );
  assert.equal(
    (await (await req("GET", `drafts/${id}/deliveries`)).json()).length,
    2,
  );
  const security = await pool.query(
    "SELECT relrowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname LIKE 'newsletter_%' AND relkind='r'",
    [schema],
  );
  assert.equal(security.rowCount, process.argv.includes("--legacy") ? 6 : 5);
  assert(security.rows.every((r) => r.relrowsecurity));
  assert.equal((await req("POST", `drafts/${third.id}/send`)).status, 400);
  assert.equal((await req("DELETE", `drafts/${third.id}`)).status, 200);
  // Selected audiences must never silently fall back to all subscribers.
  await pool.query(`INSERT INTO newsletter_subscribers(email,normalized_email,source,status) VALUES
    ('chosen@example.invalid','chosen@example.invalid','footer','subscribed'),
    ('other@example.invalid','other@example.invalid','footer','subscribed'),
    ('optout@example.invalid','optout@example.invalid','footer','unsubscribed')`);
  const targeted = await (
    await req("POST", "drafts", { ...draft, requestId: crypto.randomUUID() })
  ).json();
  for (const recipientEmails of [
    [],
    ["unknown@example.invalid"],
    ["chosen@example.invalid", "optout@example.invalid"],
  ]) {
    assert.equal(
      (await req("POST", `drafts/${targeted.id}/send`, { recipientEmails }))
        .status,
      400,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM newsletter_deliveries WHERE draft_id=$1",
          [targeted.id],
        )
      ).rows[0].n,
      0,
    );
  }
  const targetedResponse = await req("POST", `drafts/${targeted.id}/send`, {
    recipientEmails: [" Chosen@Example.invalid ", "chosen@example.invalid"],
  });
  assert.equal(targetedResponse.status, 202);
  assert.equal((await targetedResponse.json()).recipientCount, 1);
  const targetRows = await pool.query(
    "SELECT recipient FROM newsletter_deliveries WHERE draft_id=$1",
    [targeted.id],
  );
  assert.deepEqual(targetRows.rows, [{ recipient: "chosen@example.invalid" }]);
  assert.equal(
    (
      await pool.query(
        "SELECT recipient_scope FROM newsletter_drafts WHERE id=$1",
        [targeted.id],
      )
    ).rows[0].recipient_scope,
    "selected_subscribers",
  );
  console.log(
    "Newsletter integration tests passed: consent, opt-outs, auth, drafts, idempotency, concurrency, delivery, retries, HTML safety and RLS. No real mail sent.",
  );
} finally {
  process.env.GOOGLE_APPS_SCRIPT_URL = env.GOOGLE_APPS_SCRIPT_URL;
  process.env.COALITION_MAIL_SECRET = env.COALITION_MAIL_SECRET;
  process.env.PUBLIC_SITE_URL = env.PUBLIC_SITE_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  if (!/^newsletter_test_[a-f0-9]{24}$/.test(schema))
    throw new Error("Invalid test schema");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
