import type { Express, RequestHandler } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { ensureNewsletterInfrastructure } from "./newsletter-infrastructure";
import {
  newsletterDraftSchema,
  newsletterEmailSchema,
  renderNewsletterHtml,
} from "../shared/newsletter";
import { coalitionMailConfigured } from "./coalition-mail";
import { sendNewsletterPreferencesPage } from "./newsletter-preferences-page";

const uuid = z.string().uuid();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const projection = `d.id, d.subject, d.preview_text AS "previewText", d.content, d.status,
  d.recipient_scope AS "recipientScope", d.recipient_count AS "recipientCount", d.created_at AS "createdAt", d.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM newsletter_deliveries n WHERE n.draft_id=d.id AND NOT n.is_test AND n.status='sent') AS "sentCount",
  (SELECT count(*)::int FROM newsletter_deliveries n WHERE n.draft_id=d.id AND NOT n.is_test AND n.status='failed') AS "failedCount",
  (SELECT count(*)::int FROM newsletter_deliveries n WHERE n.draft_id=d.id AND NOT n.is_test AND n.status='skipped') AS "skippedCount"`;

// An opt-out is authoritative: importing members never reactivates a subscription.
export async function syncNewsletterMembers() {
  await ensureNewsletterInfrastructure();
  await pool!
    .query(`INSERT INTO newsletter_subscribers(email, normalized_email, source)
    SELECT DISTINCT lower(trim(email)), lower(trim(email)), 'membership' FROM members
    WHERE newsletter_opt_in = true AND email IS NOT NULL AND trim(email) ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
    ON CONFLICT(email) DO NOTHING`);
}

function siteBase() {
  const url = new URL(
    process.env.PUBLIC_SITE_URL || "https://youthserviceph.org",
  );
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("PUBLIC_SITE_URL must use HTTPS.");
  return url.origin;
}

