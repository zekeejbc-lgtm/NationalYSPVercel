import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const STORAGE_BUCKET = process.env.SUPABASE_PUBLICATION_BUCKET || "publication-images";
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number.parseInt(LIMIT_ARG.split("=")[1] || "", 10) : Number.POSITIVE_INFINITY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error("Missing required env vars. Need SUPABASE_URL, SUPABASE service role key, and DATABASE_URL.");
  process.exit(1);
}

type PublicationRow = {
  id: string;
  title: string | null;
  photo_url: string | null;
  facebook_link: string | null;
};

function getExtensionFromMime(contentType: string | null, fallbackUrl: string): string {
  const normalized = (contentType || "").toLowerCase();

  if (normalized.includes("image/jpeg")) return "jpg";
  if (normalized.includes("image/png")) return "png";
  if (normalized.includes("image/webp")) return "webp";
  if (normalized.includes("image/gif")) return "gif";
  if (normalized.includes("image/avif")) return "avif";

  try {
    const pathname = new URL(fallbackUrl).pathname;
    const fileName = pathname.split("/").pop() || "";
    const ext = fileName.includes(".") ? fileName.split(".").pop() || "" : "";
    if (ext && /^[a-zA-Z0-9]+$/.test(ext)) {
      return ext.toLowerCase();
    }
  } catch {
    // Ignore and fall through.
  }

  return "jpg";
}

function getUrlCandidates(publication: PublicationRow): string[] {
  const candidates = new Set<string>();

  if (publication.photo_url?.trim()) {
    candidates.add(publication.photo_url.trim());
  }

  const links = publication.facebook_link?.match(/https?:\/\/[^\s]+/gi) || [];
  for (const link of links) {
    candidates.add(link.trim());
  }

  return [...candidates];
}

async function fetchWithBrowserHeaders(url: string) {
  return fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      referer: "https://www.facebook.com/",
    },
  });
}

function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

async function resolveImageUrl(candidateUrl: string): Promise<string | null> {
  try {
    const response = await fetchWithBrowserHeaders(candidateUrl);

    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.startsWith("image/")) {
        return candidateUrl;
      }

      if (contentType.includes("text/html")) {
        const html = await response.text();
        const ogImage = extractOgImage(html);
        return ogImage || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchImageBinary(imageUrl: string): Promise<{ bytes: Buffer; contentType: string | null } | null> {
  try {
    const imageResponse = await fetchWithBrowserHeaders(imageUrl);
    if (!imageResponse.ok) {
      return null;
    }

    const contentType = imageResponse.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      return null;
    }

    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!bytes.length) {
      return null;
    }

    return { bytes, contentType };
  } catch {
    return null;
  }
}

async function ensureBucket(supabase: any, bucket: string) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    throw new Error(`Failed to list storage buckets: ${error.message}`);
  }

  const hasBucket = (buckets || []).some((entry: { name: string }) => entry.name === bucket);
  if (hasBucket) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  });

  if (createError) {
    throw new Error(`Failed to create storage bucket '${bucket}': ${createError.message}`);
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await ensureBucket(supabase, STORAGE_BUCKET);

    const publicationResult = await pool.query<PublicationRow>(
      `
        SELECT id, title, photo_url, facebook_link
        FROM publications
        WHERE photo_url ILIKE '%fbcdn.net%'
        ORDER BY published_at DESC
      `,
    );

    const publications = publicationResult.rows.slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);

    console.log(`Found ${publicationResult.rowCount || 0} publication(s) with fbcdn photo_url.`);
    if (Number.isFinite(LIMIT)) {
      console.log(`Processing first ${publications.length} publication(s) due to --limit.`);
    }

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const publication of publications) {
      const candidates = getUrlCandidates(publication);
      let resolvedImageUrl: string | null = null;

      for (const candidate of candidates) {
        const resolved = await resolveImageUrl(candidate);
        if (resolved) {
          resolvedImageUrl = resolved;
          break;
        }
      }

      if (!resolvedImageUrl) {
        failed += 1;
        console.log(`[FAIL] ${publication.id} ${publication.title || "(untitled)"} -> no resolvable image URL`);
        continue;
      }

      const imageBinary = await fetchImageBinary(resolvedImageUrl);
      if (!imageBinary) {
        failed += 1;
        console.log(`[FAIL] ${publication.id} ${publication.title || "(untitled)"} -> image fetch failed: ${resolvedImageUrl}`);
        continue;
      }

      const ext = getExtensionFromMime(imageBinary.contentType, resolvedImageUrl);
      const objectPath = `publications/${publication.id}/${Date.now()}.${ext}`;

      if (DRY_RUN) {
        skipped += 1;
        console.log(`[DRY-RUN] ${publication.id} -> would upload ${objectPath}`);
        continue;
      }

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, imageBinary.bytes, {
        contentType: imageBinary.contentType || "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });

      if (uploadError) {
        failed += 1;
        console.log(`[FAIL] ${publication.id} -> upload error: ${uploadError.message}`);
        continue;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);

      const updateResult = await pool.query(
        `UPDATE publications SET photo_url = $1 WHERE id = $2`,
        [publicUrl, publication.id],
      );

      if ((updateResult.rowCount || 0) === 0) {
        failed += 1;
        console.log(`[FAIL] ${publication.id} -> DB update returned 0 rows`);
        continue;
      }

      migrated += 1;
      console.log(`[OK] ${publication.id} -> ${publicUrl}`);
    }

    console.log("Migration complete.");
    console.log(`Migrated: ${migrated}`);
    console.log(`Dry-run skipped: ${skipped}`);
    console.log(`Failed: ${failed}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
