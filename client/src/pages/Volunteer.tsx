import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  resetImageFallback,
} from "@/lib/driveUtils";
import { formatManilaDateTime12, isPastDateTime } from "@/lib/manilaTime";
import type { VolunteerOpportunity } from "@shared/schema";
import { Calendar, Clock3, ExternalLink, Filter, MapPin, Search } from "lucide-react";
import { format } from "date-fns";

type OpportunityConnectionFilter = "all" | "national" | "city" | "barangay";
type OpportunitySort = "soonest" | "latest";

function parseCsvIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

function resolveConnectionType(opportunity: VolunteerOpportunity): "national" | "city" | "barangay" {
  if (!opportunity.chapterId) {
    return "national";
  }

  const barangayLinks = parseCsvIds(opportunity.barangayIds || opportunity.barangayId || "");
  if (barangayLinks.length > 0) {
    return "barangay";
  }

  return "city";
}

function resolveConnectionLabel(opportunity: VolunteerOpportunity): string {
  const connectionType = resolveConnectionType(opportunity);
  if (connectionType === "national") {
    return "National Chapter";
  }
  return opportunity.chapter || "Chapter";
}

function truncateDescription(value: string | null | undefined, maxLength = 140): string {
  if (!value) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function formatTimeTo12Hour(value: string | null | undefined): string {
  if (!value) {
    return "TBD";
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return value;
  }

  const rawHour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(rawHour) || rawHour < 0 || rawHour > 23) {
    return value;
  }

  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

export default function Volunteer() {
  const previewInitializedRef = useRef(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [connectionFilter, setConnectionFilter] = useState<OpportunityConnectionFilter>("all");
  const [sortBy, setSortBy] = useState<OpportunitySort>("soonest");
  const [selectedOpportunity, setSelectedOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [openVisibleCount, setOpenVisibleCount] = useState(6);
  const [completedVisibleCount, setCompletedVisibleCount] = useState(6);

  const { data: opportunities = [] } = useQuery<VolunteerOpportunity[]>({ 
    queryKey: ["/api/volunteer-opportunities"] 
  });

  const previewOpportunityId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return new URLSearchParams(window.location.search).get("previewId")?.trim() || "";
  }, []);

  useEffect(() => {
    if (previewInitializedRef.current || !previewOpportunityId || opportunities.length === 0) {
      return;
    }

    const matched = opportunities.find((item) => item.id === previewOpportunityId);
    if (matched) {
      setSelectedOpportunity(matched);
    }

    previewInitializedRef.current = true;
  }, [opportunities, previewOpportunityId]);

  const filteredOpportunities = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const scoped = opportunities.filter((opportunity) => {
      const connectionType = resolveConnectionType(opportunity);
      if (connectionFilter !== "all" && connectionType !== connectionFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = [
        opportunity.eventName,
        opportunity.description || "",
        opportunity.chapter || "",
        opportunity.contactName,
        opportunity.contactPhone,
        opportunity.contactEmail || "",
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });

    return [...scoped].sort((left, right) => {
      const leftDate = new Date(left.date).getTime();
      const rightDate = new Date(right.date).getTime();
      if (sortBy === "latest") {
        return rightDate - leftDate;
      }
      return leftDate - rightDate;
    });
  }, [connectionFilter, opportunities, searchQuery, sortBy]);

  const openOpportunities = useMemo(() => {
    return filteredOpportunities.filter((opportunity) => !isPastDateTime(opportunity.deadlineAt || opportunity.date));
  }, [filteredOpportunities]);

  const completedOpportunities = useMemo(() => {
    return filteredOpportunities.filter((opportunity) => isPastDateTime(opportunity.deadlineAt || opportunity.date));
  }, [filteredOpportunities]);

  useEffect(() => {
    setOpenVisibleCount(6);
    setCompletedVisibleCount(6);
  }, [searchQuery, connectionFilter, sortBy]);

  const visibleOpen = openOpportunities.slice(0, openVisibleCount);
  const visibleCompleted = completedOpportunities.slice(0, completedVisibleCount);

  const hasOpenShowMore = openVisibleCount < openOpportunities.length;
  const hasCompletedShowMore = completedVisibleCount < completedOpportunities.length;

  const selectedConnectionType = selectedOpportunity ? resolveConnectionType(selectedOpportunity) : "city";
  const selectedConnectionLabel = selectedOpportunity ? resolveConnectionLabel(selectedOpportunity) : "";
  const selectedDone = selectedOpportunity ? isPastDateTime(selectedOpportunity.deadlineAt || selectedOpportunity.date) : false;
  const selectedDisplayPhoto = selectedOpportunity?.photoUrl ? getDisplayImageUrl(selectedOpportunity.photoUrl) : "";
  const selectedSdgs = selectedOpportunity?.sdgs
    ? selectedOpportunity.sdgs
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

  const connectedBarangays = selectedOpportunity
    ? parseCsvIds(selectedOpportunity.barangayIds || selectedOpportunity.barangayId || "")
    : [];

  const renderOpportunityCard = (opportunity: VolunteerOpportunity) => {
    const displayPhotoUrl = opportunity.photoUrl ? getDisplayImageUrl(opportunity.photoUrl) : "";
    const connectionType = resolveConnectionType(opportunity);

    return (
      <Card key={opportunity.id} className="overflow-hidden transition-all hover-elevate">
        {displayPhotoUrl && (
          <div className="h-48 w-full overflow-hidden">
            <img
              src={displayPhotoUrl}
              alt={opportunity.eventName}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onLoad={(event) => {
                resetImageFallback(event.currentTarget);
              }}
              onError={(event) => {
                if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                  event.currentTarget.style.display = "none";
                }
              }}
            />
          </div>
        )}

        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-semibold leading-tight">{opportunity.eventName}</h3>
            <Badge variant={connectionType === "barangay" ? "secondary" : "outline"}>
              {connectionType === "national" ? "National" : connectionType === "city" ? "City" : "Barangay"}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(opportunity.date), "MMM dd, yyyy")}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {resolveConnectionLabel(opportunity)}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {opportunity.description && (
            <p className="text-sm text-muted-foreground">{truncateDescription(opportunity.description, 120)}</p>
          )}

          <Button
            variant="outline"
            onClick={() => setSelectedOpportunity(opportunity)}
            data-testid={`button-view-opportunity-${opportunity.id}`}
          >
            View Full Details
          </Button>
        </CardContent>
      </Card>
    );
  };

  const applySearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applySearch();
    }
  };

  return (
    <div className="min-h-screen">
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Volunteer Opportunities</h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Make a difference in your community. Browse upcoming volunteer activities 
              and connect with chapter coordinators to get involved.
            </p>
            {previewOpportunityId && (
              <div className="mt-4 flex justify-center">
                <Badge variant="secondary">Public Preview Mode</Badge>
              </div>
            )}
          </div>

          <div className="mb-8 rounded-lg border bg-background p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label htmlFor="volunteer-search" className="mb-2 block">Search Opportunities</Label>
                <div className="flex gap-2">
                  <Input
                    id="volunteer-search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search by title, chapter, description, contact"
                    data-testid="input-volunteer-search"
                  />
                  <Button onClick={applySearch} data-testid="button-volunteer-search">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Filter Connection</Label>
                <Select value={connectionFilter} onValueChange={(value) => setConnectionFilter(value as OpportunityConnectionFilter)}>
                  <SelectTrigger data-testid="select-volunteer-connection-filter">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Connections</SelectItem>
                    <SelectItem value="national">National</SelectItem>
                    <SelectItem value="city">City Chapter</SelectItem>
                    <SelectItem value="barangay">Barangay</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Sort</Label>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as OpportunitySort)}>
                  <SelectTrigger data-testid="select-volunteer-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soonest">Soonest First</SelectItem>
                    <SelectItem value="latest">Latest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {searchQuery && (
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary">Search: {searchQuery}</Badge>
                <Button variant="ghost" size="sm" onClick={clearSearch} data-testid="button-volunteer-clear-search">
                  Clear
                </Button>
              </div>
            )}
          </div>

          {openOpportunities.length > 0 && (
            <div className="mb-12">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Open Opportunities</h2>
                <Badge variant="outline">{openOpportunities.length}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {visibleOpen.map((opportunity) => renderOpportunityCard(opportunity))}
              </div>

              {(hasOpenShowMore || openVisibleCount > 6) && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {hasOpenShowMore && (
                    <Button
                      variant="outline"
                      onClick={() => setOpenVisibleCount((current) => current + 6)}
                      data-testid="button-open-show-more"
                    >
                      Show More (+6)
                    </Button>
                  )}
                  {openVisibleCount > 6 && (
                    <Button
                      variant="ghost"
                      onClick={() => setOpenVisibleCount(6)}
                      data-testid="button-open-hide"
                    >
                      Hide
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {completedOpportunities.length > 0 && (
            <div className="border-t pt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-muted-foreground">Completed Opportunities</h2>
                <Badge variant="secondary">{completedOpportunities.length}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {visibleCompleted.map((opportunity) => renderOpportunityCard(opportunity))}
              </div>

              {(hasCompletedShowMore || completedVisibleCount > 6) && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {hasCompletedShowMore && (
                    <Button
                      variant="outline"
                      onClick={() => setCompletedVisibleCount((current) => current + 6)}
                      data-testid="button-completed-show-more"
                    >
                      Show More (+6)
                    </Button>
                  )}
                  {completedVisibleCount > 6 && (
                    <Button
                      variant="ghost"
                      onClick={() => setCompletedVisibleCount(6)}
                      data-testid="button-completed-hide"
                    >
                      Hide
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {filteredOpportunities.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground text-lg">
                No volunteer opportunities match your current search and filters.
              </p>
            </div>
          )}

          <Dialog
            open={Boolean(selectedOpportunity)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedOpportunity(null);
                setFullImageUrl(null);
              }
            }}
          >
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
              <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4 pr-14">
                <DialogTitle>{selectedOpportunity?.eventName || "Volunteer Opportunity"}</DialogTitle>
              </DialogHeader>

              {selectedOpportunity && (
                <div className="max-h-[calc(85vh-73px)] space-y-4 overflow-y-auto px-6 py-4">
                  {selectedDisplayPhoto && (
                    <div className="h-64 w-full overflow-hidden rounded-lg border">
                      <img
                        src={selectedDisplayPhoto}
                        alt={selectedOpportunity.eventName}
                        className="h-full w-full cursor-zoom-in object-cover"
                        loading="lazy"
                        decoding="async"
                        onClick={() => setFullImageUrl(selectedDisplayPhoto)}
                        onLoad={(event) => {
                          resetImageFallback(event.currentTarget);
                        }}
                        onError={(event) => {
                          if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                            event.currentTarget.style.display = "none";
                          }
                        }}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selectedDone ? "secondary" : "default"}>{selectedDone ? "Done" : "Open"}</Badge>
                    <Badge variant="outline">
                      {selectedConnectionType === "national" ? "National" : selectedConnectionType === "city" ? "City Chapter" : "Barangay"}
                    </Badge>
                    <Badge variant="outline">Connected To: {selectedConnectionLabel}</Badge>
                  </div>

                  {selectedConnectionType === "barangay" && connectedBarangays.length > 0 && (
                    <p className="text-xs text-muted-foreground">Connected barangay IDs: {connectedBarangays.join(", ")}</p>
                  )}

                  <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                    <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {format(new Date(selectedOpportunity.date), "MMMM dd, yyyy")}</p>
                    <p className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> {formatTimeTo12Hour(selectedOpportunity.time)}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {selectedOpportunity.venue || "TBD"}</p>
                    <p>Age Requirement: {selectedOpportunity.ageRequirement || "N/A"}</p>
                    {selectedOpportunity.deadlineAt && (
                      <p className="md:col-span-2">Deadline (Manila): {formatManilaDateTime12(selectedOpportunity.deadlineAt)}</p>
                    )}
                  </div>

                  {selectedSdgs.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium">SDGs Impacted</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedSdgs.map((sdg) => (
                          <Badge key={`${selectedOpportunity.id}-sdg-${sdg}`} variant="secondary">SDG {sdg}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-sm font-medium">Description</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {selectedOpportunity.description || "No description provided."}
                    </p>
                  </div>

                  <div className="border-t pt-2">
                    <p className="mb-2 text-sm font-medium">Contact</p>
                    <p className="text-sm text-muted-foreground">{selectedOpportunity.contactName}</p>
                    <div className="mt-2 flex flex-col gap-1 text-sm">
                      <a href={`tel:${selectedOpportunity.contactPhone}`} className="w-fit text-primary underline underline-offset-4">
                        Call: {selectedOpportunity.contactPhone}
                      </a>
                      {selectedOpportunity.contactEmail && (
                        <a href={`mailto:${selectedOpportunity.contactEmail}`} className="w-fit text-primary underline underline-offset-4">
                          Email: {selectedOpportunity.contactEmail}
                        </a>
                      )}
                    </div>
                  </div>

                  {(selectedOpportunity.learnMoreUrl || selectedOpportunity.applyUrl) && (
                    <div className="flex flex-wrap gap-2 border-t pt-2">
                      {selectedOpportunity.learnMoreUrl && (
                        <Button asChild variant="outline">
                          <a href={selectedOpportunity.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                            Learn More
                            <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {selectedOpportunity.applyUrl && (
                        <Button asChild>
                          <a href={selectedOpportunity.applyUrl} target="_blank" rel="noopener noreferrer">
                            Apply Here
                            <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(fullImageUrl)} onOpenChange={(open) => !open && setFullImageUrl(null)}>
            <DialogContent className="max-h-[95vh] max-w-6xl overflow-hidden p-2">
              {fullImageUrl && (
                <img
                  src={fullImageUrl}
                  alt={selectedOpportunity?.eventName || "Volunteer full image"}
                  className="max-h-[90vh] w-full rounded-md object-contain"
                  loading="lazy"
                  decoding="async"
                  onLoad={(event) => {
                    resetImageFallback(event.currentTarget);
                  }}
                  onError={(event) => {
                    if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                      event.currentTarget.style.display = "none";
                    }
                  }}
                  data-testid="img-volunteer-full-preview"
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  );
}
