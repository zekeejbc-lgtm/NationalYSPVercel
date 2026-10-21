import type { Express, Request, Response, RequestHandler } from "express";
import type { PoolClient } from "pg";
import crypto from "node:crypto";
import multer from "multer";
import { z } from "zod";
import { pool } from "./db";
import {
  coalitionSignupSchema,
  coalitionStatusSchema,
  COALITION_RETENTION_MONTHS,
  COALITION_TRANSITIONS,
  COALITION_STATUS_LABELS,
  COALITION_CERTIFICATE_MAX_BYTES,
} from "@shared/coalition";
import { ensureCoalitionInfrastructure } from "./coalition-infrastructure";
import { coalitionMailConfigured, flushCoalitionMail } from "./coalition-mail";
export { ensureCoalitionInfrastructure } from "./coalition-infrastructure";

const retained = `created_at > now() - interval '${COALITION_RETENTION_MONTHS} months'`;
const projection = `id, reference_code AS "referenceCode", registration_type AS "registrationType", full_name AS "fullName", organization_name AS "organizationName",
  organization_type AS "organizationType", representative_name AS "representativeName", representative_position AS "representativePosition",
  organization_link AS "organizationLink", email, contact_number AS "contactNumber", city, province,
  yorp_status AS "yorpStatus", yorp_registration_number AS "yorpRegistrationNumber",
  other_registrations AS "otherRegistrations", other_registration_details AS "otherRegistrationDetails",
  EXISTS (SELECT 1 FROM coalition_documents d WHERE d.registration_id=coalition_registrations.id) AS "hasYorpCertificate",
  notice_version AS "noticeVersion", consented_at AS "consentedAt", status, created_at AS "createdAt", updated_at AS "updatedAt"`;
