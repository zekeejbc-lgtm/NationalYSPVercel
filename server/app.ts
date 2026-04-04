import { type Server } from "node:http";
import net from "node:net";
import "express-async-errors";

import express, {
  type Express,
  type Request,
  Response,
  NextFunction,
} from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

import { databaseUrl, hasDatabaseUrl, pool } from "./db";
import { registerRoutes } from "./routes";
import { ensureUploadsDir, getUploadsDir } from "./upload-path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();
const connectPgSimpleFactory =
  (connectPgSimple as unknown as { default?: typeof connectPgSimple }).default || connectPgSimple;

let PgSessionStore: ReturnType<typeof connectPgSimple> | null = null;
try {
  if (typeof connectPgSimpleFactory === "function") {
    PgSessionStore = connectPgSimpleFactory(session);
  }
} catch (error) {
  console.error("[session] connect-pg-simple initialization failed; falling back to memory store", error);
}

let routeRegistrationPromise: Promise<Server> | null = null;
let errorHandlerAttached = false;

app.set("trust proxy", 1);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use("/uploads", express.static(getUploadsDir()));
app.use("/uploads", (_req, res) => {
  res.status(404).send("Upload not found");
});

const createSessionStore = () => {
  const shouldUsePgSessionStore = process.env.ENABLE_PG_SESSION_STORE !== "false";
  const isProductionLike = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  if (!hasDatabaseUrl || !shouldUsePgSessionStore) {
    if (databaseUrl && !shouldUsePgSessionStore) {
      console.log("[session] using in-memory session store because ENABLE_PG_SESSION_STORE=false");
    }

    if (isProductionLike && shouldUsePgSessionStore && !hasDatabaseUrl) {
      console.error(
        "[session] persistent session store is disabled because no database URL was resolved; hard-refresh logouts are expected in serverless mode",
      );
    }

    return undefined;
  }

  if (!PgSessionStore) {
    if (isProductionLike && shouldUsePgSessionStore) {
      console.error(
        "[session] connect-pg-simple was not initialized; falling back to memory sessions in production can cause hard-refresh logouts",
      );
    }
    return undefined;
  }

  try {
    return new PgSessionStore({
      pool: pool ?? undefined,
      createTableIfMissing: true,
      tableName: process.env.SESSION_TABLE_NAME || "session",
    });
  } catch (error) {
    console.error("[session] failed to initialize postgres session store; falling back to memory store", error);
    return undefined;
  }
};

const sessionStore = createSessionStore();

function resolveSessionCookieSecure(): boolean | "auto" {
  const configuredValue = (process.env.SESSION_COOKIE_SECURE || "").trim().toLowerCase();
  if (configuredValue === "true") {
    return true;
  }

  if (configuredValue === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production" ? "auto" : false;
}

function resolveSessionCookieSameSite(secureSetting: boolean | "auto"): "lax" | "strict" | "none" {
  const configuredValue = (process.env.SESSION_COOKIE_SAMESITE || "").trim().toLowerCase();
  const normalizedValue =
    configuredValue === "lax" || configuredValue === "strict" || configuredValue === "none"
      ? configuredValue
      : "lax";

  if (normalizedValue === "none" && secureSetting !== true) {
    console.warn(
      "[session] SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true; falling back to lax",
    );
    return "lax";
  }

  return normalizedValue;
}

const sessionCookieSecure = resolveSessionCookieSecure();
const sessionCookieSameSite = resolveSessionCookieSameSite(sessionCookieSecure);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: sessionCookieSecure,
      httpOnly: true,
      sameSite: sessionCookieSameSite,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export async function initializeRoutes() {
  if (!routeRegistrationPromise) {
    ensureUploadsDir();
    routeRegistrationPromise = registerRoutes(app);
  }

  return routeRegistrationPromise;
}

export function attachErrorHandler() {
  if (errorHandlerAttached) {
    return;
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const message = typeof err?.message === "string" ? err.message : "Internal Server Error";
    const errorCode = typeof err?.code === "string" ? err.code : undefined;

    const missingDbConfig =
      message.includes("DATABASE_URL must be set") ||
      message.includes("DATABASE_URL is invalid or unusable");

    const dbConnectivityCodes = new Set([
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "08001",
      "08006",
      "28P01",
      "3D000",
      "57P01",
      "53300",
    ]);

    const schemaMismatchCodes = new Set(["42P01", "42703"]);
    const isDbConnectivityIssue = Boolean(errorCode && dbConnectivityCodes.has(errorCode));
    const isSchemaMismatch = Boolean(errorCode && schemaMismatchCodes.has(errorCode));

    const status =
      missingDbConfig || isDbConnectivityIssue || isSchemaMismatch
        ? 503
        : err.status || err.statusCode || 500;

    const responseMessage = missingDbConfig
      ? "Database configuration is missing on the server"
      : isDbConnectivityIssue
      ? "Database is currently unavailable"
      : isSchemaMismatch
      ? "Database schema is out of sync with the application"
      : message;

    console.error("[api-error]", { status, message, code: errorCode });
    if (!res.headersSent) {
      res.status(status).json({
        message: responseMessage,
        code: errorCode,
      });
      return;
    }

    res.end();
  });

  errorHandlerAttached = true;
}

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await initializeRoutes();
  attachErrorHandler();

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const requestedPort = parseInt(process.env.PORT || "5000", 10);
  const host = "0.0.0.0";
  const canAutoPickPortInDev = process.env.NODE_ENV === "development" && !process.env.PORT;

  const isPortAvailable = (port: number) =>
    new Promise<boolean>((resolve) => {
      const probe = net.createServer();

      probe.once("error", () => resolve(false));
      probe.once("listening", () => {
        probe.close(() => resolve(true));
      });

      probe.listen(port, host);
    });

  let portToUse = requestedPort;

  if (canAutoPickPortInDev) {
    const maxAttempts = 20;
    let foundPort = false;

    for (let i = 0; i <= maxAttempts; i++) {
      const candidate = requestedPort + i;
      if (await isPortAvailable(candidate)) {
        portToUse = candidate;
        foundPort = true;
        if (candidate !== requestedPort) {
          log(`port ${requestedPort} is busy, using ${candidate}`);
        }
        break;
      }
    }

    if (!foundPort) {
      throw new Error(
        `Could not find an open port from ${requestedPort} to ${requestedPort + maxAttempts}`,
      );
    }
  }

  server.listen(
    {
      port: portToUse,
      host,
      reusePort: process.platform !== "win32",
    },
    () => {
      log(`serving on port ${portToUse}`);
    },
  );
}
