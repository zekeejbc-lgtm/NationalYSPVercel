import { useEffect, useState } from "react";
import HeroSection from "@/components/HeroSection";
import StatsSection from "@/components/StatsSection";
import ProgramCard from "@/components/ProgramCard";
import ChapterCard from "@/components/ChapterCard";
import ProgramDetailsDialog from "@/components/ProgramDetailsDialog";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Program, Chapter, HomeContent, Stats } from "@shared/schema";
import { Link } from "wouter";
import { createClient } from "@/lib/client";
import { queryClient } from "@/lib/queryClient";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import { Card } from "@/components/ui/card";
import { Eye, Facebook, Globe, Instagram, Mail, MapPin, Megaphone, Phone, Target, User, X } from "lucide-react";

const WEBSITE_LOGO_SRC = "/images/ysp-logo.png";
const DEFAULT_HOME_CONTENT = {
  aboutUs:
    "Youth Service Philippines is a youth-centered movement that mobilizes volunteers, chapter leaders, and partners to drive meaningful service in local communities.",
  mission:
    "To equip and inspire young Filipinos to lead sustainable, community-first programs through collaboration, service, and grassroots action.",
  vision:
    "A Philippines where every young person is empowered to become a catalyst of positive change in their chapter, barangay, and beyond.",
  advocacyPillars: [
    "Youth Leadership and Civic Participation",
    "Community Service and Volunteerism",
    "Inclusive Education and Skills Development",
    "Disaster Preparedness and Environmental Stewardship",
  ],
} as const;

interface RankedShowcaseChapter extends Chapter {
  rank: number;
  rankingScore: number;
  metrics: {
    completedKpis: number;
    activeMembersCount: number;
    publicationsCount: number;
    projectReportsCount: number;
    submissionCount: number;
  };
}

interface PublicChapterDirectoryEntry {
  id: string;
  chapterId: string;
  barangayId: string | null;
  level: string;
  position: string;
  fullName: string;
  contactNumber: string;
  chapterEmail: string;
}

interface PublicBarangayDirectoryEntry {
  id: string;
  chapterId: string;
  barangayName: string;
  presidentName: string | null;
  presidentContactNumber: string | null;
  presidentEmail: string | null;
}

interface BarangayOption {
  id: string;
  chapterId: string;
  barangayName: string;
}

function isUnsupportedPhotoUrl(photoUrl: string): boolean {
  const normalized = photoUrl.toLowerCase();
  return normalized.includes("facebook.com/") || normalized.includes("fb.com/");
}

function getChapterLogoSrc(photo?: string | null): string {
  const normalizedPhoto = photo?.trim() || "";
  if (!normalizedPhoto || isUnsupportedPhotoUrl(normalizedPhoto)) {
    return WEBSITE_LOGO_SRC;
  }

  return getDisplayImageUrl(normalizedPhoto);
}

