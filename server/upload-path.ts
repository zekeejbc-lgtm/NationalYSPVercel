import fs from "node:fs";
import path from "node:path";

function resolveConfiguredUploadsDir() {
  if (process.env.UPLOADS_DIR) {
    return path.resolve(process.env.UPLOADS_DIR);
  }

  if (process.env.VERCEL) {
    return "/tmp/uploads";
  }

  return path.resolve(process.cwd(), "client/public/uploads");
}

export function getUploadsDir() {
  return resolveConfiguredUploadsDir();
}

export function ensureUploadsDir() {
  const uploadsDir = getUploadsDir();
  fs.mkdirSync(uploadsDir, { recursive: true });
  return uploadsDir;
}
