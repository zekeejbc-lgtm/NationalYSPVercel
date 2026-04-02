import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";

const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 12000;
const require = createRequire(import.meta.url);

type ServerAppModule = {
  app: unknown;
  initializeRoutes: () => Promise<unknown>;
  attachErrorHandler: () => void;
};

let serverlessBootstrapPromise: Promise<void> | null = null;
let appHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
let appModulePromise: Promise<ServerAppModule> | null = null;

async function loadAppModule() {
  if (!appModulePromise) {
    appModulePromise = Promise.resolve()
      .then(() => {
        // Built during npm run build (build:server) before Vercel packages functions.
        return require("../dist-server/server/app.cjs") as ServerAppModule;
      })
      .catch((error) => {
        appModulePromise = null;
        throw error;
      });
  }

  return appModulePromise;
}

function getBootstrapTimeoutMs() {
  const parsed = Number.parseInt(
    process.env.SERVERLESS_BOOTSTRAP_TIMEOUT_MS || `${DEFAULT_BOOTSTRAP_TIMEOUT_MS}`,
    10,
  );

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_BOOTSTRAP_TIMEOUT_MS;
  }

  return parsed;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`);
      (timeoutError as Error & { code?: string }).code = "BOOTSTRAP_TIMEOUT";
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function ensureServerlessBootstrap() {
  if (!serverlessBootstrapPromise) {
    serverlessBootstrapPromise = (async () => {
      const appModule = await loadAppModule();
      await appModule.initializeRoutes();
      appModule.attachErrorHandler();
      appHandler = appModule.app as unknown as (req: IncomingMessage, res: ServerResponse) => void;
    })().catch((error) => {
      serverlessBootstrapPromise = null;
      throw error;
    });
  }

  await serverlessBootstrapPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await withTimeout(
      ensureServerlessBootstrap(),
      getBootstrapTimeoutMs(),
      "Server bootstrap",
    );

    if (!appHandler) {
      throw new Error("Express app failed to initialize");
    }

    appHandler(req, res);
  } catch (error: any) {
    const isTimeout = error?.code === "BOOTSTRAP_TIMEOUT";
    const statusCode = isTimeout ? 503 : 500;

    console.error("[vercel] bootstrap failure", error);
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error: isTimeout ? "Server bootstrap timeout" : "Server bootstrap failed",
        message: error?.message || "Unknown bootstrap error",
        code: error?.code,
      }),
    );
  }
}