function normalizeExternalLink(value?: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function DirectoryLoadingSkeleton({
  rows,
  testId,
  label,
}: {
  rows: number;
  testId: string;
  label: string;
}) {
  return (
    <div className="space-y-3" data-testid={testId} role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border p-3 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-36" />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<RankedShowcaseChapter | null>(null);
  const [isChapterDetailsOpen, setIsChapterDetailsOpen] = useState(false);
  const [usePollingFallback, setUsePollingFallback] = useState(true);

  useEffect(() => {
    let isUnmounted = false;

    const invalidateHomeQueries = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home-content"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chapters/showcase-ranking"] });
    };

    try {
      const supabase = createClient();

      const channel = supabase
        .channel(`home-hybrid-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "stats" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "home_content" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "programs" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "members" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "publications" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "project_reports" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "kpi_completions" }, invalidateHomeQueries)
        .on("postgres_changes", { event: "*", schema: "public", table: "kpi_templates" }, invalidateHomeQueries)
        .subscribe((status) => {
          if (isUnmounted) {
            return;
          }

          if (status === "SUBSCRIBED") {
            setUsePollingFallback(false);
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setUsePollingFallback(true);
          }
        });

      return () => {
        isUnmounted = true;
        void supabase.removeChannel(channel);
      };
    } catch {
      setUsePollingFallback(true);
      return () => {
        isUnmounted = true;
      };
    }
  }, []);

  const {
    data: stats,
    isLoading: statsLoading,
    isFetched: statsFetched,
  } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    refetchInterval: usePollingFallback ? 15000 : false,
    refetchIntervalInBackground: usePollingFallback,
  });

  const {
    data: programs = [],
    isLoading: programsLoading,
    isFetched: programsFetched,
  } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
    refetchInterval: usePollingFallback ? 15000 : false,
    refetchIntervalInBackground: usePollingFallback,
  });

  const { data: homeContent } = useQuery<HomeContent>({
    queryKey: ["/api/home-content"],
    refetchInterval: usePollingFallback ? 15000 : false,
    refetchIntervalInBackground: usePollingFallback,
  });

  const {
    data: chapterShowcase = [],
    isLoading: chapterShowcaseLoading,
    isFetched: chapterShowcaseFetched,
  } = useQuery<RankedShowcaseChapter[]>({
    queryKey: ["/api/chapters/showcase-ranking"],
    refetchInterval: usePollingFallback ? 15000 : false,
    refetchIntervalInBackground: usePollingFallback,
  });

  const { data: selectedChapterDirectory = [], isLoading: isDirectoryLoading } = useQuery<PublicChapterDirectoryEntry[]>({
    queryKey: ["/api/chapters", selectedChapter?.id, "directory"],
    queryFn: async () => {
      if (!selectedChapter?.id) {
        return [];
      }

      const response = await fetch(`/api/chapters/${selectedChapter.id}/directory`);
      if (!response.ok) {
        return [];
      }

      return response.json();
    },
    enabled: isChapterDetailsOpen && !!selectedChapter?.id,
  });

  const { data: selectedChapterBarangays = [], isLoading: isBarangayDirectoryLoading } = useQuery<PublicBarangayDirectoryEntry[]>({
    queryKey: ["/api/chapters", selectedChapter?.id, "barangay-directory"],
    queryFn: async () => {
      if (!selectedChapter?.id) {
        return [];
      }

      const detailedDirectoryResponse = await fetch(`/api/chapters/${selectedChapter.id}/barangay-directory`);
      if (detailedDirectoryResponse.ok) {
        const responseContentType = (detailedDirectoryResponse.headers.get("content-type") || "").toLowerCase();
        if (responseContentType.includes("application/json")) {
          const detailedDirectoryData = await detailedDirectoryResponse.json();
          if (Array.isArray(detailedDirectoryData)) {
            return detailedDirectoryData as PublicBarangayDirectoryEntry[];
          }
        }
      }

      const barangayListResponse = await fetch(`/api/chapters/${selectedChapter.id}/barangays`);
      if (!barangayListResponse.ok) {
        return [];
      }

      const barangayList = await barangayListResponse.json();
      if (!Array.isArray(barangayList)) {
        return [];
      }

      return barangayList.map((barangay: BarangayOption) => ({
        id: barangay.id,
        chapterId: barangay.chapterId,
        barangayName: barangay.barangayName,
        presidentName: null,
        presidentContactNumber: null,
        presidentEmail: null,
      }));
    },
    enabled: isChapterDetailsOpen && !!selectedChapter?.id,
  });

  const chapterOnlyDirectoryEntries = selectedChapterDirectory.filter((entry) => {
    const normalizedLevel = (entry.level || "").toLowerCase();
    const normalizedPosition = entry.position.toLowerCase();
    return !entry.barangayId && normalizedLevel !== "barangay" && normalizedPosition.includes("president") && !normalizedPosition.includes("barangay");
  });

  const isHomeDataLoading =
    statsLoading ||
    !statsFetched ||
    programsLoading ||
    !programsFetched ||
    chapterShowcaseLoading ||
    !chapterShowcaseFetched;

  const aboutUsCopy = homeContent?.aboutUs?.trim() || DEFAULT_HOME_CONTENT.aboutUs;
  const missionCopy = homeContent?.mission?.trim() || DEFAULT_HOME_CONTENT.mission;
  const visionCopy = homeContent?.vision?.trim() || DEFAULT_HOME_CONTENT.vision;
  const advocacyPillars =
    Array.isArray(homeContent?.advocacyPillars) && homeContent.advocacyPillars.length > 0
      ? homeContent.advocacyPillars
      : DEFAULT_HOME_CONTENT.advocacyPillars;

  const homeInformationCards = [
    { title: "About Us", icon: User, description: aboutUsCopy, testId: "card-home-about-us" },
    { title: "Our Mission", icon: Target, description: missionCopy, testId: "card-home-our-mission" },
    { title: "Our Vision", icon: Eye, description: visionCopy, testId: "card-home-our-vision" },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col">
      <HeroSection />
      
      {isHomeDataLoading ? (
        <section className="py-10 md:py-12">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`home-stats-skeleton-${index}`} className="rounded-lg border bg-card p-5 space-y-3" aria-hidden="true">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <StatsSection
          projects={stats?.projects || 150}
          chapters={stats?.chapters || 25}
          members={stats?.members || 5000}
        />
      )}

      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Who We Are</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Learn what guides Youth Service Philippines through our identity, purpose, and long-term direction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {homeInformationCards.map((item) => {
              const Icon = item.icon;

              return (
                <Card
                  key={item.title}
                  className="h-full border-primary/15 bg-gradient-to-b from-background to-muted/20 p-6"
                  data-testid={item.testId}
                >
                  <Icon className="h-8 w-8 text-primary mb-4" aria-hidden="true" />
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </Card>
              );
            })}

            <Card
              className="h-full border-primary/15 bg-gradient-to-b from-background to-muted/20 p-6"
              data-testid="card-home-our-advocacy-pillars"
            >
              <Megaphone className="h-8 w-8 text-primary mb-4" aria-hidden="true" />
              <h3 className="text-xl font-semibold mb-3">Our Advocacy Pillars</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                {advocacyPillars.map((pillar) => (
                  <li key={pillar} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/80" aria-hidden="true" />
                    <span
                      lang="en"
                      className="flex-1 text-justify [text-align-last:left] [hyphens:auto] [word-spacing:-0.04em]"
                    >
                      {pillar}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Programs</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover the various ways we serve communities across the Philippines
            </p>
          </div>
          
          {isHomeDataLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" role="status" aria-label="Loading programs section">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`home-program-skeleton-${index}`} className="rounded-xl border bg-card p-4 space-y-3" aria-hidden="true">
                  <Skeleton className="h-36 w-full rounded-lg" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {programs.slice(0, 4).map((program) => (
                <ProgramCard
                  key={program.id}
                  id={program.id}
                  title={program.title}
                  description={program.description}
                  image={program.image}
                  onClick={() => setSelectedProgram(program)}
                />
              ))}
            </div>
          )}

          {!isHomeDataLoading && programs.length > 4 && (
            <div className="mt-6 flex justify-center">
              <Link
                href="/programs"
                data-testid="link-home-programs-show-more"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:underline"
              >
                Show more
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Chapters</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The top four chapters are showcased based on KPIs, active members, and publication/report submissions.
            </p>
          </div>
          
          {isHomeDataLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" role="status" aria-label="Loading chapters section">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`home-chapter-skeleton-${index}`} className="rounded-xl border bg-card p-4 space-y-3" aria-hidden="true">
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {chapterShowcase.map((chapter) => (
                  <ChapterCard
                    key={chapter.id}
                    {...chapter}
                    onSelect={() => {
                      setSelectedChapter(chapter);
                      setIsChapterDetailsOpen(true);
                    }}
                  />
                ))}
              </div>

              {chapterShowcase.length === 0 && (
                <p className="text-center text-muted-foreground mt-6" data-testid="text-no-home-showcase-chapters">
                  No chapter showcase data is available yet.
                </p>
              )}
            </>
          )}

          <div className="mt-6 flex justify-center">
            <Link
              href="/membership"
              data-testid="link-home-chapters-show-more"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:underline"
            >
              Show more
            </Link>
          </div>
        </div>
      </section>

      <ProgramDetailsDialog
        program={selectedProgram}
        open={!!selectedProgram}
        onOpenChange={(open) => {
          if (!open) setSelectedProgram(null);
        }}
      />

      <Dialog
        open={isChapterDetailsOpen}
        onOpenChange={(open) => {
          setIsChapterDetailsOpen(open);
          if (!open) {
            setSelectedChapter(null);
          }
        }}
      >
        <DialogContent hideClose className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
          {selectedChapter && (
            <>
              {(() => {
                const chapterFacebookLink = normalizeExternalLink(selectedChapter.facebookLink);
                const chapterInstagramLink = normalizeExternalLink(selectedChapter.instagramLink);
                const chapterWebsiteLink = normalizeExternalLink(selectedChapter.websiteLink);

                return (
                  <>
                    <div className="z-20 flex items-start justify-between gap-4 border-b bg-background px-6 py-4">
                      <DialogTitle className="text-2xl leading-tight">{selectedChapter.name}</DialogTitle>
                      <DialogClose asChild>
                        <button
                          type="button"
                          className="rounded-full border border-primary/40 p-1.5 text-primary transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          aria-label="Close chapter details"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </DialogClose>
                    </div>

                    <div className="max-h-[calc(90vh-5rem)] overflow-y-auto px-6 py-5 space-y-6">
                      <div className="flex items-start gap-4">
                        <img
                          src={getChapterLogoSrc(selectedChapter.photo)}
                          alt={`${selectedChapter.name} logo`}
                          className="h-20 w-20 rounded-full border bg-card object-contain p-1"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = WEBSITE_LOGO_SRC;
                          }}
                        />
                        <div className="space-y-2 text-sm">
                          <p className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{selectedChapter.location}</span>
                          </p>
                          <p className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <a href={`tel:${selectedChapter.contact}`} className="text-primary hover:underline">
                              {selectedChapter.contact}
                            </a>
                          </p>
                          {selectedChapter.email && (
                            <p className="flex items-center gap-2 text-muted-foreground">
                              <Mail className="h-4 w-4" />
                              <a href={`mailto:${selectedChapter.email}`} className="text-primary hover:underline break-all">
                                {selectedChapter.email}
                              </a>
                            </p>
                          )}
                          {selectedChapter.contactPerson && (
                            <p className="flex items-center gap-2 text-muted-foreground">
                              <User className="h-4 w-4" />
                              <span>{selectedChapter.contactPerson}</span>
                            </p>
                          )}
                          {(chapterFacebookLink || chapterInstagramLink || chapterWebsiteLink) && (
                            <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              {chapterFacebookLink && (
                                <a
                                  href={chapterFacebookLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Facebook className="h-3.5 w-3.5" />
                                  Facebook
                                </a>
                              )}
                              {chapterInstagramLink && (
                                <a
                                  href={chapterInstagramLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Instagram className="h-3.5 w-3.5" />
                                  Instagram
                                </a>
                              )}
                              {chapterWebsiteLink && (
                                <a
                                  href={chapterWebsiteLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Globe className="h-3.5 w-3.5" />
                                  Website
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-lg font-semibold">Chapter Directory</h4>
                        <p className="text-sm text-muted-foreground">
                          Public contact information only. Sensitive personal details are intentionally hidden.
                        </p>

                        {isDirectoryLoading ? (
                          <DirectoryLoadingSkeleton
                            rows={2}
                            testId="text-loading-home-chapter-directory"
                            label="Loading chapter directory"
                          />
                        ) : chapterOnlyDirectoryEntries.length === 0 ? (
                          <p className="text-sm text-muted-foreground" data-testid="text-empty-home-chapter-directory">
                            No directory entries available yet. Use the chapter contact details above.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {chapterOnlyDirectoryEntries.map((entry) => (
                              <div key={entry.id} className="rounded-lg border p-3 space-y-1" data-testid={`home-directory-entry-${entry.id}`}>
                                <p className="font-medium">{entry.fullName}</p>
                                <p className="text-sm text-muted-foreground">{entry.position}</p>
                                <p className="text-sm">
                                  <a href={`tel:${entry.contactNumber}`} className="text-primary hover:underline">
                                    {entry.contactNumber}
                                  </a>
                                </p>
                                <p className="text-sm break-all">
                                  <a href={`mailto:${entry.chapterEmail}`} className="text-primary hover:underline">
                                    {entry.chapterEmail}
                                  </a>
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-lg font-semibold">Barangay Chapters</h4>
                        <p className="text-sm text-muted-foreground">
                          Barangay chapters under this city chapter and their barangay chapter president.
                        </p>

                        {isBarangayDirectoryLoading ? (
                          <DirectoryLoadingSkeleton
                            rows={3}
                            testId="text-loading-home-barangay-directory"
                            label="Loading barangay chapters"
                          />
                        ) : selectedChapterBarangays.length === 0 ? (
                          <p className="text-sm text-muted-foreground" data-testid="text-empty-home-barangay-directory">
                            No barangay chapters available for this city chapter yet.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {selectedChapterBarangays.map((barangayEntry) => (
                              <div key={barangayEntry.id} className="rounded-lg border p-3 space-y-1" data-testid={`home-barangay-directory-entry-${barangayEntry.id}`}>
                                <p className="font-medium">{barangayEntry.barangayName}</p>
                                {barangayEntry.presidentName ? (
                                  <>
                                    <p className="text-sm text-muted-foreground">Barangay Chapter President: {barangayEntry.presidentName}</p>
                                    {barangayEntry.presidentContactNumber && (
                                      <p className="text-sm">
                                        <a href={`tel:${barangayEntry.presidentContactNumber}`} className="text-primary hover:underline">
                                          {barangayEntry.presidentContactNumber}
                                        </a>
                                      </p>
                                    )}
                                    {barangayEntry.presidentEmail && (
                                      <p className="text-sm break-all">
                                        <a href={`mailto:${barangayEntry.presidentEmail}`} className="text-primary hover:underline">
                                          {barangayEntry.presidentEmail}
                                        </a>
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No barangay chapter president assigned yet.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