// Small batches fit the existing serverless execution limit. Row locks prevent
// concurrent workers from sending the same queued delivery.
export async function flushNewsletterMail(limit = 2) {
  await ensureNewsletterInfrastructure();
  if (!coalitionMailConfigured())
    throw new Error("Email delivery is not configured.");
  const client = await pool!.connect();
  let processed = 0;
  try {
    for (let i = 0; i < limit; i++) {
      await client.query("BEGIN");
      const {
        rows: [item],
      } =
        await client.query(`SELECT n.*, s.status AS subscription_status, s.unsubscribe_token
        FROM newsletter_deliveries n
        LEFT JOIN newsletter_subscribers s ON s.id=n.subscriber_id
        WHERE n.status='queued' AND n.held_at IS NULL AND n.next_attempt_at <= now()
        ORDER BY n.next_attempt_at, n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1`);
      if (!item) {
        await client.query("COMMIT");
        break;
      }
      if (!item.is_test && item.subscription_status !== "subscribed") {
        await client.query(
          "UPDATE newsletter_deliveries SET status='skipped' WHERE id=$1",
          [item.id],
        );
      } else if (Date.now() - new Date(item.created_at).getTime() >= 86400000) {
        // The current GAS bridge remembers message IDs for two days. Never retry
        // beyond that window, including a delayed cron or manual worker call.
        await client.query(
          "UPDATE newsletter_deliveries SET status='failed',last_error='Delivery window expired. Retry this delivery to queue a fresh copy.' WHERE id=$1",
          [item.id],
        );
      } else {
        try {
          const unsubscribe = item.is_test
            ? "This is a test email; no subscription was changed."
            : `Unsubscribe: ${siteBase()}/api/newsletter/unsubscribe?token=${item.unsubscribe_token}`;
          const body = `${item.is_test ? "[TEST EMAIL]\n\n" : ""}${item.preview_text ? item.preview_text + "\n\n" : ""}${item.content}\n\n—\nYouth Service Philippines\n${unsubscribe}`;
          const response = await fetch(process.env.GOOGLE_APPS_SCRIPT_URL!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "newsletter_mail",
              secret: process.env.COALITION_MAIL_SECRET,
              messageId: item.id,
              to: item.recipient,
              subject: item.subject,
              body,
              htmlBody: renderNewsletterHtml(
                {
                  subject: item.subject,
                  previewText: item.preview_text,
                  content: item.content,
                },
                item.is_test
                  ? undefined
                  : `${siteBase()}/api/newsletter/unsubscribe?token=${item.unsubscribe_token}`,
                item.is_test,
              ),
            }),
            signal: AbortSignal.timeout(8000),
          });
          const result = await response.json();
          if (!response.ok || !result.success)
            throw new Error("Email bridge rejected delivery.");
          await client.query(
            "UPDATE newsletter_deliveries SET status='sent',sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",
            [item.id],
          );
        } catch {
          await client.query(
            `UPDATE newsletter_deliveries SET attempts=attempts+1,
            status=CASE WHEN attempts+1 >= 12 THEN 'failed' ELSE 'queued' END,
            next_attempt_at=now()+interval '5 minutes', last_error='Delivery failed. Check mail configuration and daily quota.' WHERE id=$1`,
            [item.id],
          );
        }
      }
      await client.query("COMMIT");
      processed++;
    }
    await client.query(`UPDATE newsletter_drafts d SET status=CASE WHEN EXISTS
      (SELECT 1 FROM newsletter_deliveries n WHERE n.draft_id=d.id AND NOT n.is_test AND n.status='failed') THEN 'failed' ELSE 'sent' END, updated_at=now()
      WHERE d.status='queued' AND NOT EXISTS
      (SELECT 1 FROM newsletter_deliveries n WHERE n.draft_id=d.id AND NOT n.is_test AND n.status='queued')`);
    return { processed };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function registerNewsletterRoutes(
  app: Express,
  adminAuth: RequestHandler,
) {
  const ready: RequestHandler = async (_req, res, next) => {
    try {
      await ensureNewsletterInfrastructure();
      next();
    } catch (error) {
      console.error("[newsletter] initialization failed", error);
      res.status(503).json({ error: "Newsletter is temporarily unavailable." });
    }
  };
  const route =
    (handler: RequestHandler): RequestHandler =>
    async (req, res, next) => {
      try {
        await handler(req, res, next);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: error.issues[0]?.message || "Invalid details." });
          return;
        }
        console.error("[newsletter] request failed", error);
        res.status(500).json({
          error: "Unable to complete newsletter request. Please retry.",
        });
      }
    };
  app.use("/api/newsletter", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.post(
    "/api/newsletter/subscribe",
    ready,
    route(async (req, res) => {
      const { email, consent } = z
        .object({ email: newsletterEmailSchema, consent: z.literal(true) })
        .parse(req.body);
      const key = crypto
        .createHash("sha256")
        .update(req.ip || "unknown")
        .digest("hex");
      const {
        rows: [rate],
      } = await pool!.query(
        `INSERT INTO newsletter_subscription_limits(key, attempts) VALUES($1,1)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN newsletter_subscription_limits.window_start < now()-interval '1 hour' THEN 1 ELSE newsletter_subscription_limits.attempts+1 END,
      window_start=CASE WHEN newsletter_subscription_limits.window_start < now()-interval '1 hour' THEN now() ELSE newsletter_subscription_limits.window_start END RETURNING attempts`,
        [key],
      );
      if (rate.attempts > 10) {
        res.status(429).json({
          error: "Too many subscription attempts. Please try again later.",
        });
        return;
      }
      await pool!.query(
        "DELETE FROM newsletter_subscription_limits WHERE window_start < now()-interval '1 day'",
      );
      // Explicit consent restores the same identity and its delivery history.
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const {
          rows: [existing],
        } = await client.query(
          "SELECT id,status,deleted_at FROM newsletter_subscribers WHERE email=$1 FOR UPDATE",
          [email],
        );
        if (
          existing &&
          (existing.status !== "subscribed" || existing.deleted_at)
        ) {
          await client.query(
            `UPDATE newsletter_deliveries SET status='skipped',held_at=NULL,last_error='Earlier queued delivery cancelled when subscription was renewed.' WHERE recipient=$1 AND status='queued'`,
            [email],
          );
        }
        await client.query(
          `INSERT INTO newsletter_subscribers(email,normalized_email,source) VALUES($1,$1,'footer')
        ON CONFLICT(email) DO UPDATE SET status='subscribed',deleted_at=NULL,unsubscribed_at=NULL,
        source='footer',consent_version='newsletter-v1',last_subscribed_at=now(),updated_at=now()`,
          [email],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      res.json({
        status: "subscribed",
        message:
          "Your email is subscribed to Youth Service Philippines newsletter updates.",
      });
    }),
  );
  app.get(
    "/api/newsletter/unsubscribe",
    ready,
    route(async (req, res) => {
      const parsed = tokenSchema.safeParse(req.query.token);
      if (!parsed.success) {
        sendNewsletterPreferencesPage(res, "invalid");
        return;
      }
      sendNewsletterPreferencesPage(res, "confirm", parsed.data);
    }),
  );
  app.post(
    "/api/newsletter/unsubscribe",
    ready,
    route(async (req, res) => {
      const parsed = tokenSchema.safeParse(req.body?.token);
      if (!parsed.success) {
        sendNewsletterPreferencesPage(res, "invalid");
        return;
      }
      const result = await pool!.query(
        `UPDATE newsletter_subscribers SET status='unsubscribed',unsubscribed_at=now(),updated_at=now() WHERE unsubscribe_token=$1`,
        [parsed.data],
      );
      sendNewsletterPreferencesPage(res, result.rowCount ? "success" : "invalid");
    }),
  );
  app.get(
    "/api/newsletter/subscribers",
    adminAuth,
    ready,
    route(async (_req, res) => {
      await syncNewsletterMembers();
      const result = await pool!
        .query(`SELECT s.id,s.email,s.status,s.source,s.created_at AS "createdAt",s.updated_at AS "updatedAt",s.last_subscribed_at AS "lastSubscribedAt",
      EXISTS(SELECT 1 FROM members m WHERE lower(trim(m.email))=s.email) AS "isMember",
      (EXISTS(SELECT 1 FROM chapters c WHERE lower(trim(c.email))=s.email) OR EXISTS(SELECT 1 FROM chapter_officers o WHERE lower(trim(o.chapter_email))=s.email)) AS "isDirectoryEmail"
      FROM newsletter_subscribers s WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC`);
      res.json(result.rows);
    }),
  );
  app.get(
    "/api/newsletter/subscribers/:id",
    adminAuth,
    ready,
    route(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .parse(req.query.page || 0);
      const {
        rows: [subscriber],
      } = await pool!.query(
        `SELECT id,email,status,source,last_subscribed_at AS "lastSubscribedAt"
        FROM newsletter_subscribers WHERE id=$1 AND deleted_at IS NULL`,
        [id],
      );
      if (!subscriber) {
        res.status(404).json({ error: "Subscriber not found." });
        return;
      }
      const result = await pool!.query(
        `SELECT id,subject,preview_text AS "previewText",content,status,is_test AS "isTest",
        attempts,last_error AS "lastError",created_at AS "createdAt",sent_at AS "sentAt",
        next_attempt_at AS "nextAttemptAt",held_at AS "heldAt",resend_of AS "resendOf"
        FROM newsletter_deliveries WHERE recipient=$1
        ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $2`,
        [subscriber.email, page * 50],
      );
      res.json({
        subscriber,
        deliveries: result.rows.slice(0, 50),
        hasMore: result.rows.length > 50,
      });
    }),
  );
  app.delete(
    "/api/newsletter/subscribers/:id",
    adminAuth,
    ready,
    route(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const email = z.string().parse(req.body.email);
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const {
          rows: [subscriber],
        } = await client.query(
          "SELECT email FROM newsletter_subscribers WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [id],
        );
        if (!subscriber) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Subscriber not found." });
          return;
        }
        if (email !== subscriber.email) {
          await client.query("ROLLBACK");
          res
            .status(400)
            .json({
              error: "Type the subscriber's email exactly to delete them.",
            });
          return;
        }
        await client.query(
          `UPDATE newsletter_subscribers SET deleted_at=now(),status='unsubscribed',unsubscribed_at=now(),updated_at=now() WHERE id=$1`,
          [id],
        );
        await client.query(
          `UPDATE newsletter_deliveries SET status='skipped',held_at=NULL,last_error='Subscriber deleted by an administrator.'
          WHERE recipient=$1 AND status='queued'`,
          [subscriber.email],
        );
        await client.query("COMMIT");
        res.json({ success: true });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }),
  );
  app.post(
    "/api/newsletter/subscribers/:id/deliveries/:deliveryId/action",
    adminAuth,
    ready,
    route(async (req, res) => {
      const id = uuid.parse(req.params.id),
        deliveryId = uuid.parse(req.params.deliveryId);
      const { action, requestId } = z
        .object({
          action: z.enum(["hold", "resume", "retry", "resend"]),
          requestId: uuid,
        })
        .parse(req.body);
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const {
          rows: [subscriber],
        } = await client.query(
          "SELECT * FROM newsletter_subscribers WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [id],
        );
        if (!subscriber || subscriber.status !== "subscribed") {
          await client.query("ROLLBACK");
          res
            .status(409)
            .json({ error: "Delivery controls require an active subscriber." });
          return;
        }
        const {
          rows: [delivery],
        } = await client.query(
          "SELECT * FROM newsletter_deliveries WHERE id=$1 AND recipient=$2 FOR UPDATE",
          [deliveryId, subscriber.email],
        );
        if (!delivery) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Delivery not found." });
          return;
        }
        const repeated = await client.query(
          "SELECT id FROM newsletter_deliveries WHERE id=$1 AND resend_of=$2 AND recipient=$3",
          [requestId, deliveryId, subscriber.email],
        );
        if (repeated.rowCount) {
          await client.query("COMMIT");
          res.status(202).json({ success: true });
          return;
        }
        if (action === "hold" || action === "resume") {
          if (delivery.status !== "queued") {
            await client.query("ROLLBACK");
            res
              .status(409)
              .json({
                error: "Only queued deliveries can be held or resumed.",
              });
            return;
          }
          await client.query(
            `UPDATE newsletter_deliveries SET held_at=CASE WHEN $2 THEN coalesce(held_at,now()) ELSE NULL END,
            next_attempt_at=CASE WHEN $2 THEN next_attempt_at ELSE now() END WHERE id=$1`,
            [deliveryId, action === "hold"],
          );
        } else {
          if (
            (action === "retry" &&
              delivery.status !== "failed" &&
              delivery.status !== "queued") ||
            (action === "resend" && delivery.status !== "sent")
          ) {
            await client.query("ROLLBACK");
            res
              .status(409)
              .json({
                error: "This delivery has changed. Refresh and try again.",
              });
            return;
          }
          // Keep the bridge message ID for retries inside its safe deduplication
          // window. An explicit resend or expired retry gets a new history entry.
          const expired =
            Date.now() - new Date(delivery.created_at).getTime() >= 86400000;
          if (action === "resend" || expired) {
            await client.query(
              `INSERT INTO newsletter_deliveries(id,draft_id,subscriber_id,recipient,is_test,subject,preview_text,content,resend_of)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
              [
                requestId,
                delivery.draft_id,
                subscriber.id,
                subscriber.email,
                delivery.is_test,
                delivery.subject,
                delivery.preview_text,
                delivery.content,
                delivery.id,
              ],
            );
            if (delivery.status === "queued")
              await client.query(
                "UPDATE newsletter_deliveries SET status='skipped',held_at=NULL,last_error='Replaced by an administrator retry.' WHERE id=$1",
                [deliveryId],
              );
          } else {
            await client.query(
              "UPDATE newsletter_deliveries SET status='queued',held_at=NULL,next_attempt_at=now() WHERE id=$1",
              [deliveryId],
            );
          }
          if (!delivery.is_test)
            await client.query(
              "UPDATE newsletter_drafts SET status='queued',updated_at=now() WHERE id=$1",
              [delivery.draft_id],
            );
        }
        await client.query("COMMIT");
        res.status(202).json({ success: true });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }),
  );
  app.get(
    "/api/newsletter/status",
    adminAuth,
    ready,
    route(async (_req, res) => {
      const {
        rows: [counts],
      } = await pool!.query(
        `SELECT count(*) FILTER(WHERE status='queued' AND held_at IS NULL)::int AS pending,
        count(*) FILTER(WHERE status='queued' AND held_at IS NOT NULL)::int AS held,
        count(*) FILTER(WHERE status='failed')::int AS failed FROM newsletter_deliveries`,
      );
      res.json({
        configured: coalitionMailConfigured(),
        automaticProcessing: process.env.NEWSLETTER_WORKER_ENABLED === "true",
        ...counts,
      });
    }),
  );
  app.get(
    "/api/newsletter/drafts",
    adminAuth,
    ready,
    route(async (_req, res) => {
      res.json(
        (
          await pool!.query(
            `SELECT ${projection} FROM newsletter_drafts d ORDER BY d.created_at DESC LIMIT 100`,
          )
        ).rows,
      );
    }),
  );
  app.post(
    "/api/newsletter/drafts",
    adminAuth,
    ready,
    route(async (req, res) => {
      const draft = newsletterDraftSchema.parse(req.body);
      const requestId = uuid.parse(req.body.requestId);
      const {
        rows: [saved],
      } = await pool!.query(
        "INSERT INTO newsletter_drafts(id,subject,preview_text,content) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING id",
        [requestId, draft.subject, draft.previewText, draft.content],
      );
      res.status(201).json(saved);
    }),
  );
  app.get(
    "/api/newsletter/drafts/:id/deliveries",
    adminAuth,
    ready,
    route(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const result = await pool!.query(
        `SELECT id,recipient,status,is_test AS "isTest",attempts,last_error AS "lastError",sent_at AS "sentAt"
      FROM newsletter_deliveries WHERE draft_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,
        [id],
      );
      res.json(result.rows);
    }),
  );
  app.patch(
    "/api/newsletter/drafts/:id",
    adminAuth,
    ready,
    route(async (req, res) => {
      const id = uuid.parse(req.params.id),
        draft = newsletterDraftSchema.parse(req.body);
      const result = await pool!.query(
        `UPDATE newsletter_drafts SET subject=$2,preview_text=$3,content=$4,updated_at=now() WHERE id=$1 AND status='draft'
      AND NOT EXISTS(SELECT 1 FROM newsletter_deliveries WHERE draft_id=$1 AND is_test AND status='queued') RETURNING id`,
        [id, draft.subject, draft.previewText, draft.content],
      );
      res.status(result.rowCount ? 200 : 409).json(
        result.rows[0] || {
          error: "Only unsent drafts without pending tests can be edited.",
        },
      );
    }),
  );
  app.delete(
    "/api/newsletter/drafts/:id",
    adminAuth,
    ready,
    route(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const result = await pool!.query(
        "DELETE FROM newsletter_drafts WHERE id=$1 AND status='draft' RETURNING id",
        [id],
      );
      res
        .status(result.rowCount ? 200 : 409)
        .json(
          result.rows[0] || { error: "Only unsent drafts can be deleted." },
        );
    }),
  );
  app.post(
    "/api/newsletter/drafts/:id/test",
    adminAuth,
    ready,
    route(async (req, res) => {
      if (!coalitionMailConfigured()) {
        res
          .status(503)
          .json({ error: "Configure email delivery before sending a test." });
        return;
      }
      const id = uuid.parse(req.params.id),
        email = newsletterEmailSchema.parse(req.body.email),
        requestId = uuid.parse(req.body.requestId);
      const result = await pool!.query(
        `INSERT INTO newsletter_deliveries(id,draft_id,recipient,is_test,subject,preview_text,content)
      SELECT $3,id,$2,true,subject,preview_text,content FROM newsletter_drafts WHERE id=$1
      ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING id`,
        [id, email, requestId],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      res.status(202).json({
        message:
          "Test queued. Process the queue or wait for automatic delivery.",
      });
    }),
  );
  app.post(
    "/api/newsletter/drafts/:id/send",
    adminAuth,
    ready,
    route(async (req, res) => {
      if (!coalitionMailConfigured()) {
        res
          .status(503)
          .json({ error: "Configure email delivery before sending." });
        return;
      }
      const id = uuid.parse(req.params.id);
      const audience = z
        .object({
          recipientEmails: z
            .array(newsletterEmailSchema)
            .min(1)
            .max(1000)
            .optional(),
        })
        .parse(req.body || {});
      const recipientEmails = audience.recipientEmails
        ? Array.from(new Set(audience.recipientEmails))
        : null;
      await syncNewsletterMembers();
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const {
          rows: [draft],
        } = await client.query(
          "SELECT * FROM newsletter_drafts WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!draft || draft.status !== "draft") {
          await client.query("ROLLBACK");
          res.status(409).json({
            error: "This campaign has already been queued or is unavailable.",
          });
          return;
        }
        const queued = await client.query(
          `INSERT INTO newsletter_deliveries(draft_id,subscriber_id,recipient,subject,preview_text,content)
        SELECT $1,id,email,$2,$3,$4 FROM newsletter_subscribers WHERE status='subscribed'
        AND ($5::text[] IS NULL OR email=ANY($5::text[])) ON CONFLICT DO NOTHING`,
          [
            id,
            draft.subject,
            draft.preview_text,
            draft.content,
            recipientEmails,
          ],
        );
        if (recipientEmails && queued.rowCount !== recipientEmails.length) {
          await client.query("ROLLBACK");
          res.status(400).json({
            error:
              "One or more selected emails are unavailable or unsubscribed. Refresh your subscriber list and try again.",
          });
          return;
        }
        if (!queued.rowCount) {
          await client.query("ROLLBACK");
          res
            .status(400)
            .json({ error: "There are no subscribed recipients." });
          return;
        }
        await client.query(
          "UPDATE newsletter_drafts SET status='queued',recipient_count=$2,recipient_scope=$3,updated_at=now() WHERE id=$1",
          [
            id,
            queued.rowCount,
            recipientEmails ? "selected_subscribers" : "all_subscribers",
          ],
        );
        await client.query("COMMIT");
        res.status(202).json({ recipientCount: queued.rowCount });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }),
  );
  app.post(
    "/api/newsletter/process",
    adminAuth,
    ready,
    route(async (_req, res) => {
      res.json(await flushNewsletterMail());
    }),
  );
  app.get(
    "/api/newsletter/process",
    route(async (req, res) => {
      const secret = process.env.CRON_SECRET;
      const expected = Buffer.from(`Bearer ${secret || ""}`),
        actual = Buffer.from(req.headers.authorization || "");
      if (
        !secret ||
        expected.length !== actual.length ||
        !crypto.timingSafeEqual(expected, actual)
      ) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      res.json(await flushNewsletterMail());
    }),
  );
}
