import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { flushNewsletterMail } from "../server/newsletter";
import { pool } from "../server/db";

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
try {
  do {
    try {
      const result = await flushNewsletterMail();
      console.log(`Newsletter worker: ${result.processed} attempts processed.`);
    } catch {
      console.error(
        "Newsletter worker failed. Check database and email configuration.",
      );
    }
    if (process.argv.includes("--once") || stopping) break;
    await setTimeout(15000);
  } while (!stopping);
} finally {
  await pool?.end();
}
