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
export const databaseUrl = process.env.DATABASE_URL;
export const hasDatabaseUrl = Boolean(databaseUrl);

if (!databaseUrl && !isDevelopment) {
  console.warn(
    "[startup] DATABASE_URL is not set; database-backed API routes will fail until configured.",
  );
}

let initializedPool: Pool | null = null;

if (databaseUrl) {
  try {
    initializedPool = new Pool({ connectionString: databaseUrl });
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
