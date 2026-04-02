import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Chapter } from "@shared/schema";
import { Mail, Phone, MapPin, User } from "lucide-react";
import { getDisplayImageUrl } from "@/lib/driveUtils";

const WEBSITE_LOGO_SRC = "/images/ysp-logo.png";

function isUnsupportedPhotoUrl(photoUrl: string): boolean {
  const normalized = photoUrl.toLowerCase();
  return normalized.includes("facebook.com/") || normalized.includes("fb.com/");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getChapterLogoSrc(photo?: string | null): string {
  const normalizedPhoto = photo?.trim() || "";
  if (!normalizedPhoto || isUnsupportedPhotoUrl(normalizedPhoto)) {
    return WEBSITE_LOGO_SRC;
  }

  return getDisplayImageUrl(normalizedPhoto);
}

function createMarkerIcon(logoSrc: string): L.DivIcon {
  const safeLogoSrc = escapeHtmlAttribute(logoSrc);
  const safeFallbackSrc = escapeHtmlAttribute(WEBSITE_LOGO_SRC);

  return L.divIcon({
    className: "ysp-chapter-marker",
    html: `
      <div style="position:relative;width:40px;height:52px;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.28));">
        <svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="display:block;">
          <path d="M20 1C10.6 1 3 8.6 3 18c0 12.3 14.4 29.2 16.2 31.2.4.5 1.2.5 1.6 0C22.6 47.2 37 30.3 37 18 37 8.6 29.4 1 20 1z" fill="#ffffff" stroke="#f97316" stroke-width="2.2" />
          <circle cx="20" cy="19" r="10.7" fill="#ffffff" stroke="#fb923c" stroke-width="1.4" />
        </svg>
        <div style="position:absolute;top:8px;left:9px;width:22px;height:22px;border-radius:999px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <img src="${safeLogoSrc}" alt="Chapter logo" style="width:16px;height:16px;object-fit:contain;" onerror="this.onerror=null;this.src='${safeFallbackSrc}';"/>
        </div>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    popupAnchor: [0, -46],
  });
}

const markerIconCache = new Map<string, L.DivIcon>();

function getMarkerIcon(photo?: string | null): L.DivIcon {
  const logoSrc = getChapterLogoSrc(photo);
  const cachedIcon = markerIconCache.get(logoSrc);

  if (cachedIcon) {
    return cachedIcon;
  }

  const newIcon = createMarkerIcon(logoSrc);
  markerIconCache.set(logoSrc, newIcon);
  return newIcon;
}

function FitBounds({ chapters }: { chapters: Chapter[] }) {
  const map = useMap();
  
  useEffect(() => {
    const validChapters = chapters.filter(
      ch => ch.latitude && ch.longitude
    );
    
    if (validChapters.length > 0) {
      const bounds = L.latLngBounds(
        validChapters.map(ch => [
          parseFloat(ch.latitude!),
          parseFloat(ch.longitude!)
        ])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [chapters, map]);
  
  return null;
}

interface ChaptersMapProps {
  chapters: Chapter[];
}

export default function ChaptersMap({ chapters }: ChaptersMapProps) {
  const validChapters = chapters.filter(
    ch => ch.latitude && ch.longitude && 
    !isNaN(parseFloat(ch.latitude)) && 
    !isNaN(parseFloat(ch.longitude))
  );

  if (validChapters.length === 0) {
    return (
      <div className="w-full h-[400px] bg-muted rounded-lg flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No chapter locations available yet.</p>
          <p className="text-sm">Chapters with coordinates will appear on the map.</p>
        </div>
      </div>
    );
  }

  const centerLat = validChapters.reduce((sum, ch) => sum + parseFloat(ch.latitude!), 0) / validChapters.length;
  const centerLng = validChapters.reduce((sum, ch) => sum + parseFloat(ch.longitude!), 0) / validChapters.length;

  return (
    <div className="relative z-0 w-full h-[400px] rounded-lg overflow-hidden border shadow-sm">
      <MapContainer
        className="z-0"
        center={[centerLat, centerLng]}
        zoom={6}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds chapters={validChapters} />
        {validChapters.map((chapter) => (
          <Marker
            key={chapter.id}
            position={[parseFloat(chapter.latitude!), parseFloat(chapter.longitude!)]}
            icon={getMarkerIcon(chapter.photo)}
          >
            <Popup>
              <div className="min-w-[200px] max-w-[280px]">
                <div className="mb-2 flex items-start gap-2">
                  <img
                    src={getChapterLogoSrc(chapter.photo)}
                    alt={`${chapter.name} logo`}
                    className="h-10 w-10 rounded-full border bg-white object-contain p-1"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = WEBSITE_LOGO_SRC;
                    }}
                  />
                  <h3 className="font-bold text-base text-foreground leading-tight">{chapter.name}</h3>
                </div>
                <div className="space-y-1.5 text-sm">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{chapter.location}</span>
                  </p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <a href={`tel:${chapter.contact}`} className="hover:underline">
                      {chapter.contact}
                    </a>
                  </p>
                  {chapter.email && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <a href={`mailto:${chapter.email}`} className="hover:underline break-all">
                        {chapter.email}
                      </a>
                    </p>
                  )}
                  {chapter.contactPerson && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{chapter.contactPerson}</span>
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
