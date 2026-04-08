import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Facebook, Mail, MapPin, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import {
  getSocialMeta,
  normalizeExternalUrl,
  resolveMainFacebookUrl,
  sanitizeContactSocials,
} from "@/lib/contactSocials";
import { buildOsmPublicUrl, parseMapSelectionFromUrl, toEmbeddableMapUrl } from "@/lib/hqMap";
import type { ContactInfo } from "@shared/schema";

const DEFAULT_CONTACT_EMAIL = "phyouthservice@gmail.com";
const DEFAULT_CONTACT_PHONE = "09177798413";
const DEFAULT_CONTACT_FACEBOOK = "https://www.facebook.com/YOUTHSERVICEPHILIPPINES";

export default function Contact() {
  const [isHqMapOpen, setIsHqMapOpen] = useState(false);

  const {
    data: contactInfo,
    isLoading: contactInfoLoading,
    isFetched: contactInfoFetched,
  } = useQuery<ContactInfo>({
    queryKey: ["/api/contact-info"] 
  });

  const isContactDataLoading = contactInfoLoading || !contactInfoFetched;

  const socialLinks = useMemo(() => {
    const baseSocials = sanitizeContactSocials(
      Array.isArray(contactInfo?.socials) ? contactInfo.socials : [],
    );

    if (baseSocials.length === 0) {
      const fallbackFacebook = normalizeExternalUrl(contactInfo?.facebook || DEFAULT_CONTACT_FACEBOOK);
      if (fallbackFacebook) {
        return [{ url: fallbackFacebook, label: "Facebook" }];
      }
    }

    return baseSocials;
  }, [contactInfo]);

  const mainFacebookUrl = useMemo(() => {
    return (
      resolveMainFacebookUrl(contactInfo?.facebook || DEFAULT_CONTACT_FACEBOOK, socialLinks) ||
      DEFAULT_CONTACT_FACEBOOK
    );
  }, [contactInfo, socialLinks]);

  const normalizedHqMapUrl = toEmbeddableMapUrl(contactInfo?.hqMapUrl);
  const hqPublicMapUrl = useMemo(() => {
    const mapSelection = parseMapSelectionFromUrl(contactInfo?.hqMapUrl || normalizedHqMapUrl);
    if (mapSelection) {
      return buildOsmPublicUrl(mapSelection.lat, mapSelection.lng, mapSelection.zoom || 16);
    }

    return normalizedHqMapUrl;
  }, [contactInfo?.hqMapUrl, normalizedHqMapUrl]);
  const hasHqCard =
    Boolean(contactInfo?.hqOfficeName?.trim()) ||
    Boolean(contactInfo?.hqAddress?.trim()) ||
    Boolean(normalizedHqMapUrl);

  return (
    <div className="min-h-screen">
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Have questions or want to get involved? We'd love to hear from you. 
              Reach out to us through any of the following channels.
            </p>
          </div>

          {isContactDataLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" role="status" aria-label="Loading contact information">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={`contact-card-skeleton-${index}`} className="text-center" aria-hidden="true">
                  <CardHeader>
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                    <Skeleton className="mx-auto h-6 w-28" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="mx-auto h-6 w-44" />
                    <Skeleton className="mx-auto h-4 w-36" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover-elevate transition-all text-center">
              <CardHeader>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Email Us</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={`mailto:${contactInfo?.email || DEFAULT_CONTACT_EMAIL}`}
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-email"
                >
                  {contactInfo?.email || DEFAULT_CONTACT_EMAIL}
                </a>
                <p className="text-sm text-muted-foreground mt-2">
                  Send us an email anytime
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all text-center">
              <CardHeader>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Call Us</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={`tel:${contactInfo?.phone || DEFAULT_CONTACT_PHONE}`}
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-phone"
                >
                  {contactInfo?.phone || DEFAULT_CONTACT_PHONE}
                </a>
                <p className="text-sm text-muted-foreground mt-2">
                  Mon-Fri, 9:00 AM - 5:00 PM
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all text-center">
              <CardHeader>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Facebook className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Follow Us</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={mainFacebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-facebook"
                >
                  @YOUTHSERVICEPHILIPPINES
                </a>
                <p className="text-sm text-muted-foreground mt-2">
                  Stay updated with our activities
                </p>
              </CardContent>
            </Card>
          </div>
          )}

          {!isContactDataLoading && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="hover-elevate transition-all">
                <CardHeader>
                  <CardTitle className="text-xl">Social Channels</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {socialLinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-empty-contact-socials">
                      No social links available yet.
                    </p>
                  ) : (
                    socialLinks.map((social, index) => {
                      const socialMeta = getSocialMeta(social.url, social.label);
                      const SocialIcon = socialMeta.Icon;

                      return (
                        <a
                          key={`${social.url}-${index}`}
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                          data-testid={`link-contact-social-${index}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <SocialIcon className="h-5 w-5 text-primary shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{socialMeta.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{socialMeta.hostname || social.url}</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </a>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {hasHqCard && (
                <Card
                  className={`hover-elevate transition-all ${normalizedHqMapUrl ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (normalizedHqMapUrl) {
                      setIsHqMapOpen(true);
                    }
                  }}
                  data-testid="card-contact-hq"
                >
                  <CardHeader>
                    <CardTitle className="text-xl">HQ Location</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span className="font-medium text-foreground">
                          {contactInfo?.hqOfficeName?.trim() || "National Headquarters"}
                        </span>
                      </p>
                      {contactInfo?.hqAddress?.trim() && (
                        <p className="text-muted-foreground">{contactInfo.hqAddress}</p>
                      )}
                      {normalizedHqMapUrl ? (
                        <p className="inline-flex items-center gap-1 text-primary font-medium">
                          View Map <ExternalLink className="h-4 w-4" />
                        </p>
                      ) : (
                        <p className="text-muted-foreground">Map link not set yet.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <Card className="mt-12 hover-elevate transition-all">
            <CardHeader>
              <CardTitle className="text-center text-2xl">Get Involved</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-6">
                Whether you want to volunteer, start a chapter, or partner with us, 
                we're excited to work with you. Contact us today and let's make a difference together!
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link href="/membership" data-testid="link-become-member" className="text-primary hover:underline font-medium">
                  Become a Member →
                </Link>
                <Link href="/volunteer" data-testid="link-volunteer" className="text-primary hover:underline font-medium">
                  View Volunteer Opportunities →
                </Link>
              </div>
            </CardContent>
          </Card>

          <Dialog open={isHqMapOpen} onOpenChange={setIsHqMapOpen}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden gap-0">
              <DialogHeader className="px-6 py-4 border-b">
                <DialogTitle>{contactInfo?.hqOfficeName?.trim() || "HQ Location"}</DialogTitle>
                <DialogDescription>
                  Interactive map powered by your configured Leaflet/OpenStreetMap link.
                </DialogDescription>
              </DialogHeader>

              {normalizedHqMapUrl ? (
                <div className="space-y-3 p-4">
                  <iframe
                    src={normalizedHqMapUrl}
                    className="h-[60vh] w-full rounded-lg border"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="HQ Location Map"
                  />
                  <div className="text-right">
                    <a
                      href={hqPublicMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Open map in new tab <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-sm text-muted-foreground">No map link configured yet.</div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  );
}
