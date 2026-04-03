import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Facebook, ExternalLink, Image, ImageOff, X } from "lucide-react";
import { format } from "date-fns";
import type { Publication } from "@shared/schema";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  IMAGE_DEBUG_ENABLED,
  resetImageFallback,
} from "@/lib/driveUtils";

const PUBLICATIONS_BATCH_SIZE = 3;

export default function Publications() {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [fallbackImages, setFallbackImages] = useState<Record<string, boolean>>({});
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [visibleCount, setVisibleCount] = useState(PUBLICATIONS_BATCH_SIZE);
  const { data: publications = [], isLoading, isError } = useQuery<Publication[]>({
    queryKey: ["/api/publications"]
  });

  const getPublicationPhotoUrl = (publication: Publication & { imageUrl?: string | null }) => {
    const raw = publication.photoUrl || publication.imageUrl || "";
    return getDisplayImageUrl(raw.trim());
  };

  const truncateText = (value: string, maxLength: number) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return `${cleaned.slice(0, maxLength).trimEnd()}...`;
  };

  const visiblePublications = publications.slice(0, visibleCount);
  const canShowMore = visibleCount < publications.length;
  const canHide = publications.length > PUBLICATIONS_BATCH_SIZE && visibleCount > PUBLICATIONS_BATCH_SIZE;

  const handleShowMore = () => {
    setVisibleCount((current) => Math.min(current + PUBLICATIONS_BATCH_SIZE, publications.length));
  };

  const handleHide = () => {
    setVisibleCount(PUBLICATIONS_BATCH_SIZE);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <section className="relative py-16 md:py-24 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Programs Publication
            </h1>
            <p className="text-lg text-muted-foreground">
              Stay updated with our latest activities, events, and stories from Youth Service Philippines
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-20 flex-1">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="space-y-8 py-8" role="status" aria-label="Loading publications">
              <div className="h-8 w-56 rounded-md bg-muted skeleton-shimmer mx-auto" />
              <div className="h-56 w-full rounded-xl bg-muted skeleton-shimmer" />
              <div className="h-56 w-full rounded-xl bg-muted skeleton-shimmer" />
            </div>
          ) : isError ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Failed to load publications. Please try again later.</p>
            </div>
          ) : publications.length === 0 ? (
            <div className="text-center py-16">
              <Image className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Publications Yet</h3>
              <p className="text-muted-foreground">
                Check back soon for updates and stories from our programs!
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {visiblePublications.map((publication, index) => {
                const photoUrl = getPublicationPhotoUrl(publication as Publication & { imageUrl?: string | null });
                const usesFallbackImage = Boolean(fallbackImages[publication.id]);
                const hasImageError = Boolean(failedImages[publication.id]);
                const cardImageSrc = hasImageError
                  ? ""
                  : usesFallbackImage
                    ? DEFAULT_IMAGE_FALLBACK_SRC
                    : photoUrl;

                return (
                <Card 
                  key={publication.id} 
                  className="overflow-hidden hover-elevate transition-all cursor-pointer focus-within:ring-2 focus-within:ring-ring"
                  data-testid={`card-publication-${publication.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPublication(publication)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedPublication(publication);
                    }
                  }}
                >
                  {cardImageSrc ? (
                    <div className="relative w-full aspect-video">
                      <img
                        src={cardImageSrc}
                        alt={publication.title}
                        className="w-full h-full object-cover"
                        onLoad={(event) => {
                          resetImageFallback(event.currentTarget);
                        }}
                        onError={(event) => {
                          if (!usesFallbackImage && applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                            setFallbackImages((prev) => ({ ...prev, [publication.id]: true }));
                            return;
                          }

                          setFailedImages((prev) => ({ ...prev, [publication.id]: true }));
                          if (IMAGE_DEBUG_ENABLED) {
                            console.error("[Image Debug] Publication image failed", {
                              publicationId: publication.id,
                              title: publication.title,
                              photoUrl,
                              attemptedFallback: usesFallbackImage,
                            });
                          }
                        }}
                      />
                    </div>
                  ) : photoUrl ? (
                    <div className="relative w-full aspect-video bg-muted flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ImageOff className="h-8 w-8" />
                        <span className="text-sm">Image unavailable</span>
                      </div>
                    </div>
                  ) : null}
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(publication.publishedAt), "MMMM d, yyyy 'at' h:mm a")}
                      </span>
                      {index === 0 && (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
                          Latest
                        </span>
                      )}
                    </div>
                    
                    <h2 className="text-2xl md:text-3xl font-bold mb-4">
                      {publication.title}
                    </h2>
                    
                    <p className="text-muted-foreground leading-relaxed mb-6 break-words text-justify">
                      {truncateText(publication.content, 260)}
                    </p>
                    
                    {publication.facebookLink && (
                      <div className="pt-4 border-t">
                        <Button
                          variant="outline"
                          asChild
                          className="gap-2"
                        >
                          <a
                            href={publication.facebookLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            data-testid={`link-facebook-${publication.id}`}
                          >
                            <Facebook className="h-4 w-4" />
                            View on Facebook
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}

              {(canShowMore || canHide) && (
                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={canShowMore ? handleShowMore : handleHide}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:underline"
                    data-testid="button-publications-toggle"
                  >
                    {canShowMore ? "Show more" : "Hide"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Dialog
        open={Boolean(selectedPublication)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPublication(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border p-0 gap-0 flex flex-col sm:w-full" hideClose>
          <DialogHeader className="sticky top-0 flex-none z-10 border-b bg-background/95 px-4 py-3 md:px-6">
            <div className="flex items-start justify-between gap-3 pr-2">
              <div className="min-w-0">
                <DialogTitle className="text-left text-lg leading-tight break-words md:text-2xl">
                  {selectedPublication?.title}
                </DialogTitle>
                <DialogDescription className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                  {selectedPublication ? format(new Date(selectedPublication.publishedAt), "MMMM d, yyyy 'at' h:mm a") : ""}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Close dialog">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          {selectedPublication && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-4 py-4 md:px-6 md:py-5">
              {(() => {
                const selectedPhotoUrl = getPublicationPhotoUrl(selectedPublication as Publication & { imageUrl?: string | null });
                const selectedUsesFallback = Boolean(fallbackImages[selectedPublication.id]);
                const selectedImageError = Boolean(failedImages[selectedPublication.id]);
                const selectedImageSrc = selectedImageError
                  ? ""
                  : selectedUsesFallback
                    ? DEFAULT_IMAGE_FALLBACK_SRC
                    : selectedPhotoUrl;

                if (selectedImageSrc) {
                  return (
                    <img
                      src={selectedImageSrc}
                      alt={selectedPublication.title}
                      className="w-full max-h-[420px] object-contain rounded-xl bg-muted"
                      loading="lazy"
                      decoding="async"
                      onLoad={(event) => {
                        resetImageFallback(event.currentTarget);
                      }}
                      onError={(event) => {
                        if (!selectedUsesFallback && applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                          setFallbackImages((prev) => ({ ...prev, [selectedPublication.id]: true }));
                          return;
                        }

                        setFailedImages((prev) => ({ ...prev, [selectedPublication.id]: true }));
                      }}
                    />
                  );
                }

                return (
                  <div className="w-full h-48 bg-muted rounded-xl flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ImageOff className="h-10 w-10" />
                      <span className="text-sm">No image available</span>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3">
                {selectedPublication.content.split("\n").filter(Boolean).map((paragraph, i) => (
                  <p key={i} className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words text-justify">
                    {paragraph}
                  </p>
                ))}
              </div>

              {selectedPublication.facebookLink && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    asChild
                    className="gap-2"
                  >
                    <a
                      href={selectedPublication.facebookLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Facebook className="h-4 w-4" />
                      View on Facebook
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
