import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import LoadingState from "@/components/ui/loading-state";
import { Search, UserCheck } from "lucide-react";
import type { Chapter, ChapterOfficer } from "@shared/schema";

const OFFICER_POSITIONS = [
  "City/Municipality President",
  "Barangay President",
  "Program Development Officer",
  "Finance and Treasury Officer",
  "Secretary and Documentation Officer",
  "Partnership and Fundraising Officer",
  "Communications and Marketing Officer",
  "Membership and Internal Affairs Officer"
];

const CHAPTER_OFFICER_POSITIONS = OFFICER_POSITIONS.filter((position) => position !== "Barangay President");

const GEO_SYNONYM_MAP: Record<string, string[]> = {
  luzon: [
    "ncr", "metro manila", "manila", "calabarzon", "mimaropa", "bicol", "ilocos", "cordillera", "cagayan valley",
    "aurora", "bataan", "batangas", "bulacan", "cavite", "laguna", "marinduque", "masbate", "quezon", "rizal",
    "palawan", "pangasinan", "zambales", "tarlac", "nueva ecija", "nueva vizcaya", "quirino", "isabela", "cagayan",
  ],
  visayas: [
    "western visayas", "central visayas", "eastern visayas", "negros", "panay", "cebu", "bohol", "leyte", "samar",
    "iloilo", "capiz", "aklan", "antique", "guimaras", "siquijor", "biliran", "southern leyte",
  ],
  mindanao: [
    "zamboanga", "northern mindanao", "davao", "soccsksargen", "caraga", "barmm", "bangsamoro",
    "bukidnon", "camiguin", "misamis", "cotabato", "sultan kudarat", "sarangani", "south cotabato",
    "agusan", "surigao", "lanao", "maguindanao", "basilan", "sulu", "tawi tawi", "davao de oro", "davao del sur",
    "davao del norte", "davao oriental", "davao occidental",
  ],
  "davao region": [
    "region xi", "davao", "davao city", "davao de oro", "davao del sur", "davao del norte", "davao oriental", "davao occidental",
  ],
};

type ChapterOfficerDirectoryEntry = {
  id: string;
  position: string;
  fullName: string;
  isFallbackPresident?: boolean;
};

const normalizeChapterPosition = (position: string) =>
  position === "Barangay President" ? "City/Municipality President" : position;

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\bisland\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const SEARCH_NOISE_TOKENS = new Set(["island", "islands", "region", "regions"]);

const getGeoBucketsFromQuery = (rawQuery: string) => {
  const query = normalizeText(rawQuery);
  if (!query) return [] as Array<keyof typeof GEO_SYNONYM_MAP>;

  return (Object.keys(GEO_SYNONYM_MAP) as Array<keyof typeof GEO_SYNONYM_MAP>).filter((bucket) => {
    const candidates = [bucket, ...GEO_SYNONYM_MAP[bucket]].map(normalizeText);
    return candidates.some((candidate) => candidate && query.includes(candidate));
  });
};

const getPlainSearchTokens = (rawQuery: string) => {
  const query = normalizeText(rawQuery);
  if (!query) return [] as string[];

  const geoTerms = new Set(
    (Object.keys(GEO_SYNONYM_MAP) as Array<keyof typeof GEO_SYNONYM_MAP>).flatMap((bucket) =>
      [bucket, ...GEO_SYNONYM_MAP[bucket]].map(normalizeText),
    ),
  );

  return query
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !SEARCH_NOISE_TOKENS.has(token) && !geoTerms.has(token));
};

const chapterMatchesGeoBucket = (searchableText: string, bucket: keyof typeof GEO_SYNONYM_MAP) => {
  const geoCandidates = [bucket, ...GEO_SYNONYM_MAP[bucket]].map(normalizeText);
  return geoCandidates.some((candidate) => candidate && searchableText.includes(candidate));
};

const isChapterLevelOfficer = (officer: ChapterOfficer) =>
  officer.level !== "barangay" && !officer.barangayId;

