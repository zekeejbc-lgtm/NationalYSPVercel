import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, ChevronDown, Facebook, ExternalLink, Image, ImageOff, Search, X } from "lucide-react";
import { format } from "date-fns";
import type { Chapter, Publication } from "@shared/schema";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  IMAGE_DEBUG_ENABLED,
  resetImageFallback,
} from "@/lib/driveUtils";

const PUBLICATIONS_BATCH_SIZE = 3;

function PublicationCardSkeleton({ isAlternatingRow }: { isAlternatingRow: boolean }) {
  return (
    <Card className="overflow-hidden" aria-hidden="true">
      <div className="grid gap-0 md:grid-cols-2">
        <div className={`relative min-h-[220px] bg-muted ${isAlternatingRow ? "md:order-2" : "md:order-1"}`}>
          <Skeleton className="h-full min-h-[220px] w-full rounded-none" />
        </div>

        <CardContent className={`p-6 md:p-8 md:flex md:flex-col md:justify-center ${isAlternatingRow ? "md:order-1" : "md:order-2"}`}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>

            <Skeleton className="h-8 w-11/12" />

            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-10/12" />
            </div>

            <Skeleton className="h-10 w-40" />
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default function Publications() {
  const [searchInput, setSearchInput] = useState("");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [fallbackImages, setFallbackImages] = useState<Record<string, boolean>>({});
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [visibleCount, setVisibleCount] = useState(PUBLICATIONS_BATCH_SIZE);

  const {
    data: publications = [],
    isLoading: publicationsLoading,
    isFetched: publicationsFetched,
    isError,
  } = useQuery<Publication[]>({
    queryKey: ["/api/publications"],
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const isPublicationsDataLoading =
    publicationsLoading ||
    !publicationsFetched ||
    chaptersLoading ||
    !chaptersFetched;

  const chapterNameById = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter.name])),
    [chapters],
  );

  const searchTerms = useMemo(
    () => searchInput.split(",").map((term) => term.trim().toLowerCase()).filter(Boolean),
    [searchInput],
  );

  const getPublicationSearchBlob = (publication: Publication) => {
    const chapterName = publication.chapterId
      ? chapterNameById.get(publication.chapterId) || ""
      : "National / Unassigned";
    const publishedAtDate = new Date(publication.publishedAt);
    const formattedDateParts = Number.isNaN(publishedAtDate.getTime())
      ? []
      : [
          format(publishedAtDate, "MMMM d, yyyy 'at' h:mm a"),
          format(publishedAtDate, "MMMM d, yyyy"),
          format(publishedAtDate, "MMM d, yyyy"),
          format(publishedAtDate, "yyyy-MM-dd"),
          format(publishedAtDate, "MM/dd/yyyy"),
          String(publishedAtDate.getFullYear()),
        ];

    const publicationValues = Object.values(publication)
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value));

    return [
      ...publicationValues,
      chapterName,
      ...formattedDateParts,
    ]
      .join(" ")
      .toLowerCase();
  };

  const filteredPublications = useMemo(
    () => {
      if (searchTerms.length === 0) {
        return publications;
      }

      return publications.filter((publication) => {
        const searchBlob = getPublicationSearchBlob(publication);
        return searchTerms.some((term) => searchBlob.includes(term));
      });
    },
    [publications, searchTerms, chapterNameById],
  );

  useEffect(() => {
    setVisibleCount(PUBLICATIONS_BATCH_SIZE);
  }, [searchInput]);

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

  const visiblePublications = filteredPublications.slice(0, visibleCount);
  const canShowMore = visibleCount < filteredPublications.length;
  const canHide = filteredPublications.length > PUBLICATIONS_BATCH_SIZE && visibleCount > PUBLICATIONS_BATCH_SIZE;

  const handleShowMore = () => {
    setVisibleCount((current) => Math.min(current + PUBLICATIONS_BATCH_SIZE, filteredPublications.length));
  };

  const handleHide = () => {
    setVisibleCount((current) => Math.max(PUBLICATIONS_BATCH_SIZE, current - PUBLICATIONS_BATCH_SIZE));
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const publicationIdFromQuery = params.get("publicationId")?.trim() || "";

    if (!publicationIdFromQuery) {
      return;
    }

    const matchedPublication = publications.find((publication) => publication.id === publicationIdFromQuery) || null;
    if (!matchedPublication) {
      return;
    }

    setSelectedPublication((current) => {
      if (current?.id === matchedPublication.id) {
        return current;
      }

      return matchedPublication;
    });
  }, [publications]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const currentQueryPublicationId = url.searchParams.get("publicationId")?.trim() || "";
    const selectedPublicationId = selectedPublication?.id || "";

    if (selectedPublicationId) {
      if (currentQueryPublicationId === selectedPublicationId) {
        return;
      }

      url.searchParams.set("publicationId", selectedPublicationId);
    } else {
      if (!currentQueryPublicationId) {
        return;
      }

      url.searchParams.delete("publicationId");
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [selectedPublication]);

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
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          {isPublicationsDataLoading ? (
            <div className="space-y-8" role="status" aria-label="Loading publications">
              {Array.from({ length: PUBLICATIONS_BATCH_SIZE }).map((_, index) => (
                <PublicationCardSkeleton key={`publication-skeleton-${index}`} isAlternatingRow={index % 2 === 1} />
              ))}
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
              <div className="rounded-xl border bg-background p-4 md:p-5">
                <label htmlFor="publications-search" className="mb-2 block text-sm font-medium">
                  Search Publications
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="publications-search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search title, info, chapter, date, year, links (comma-separated: Tagum, Cavite)"
                    className="pl-9"
                    data-testid="input-publications-search"
                  />
                </div>
              </div>

              {filteredPublications.length === 0 && (
                <div className="text-center py-10 rounded-xl border bg-background" data-testid="empty-publication-search-results">
                  <h3 className="text-lg font-semibold">No matching publications found</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Try another keyword or use comma-separated terms like Tagum, Cavite.
                  </p>
                </div>
              )}

              {visiblePublications.map((publication, index) => {
                const photoUrl = getPublicationPhotoUrl(publication as Publication & { imageUrl?: string | null });
                const usesFallbackImage = Boolean(fallbackImages[publication.id]);
                const hasImageError = Boolean(failedImages[publication.id]);
                const isAlternatingRow = index % 2 === 1;
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
                  <div className="grid gap-0 md:grid-cols-2">
                    {cardImageSrc ? (
                      <div className={`relative min-h-[220px] bg-muted ${isAlternatingRow ? "md:order-2" : "md:order-1"}`}>
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
                      <div className={`relative min-h-[220px] bg-muted flex items-center justify-center ${isAlternatingRow ? "md:order-2" : "md:order-1"}`}>
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ImageOff className="h-8 w-8" />
                          <span className="text-sm">Image unavailable</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`relative min-h-[220px] bg-muted flex items-center justify-center ${isAlternatingRow ? "md:order-2" : "md:order-1"}`}>
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ImageOff className="h-8 w-8" />
                          <span className="text-sm">No image available</span>
                        </div>
                      </div>
                    )}

                    <CardContent className={`p-6 md:p-8 md:flex md:flex-col md:justify-center ${isAlternatingRow ? "md:order-1" : "md:order-2"}`}>
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
                  </div>
                </Card>
                );
              })}

              {(canShowMore || canHide) && (
                <div className="pt-1 flex justify-center gap-2">
                  {canShowMore && (
                    <button
                      type="button"
                      onClick={handleShowMore}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-0"
                      data-testid="button-publications-toggle"
                    >
                      <span>Show more</span>
                      <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
                    </button>
                  )}

                  {canHide && (
                    <button
                      type="button"
                      onClick={handleHide}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-0"
                      data-testid="button-publications-hide"
                    >
                      <span>Hide</span>
                      <ChevronDown className="h-4 w-4 rotate-180 transition-transform duration-200 group-hover:-translate-y-0.5" />
                    </button>
                  )}
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
