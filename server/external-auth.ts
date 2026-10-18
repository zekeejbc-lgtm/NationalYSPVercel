import type { Express, Request, Response } from "express";
import { createClient, type User } from "@supabase/supabase-js";
import { pool } from "./db";
import { assertExternalSignInMethod } from "./external-auth-policy";
import { z } from "zod";

type ExternalProvider = "google" | "passkey";
type AccountType = "admin" | "chapter" | "barangay";

function isProviderEnabled(selectedProvider: ExternalProvider) {
  const variableName = selectedProvider === "google" ? "GOOGLE_AUTH_ENABLED" : "PASSKEY_AUTH_ENABLED";
  return process.env[variableName] === "true";
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) : null;

let externalAuthSetup: Promise<void> | null = null;
export async function ensureExternalAuthInfrastructure() {
  if (!pool) return;
  if (process.env.VERCEL === "1" && process.env.RUN_STARTUP_SCHEMA_SETUP !== "true") return;
  if (!externalAuthSetup) {
    externalAuthSetup = pool.query(`
    create table if not exists external_auth_identities (
      id varchar primary key default gen_random_uuid(),
      account_type text not null,
      account_id varchar not null,
      provider text not null,
      provider_subject text not null,
      email text,
      created_at timestamp not null default now(),
      last_used_at timestamp,
      constraint external_auth_account_type_check check (account_type in ('admin','chapter','barangay')),
      constraint external_auth_provider_check check (provider in ('google','passkey'))
    );
    create index if not exists external_auth_account_idx on external_auth_identities(account_type, account_id);
    create unique index if not exists external_auth_provider_subject_idx on external_auth_identities(provider, provider_subject);
    create unique index if not exists external_auth_account_provider_idx on external_auth_identities(account_type, account_id, provider);
    alter table external_auth_identities enable row level security;
  `).then(() => undefined).catch((error) => {
    externalAuthSetup = null;
    throw error;
  });
  }
  await externalAuthSetup;
}

function provider(value: unknown): ExternalProvider | null {
  return value === "google" || value === "passkey" ? value : null;
}

function accountType(value: unknown): AccountType | null {
  return value === "admin" || value === "chapter" || value === "barangay" ? value : null;
}

function bearerToken(req: Request) {
  const header = req.get("authorization") || "";
  return /^Bearer\s+(.+)$/i.exec(header)?.[1] || "";
}

async function getSupabaseUser(req: Request): Promise<User> {
  if (!supabase) throw new Error("Supabase Auth is not configured on the server.");
  const token = bearerToken(req);
  if (!token) throw new Error("Supabase access token required.");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid external authentication session.");
  return data.user;
}

async function verifySignInMethod(req: Request, user: User, selectedProvider: ExternalProvider) {
  const { data, error } = await supabase!.auth.getClaims(bearerToken(req));
  if (error || !data) throw new Error("Invalid external authentication session.");
  assertExternalSignInMethod(user, data.claims.amr, selectedProvider);
}

async function getAccount(accountTypeValue: AccountType, accountId: string) {
  if (!pool) return null;
  if (accountTypeValue === "admin") {
    const result = await pool.query("select id, username from admin_users where id = $1", [accountId]);
    return result.rows[0] ? { ...result.rows[0], role: "admin" as const } : null;
  }
  if (accountTypeValue === "chapter") {
    const result = await pool.query(
      `select cu.id, cu.username, cu.chapter_id as "chapterId", cu.is_active as "isActive", cu.must_change_password as "mustChangePassword", c.name as "chapterName"
       from chapter_users cu left join chapters c on c.id = cu.chapter_id where cu.id = $1`,
      [accountId],
    );
    return result.rows[0] && result.rows[0].isActive ? { ...result.rows[0], role: "chapter" as const } : null;
  }
  const result = await pool.query(
    `select bu.id, bu.username, bu.chapter_id as "chapterId", bu.barangay_name as "barangayName", bu.is_active as "isActive", bu.must_change_password as "mustChangePassword", c.name as "chapterName"
     from barangay_users bu left join chapters c on c.id = bu.chapter_id where bu.id = $1`,
    [accountId],
  );
  return result.rows[0] && result.rows[0].isActive ? { ...result.rows[0], role: "barangay" as const, barangayId: result.rows[0].id } : null;
}

