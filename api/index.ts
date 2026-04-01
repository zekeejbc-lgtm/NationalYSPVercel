import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as appModule from "../server/app";

let serverlessBootstrapPromise: Promise<void> | null = null;
let appHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

async function ensureServerlessBootstrap() {
  if (!serverlessBootstrapPromise) {
    serverlessBootstrapPromise = (async () => {
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
    await ensureServerlessBootstrap();
    if (!appHandler) {
      throw new Error("Express app failed to initialize");
    }

    appHandler(req, res);
  } catch (error: any) {
    console.error("[vercel] bootstrap failure", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Server bootstrap failed",
        message: error?.message || "Unknown bootstrap error",
      }),
    );
  }
}
