export type MapSelection = {
  lat: number;
  lng: number;
  zoom?: number;
};

type NominatimSearchResult = {
  lat: string;
  lon: string;
};

type NominatimReverseResult = {
  display_name?: string;
  address?: {
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

function normalizeExternalUrl(value?: string | null) {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function parseCoordinate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value: number) {
  return value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return value >= -180 && value <= 180;
}

function toSelection(lat: number | null, lng: number | null, zoom?: number): MapSelection | null {
  if (lat === null || lng === null || !isValidLatitude(lat) || !isValidLongitude(lng)) {
    return null;
  }

  return { lat, lng, zoom };
}

export function parseMapSelectionFromUrl(rawUrl?: string | null): MapSelection | null {
  const normalizedUrl = normalizeExternalUrl(rawUrl);
  if (!normalizedUrl) {
    return null;
  }

  const hashMapMatch = normalizedUrl.match(/#map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i);
  if (hashMapMatch) {
    const zoom = Number.parseInt(hashMapMatch[1], 10);
    const lat = parseCoordinate(hashMapMatch[2]);
    const lng = parseCoordinate(hashMapMatch[3]);
    const selection = toSelection(lat, lng, Number.isFinite(zoom) ? zoom : undefined);
    if (selection) {
      return selection;
    }
  }

  try {
    const parsedUrl = new URL(normalizedUrl);

    const markerValue = parsedUrl.searchParams.get("marker");
    if (markerValue) {
      const markerParts = markerValue.split(",").map((part) => part.trim());
      if (markerParts.length === 2) {
        const markerLat = parseCoordinate(markerParts[0]);
        const markerLng = parseCoordinate(markerParts[1]);
        const markerSelection = toSelection(markerLat, markerLng);
        if (markerSelection) {
          return markerSelection;
        }
      }
    }

    const mlat = parseCoordinate(parsedUrl.searchParams.get("mlat"));
    const mlon = parseCoordinate(parsedUrl.searchParams.get("mlon"));
    const markerSelection = toSelection(mlat, mlon);
    if (markerSelection) {
      return markerSelection;
    }

    const qValue = parsedUrl.searchParams.get("q");
    if (qValue) {
      const qParts = qValue.split(",").map((part) => part.trim());
      if (qParts.length === 2) {
        const qLat = parseCoordinate(qParts[0]);
        const qLng = parseCoordinate(qParts[1]);
        const qSelection = toSelection(qLat, qLng);
        if (qSelection) {
          return qSelection;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

function bboxDeltaForZoom(zoom: number) {
  if (zoom >= 16) {
    return 0.005;
  }

  if (zoom >= 14) {
    return 0.01;
  }

  if (zoom >= 12) {
    return 0.03;
  }

  return 0.08;
}

export function buildOsmEmbedUrl(lat: number, lng: number, zoom = 16) {
  const delta = bboxDeltaForZoom(zoom);
  const minLng = lng - delta;
  const minLat = lat - delta;
  const maxLng = lng + delta;
  const maxLat = lat + delta;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`,
  )}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

export function buildOsmPublicUrl(lat: number, lng: number, zoom = 16) {
  return `https://www.openstreetmap.org/#map=${zoom}/${lat.toFixed(6)}/${lng.toFixed(6)}`;
}

export function toEmbeddableMapUrl(rawUrl?: string | null) {
  const normalizedUrl = normalizeExternalUrl(rawUrl);
  if (!normalizedUrl) {
    return "";
  }

  if (!/openstreetmap\.org/i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  if (normalizedUrl.includes("/export/embed.html")) {
    return normalizedUrl;
  }

  const selection = parseMapSelectionFromUrl(normalizedUrl);
  if (!selection) {
    return normalizedUrl;
  }

  return buildOsmEmbedUrl(selection.lat, selection.lng, selection.zoom ?? 16);
}

function formatReverseAddress(result: NominatimReverseResult) {
  const address = result.address;
  if (!address) {
    return result.display_name || null;
  }

  const parts = [
    address.neighbourhood || address.suburb || address.village || address.town || address.city,
    address.county,
    address.state,
    address.country,
  ].filter((value): value is string => Boolean(value && value.trim()));

  if (parts.length > 0) {
    return Array.from(new Set(parts)).join(", ");
  }

  return result.display_name || null;
}

export async function reverseGeocodeLocation(lat: number, lng: number): Promise<string | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
  );

  if (!response.ok) {
    throw new Error("Failed to reverse geocode location");
  }

  const result = (await response.json()) as NominatimReverseResult;
  return formatReverseAddress(result);
}

export async function geocodeLocation(query: string): Promise<MapSelection | null> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return null;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(normalizedQuery)}`,
  );

  if (!response.ok) {
    throw new Error("Failed to search location");
  }

  const results = (await response.json()) as NominatimSearchResult[];
  const first = results[0];
  if (!first) {
    return null;
  }

  return toSelection(parseCoordinate(first.lat), parseCoordinate(first.lon));
}
