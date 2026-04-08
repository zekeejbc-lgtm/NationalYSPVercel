import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSocialMeta, resolveMainFacebookUrl, sanitizeContactSocials } from "@/lib/contactSocials";
import {
  buildOsmEmbedUrl,
  geocodeLocation,
  parseMapSelectionFromUrl,
  reverseGeocodeLocation,
  toEmbeddableMapUrl,
} from "@/lib/hqMap";
import { MapPin, Plus, Search, Trash2 } from "lucide-react";
import type { ContactInfo } from "@shared/schema";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type SocialInputRow = {
  url: string;
  label: string;
};

type ContactUpdatePayload = {
  email: string;
  phone: string;
  facebook: string;
  socials: Array<{ url: string; label?: string }>;
  hqOfficeName: string | null;
  hqAddress: string | null;
  hqMapUrl: string | null;
};

const DEFAULT_FACEBOOK_URL = "https://www.facebook.com/YOUTHSERVICEPHILIPPINES";
const HQ_MAP_DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];
const HQ_MAP_DEFAULT_ZOOM = 12;
const HQ_MAP_FOCUSED_ZOOM = 16;

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const hqPickerMarkerIcon = L.divIcon({
  className: "ysp-hq-picker-marker",
  html: `
    <div style="position:relative;width:22px;height:22px;transform:translate(-11px,-22px);">
      <div style="width:22px;height:22px;border-radius:999px;background:#f97316;border:2px solid #ffffff;box-shadow:0 4px 10px rgba(15,23,42,0.35);"></div>
      <div style="position:absolute;left:8px;top:20px;width:6px;height:8px;background:#f97316;clip-path:polygon(50% 100%,0 0,100% 0);"></div>
    </div>
  `,
  iconSize: [22, 30],
  iconAnchor: [11, 30],
});

function LocationMapViewportController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, { animate: true });

    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [center, zoom, map]);

  return null;
}

