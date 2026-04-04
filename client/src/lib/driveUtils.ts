export const IMAGE_DEBUG_ENABLED = import.meta.env.DEV && import.meta.env.VITE_IMAGE_DEBUG === "true";
export const DEFAULT_IMAGE_FALLBACK_SRC = "/images/ysp-logo.png";

const FALLBACK_APPLIED_DATASET_KEY = "fallbackApplied";

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
    const normalizedUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    if (IMAGE_DEBUG_ENABLED) {
      console.log("[Image Debug] Normalized Drive URL", {
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
    return normalizeDriveImageUrl(sanitizedUrl);
  }

  if (isIbbPageUrl(sanitizedUrl)) {
    const proxyUrl = getImageProxyUrl(sanitizedUrl);
    if (IMAGE_DEBUG_ENABLED) {
      console.log("[Image Debug] Using image proxy URL", { imageUrl: sanitizedUrl, proxyUrl });
    }
    return proxyUrl;
  }

  return sanitizedUrl;
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