function publicAccount(account: any) {
  if (account.role === "admin") return { id: account.id, username: account.username, role: account.role };
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    chapterId: account.chapterId,
    chapterName: account.chapterName || "",
    ...(account.role === "barangay" ? { barangayId: account.barangayId, barangayName: account.barangayName } : {}),
    mustChangePassword: account.mustChangePassword,
  };
}

async function saveLocalSession(req: Request, res: Response, account: any) {
  await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = account.id;
  req.session.role = account.role;
  req.session.chapterId = account.chapterId;
  req.session.barangayId = account.role === "barangay" ? account.id : undefined;
  req.session.barangayName = account.role === "barangay" ? account.barangayName : undefined;
  await new Promise<void>((resolve, reject) => req.session.save(error => (error ? reject(error) : resolve())));
  res.json({ success: true, user: publicAccount(account), external: true });
}

export function registerExternalAuthRoutes(app: Express, requireAuth: (req: Request, res: Response, next: Function) => void) {
  app.post("/api/auth/external/enroll", requireAuth, async (req, res) => {
    try {
      if (!pool || !req.session.userId || !req.session.role) return res.status(401).json({ error: "Sign in with your YSP credentials first." });
      if (!isProviderEnabled("google") && !isProviderEnabled("passkey")) return res.status(404).json({ error: "External sign-in is not enabled." });
      if (req.body?.accountId !== req.session.userId) return res.status(409).json({ error: "Your YSP account changed. Start linking again from My Profile." });
      const parsed = z.string().trim().email().max(254).safeParse(req.body?.email);
      if (!parsed.success) return res.status(400).json({ error: "Enter the Google email you want to link." });
      const email = parsed.data.toLowerCase();
      if (!await getAccount(req.session.role, req.session.userId)) return res.status(403).json({ error: "Your YSP account is inactive or no longer exists." });
      const connection = await pool.connect();
      try {
        await connection.query("begin");
        await connection.query("select pg_advisory_xact_lock(hashtext($1))", [`external-auth-email:${email}`]);
        const linked = await connection.query(
          `select i.account_type, i.account_id from external_auth_identities i
           join auth.users u on u.id::text = i.provider_subject where u.email = $1`, [email],
        );
        if (linked.rows.some(row => row.account_type !== req.session.role || row.account_id !== req.session.userId)) throw new Error("This Google account is already linked to another YSP account.");
        const existingGoogle = await connection.query(
          `select u.email from external_auth_identities i join auth.users u on u.id::text = i.provider_subject
           where i.account_type = $1 and i.account_id = $2 and i.provider = 'google'`, [req.session.role, req.session.userId],
        );
        if (existingGoogle.rows.some(row => row.email?.toLowerCase() !== email)) throw new Error("Use the Google email already linked to this YSP account.");
        const pending = await connection.query("select account_type, account_id from ysp_auth.google_enrollments where email = $1 and expires_at > now()", [email]);
        if (pending.rows.some(row => row.account_type !== req.session.role || row.account_id !== req.session.userId)) throw new Error("This Google email has another pending connection. Please try again later.");
        await connection.query("delete from ysp_auth.google_enrollments where (account_type = $1 and account_id = $2) or (email = $3 and expires_at <= now())", [req.session.role, req.session.userId, email]);
        await connection.query("insert into ysp_auth.google_enrollments (email, account_type, account_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')", [email, req.session.role, req.session.userId]);
        await connection.query("commit");
      } catch (error) {
        await connection.query("rollback");
        throw error;
      } finally {
        connection.release();
      }
      res.json({ success: true, email });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Could not authorize this Google connection." });
    }
  });

  app.post("/api/auth/external/exchange", async (req, res) => {
    try {
      const selectedProvider = provider(req.body?.provider);
      if (!selectedProvider || !pool) return res.status(400).json({ error: "Unsupported external provider" });
      if (!isProviderEnabled(selectedProvider)) return res.status(404).json({ error: "This sign-in method is not enabled." });
      const user = await getSupabaseUser(req);
      await verifySignInMethod(req, user, selectedProvider);
      const result = await pool.query(
        `select account_type as "accountType", account_id as "accountId" from external_auth_identities where provider = $1 and provider_subject = $2`,
        [selectedProvider, user.id],
      );
      const identity = result.rows[0];
      if (!identity) {
        await supabase!.auth.admin.signOut(bearerToken(req), "local");
        return res.status(403).json({ error: "This identity is not linked to a YSP account. Sign in with your YSP credentials first, then link it from Profile." });
      }
      const type = accountType(identity.accountType);
      const account = type ? await getAccount(type, identity.accountId) : null;
      if (!account) return res.status(403).json({ error: "The linked YSP account is inactive or no longer exists." });
      await pool.query("update external_auth_identities set last_used_at = now(), email = $1 where provider = $2 and provider_subject = $3", [user.email || null, selectedProvider, user.id]);
      await saveLocalSession(req, res, account);
    } catch (error: any) {
      res.status(401).json({ error: error?.message || "External authentication failed" });
    }
  });

  app.post("/api/auth/external/link", requireAuth, async (req, res) => {
    try {
      const selectedProvider = provider(req.body?.provider);
      if (!selectedProvider || !pool || !req.session.userId || !req.session.role) return res.status(400).json({ error: "Unsupported external provider" });
      if (!isProviderEnabled(selectedProvider)) return res.status(404).json({ error: "This sign-in method is not enabled." });
      if (req.body.accountId !== req.session.userId) return res.status(409).json({ error: "Your YSP account changed. Start linking again from My Profile." });
      const user = await getSupabaseUser(req);
      const account = await getAccount(req.session.role, req.session.userId);
      if (!account) return res.status(404).json({ error: "Account not found or inactive" });
      if (selectedProvider === "google") {
        await verifySignInMethod(req, user, "google");
      } else {
        const { data, error } = await supabase!.auth.admin.passkey.listPasskeys({ userId: user.id });
        if (error || !data?.length) throw new Error("Register a passkey before linking passkey sign-in.");
      }
      const connection = await pool.connect();
      try {
        await connection.query("begin");
        // Serialize links for the same Supabase user, including different providers.
        await connection.query("select pg_advisory_xact_lock(hashtext($1))", [`external-auth:${user.id}`]);
        const existing = await connection.query(
          "select account_type, account_id, provider from external_auth_identities where provider_subject = $1",
          [user.id],
        );
        if (existing.rows.some(row => row.account_id !== req.session.userId || row.account_type !== req.session.role)) {
          throw new Error("This identity is already linked to another YSP account.");
        }
        if (selectedProvider === "google" && !existing.rows.some(row => row.provider === "google")) {
          const authorized = await connection.query(
            `delete from ysp_auth.google_enrollments where email = $1 and account_type = $2 and account_id = $3 and expires_at > now() returning email`,
            [user.email?.toLowerCase(), req.session.role, req.session.userId],
          );
          if (!authorized.rowCount) throw new Error("Authorize this Google email from My Profile before linking it.");
        }
        if (selectedProvider === "passkey" && !existing.rows.length) throw new Error("Link your Google account from My Profile before adding a passkey.");
        await connection.query(
          `insert into external_auth_identities (account_type, account_id, provider, provider_subject, email)
           values ($1, $2, $3, $4, $5)
           on conflict (account_type, account_id, provider) do update set provider_subject = excluded.provider_subject, email = excluded.email`,
          [req.session.role, req.session.userId, selectedProvider, user.id, user.email || null],
        );
        await connection.query("commit");
      } catch (error) {
        await connection.query("rollback");
        throw error;
      } finally {
        connection.release();
      }
      res.json({ success: true, provider: selectedProvider });
    } catch (error: any) {
      const status = /duplicate|unique/i.test(error?.message || "") ? 409 : 400;
      res.status(status).json({ error: error?.message || "Could not link external identity" });
    }
  });

  app.get("/api/auth/external", requireAuth, async (req, res) => {
    if (!pool || !req.session.userId || !req.session.role) return res.status(401).json({ error: "Unauthorized" });
    const result = await pool.query(
      `select provider, email, created_at as "createdAt", last_used_at as "lastUsedAt" from external_auth_identities where account_type = $1 and account_id = $2 order by provider`,
      [req.session.role, req.session.userId],
    );
    res.json(result.rows);
  });
}