function LocationMapClickHandler({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export default function ContactManager() {
  const { toast } = useToast();
  const reverseLookupRequestIdRef = useRef(0);
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    facebook: "",
    socials: [{ url: "", label: "" }] as SocialInputRow[],
    hqOfficeName: "",
    hqAddress: "",
    hqMapUrl: "",
  });
  const [hqSelection, setHqSelection] = useState<{ lat: number; lng: number } | null>(null);
  const [hqMapCenter, setHqMapCenter] = useState<[number, number]>(HQ_MAP_DEFAULT_CENTER);
  const [hqMapZoom, setHqMapZoom] = useState(HQ_MAP_DEFAULT_ZOOM);
  const [hqSearchAddress, setHqSearchAddress] = useState("");
  const [isHqReverseLookupPending, setIsHqReverseLookupPending] = useState(false);
  const [isHqAddressSearchPending, setIsHqAddressSearchPending] = useState(false);
  const [hqLookupMessage, setHqLookupMessage] = useState<string | null>(null);

  const { data: contactInfo, isLoading } = useQuery<ContactInfo>({
    queryKey: ["/api/contact-info"]
  });

  useEffect(() => {
    if (contactInfo) {
      const embeddedMapUrl = toEmbeddableMapUrl(contactInfo.hqMapUrl || "");
      const parsedSelection = parseMapSelectionFromUrl(embeddedMapUrl || contactInfo.hqMapUrl || "");

      const loadedSocials = Array.isArray(contactInfo.socials)
        ? contactInfo.socials.map((entry) => ({
            url: entry.url || "",
            label: entry.label || "",
          }))
        : [];

      setFormData({
        email: contactInfo.email,
        phone: contactInfo.phone,
        facebook: contactInfo.facebook,
        socials: loadedSocials.length > 0 ? loadedSocials : [{ url: "", label: "" }],
        hqOfficeName: contactInfo.hqOfficeName || "",
        hqAddress: contactInfo.hqAddress || "",
        hqMapUrl: embeddedMapUrl || contactInfo.hqMapUrl || "",
      });
      setHqSearchAddress(contactInfo.hqAddress || "");

      if (parsedSelection) {
        setHqSelection({ lat: parsedSelection.lat, lng: parsedSelection.lng });
        setHqMapCenter([parsedSelection.lat, parsedSelection.lng]);
        setHqMapZoom(parsedSelection.zoom || HQ_MAP_FOCUSED_ZOOM);
      } else {
        setHqSelection(null);
        setHqMapCenter(HQ_MAP_DEFAULT_CENTER);
        setHqMapZoom(HQ_MAP_DEFAULT_ZOOM);
      }
    }
  }, [contactInfo]);

  const updateMutation = useMutation({
    mutationFn: (data: ContactUpdatePayload) => apiRequest("PUT", "/api/contact-info", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-info"] });
      toast({
        title: "Success",
        description: "Contact information updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update contact info",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedSocials = sanitizeContactSocials(
      formData.socials.map((entry) => ({
        url: entry.url,
        label: entry.label,
      })),
    );

    const mainFacebook =
      resolveMainFacebookUrl(formData.facebook, normalizedSocials) || DEFAULT_FACEBOOK_URL;

    updateMutation.mutate({
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      facebook: mainFacebook,
      socials: normalizedSocials,
      hqOfficeName: toNullableText(formData.hqOfficeName),
      hqAddress: toNullableText(formData.hqAddress),
      hqMapUrl: toNullableText(formData.hqMapUrl),
    });
  };

  const handleHqMapSelect = async (latitude: number, longitude: number) => {
    const nextMapUrl = buildOsmEmbedUrl(latitude, longitude, HQ_MAP_FOCUSED_ZOOM);

    setHqSelection({ lat: latitude, lng: longitude });
    setHqMapCenter([latitude, longitude]);
    setHqMapZoom(HQ_MAP_FOCUSED_ZOOM);
    setHqLookupMessage(null);
    setFormData((previous) => ({
      ...previous,
      hqMapUrl: nextMapUrl,
    }));

    const requestId = reverseLookupRequestIdRef.current + 1;
    reverseLookupRequestIdRef.current = requestId;
    setIsHqReverseLookupPending(true);

    try {
      const resolvedLocation = await reverseGeocodeLocation(latitude, longitude);
      if (reverseLookupRequestIdRef.current !== requestId) {
        return;
      }

      if (resolvedLocation) {
        setHqSearchAddress(resolvedLocation);
        setHqLookupMessage("Map location detected. Search Address was updated; Office Address stays manual.");
      } else {
        setHqLookupMessage("Pinpoint saved. You can type Office Address manually.");
      }
    } catch {
      if (reverseLookupRequestIdRef.current === requestId) {
        setHqLookupMessage("Pinpoint saved. Search Address auto-detect is temporarily unavailable.");
      }
    } finally {
      if (reverseLookupRequestIdRef.current === requestId) {
        setIsHqReverseLookupPending(false);
      }
    }
  };

  const handleSearchAddressOnMap = async () => {
    const searchQuery = hqSearchAddress.trim();
    if (!searchQuery) {
      toast({
        title: "Search address required",
        description: "Enter a Search Address first so we can locate it on the map.",
        variant: "destructive",
      });
      return;
    }

    setIsHqAddressSearchPending(true);
    setHqLookupMessage(null);

    try {
      const foundLocation = await geocodeLocation(searchQuery);
      if (!foundLocation) {
        setHqLookupMessage("No matching location found. Try a more specific address.");
        return;
      }

      await handleHqMapSelect(foundLocation.lat, foundLocation.lng);
    } catch {
      setHqLookupMessage("Location search failed. Please try again.");
    } finally {
      setIsHqAddressSearchPending(false);
    }
  };

  const addSocialRow = () => {
    setFormData((previous) => ({
      ...previous,
      socials: [...previous.socials, { url: "", label: "" }],
    }));
  };

  const updateSocialRow = (index: number, field: keyof SocialInputRow, value: string) => {
    setFormData((previous) => ({
      ...previous,
      socials: previous.socials.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    }));
  };

  const removeSocialRow = (index: number) => {
    setFormData((previous) => {
      const nextSocials = previous.socials.filter((_, rowIndex) => rowIndex !== index);
      return {
        ...previous,
        socials: nextSocials.length > 0 ? nextSocials : [{ url: "", label: "" }],
      };
    });
  };

  if (isLoading) {
    return <LoadingState label="Loading contact information..." rows={1} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Information</CardTitle>
        <CardDescription>
          Update the organization's contact details displayed on the website
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              data-testid="input-contact-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              data-testid="input-contact-phone"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="facebook">Facebook Page URL</Label>
            <Input
              id="facebook"
              type="url"
              value={formData.facebook}
              onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
              data-testid="input-contact-facebook"
            />
            <p className="text-xs text-muted-foreground">
              This is the main Facebook link shown in the footer. If empty, the first Facebook social link will be used.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Social Links</Label>
                <p className="text-xs text-muted-foreground">
                  Paste any social URL and the platform logo will be detected automatically.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSocialRow}
                data-testid="button-add-contact-social"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Social
              </Button>
            </div>

            <div className="space-y-3">
              {formData.socials.map((social, index) => {
                const socialMeta = getSocialMeta(social.url, social.label);
                const SocialIcon = socialMeta.Icon;

                return (
                  <div key={`contact-social-row-${index}`} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <SocialIcon className="h-4 w-4 text-primary" />
                        <span>{socialMeta.name}</span>
                        {socialMeta.hostname && <span className="text-xs">({socialMeta.hostname})</span>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSocialRow(index)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-remove-contact-social-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <Input
                      type="url"
                      placeholder="https://instagram.com/yourpage"
                      value={social.url}
                      onChange={(e) => updateSocialRow(index, "url", e.target.value)}
                      data-testid={`input-contact-social-url-${index}`}
                    />
                    <Input
                      placeholder="Optional label (e.g. Community Group)"
                      value={social.label}
                      onChange={(e) => updateSocialRow(index, "label", e.target.value)}
                      data-testid={`input-contact-social-label-${index}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label>HQ Office</Label>
            <p className="text-xs text-muted-foreground">
              Office Address is manual and saved. Search Address is separate and only used for map lookup.
            </p>

            <div className="space-y-2">
              <Label htmlFor="hq-office-name">Office Name</Label>
              <Input
                id="hq-office-name"
                value={formData.hqOfficeName}
                onChange={(e) => setFormData({ ...formData, hqOfficeName: e.target.value })}
                placeholder="National Headquarters"
                data-testid="input-contact-hq-office-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hq-address">Office Address</Label>
              <Input
                id="hq-address"
                value={formData.hqAddress}
                onChange={(e) => {
                  setHqLookupMessage(null);
                  setFormData({ ...formData, hqAddress: e.target.value });
                }}
                placeholder="Makati City, Metro Manila"
                data-testid="input-contact-hq-address"
              />
              <p className="text-xs text-muted-foreground">
                This exact value is what appears on the public Contact page.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hq-search-address">Search Address (Map Only)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="hq-search-address"
                  value={hqSearchAddress}
                  onChange={(e) => {
                    setHqLookupMessage(null);
                    setHqSearchAddress(e.target.value);
                  }}
                  placeholder="Tagum City, Davao del Norte"
                  data-testid="input-contact-hq-search-address"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSearchAddressOnMap}
                  disabled={isHqAddressSearchPending}
                  data-testid="button-search-contact-hq-address"
                >
                  <Search className="mr-1 h-4 w-4" />
                  {isHqAddressSearchPending ? "Searching..." : "Find on Map"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location Selector Map</Label>
              <div className="h-[300px] rounded-md border overflow-hidden">
                <MapContainer
                  center={hqMapCenter}
                  zoom={hqMapZoom}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationMapViewportController center={hqMapCenter} zoom={hqMapZoom} />
                  <LocationMapClickHandler onSelect={handleHqMapSelect} />

                  {hqSelection && (
                    <Marker
                      position={[hqSelection.lat, hqSelection.lng]}
                      icon={hqPickerMarkerIcon}
                      draggable
                      eventHandlers={{
                        dragend: (event) => {
                          const marker = event.target as L.Marker;
                          const position = marker.getLatLng();
                          void handleHqMapSelect(position.lat, position.lng);
                        },
                      }}
                    />
                  )}
                </MapContainer>
              </div>
              <p className="text-xs text-muted-foreground">
                Click or drag the pin to set HQ location. The address will be auto-filled with the resolved location name.
              </p>
              {(isHqReverseLookupPending || hqLookupMessage) && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {isHqReverseLookupPending ? "Resolving location name from map..." : hqLookupMessage}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hq-map-url">Map URL (Auto-generated)</Label>
              <Input
                id="hq-map-url"
                type="url"
                value={formData.hqMapUrl}
                placeholder="Map URL is generated when you place the pin"
                readOnly
                data-testid="input-contact-hq-map-url"
              />
            </div>
          </div>

          <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-contact">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