const uuid = z.string().uuid();
const certificateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COALITION_CERTIFICATE_MAX_BYTES, files: 1, fields: 1, fieldSize: 32768, parts: 3 },
}).single("yorpCertificate");
const parseSignup: RequestHandler = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();
  certificateUpload(req, res, (error) => {
    if (error) return res.status(400).json({ error: "Upload one PDF, JPG, or PNG certificate up to 3 MB." });
    try {
      req.body = JSON.parse(req.body.data);
      next();
    } catch {
      res.status(400).json({ error: "Invalid registration details." });
    }
  });
};
export function certificateMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  return null;
}
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function newReferenceCode() {
  const bytes = crypto.randomBytes(16);
  let value = "";
  for (let index = 0; index < bytes.length; index += 1)
    value += REFERENCE_ALPHABET[bytes[index] % REFERENCE_ALPHABET.length];
  return `YSC-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`;
}
async function backfillReferenceCodes() {
  if (referenceBackfillDone) return;
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query(
      "SELECT id FROM coalition_registrations WHERE reference_code IS NULL OR reference_code !~ '^YSC-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$' LIMIT 100 FOR UPDATE SKIP LOCKED",
    );
    for (const row of rows.rows) {
      let assigned = false;
      for (let attempt = 0; attempt < 5 && !assigned; attempt += 1) {
        try {
          await client.query(
            "UPDATE coalition_registrations SET reference_code=$2 WHERE id=$1",
            [row.id, newReferenceCode()],
          );
          assigned = true;
        } catch (error) {
          if ((error as { code?: string }).code !== "23505") throw error;
        }
      }
      if (!assigned)
        throw new Error("Unable to create a unique application reference.");
    }
    await client.query("COMMIT");
    referenceBackfillDone = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
const trackingCookie = "ysp_coalition_tracking";
let lastCleanup = 0;
let referenceBackfillDone = false;
async function ready() {
  // Vercel instances should use the schema provisioned by the deployment
  // migration. Running DDL, backfills, and retention cleanup in a user-facing
  // request makes cold starts exceed the function timeout.
  if (process.env.VERCEL === "1" && process.env.RUN_STARTUP_SCHEMA_SETUP !== "true") return;
  await ensureCoalitionInfrastructure();
  await backfillReferenceCodes();
  if (Date.now() - lastCleanup < 3600000) return;
  await pool!.query(
    `DELETE FROM coalition_registrations WHERE NOT (${retained})`,
  );
  await pool!.query(
    `DELETE FROM coalition_tracking_tokens WHERE expires_at <= now()`,
  );
  await pool!.query(
    `DELETE FROM coalition_submission_limits WHERE window_start < now() - interval '1 hour'`,
  );
  lastCleanup = Date.now();
}
async function limited(req: Request, category: string, maximum: number) {
  const key = crypto
    .createHmac(
      "sha256",
      process.env.SESSION_SECRET || "coalition-abuse-protection",
    )
    .update(category + ":" + (req.ip || "unknown"))
    .digest("hex");
  const result = await pool!.query(
    `INSERT INTO coalition_submission_limits (key, attempts) VALUES ($1,1)
    ON CONFLICT (key) DO UPDATE SET
    attempts = CASE WHEN coalition_submission_limits.window_start < now() - interval '1 hour' THEN 1 ELSE coalition_submission_limits.attempts + 1 END,
    window_start = CASE WHEN coalition_submission_limits.window_start < now() - interval '1 hour' THEN now() ELSE coalition_submission_limits.window_start END RETURNING attempts`,
    [key],
  );
  return result.rows[0].attempts > maximum;
}
function failure(res: Response, action: string, error: unknown) {
  console.error(`[coalition] ${action} failed`, {
    code: (error as { code?: string }).code,
  });
  return res.status(503).json({
    error: `Unable to ${action} right now. Please retry.`,
    code: "COALITION_UNAVAILABLE",
  });
}
async function accessToken(
  client: PoolClient,
  id: string,
  minutes = 7 * 24 * 60,
) {
  const token = crypto.randomBytes(32).toString("hex");
  await client.query(
    `INSERT INTO coalition_tracking_tokens (token_hash, registration_id, kind, expires_at) VALUES ($1,$2,'access',now() + $3 * interval '1 minute')`,
    [hash(token), id, minutes],
  );
  return token;
}
function trackingLink(reference: string, token: string) {
  const origin = (
    process.env.PUBLIC_SITE_URL || "https://youthserviceph.org"
  ).replace(/\/$/, "");
  return `${origin}/coalition-track#reference=${reference}&token=${token}`;
}
async function queueMail(
  client: PoolClient,
  record: {
    id: string;
    reference_code?: string;
    email: string;
    status: keyof typeof COALITION_STATUS_LABELS;
  },
  message: string,
  token?: string,
) {
  const secret = token || (await accessToken(client, record.id));
  await client.query(
    `INSERT INTO coalition_email_outbox (registration_id,recipient,subject,body) VALUES ($1,$2,$3,$4)`,
    [
      record.id,
      record.email,
      "Youth Service Coalition — " + COALITION_STATUS_LABELS[record.status],
      `Your coalition application is ${COALITION_STATUS_LABELS[record.status].toLowerCase()}.\n\n${message}\n\nReference: ${record.reference_code || record.id}\n\nView your private progress page (link expires in 7 days):\n${trackingLink(record.reference_code || record.id, secret)}\n\nKeep this link private. National administrators handle application decisions.\nYouth Service Philippines`,
    ],
  );
}
async function delivery(id?: string) {
  try {
    await flushCoalitionMail(id);
  } catch {
    /* A saved application must survive a mail provider outage. */
  }
}
async function event(
  client: PoolClient,
  id: string,
  status: string,
  message: string,
  actor: string,
  actorId?: string,
) {
  await client.query(
    `INSERT INTO coalition_events (registration_id,status,message,actor,actor_id) VALUES ($1,$2,$3,$4,$5)`,
    [id, status, message, actor, actorId || null],
  );
}
async function trackingRecord(req: Request) {
  const raw =
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(trackingCookie + "="))
      ?.slice(trackingCookie.length + 1) || "";
  if (!tokenSchema.safeParse(raw).success) return null;
  const result = await pool!.query(
    `SELECT r.* FROM coalition_registrations r JOIN coalition_tracking_tokens t ON t.registration_id = r.id WHERE t.token_hash=$1 AND t.kind='session' AND t.expires_at > now() AND r.${retained}`,
    [hash(raw)],
  );
  return result.rows[0] || null;
}
async function events(id: string) {
  return (
    await pool!.query(
      `SELECT id,status,message,actor,created_at AS "createdAt" FROM coalition_events WHERE registration_id=$1 ORDER BY created_at,id`,
      [id],
    )
  ).rows;
}

