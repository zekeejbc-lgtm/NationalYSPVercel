import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import LoadingState from "@/components/ui/loading-state";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { UserCheck, Search, Phone, Mail, Building2 } from "lucide-react";
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

export default function OfficerListManager() {
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");
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

  const filteredOfficers = officers.filter(officer => {
    if (filterChapter !== "all" && officer.chapterId !== filterChapter) return false;
    if (filterPosition !== "all" && officer.position !== filterPosition) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        officer.fullName.toLowerCase().includes(search) ||
        officer.position.toLowerCase().includes(search) ||
        officer.chapterEmail.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const officersPagination = usePagination(filteredOfficers, {
    pageSize: 12,
    resetKey: `${searchTerm}|${filterChapter}|${filterPosition}|${filteredOfficers.length}`,
  });

  const getChapterName = (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    return chapter?.name || "Unknown Chapter";
  };

  const groupedByChapter = chapters.reduce((acc, chapter) => {
    acc[chapter.id] = officers.filter(o => o.chapterId === chapter.id);
    return acc;
  }, {} as Record<string, ChapterOfficer[]>);

  const chaptersWithOfficers = Object.entries(groupedByChapter).filter(([_, offs]) => offs.length > 0).length;
  const totalOfficers = officers.length;

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
            <div className="text-sm text-muted-foreground">Total Officers</div>
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

        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label>Search Officers</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, position, or email..."
                className="pl-10"
                data-testid="input-search-officers"
              />
            </div>
          </div>
          <div className="w-56">
            <Label>Filter by Chapter</Label>
            <Select value={filterChapter} onValueChange={setFilterChapter}>
              <SelectTrigger data-testid="select-filter-chapter">
                <SelectValue placeholder="All Chapters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chapters</SelectItem>
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.name} ({groupedByChapter[chapter.id]?.length || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <Label>Filter by Position</Label>
            <Select value={filterPosition} onValueChange={setFilterPosition}>
              <SelectTrigger data-testid="select-filter-position">
                <SelectValue placeholder="All Positions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {OFFICER_POSITIONS.map((position) => (
                  <SelectItem key={position} value={position}>
                    {position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border rounded-lg">
          <div className="grid grid-cols-12 gap-4 p-4 bg-muted/50 font-medium text-sm">
            <div className="col-span-3">Name</div>
            <div className="col-span-3">Position</div>
            <div className="col-span-3">Chapter</div>
            <div className="col-span-3">Contact</div>
          </div>
          
          {isLoading ? (
            <div className="p-6">
              <LoadingState label="Loading officers..." rows={3} compact />
            </div>
          ) : filteredOfficers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No officers found. {searchTerm && "Try adjusting your search."}
            </div>
          ) : (
            <div className="divide-y">
              {officersPagination.paginatedItems.map((officer) => (
                <div key={officer.id} className="grid grid-cols-12 gap-4 p-4 items-center hover-elevate">
                  <div className="col-span-3">
                    <div className="font-medium">{officer.fullName}</div>
                  </div>
                  <div className="col-span-3">
                    <Badge variant="secondary">{officer.position}</Badge>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-1 text-sm">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {getChapterName(officer.chapterId)}
                    </div>
                  </div>
                  <div className="col-span-3 text-sm text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span>{officer.contactNumber}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      <span className="break-all">{officer.chapterEmail}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <PaginationControls
          currentPage={officersPagination.currentPage}
          totalPages={officersPagination.totalPages}
          itemsPerPage={officersPagination.itemsPerPage}
          totalItems={officersPagination.totalItems}
          startItem={officersPagination.startItem}
          endItem={officersPagination.endItem}
          onPageChange={officersPagination.setCurrentPage}
          onItemsPerPageChange={officersPagination.setItemsPerPage}
          itemLabel="officers"
        />

        {filterChapter === "all" && chapters.length > 0 && (
          <div className="mt-6">
            <h3 className="font-medium mb-4">Officers by Chapter</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {chapters.map((chapter) => {
                const chapterOfficers = groupedByChapter[chapter.id] || [];
                const filledPositions = chapterOfficers.length;
                const totalPositions = 7;
                
                return (
                  <Card key={chapter.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{chapter.name}</h4>
                      <Badge variant={filledPositions === totalPositions ? "default" : "outline"}>
                        {filledPositions}/{totalPositions}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {filledPositions === 0 ? (
                        <span className="text-destructive">No officers assigned</span>
                      ) : filledPositions === totalPositions ? (
                        <span className="text-green-600">All positions filled</span>
                      ) : (
                        <span>Missing {totalPositions - filledPositions} positions</span>
                      )}
                    </div>
                    {chapterOfficers.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {chapterOfficers.map((officer) => (
                          <div key={officer.id} className="text-xs text-muted-foreground">
                            {officer.position}: {officer.fullName}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