export default function OfficerListManager() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: officers = [], isLoading } = useQuery<ChapterOfficer[]>({
    queryKey: ["/api/officers"],
    queryFn: async () => {
      const res = await fetch("/api/officers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch officers");
      return res.json();
    },
  });

  const groupedByChapter = chapters.reduce((acc, chapter) => {
    acc[chapter.id] = officers.filter(
      (officer) => officer.chapterId === chapter.id && isChapterLevelOfficer(officer),
    );
    return acc;
  }, {} as Record<string, ChapterOfficer[]>);

  const chapterSummaries = chapters.map((chapter) => {
    const chapterOfficers = groupedByChapter[chapter.id] || [];
    const hasRecordedPresident = chapterOfficers.some(
      (officer) => normalizeChapterPosition(officer.position) === "City/Municipality President",
    );
    const chapterProfilePresident = chapter.contactPerson?.trim();
    const directoryEntries: ChapterOfficerDirectoryEntry[] = chapterOfficers.map((officer) => ({
      id: officer.id,
      position: officer.position,
      fullName: officer.fullName,
    }));

    if (!hasRecordedPresident && chapterProfilePresident) {
      directoryEntries.unshift({
        id: `profile-president-${chapter.id}`,
        position: "City/Municipality President",
        fullName: chapterProfilePresident,
        isFallbackPresident: true,
      });
    }

    const normalizedFilledPositions = new Set(
      directoryEntries.map((entry) => normalizeChapterPosition(entry.position)),
    );
    const missingPositions = CHAPTER_OFFICER_POSITIONS.filter(
      (position) => !normalizedFilledPositions.has(position),
    );

    return {
      chapter,
      directoryEntries,
      missingPositions,
      filledPositions: CHAPTER_OFFICER_POSITIONS.length - missingPositions.length,
      totalPositions: CHAPTER_OFFICER_POSITIONS.length,
    };
  });

  const filteredChapterSummaries = useMemo(() => {
    const normalizedQuery = normalizeText(searchTerm);
    if (!normalizedQuery) return chapterSummaries;

    const geoBuckets = getGeoBucketsFromQuery(normalizedQuery);
    const plainTokens = getPlainSearchTokens(normalizedQuery);

    return chapterSummaries.filter(({ chapter, directoryEntries, missingPositions }) => {
      const chapterText = normalizeText(`${chapter.name} ${chapter.location || ""} ${chapter.contactPerson || ""}`);
      const directoryText = normalizeText(
        directoryEntries.map((entry) => `${entry.position} ${entry.fullName}`).join(" "),
      );
      const missingText = normalizeText(missingPositions.join(" "));

      const searchable = `${chapterText} ${directoryText} ${missingText}`;

      const geoMatch = geoBuckets.length === 0 || geoBuckets.every((bucket) => chapterMatchesGeoBucket(searchable, bucket));
      const tokenMatch = plainTokens.every((token) => searchable.includes(token));

      return geoMatch && tokenMatch;
    });
  }, [chapterSummaries, searchTerm]);

  const chaptersWithOfficers = chapterSummaries.filter((summary) => summary.directoryEntries.length > 0).length;
  const totalOfficers = chapterSummaries.reduce(
    (sum, summary) => sum + summary.directoryEntries.filter((entry) => !entry.isFallbackPresident).length,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Officer Directory
        </CardTitle>
        <CardDescription>
          View all chapter officers and their contact information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-2xl font-bold text-primary">{totalOfficers}</div>
            <div className="text-sm text-muted-foreground">Recorded Chapter Officers</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{chaptersWithOfficers}</div>
            <div className="text-sm text-muted-foreground">Chapters with Officers</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{chapters.length - chaptersWithOfficers}</div>
            <div className="text-sm text-muted-foreground">Chapters Missing Officers</div>
          </Card>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search chapter, role, officer name, island, or region (e.g. Mindanao Island, Davao Region)"
              className="pl-9"
              data-testid="input-search-officer-directory"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {filteredChapterSummaries.length} of {chapterSummaries.length} chapters
          </p>
        </div>

        <div className="mt-2">
          <h3 className="font-medium mb-4">Officers by Chapter</h3>

          {isLoading ? (
            <LoadingState label="Loading officers by chapter..." rows={4} compact />
          ) : filteredChapterSummaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chapter matched your search.</p>
          ) : (
            <Accordion type="multiple" className="space-y-4">
              {filteredChapterSummaries.map(({ chapter, directoryEntries, missingPositions, filledPositions, totalPositions }) => (
                <Card key={chapter.id}>
                  <AccordionItem value={`chapter-${chapter.id}`} className="border-0">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex w-full items-center justify-between gap-2 pr-2 text-left">
                        <div className="space-y-1">
                          <h4 className="font-medium leading-none">{chapter.name}</h4>
                          <div className="text-xs text-muted-foreground">
                            Press to open full officer directory
                          </div>
                        </div>
                        <Badge variant={filledPositions === totalPositions ? "default" : "outline"}>
                          {filledPositions}/{totalPositions}
                        </Badge>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent>
                      <div className="px-4 pb-4 space-y-4">
                        <div className="text-sm text-muted-foreground">
                          {filledPositions === totalPositions
                            ? "All chapter officer positions are filled"
                            : `Missing ${missingPositions.length} position${missingPositions.length === 1 ? "" : "s"}`}
                        </div>

                        <div className="grid gap-2">
                          {CHAPTER_OFFICER_POSITIONS.map((position) => {
                            const assignedEntries = directoryEntries.filter(
                              (entry) => normalizeChapterPosition(entry.position) === position,
                            );
                            const isMissing = assignedEntries.length === 0;

                            return (
                              <div key={`${chapter.id}-${position}`} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">{position}</p>
                                  {isMissing ? (
                                    <p className="text-xs text-destructive">Vacant</p>
                                  ) : (
                                    assignedEntries.map((entry) => (
                                      <p key={entry.id} className="text-xs text-muted-foreground">
                                        {entry.fullName}
                                        {entry.isFallbackPresident && (
                                          <span className="ml-1 uppercase tracking-wide text-[10px]">(from chapter profile)</span>
                                        )}
                                      </p>
                                    ))
                                  )}
                                </div>

                                <Badge
                                  variant={isMissing ? "outline" : "secondary"}
                                  className={isMissing ? "border-destructive/40 text-destructive" : ""}
                                >
                                  {isMissing ? "Lacking" : "Filled"}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>

                        {missingPositions.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lacking Officers</div>
                            <div className="flex flex-wrap gap-2">
                              {missingPositions.map((position) => (
                                <Badge key={`${chapter.id}-missing-${position}`} variant="outline" className="border-destructive/40 text-destructive">
                                  {position}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Card>
              ))}
            </Accordion>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
