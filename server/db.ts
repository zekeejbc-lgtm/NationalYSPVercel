import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

let poolInitializationError: Error | null = null;

const missingDatabaseUrlError = () =>
  new Error(
    poolInitializationError
      ? `DATABASE_URL is invalid or unusable: ${poolInitializationError.message}`
      : "DATABASE_URL must be set. Add it to your environment before using database-backed routes.",
  );

const isDevelopment = process.env.NODE_ENV === "development";
function resolveDatabaseUrl() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.SUPABASE_DB_URL,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export const databaseUrl = resolveDatabaseUrl();
export const hasDatabaseUrl = Boolean(databaseUrl);

const DEFAULT_POOL_MAX = 10;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;
const DEFAULT_IDLE_TIMEOUT_MS = 10000;

function parsePositiveInt(rawValue: string | undefined, fallback: number) {
  const parsed = Number.parseInt(rawValue || "", 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function shouldEnableSslForDatabaseUrl(url?: string) {
  if (!url) {
    return false;
  }

  return /\.supabase\.(?:co|in)/i.test(url);
}

if (!databaseUrl && !isDevelopment) {
  console.error(
    "[startup] DATABASE_URL is not set; database-backed API routes will fail until configured.",
  );
}

let initializedPool: Pool | null = null;

if (databaseUrl) {
  try {
    initializedPool = new Pool({
      connectionString: databaseUrl,
      max: parsePositiveInt(process.env.PG_POOL_MAX, DEFAULT_POOL_MAX),
      idleTimeoutMillis: parsePositiveInt(process.env.PG_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
      connectionTimeoutMillis: parsePositiveInt(
        process.env.PG_CONNECTION_TIMEOUT_MS,
        DEFAULT_CONNECTION_TIMEOUT_MS,
      ),
      keepAlive: true,
      ssl: shouldEnableSslForDatabaseUrl(databaseUrl)
        ? { rejectUnauthorized: false }
        : undefined,
    });
  } catch (error: any) {
    poolInitializationError = error instanceof Error ? error : new Error(String(error));
    console.error("[startup] Failed to initialize database pool", poolInitializationError);
  }
}

export const pool = initializedPool;

export const db = pool
  ? drizzle(pool, { schema })
  : (new Proxy(
      {},
      {
        get() {
          throw missingDatabaseUrlError();
        },
      },
    ) as any);
