export const ORGANIZATION_REPORT_INFO = {
  name: "Youth Service PH",
  fullGovernmentName: "Youth Service to the Filipino Youth, Inc.",
  motto: "Empowering Filipino Youth Through Community Service",
  secRegistryNumber: "2023010080782-00",
  facebook: "/YOUTHSERVICEPHILIPPINES",
  website: "youthserviceph.org",
  email: "national@youthserviceph.org",
  logoPath: "/images/ysp-logo.png",
} as const;

export const PDF_THEME = {
  accent: [249, 115, 22] as const,
  border: [229, 231, 235] as const,
  text: [17, 24, 39] as const,
  mutedText: [75, 85, 99] as const,
  tableHeaderFill: [255, 247, 237] as const,
} as const;

export function formatManilaDateTime12h(date: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatManilaDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" ? value : "-";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

export function createSafeFileToken(value: string | null | undefined, fallback = "chapter") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export function getIsoDateFileStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
