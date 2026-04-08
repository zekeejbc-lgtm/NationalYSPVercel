import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or service role key in environment");
}

const bucket = process.env.SUPABASE_PUBLICATION_BUCKET || "publication-images";

const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
if (!fileArg) {
  throw new Error("Usage: tsx scripts/upload-local-image-to-supabase.ts --file=client/public/uploads/your-image.jpg");
}

const filePath = path.resolve(process.cwd(), fileArg.slice("--file=".length));
const fileName = path.basename(filePath);
const extension = path.extname(fileName).toLowerCase();

const mimeByExt: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const contentType = mimeByExt[extension] || "image/jpeg";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: createBucketError } = await supabase.storage.createBucket(bucket, {
  public: true,
  fileSizeLimit: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"],
});

if (createBucketError) {
  const message = (createBucketError.message || "").toLowerCase();
  const alreadyExists = message.includes("already exists") || message.includes("duplicate");
  if (!alreadyExists) {
    throw createBucketError;
  }
}

const bytes = await fs.readFile(filePath);
const objectPath = `publications/linked/${Date.now()}-${Math.round(Math.random() * 1e9)}${extension || ".jpg"}`;

const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
  contentType,
  cacheControl: "31536000",
  upsert: false,
});

if (uploadError) {
  throw uploadError;
}

const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
if (!data?.publicUrl) {
  throw new Error("Failed to get public URL from Supabase Storage");
}

console.log(data.publicUrl);
