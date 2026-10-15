import type { Express, Request, Response } from "express";
import { createClient, type User } from "@supabase/supabase-js";
import { pool } from "./db";

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
  req.session.userId = account.id;
  req.session.role = account.role;
  req.session.chapterId = account.chapterId;
  req.session.barangayId = account.role === "barangay" ? account.id : undefined;
  req.session.barangayName = account.role === "barangay" ? account.barangayName : undefined;
  await new Promise<void>((resolve, reject) => req.session.save(error => (error ? reject(error) : resolve())));
  res.json({ success: true, user: publicAccount(account), external: true });
}

export function registerExternalAuthRoutes(app: Express, requireAuth: (req: Request, res: Response, next: Function) => void) {
  app.post("/api/auth/external/exchange", async (req, res) => {
    try {
      const selectedProvider = provider(req.body?.provider);
      if (!selectedProvider || !pool) return res.status(400).json({ error: "Unsupported external provider" });
      if (!isProviderEnabled(selectedProvider)) return res.status(404).json({ error: "This sign-in method is not enabled." });
      const user = await getSupabaseUser(req);
      const result = await pool.query(
        `select account_type as "accountType", account_id as "accountId" from external_auth_identities where provider = $1 and provider_subject = $2`,
        [selectedProvider, user.id],
      );
      const identity = result.rows[0];
      if (!identity) return res.status(403).json({ error: "This identity is not linked to a YSP account. Sign in with your YSP credentials first, then link it from Profile." });
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
      const user = await getSupabaseUser(req);
      const account = await getAccount(req.session.role, req.session.userId);
      if (!account) return res.status(404).json({ error: "Account not found or inactive" });
      await pool.query(
        `insert into external_auth_identities (account_type, account_id, provider, provider_subject, email)
         values ($1, $2, $3, $4, $5)
         on conflict (account_type, account_id, provider) do update set provider_subject = excluded.provider_subject, email = excluded.email`,
        [req.session.role, req.session.userId, selectedProvider, user.id, user.email || null],
      );
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
