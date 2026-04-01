import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const missingDatabaseUrlError = () =>
  new Error(
    "DATABASE_URL must be set. Add it to your environment before using database-backed routes.",
  );

const isDevelopment = process.env.NODE_ENV === "development";
export const databaseUrl = process.env.DATABASE_URL;
export const hasDatabaseUrl = Boolean(databaseUrl);

if (!databaseUrl && !isDevelopment) {
  console.warn(
    "[startup] DATABASE_URL is not set; database-backed API routes will fail until configured.",
  );
}

export const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : null;

export const db = pool
  ? drizzle({ client: pool, schema })
  : (new Proxy(
      {},
      {
        get() {
          throw missingDatabaseUrlError();
        },
      },
    ) as any);
