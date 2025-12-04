import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Chapter } from "@shared/schema";
import { Mail, Phone, MapPin, User } from "lucide-react";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

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
    <div className="w-full h-[400px] rounded-lg overflow-hidden border shadow-sm">
      <MapContainer
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
            icon={markerIcon}
          >
            <Popup>
              <div className="min-w-[200px] max-w-[280px]">
                <h3 className="font-bold text-base mb-2 text-foreground">{chapter.name}</h3>
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
                      <a href={`mailto:${chapter.email}`} className="hover:underline truncate">
                        {chapter.email}
                      </a>
                    </p>
                  )}
                  {chapter.representative && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{chapter.representative}</span>
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
