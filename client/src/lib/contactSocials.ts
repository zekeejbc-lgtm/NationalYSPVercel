import type { LucideIcon } from "lucide-react";
import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  MessageCircle,
  Music2,
  Twitter,
  Youtube,
} from "lucide-react";

export type ContactSocialEntry = {
  url: string;
  label?: string;
};

type SocialMatch = {
  id: string;
  name: string;
  Icon: LucideIcon;
  domains: string[];
};

const SOCIAL_MATCHERS: SocialMatch[] = [
  {
    id: "facebook",
    name: "Facebook",
    Icon: Facebook,
    domains: ["facebook.com", "fb.com", "m.facebook.com"],
  },
  {
    id: "instagram",
    name: "Instagram",
    Icon: Instagram,
    domains: ["instagram.com"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    Icon: Linkedin,
    domains: ["linkedin.com"],
  },
  {
    id: "youtube",
    name: "YouTube",
    Icon: Youtube,
    domains: ["youtube.com", "youtu.be"],
  },
  {
    id: "x",
    name: "X",
    Icon: Twitter,
    domains: ["x.com", "twitter.com"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    Icon: Music2,
    domains: ["tiktok.com"],
  },
  {
    id: "messenger",
    name: "Messenger",
    Icon: MessageCircle,
    domains: ["m.me", "messenger.com"],
  },
];

export function normalizeExternalUrl(value?: string | null): string {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function getHostname(value?: string | null): string {
  const normalizedUrl = normalizeExternalUrl(value);
  if (!normalizedUrl) {
    return "";
  }

  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function matchesDomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function getSocialMeta(value?: string | null, explicitLabel?: string | null) {
  const hostname = getHostname(value);
  const label = explicitLabel?.trim();

  const matched = SOCIAL_MATCHERS.find((social) =>
    social.domains.some((domain) => matchesDomain(hostname, domain)),
  );

  if (matched) {
    return {
      id: matched.id,
      name: label || matched.name,
      Icon: matched.Icon,
      hostname,
    };
  }

  return {
    id: "website",
    name: label || "Website",
    Icon: Globe,
    hostname,
  };
}

export function isFacebookUrl(value?: string | null) {
  const hostname = getHostname(value);
  return matchesDomain(hostname, "facebook.com") || matchesDomain(hostname, "fb.com");
}

export function sanitizeContactSocials(entries: ContactSocialEntry[]) {
  const dedupe = new Set<string>();
  const cleaned: ContactSocialEntry[] = [];

  for (const entry of entries) {
    const url = normalizeExternalUrl(entry.url);
    if (!url) {
      continue;
    }

    const dedupeKey = url.toLowerCase();
    if (dedupe.has(dedupeKey)) {
      continue;
    }

    dedupe.add(dedupeKey);
    const label = entry.label?.trim();

    cleaned.push({
      url,
      ...(label ? { label } : {}),
    });
  }

  return cleaned;
}

export function resolveMainFacebookUrl(fallbackFacebook: string, socials: ContactSocialEntry[]) {
  const normalizedFallback = normalizeExternalUrl(fallbackFacebook);
  if (isFacebookUrl(normalizedFallback)) {
    return normalizedFallback;
  }

  const firstFacebook = socials.find((social) => isFacebookUrl(social.url));
  return firstFacebook?.url || normalizedFallback;
}
