export const IMAGE_DEBUG_ENABLED = import.meta.env.DEV && import.meta.env.VITE_IMAGE_DEBUG === "true";
export const DEFAULT_IMAGE_FALLBACK_SRC = "/images/ysp-logo.png";

const FALLBACK_APPLIED_DATASET_KEY = "fallbackApplied";

type GoogleDriveUploadFileNameOptions = {
  originalFileName: string;
  uploaderUsername?: string | null;
  uploadLocation: string;
  purpose: string;
  uploadedAt?: Date;
};

export function extractDriveFileId(url: string): string | null {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    const queryId =
      parsedUrl.searchParams.get("id") ||
      parsedUrl.searchParams.get("fileId") ||
      parsedUrl.searchParams.get("docid");

    if (queryId && /^[a-zA-Z0-9_-]+$/.test(queryId)) {
      return queryId;
    }
  } catch {
    // Continue with regex extraction for non-URL strings.
  }

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /[?&]fileId=([a-zA-Z0-9_-]+)/,
    /[?&]docid=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

export function normalizeDriveImageUrl(url: string): string {
  if (!url) return "";

  const fileId = extractDriveFileId(url);
  if (fileId) {
    const normalizedUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w4000`;
    if (IMAGE_DEBUG_ENABLED) {
      console.error("[Image Debug] Normalized Drive URL", {
        originalUrl: url,
        normalizedUrl,
        fileId,
      });
    }
    return normalizedUrl;
  }

  if (IMAGE_DEBUG_ENABLED && url.includes("drive.google.com")) {
    console.error("[Image Debug] Could not extract Drive file ID", { originalUrl: url });
  }

  return url;
}

export function isDriveUrl(url: string): boolean {
  const hostname = getHostname(url);
  return (
    hostname === "drive.google.com" ||
    hostname === "www.drive.google.com" ||
    hostname === "docs.google.com" ||
    hostname === "www.docs.google.com" ||
    hostname === "drive.usercontent.google.com"
  );
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isIbbPageUrl(url: string): boolean {
  const hostname = getHostname(url);
  return hostname === "ibb.co" || hostname === "www.ibb.co" || hostname === "imgbb.com" || hostname === "www.imgbb.com";
}

function getImageProxyUrl(imageUrl: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

export function getDisplayImageUrl(imageUrl: string): string {
  if (!imageUrl) {
    return "";
  }

  const sanitizedUrl = imageUrl.trim();
  if (!sanitizedUrl) {
    return "";
  }

  if (isDriveUrl(sanitizedUrl)) {
    const normalizedUrl = normalizeDriveImageUrl(sanitizedUrl);
    const proxyUrl = getImageProxyUrl(normalizedUrl);
    if (IMAGE_DEBUG_ENABLED) {
      console.error("[Image Debug] Using Drive image proxy URL", { imageUrl: sanitizedUrl, normalizedUrl, proxyUrl });
    }
    return proxyUrl;
  }

  if (isIbbPageUrl(sanitizedUrl)) {
    const proxyUrl = getImageProxyUrl(sanitizedUrl);
    if (IMAGE_DEBUG_ENABLED) {
      console.error("[Image Debug] Using image proxy URL", { imageUrl: sanitizedUrl, proxyUrl });
    }
    return proxyUrl;
  }

  return sanitizedUrl;
}

export function getGoogleDriveUploadUrl(uploadData: unknown): string {
  if (!uploadData || typeof uploadData !== "object") {
    return "";
  }

  const data = uploadData as Record<string, unknown>;
  const candidates = [
    data.url,
    data.webViewLink,
    data.viewLink,
    data.publicUrl,
    data.publicURL,
    data.fileUrl,
    data.fileURL,
    data.driveUrl,
    data.driveURL,
    data.downloadUrl,
    data.downloadURL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

export function getGoogleDriveUploadErrorMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Failed to upload image";

  if (/access denied:\s*driveapp/i.test(rawMessage)) {
    return "Google Drive rejected the upload because the Apps Script does not have Drive access. Redeploy or reauthorize the script with Drive permission, and make sure the target folder is writable by the script owner.";
  }

  return rawMessage;
}

function getSafeFileNameSegment(value?: string | null): string {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

function getFileExtension(fileName: string): string {
  const match = fileName.match(/\.([a-zA-Z0-9]{1,12})$/);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function formatUploadDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join("-") + `_${pad(value.getHours())}-${pad(value.getMinutes())}-${pad(value.getSeconds())}`;
}

export function buildGoogleDriveUploadFileName({
  originalFileName,
  uploaderUsername,
  uploadLocation,
  purpose,
  uploadedAt = new Date(),
}: GoogleDriveUploadFileNameOptions): string {
  const extension = getFileExtension(originalFileName);
  const baseName = [
    getSafeFileNameSegment(uploaderUsername),
    getSafeFileNameSegment(uploadLocation),
    getSafeFileNameSegment(purpose),
    formatUploadDateTime(uploadedAt),
  ].join("_");

  return `${baseName}${extension}`;
}

export function applyImageFallback(target: HTMLImageElement, fallbackSrc = DEFAULT_IMAGE_FALLBACK_SRC): boolean {
  if (!target) {
    return false;
  }

  if (target.dataset[FALLBACK_APPLIED_DATASET_KEY] === "true") {
    return false;
  }

  target.dataset[FALLBACK_APPLIED_DATASET_KEY] = "true";
  target.src = fallbackSrc;
  return true;
}

export function resetImageFallback(target: HTMLImageElement): void {
  if (!target) {
    return;
  }

  delete target.dataset[FALLBACK_APPLIED_DATASET_KEY];
  target.style.removeProperty("display");
}