export function registerCoalitionRoutes(
  app: Express,
  adminAuth: RequestHandler,
) {
  app.use("/api/coalition", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.post("/api/coalition/registrations", parseSignup, async (req, res) => {
    const parsed = coalitionSignupSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    const certificateMime = req.file ? certificateMimeType(req.file.buffer) : null;
    if (req.file && (parsed.data.registrationType !== "organization" || parsed.data.yorpStatus !== "registered" || !certificateMime || req.file.mimetype !== certificateMime))
      return res.status(400).json({ error: "Only YORP-registered organizations may upload a PDF, JPG, or PNG certificate." });
    let client: PoolClient | undefined;
    try {
      await ready();
      if (await limited(req, "signup", 10))
        return res.status(429).set("Retry-After", "3600").json({
          error: "Too many submissions. Please try again in an hour.",
        });
      client = await pool!.connect();
      await client.query("BEGIN");
      const d = parsed.data,
        org = d.registrationType === "organization" ? d : null;
      const referenceCode = newReferenceCode();
      const result = await client.query(
        `INSERT INTO coalition_registrations (id,reference_code,registration_type,full_name,organization_name,organization_type,representative_name,representative_position,organization_link,email,contact_number,city,province,privacy_consent,authorized_representative,notice_version,yorp_status,yorp_registration_number,other_registrations,other_registration_details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15,$16,$17,$18,$19) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [
          d.requestId,
          referenceCode,
          d.registrationType,
          d.registrationType === "individual" ? d.fullName : null,
          org?.organizationName || null,
          org?.organizationType || null,
          org?.representativeName || null,
          org?.representativePosition || null,
          org?.organizationLink || null,
          d.email,
          d.contactNumber,
          d.city,
          d.province,
          !!org,
          d.noticeVersion,
          org?.yorpStatus || null,
          org?.yorpRegistrationNumber || null,
          org?.otherRegistrations || [],
          org?.otherRegistrationDetails || null,
        ],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        const existing = await pool!.query(
          "SELECT reference_code FROM coalition_registrations WHERE id=$1",
          [d.requestId],
        );
        return res.status(200).json({
          reference: existing.rows[0]?.reference_code || d.requestId,
          alreadyReceived: true,
        });
      }
      if (req.file) {
        await client.query(
          "INSERT INTO coalition_documents (registration_id,mime_type,contents) VALUES ($1,$2,$3)",
          [d.requestId, certificateMime, req.file.buffer],
        );
      }
      const token = await accessToken(client, d.requestId);
      await event(
        client,
        d.requestId,
        "submitted",
        "Application received. National administrators will review your application.",
        "system",
      );
      await queueMail(
        client,
        {
          id: d.requestId,
          reference_code: referenceCode,
          email: d.email,
          status: "submitted",
        },
        "Your application has been received.",
        token,
      );
      await client.query("COMMIT");
      client.release();
      client = undefined;
      await delivery(d.requestId);
      return res.status(201).json({
        reference: referenceCode,
        referenceCode,
        trackingToken: token,
        emailQueued: true,
      });
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      return failure(res, "save your application", error);
    } finally {
      client?.release();
    }
  });
  app.get("/api/coalition/registrations/:id/certificate", adminAuth, async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: "Invalid reference." });
    try {
      await ready();
      const result = await pool!.query(
        `SELECT d.mime_type,d.contents FROM coalition_documents d JOIN coalition_registrations r ON r.id=d.registration_id WHERE r.id=$1 AND r.${retained}`,
        [req.params.id],
      );
      const document = result.rows[0];
      if (!document) return res.status(404).json({ error: "Certificate not found." });
      const extension = document.mime_type === "application/pdf" ? "pdf" : document.mime_type === "image/png" ? "png" : "jpg";
      res.set("Content-Type", document.mime_type);
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Disposition", `attachment; filename="yorp-certificate.${extension}"`);
      res.send(document.contents);
    } catch (error) {
      return failure(res, "load the certificate", error);
    }
  });
  app.get("/api/coalition/registrations", adminAuth, async (req, res) => {
    try {
      await ready();
      const page = Math.max(
        1,
        Math.min(
          100000,
          Number.parseInt(String(req.query.page || "1"), 10) || 1,
        ),
      );
      const type =
        req.query.type === "individual" || req.query.type === "organization"
          ? req.query.type
          : null;
      const where = `${retained} AND ($1::text IS NULL OR registration_type=$1)`;
      const count = await pool!.query(
        `SELECT count(*)::integer AS total FROM coalition_registrations WHERE ${where}`,
        [type],
      );
      const rows = await pool!.query(
        `SELECT ${projection} FROM coalition_registrations WHERE ${where} ORDER BY created_at DESC,id LIMIT 50 OFFSET $2`,
        [type, (page - 1) * 50],
      );
      const pending = await pool!.query(
        "SELECT count(*)::integer AS count FROM coalition_email_outbox WHERE sent_at IS NULL",
      );
      res.json({
        items: rows.rows,
        total: count.rows[0].total,
        page,
        emailConfigured: coalitionMailConfigured(),
        pendingEmails: pending.rows[0].count,
      });
    } catch (error) {
      return failure(res, "load coalition applications", error);
    }
  });
  app.get(
    "/api/coalition/registrations/:id/events",
    adminAuth,
    async (req, res) => {
      if (!uuid.safeParse(req.params.id).success)
        return res.status(400).json({ error: "Invalid reference." });
      try {
        await ready();
        const row = await pool!.query(
          `SELECT id FROM coalition_registrations WHERE id=$1 AND ${retained}`,
          [req.params.id],
        );
        if (!row.rowCount)
          return res.status(404).json({ error: "Application not found." });
        res.json(await events(req.params.id));
      } catch (error) {
        return failure(res, "load application history", error);
      }
    },
  );
  app.patch("/api/coalition/registrations/:id", adminAuth, async (req, res) => {
    const status = coalitionStatusSchema.safeParse(req.body.status);
    const message = z
      .string()
      .trim()
      .max(2000)
      .safeParse(req.body.message || "");
    if (
      !uuid.safeParse(req.params.id).success ||
      !status.success ||
      !message.success
    )
      return res.status(400).json({ error: "Invalid decision or reference." });
    if (
      ["declined", "needs_information"].includes(status.data) &&
      message.data.length < 5
    )
      return res.status(400).json({
        error:
          "Please include a message explaining the decision or information needed.",
      });
    let client: PoolClient | undefined;
    try {
      await ready();
      client = await pool!.connect();
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT * FROM coalition_registrations WHERE id=$1 AND ${retained} FOR UPDATE`,
        [req.params.id],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Application not found." });
      }
      if (
        !COALITION_TRANSITIONS[
          row.status as keyof typeof COALITION_TRANSITIONS
        ]?.includes(status.data)
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error:
            "This status change is not allowed. Refresh the application and review its current status.",
        });
      }
      await client.query(
        "UPDATE coalition_registrations SET status=$2,updated_at=now() WHERE id=$1",
        [row.id, status.data],
      );
      const text =
        message.data ||
        `National administration changed your application to ${COALITION_STATUS_LABELS[status.data].toLowerCase()}.`;
      await event(
        client,
        row.id,
        status.data,
        text,
        "admin",
        req.session?.userId,
      );
      await queueMail(client, { ...row, status: status.data }, text);
      await client.query("COMMIT");
      client.release();
      client = undefined;
      await delivery(row.id);
      res.json({ success: true, status: status.data });
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      return failure(res, "update application", error);
    } finally {
      client?.release();
    }
  });
  app.delete(
    "/api/coalition/registrations/:id",
    adminAuth,
    async (req, res) => {
      if (!uuid.safeParse(req.params.id).success)
        return res.status(400).json({ error: "Invalid reference." });
      try {
        await ready();
        const row = await pool!.query(
          "DELETE FROM coalition_registrations WHERE id=$1 RETURNING id",
          [req.params.id],
        );
        res
          .status(row.rowCount ? 200 : 404)
          .json(
            row.rowCount
              ? { success: true }
              : { error: "Application not found." },
          );
      } catch (error) {
        return failure(res, "delete application", error);
      }
    },
  );
  app.post("/api/coalition/mail/retry", adminAuth, async (_req, res) => {
    try {
      await ready();
      await pool!.query(
        "UPDATE coalition_email_outbox SET next_attempt_at=now(),attempts=0 WHERE sent_at IS NULL AND created_at > now() - interval '7 days'",
      );
      await delivery();
      res.json({ success: true });
    } catch (error) {
      return failure(res, "retry email delivery", error);
    }
  });
  app.post("/api/coalition/tracking/recover", async (req, res) => {
    const parsed = z
      .object({
        reference: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{8,40}$/),
        email: z.string().trim().email().max(254),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Enter a valid reference and email address." });
    if (!coalitionMailConfigured())
      return res.status(503).json({
        error:
          "Email recovery is temporarily unavailable. Use the private link saved when you submitted, or contact the national team.",
      });
    let client: PoolClient | undefined;
    try {
      await ready();
      if (await limited(req, "recovery", 5))
        return res.status(429).json({
          error: "Too many recovery requests. Please try again in an hour.",
        });
      client = await pool!.connect();
      await client.query("BEGIN");
      const row = (
        await client.query(
          `SELECT * FROM coalition_registrations WHERE (id::text=$1 OR reference_code=$1) AND lower(email)=lower($2) AND ${retained}`,
          [parsed.data.reference, parsed.data.email],
        )
      ).rows[0];
      if (row) {
        const token = await accessToken(client, row.id, 30);
        await client.query(
          `INSERT INTO coalition_email_outbox (registration_id,recipient,subject,body) VALUES ($1,$2,'Youth Service Coalition — verify tracking access',$3)`,
          [
            row.id,
            row.email,
            `Open this private link to verify access to your coalition application. It expires in 30 minutes.\n\n${trackingLink(row.reference_code || row.id, token)}\n\nIf you did not request this email, ignore it.\nYouth Service Philippines`,
          ],
        );
      }
      await client.query("COMMIT");
      client.release();
      client = undefined;
      if (row) await delivery(row.id);
      res.json({
        message:
          "If the reference and email match an application, a private verification link will be emailed. Check your inbox and spam folder.",
      });
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      return failure(res, "request a verification link", error);
    } finally {
      client?.release();
    }
  });
  app.post("/api/coalition/tracking/access", async (req, res) => {
    const parsed = z
      .object({
        reference: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{8,40}$/),
        token: tokenSchema,
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(401).json({
        error:
          "This tracking link is invalid or expired. Request a new email link.",
      });
    try {
      await ready();
      if (await limited(req, "access", 30))
        return res
          .status(429)
          .json({ error: "Too many attempts. Try again in an hour." });
      const row = await pool!.query(
        `SELECT r.id FROM coalition_tracking_tokens t JOIN coalition_registrations r ON r.id=t.registration_id WHERE t.token_hash=$1 AND (r.id::text=$2 OR r.reference_code=$2) AND t.kind='access' AND t.expires_at>now() AND r.${retained}`,
        [hash(parsed.data.token), parsed.data.reference],
      );
      if (!row.rowCount)
        return res.status(401).json({
          error:
            "This tracking link is invalid or expired. Request a new email link.",
        });
      const session = crypto.randomBytes(32).toString("hex");
      await pool!.query(
        `INSERT INTO coalition_tracking_tokens (token_hash,registration_id,kind,expires_at) VALUES ($1,$2,'session',now()+interval '8 hours')`,
        [hash(session), row.rows[0].id],
      );
      res.cookie(trackingCookie, session, {
        httpOnly: true,
        secure: req.secure || process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/coalition/tracking",
        maxAge: 8 * 3600000,
      });
      res.json({ success: true });
    } catch (error) {
      return failure(res, "verify tracking access", error);
    }
  });
  app.get("/api/coalition/tracking/application", async (req, res) => {
    try {
      await ready();
      const row = await trackingRecord(req);
      if (!row)
        return res.status(401).json({
          error:
            "Open your private tracking link or request a new verification email.",
        });
      res.json({
        reference: row.reference_code || row.id,
        name: row.organization_name || row.full_name,
        registrationType: row.registration_type,
        status: row.status,
        createdAt: row.created_at,
        events: await events(row.id),
      });
    } catch (error) {
      return failure(res, "load application progress", error);
    }
  });
  app.post("/api/coalition/tracking/action", async (req, res) => {
    // JSON-only requests plus SameSite cookies prevent cross-site form actions.
    if (!req.is("application/json"))
      return res.status(415).json({ error: "JSON is required." });
    const parsed = z
      .object({
        action: z.enum(["respond", "withdraw"]),
        message: z.string().trim().max(2000).default(""),
      })
      .safeParse(req.body);
    if (
      !parsed.success ||
      (parsed.data.action === "respond" && parsed.data.message.length < 5)
    )
      return res.status(400).json({
        error: "Please enter a response of at least five characters.",
      });
    let client: PoolClient | undefined;
    try {
      await ready();
      const record = await trackingRecord(req);
      if (!record)
        return res
          .status(401)
          .json({ error: "Your tracking session has expired." });
      if (await limited(req, "applicant-action", 20))
        return res
          .status(429)
          .json({ error: "Too many updates. Please try again later." });
      client = await pool!.connect();
      await client.query("BEGIN");
      const row = (
        await client.query(
          `SELECT * FROM coalition_registrations WHERE id=$1 AND ${retained} FOR UPDATE`,
          [record.id],
        )
      ).rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Application not found." });
      }
      const withdraw = parsed.data.action === "withdraw";
      if (
        row.status === "withdrawn" ||
        (!withdraw && row.status !== "needs_information")
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error:
            "This action is no longer available. Refresh your application.",
        });
      }
      const status = withdraw ? "withdrawn" : "under_review",
        message = withdraw
          ? "The applicant withdrew this application."
          : parsed.data.message;
      await client.query(
        "UPDATE coalition_registrations SET status=$2,updated_at=now() WHERE id=$1",
        [row.id, status],
      );
      await event(client, row.id, status, message, "applicant");
      await queueMail(client, { ...row, status }, message);
      await client.query("COMMIT");
      client.release();
      client = undefined;
      await delivery(row.id);
      res.json({ success: true });
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      return failure(res, "update application", error);
    } finally {
      client?.release();
    }
  });
  app.post("/api/coalition/tracking/logout", async (req, res) => {
    try {
      await ready();
      const raw = (req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(trackingCookie + "="))
        ?.slice(trackingCookie.length + 1);
      if (raw)
        await pool!.query(
          "DELETE FROM coalition_tracking_tokens WHERE token_hash=$1 AND kind='session'",
          [hash(raw)],
        );
      res.clearCookie(trackingCookie, { path: "/api/coalition/tracking" });
      res.json({ success: true });
    } catch (error) {
      return failure(res, "close tracking session", error);
    }
  });
}
