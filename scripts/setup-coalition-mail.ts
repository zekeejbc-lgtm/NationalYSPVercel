import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";

let secret = process.env.COALITION_MAIL_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString("hex");
  fs.appendFileSync(".env", `\nCOALITION_MAIL_SECRET=${secret}\n`, {
    encoding: "utf8",
  });
}
if (secret.length < 32 || /[\r\n]/.test(secret))
  throw new Error("COALITION_MAIL_SECRET must be at least 32 characters.");
fs.writeFileSync(
  "scripts/coalition-mail-config.gs",
  "// Private deployment bootstrap. Do not commit.\nvar COALITION_MAIL_BOOTSTRAP_SECRET = " +
    JSON.stringify(secret) +
    ";\n",
  { encoding: "utf8" },
);
console.log(
  "Matching server/GAS mail secret prepared privately. No credentials were printed.",
);
