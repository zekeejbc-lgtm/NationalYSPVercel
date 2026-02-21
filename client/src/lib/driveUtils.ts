export function extractDriveFileId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
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
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  return url;
}

export function isDriveUrl(url: string): boolean {
  return url.includes("drive.google.com");
}

export function getDisplayImageUrl(imageUrl: string): string {
  if (!imageUrl) return "";
  if (isDriveUrl(imageUrl)) {
    return normalizeDriveImageUrl(imageUrl);
  }
  return imageUrl;
}
