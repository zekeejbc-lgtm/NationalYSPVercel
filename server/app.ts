import { type Server } from "node:http";
import net from "node:net";

import express, {
  type Express,
  type Request,
  Response,
  NextFunction,
} from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

import { pool } from "./db";
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
const PgSessionStore = connectPgSimple(session);

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

const sessionStore = pool
  ? new PgSessionStore({
      pool,
      createTableIfMissing: true,
      tableName: process.env.SESSION_TABLE_NAME || "session",
    })
  : undefined;

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
