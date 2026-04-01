import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";

import { app, attachErrorHandler, initializeRoutes } from "../server/app";

let serverlessBootstrapPromise: Promise<void> | null = null;

async function ensureServerlessBootstrap() {
  if (!serverlessBootstrapPromise) {
    serverlessBootstrapPromise = (async () => {
      await initializeRoutes();
      attachErrorHandler();
    })();
  }

  await serverlessBootstrapPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureServerlessBootstrap();
  app(req as any, res as any);
}
