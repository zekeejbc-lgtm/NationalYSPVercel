import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LoadingState from "@/components/ui/loading-state";
import PaginationControls from "@/components/ui/pagination-controls";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getDisplayImageUrl, IMAGE_DEBUG_ENABLED } from "@/lib/driveUtils";
import AdaptiveDashboardNav, { type AdaptiveDashboardTab } from "@/components/dashboard/AdaptiveDashboardNav";
import { 
  FileText, 
  Newspaper, 
  Building2, 
  BarChart3, 
  Trophy,
  LogOut,
  Search,
  Facebook,
  Phone,
  ArrowUpDown,
  Upload,
  MapPin,
  UserCheck,
  Share2,
  HandHeart,
  Users,
  ClipboardList,
  Send,
  MessageSquare,
  ImageOff
} from "lucide-react";
import type { Chapter, Publication } from "@shared/schema";

const OfficersPanel = lazy(() => import("@/components/chapter/OfficersPanel"));
const SocialMediaPanel = lazy(() => import("@/components/chapter/SocialMediaPanel"));
const VolunteerOpportunityPanel = lazy(() => import("@/components/chapter/VolunteerOpportunityPanel"));
const ChapterKpiPanel = lazy(() => import("@/components/chapter/ChapterKpiPanel"));
const EnhancedLeaderboard = lazy(() => import("@/components/chapter/EnhancedLeaderboard"));
const MemberDashboardPanel = lazy(() => import("@/components/chapter/MemberDashboardPanel"));
const ImportantDocumentsPanel = lazy(() => import("@/components/chapter/ImportantDocumentsPanel"));
const FundingRequestPanel = lazy(() => import("@/components/chapter/FundingRequestPanel"));
const NationalRequestPanel = lazy(() => import("@/components/chapter/NationalRequestPanel"));

interface AuthUser {
  id: string;
  username: string;
  role: "chapter" | "admin";
  chapterId?: string;
  chapterName?: string;
  mustChangePassword?: boolean;
}


export default function ChapterDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reports");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  
  const [projectName, setProjectName] = useState("");
  const [projectWriteup, setProjectWriteup] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [facebookLink, setFacebookLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [collaborationType, setCollaborationType] = useState<"NONE" | "ANOTHER_CHAPTER" | "YSP_NATIONAL">("NONE");
  const [collaboratingChapterId, setCollaboratingChapterId] = useState<string | null>(null);
  
  const [publicationSearch, setPublicationSearch] = useState("");
  const [publicationChapterFilter, setPublicationChapterFilter] = useState<string>("all");
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [failedPublicationImages, setFailedPublicationImages] = useState<Record<string, boolean>>({});
  const [chapterSearch, setChapterSearch] = useState("");
  const [chapterSort, setChapterSort] = useState<"asc" | "desc">("asc");

  const { data: publications = [] } = useQuery<Publication[]>({
    queryKey: ["/api/publications"],
    enabled: authenticated,
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
    enabled: authenticated,
  });

  useEffect(() => {
    const checkAuth = async () => {
      console.log("[Chapter] DASHBOARD_MOUNTED, checking auth...");
      try {
        const response = await fetch("/api/auth/check", { credentials: "include" });
        const data = await response.json();
        console.log("[Chapter] Auth check result:", { authenticated: data.authenticated, role: data.user?.role });
        
        if (!data.authenticated) {
          console.log("[Chapter] Not authenticated, redirecting to /login");
          setLocation("/login");
          return;
        }
        
        if (data.user?.role === "admin") {
          console.log("[Chapter] User is admin, redirecting to /admin");
          setLocation("/admin");
          return;
        }
        
        if (data.user?.role !== "chapter") {
          console.log("[Chapter] Unknown role:", data.user?.role, "redirecting to /login");
          setLocation("/login");
          return;
        }
        
        console.log("[Chapter] AUTH_STATE: authenticated=true, role=CHAPTER, chapterName:", data.user?.chapterName);
        setAuthenticated(true);
        setAuthUser(data.user);
        
        if (data.user?.mustChangePassword) {
          setShowPasswordDialog(true);
        }
      } catch (error) {
        console.log("[Chapter] Auth check error:", error);
        setLocation("/login");
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, [setLocation]);

  const submitReportMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/project-reports", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Project report submitted successfully" });
      setProjectName("");
      setProjectWriteup("");
      setPhotoUrl("");
      setFacebookLink("");
      setCollaborationType("NONE");
      setCollaboratingChapterId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      return await apiRequest("POST", "/api/auth/change-password", { newPassword });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Password Updated Successfully." });
      setShowPasswordDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/auth/logout", {});
    console.log("[Chapter] Logged out successfully");
    queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
    setLocation("/login");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);
    
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      const data = await res.json();
      setPhotoUrl(data.url);
    } catch (error) {
      toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName || !projectWriteup || !facebookLink) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (collaborationType === "ANOTHER_CHAPTER" && !collaboratingChapterId) {
      toast({ title: "Error", description: "Please select the collaborating chapter", variant: "destructive" });
      return;
    }
    submitReportMutation.mutate({
      projectName,
      projectWriteup,
      photoUrl: photoUrl || null,
      facebookPostLink: facebookLink,
      collaborationType,
      collaboratingChapterId: collaborationType === "ANOTHER_CHAPTER" ? collaboratingChapterId : null
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate(newPassword);
  };

  const chapterNameById = useMemo(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter.name]));
  }, [chapters]);

  const filteredPublications = useMemo(() => {
    const normalizedQuery = publicationSearch.trim().toLowerCase();

    return publications.filter((pub) => {
      const matchesChapterFilter =
        publicationChapterFilter === "all"
          ? true
          : publicationChapterFilter === "mine"
            ? pub.chapterId === authUser?.chapterId
            : pub.chapterId === publicationChapterFilter;

      if (!matchesChapterFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const chapterName = (pub.chapterId ? chapterNameById.get(pub.chapterId) : "") || "";
      return (
        pub.title.toLowerCase().includes(normalizedQuery) ||
        pub.content.toLowerCase().includes(normalizedQuery) ||
        chapterName.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [publications, publicationSearch, publicationChapterFilter, authUser?.chapterId, chapterNameById]);

  const getPublicationPhotoUrl = (publication: Publication & { imageUrl?: string | null }) => {
    const raw = publication.photoUrl || publication.imageUrl || "";
    return getDisplayImageUrl(raw.trim());
  };

  const getChapterName = (chapterId: string | null) => {
    if (!chapterId) return "Unknown Chapter";
    return chapterNameById.get(chapterId) || "Unknown Chapter";
  };

  const truncateText = (value: string, maxLength: number) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return `${cleaned.slice(0, maxLength).trimEnd()}...`;
  };

  const filteredChapters = chapters
    .filter(chapter => 
      chapter.name.toLowerCase().includes(chapterSearch.toLowerCase()) ||
      chapter.location.toLowerCase().includes(chapterSearch.toLowerCase())
    )
    .sort((a, b) => 
      chapterSort === "asc" 
        ? a.name.localeCompare(b.name) 
        : b.name.localeCompare(a.name)
    );

  const publicationsPagination = usePagination(filteredPublications, {
    pageSize: 9,
    resetKey: `${publicationChapterFilter}|${publicationSearch}|${filteredPublications.length}`,
  });

  const chaptersPagination = usePagination(filteredChapters, {
    pageSize: 9,
    resetKey: `${chapterSearch}|${chapterSort}|${filteredChapters.length}`,
  });

  const dashboardTabs: AdaptiveDashboardTab[] = [
    { value: "reports", label: "Submit Report", icon: FileText, group: "Operations", dataTestId: "tab-reports", mobilePriority: true, desktopPriority: true },
    { value: "members", label: "Members", icon: Users, group: "People", dataTestId: "tab-members", mobilePriority: true, desktopPriority: true },
    { value: "officers", label: "Officers", icon: UserCheck, group: "People", dataTestId: "tab-officers", desktopPriority: true },
    { value: "kpis", label: "KPIs", icon: BarChart3, group: "Insights", dataTestId: "tab-kpis", mobilePriority: true, desktopPriority: true },
    { value: "volunteer", label: "Volunteer", icon: HandHeart, group: "Operations", dataTestId: "tab-volunteer", desktopPriority: true },
    { value: "documents", label: "Documents", icon: ClipboardList, group: "Operations", dataTestId: "tab-documents", desktopPriority: true },
    { value: "requests", label: "Funding", icon: Send, group: "Communication & Growth", dataTestId: "tab-requests", mobilePriority: true },
    { value: "social", label: "Social Media", icon: Share2, group: "Communication & Growth", dataTestId: "tab-social" },
    { value: "publications", label: "Publications", icon: Newspaper, group: "Insights", dataTestId: "tab-publications" },
    { value: "chapters", label: "Chapters", icon: Building2, group: "People", dataTestId: "tab-chapters" },
    { value: "leaderboard", label: "Leaderboard", icon: Trophy, group: "Insights", dataTestId: "tab-leaderboard" },
    { value: "national", label: "Message National", icon: MessageSquare, group: "Communication & Growth", dataTestId: "tab-national", desktopPriority: true },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
        <div className="w-full max-w-3xl">
          <LoadingState label="Loading dashboard..." rows={4} />
        </div>
      </div>
    );
  }

  const renderTabFallback = (label: string) => (
    <Card>
      <CardContent className="p-6">
        <LoadingState label={label} rows={3} compact />
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/ysp-logo.png" alt="YSP Logo" className="h-10 w-auto" />
            <div>
              <h1 className="font-semibold">Chapter Dashboard</h1>
              <p className="text-sm text-muted-foreground">{authUser?.chapterName}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <AdaptiveDashboardNav
            tabs={dashboardTabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            mobileTitle="Chapter Sections"
            mobileDescription="Use quick tabs below or open More for all sections."
          />

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Submit Project Report</CardTitle>
                <CardDescription>
                  Share your chapter's project activities. Reports are automatically published.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitReport} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name *</Label>
                    <Input
                      id="projectName"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Enter project name"
                      required
                      data-testid="input-project-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projectWriteup">Project Write-up *</Label>
                    <Textarea
                      id="projectWriteup"
                      value={projectWriteup}
                      onChange={(e) => setProjectWriteup(e.target.value)}
                      placeholder="Describe your project..."
                      rows={6}
                      required
                      data-testid="input-project-writeup"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="photo">Photo</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        id="photo"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="max-w-xs"
                        data-testid="input-photo"
                      />
                      {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
                      {photoUrl && (
                        <img src={getDisplayImageUrl(photoUrl)} alt="Preview" className="h-20 w-20 object-cover rounded" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="facebookLink">Facebook Post Link *</Label>
                    <Input
                      id="facebookLink"
                      type="url"
                      value={facebookLink}
                      onChange={(e) => setFacebookLink(e.target.value)}
                      placeholder="https://facebook.com/..."
                      required
                      data-testid="input-facebook-link"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Collaboration (Optional)</Label>
                    <Select
                      value={collaborationType}
                      onValueChange={(value: "NONE" | "ANOTHER_CHAPTER" | "YSP_NATIONAL") => {
                        setCollaborationType(value);
                        if (value !== "ANOTHER_CHAPTER") {
                          setCollaboratingChapterId(null);
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-collaboration-type">
                        <SelectValue placeholder="Select collaboration type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">None</SelectItem>
                        <SelectItem value="ANOTHER_CHAPTER">Another Chapter</SelectItem>
                        <SelectItem value="YSP_NATIONAL">YSP National</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {collaborationType === "ANOTHER_CHAPTER" && (
                    <div className="space-y-2">
                      <Label>Collaborating Chapter *</Label>
                      <Select
                        value={collaboratingChapterId || "none"}
                        onValueChange={(value) => setCollaboratingChapterId(value === "none" ? null : value)}
                      >
                        <SelectTrigger data-testid="select-collaborating-chapter">
                          <SelectValue placeholder="Select chapter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select a chapter</SelectItem>
                          {chapters
                            .filter(ch => ch.id !== authUser?.chapterId)
                            .map(ch => (
                              <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button 
                    type="submit" 
                    disabled={submitReportMutation.isPending}
                    data-testid="button-submit-report"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {submitReportMutation.isPending ? "Submitting..." : "Submit Report"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members">
            <Suspense fallback={renderTabFallback("Loading members...")}>
              {authUser?.chapterId && authUser?.chapterName && (
                <MemberDashboardPanel chapterId={authUser.chapterId} chapterName={authUser.chapterName} />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="officers">
            <Suspense fallback={renderTabFallback("Loading officers...")}>
              {authUser?.chapterId && (
                <OfficersPanel chapterId={authUser.chapterId} chapterName={authUser.chapterName} />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="kpis">
            <Suspense fallback={renderTabFallback("Loading KPIs...")}>
              {authUser?.chapterId && (
                <ChapterKpiPanel chapterId={authUser.chapterId} />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="volunteer">
            <Suspense fallback={renderTabFallback("Loading volunteer opportunities...")}>
              {authUser?.chapterId && (
                <VolunteerOpportunityPanel chapterId={authUser.chapterId} />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="documents">
            <Suspense fallback={renderTabFallback("Loading documents...")}>
              {authUser?.chapterId && (
                <ImportantDocumentsPanel chapterId={authUser.chapterId} />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="requests">
            <Suspense fallback={renderTabFallback("Loading funding requests...")}>
              {authUser?.chapterId && (
                <FundingRequestPanel chapterId={authUser.chapterId} />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="social">
            <Suspense fallback={renderTabFallback("Loading social media panel...")}>
              {authUser?.chapterId && (
                <SocialMediaPanel chapterId={authUser.chapterId} />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="publications">
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search publications by title, chapter, or content..."
                    value={publicationSearch}
                    onChange={(e) => setPublicationSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-publication-search"
                  />
                </div>
                <Select value={publicationChapterFilter} onValueChange={setPublicationChapterFilter}>
                  <SelectTrigger className="w-[220px]" data-testid="select-publication-filter">
                    <SelectValue placeholder="Filter chapters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Chapters</SelectItem>
                    <SelectItem value="mine">My Chapter Only</SelectItem>
                    {chapters.map((chapter) => (
                      <SelectItem key={chapter.id} value={chapter.id}>
                        {chapter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publicationsPagination.paginatedItems.map((pub) => {
                  const photoUrl = getPublicationPhotoUrl(pub as Publication & { imageUrl?: string | null });
                  const hasImageError = Boolean(failedPublicationImages[pub.id]);

                  return (
                  <Card
                    key={pub.id}
                    className="h-[440px] overflow-hidden cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring"
                    data-testid={`card-publication-${pub.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPublication(pub)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedPublication(pub);
                      }
                    }}
                  >
                    {photoUrl && !hasImageError ? (
                      <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                        <img
                          src={photoUrl}
                          alt={pub.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onError={() => {
                            setFailedPublicationImages((prev) => ({ ...prev, [pub.id]: true }));
                            if (IMAGE_DEBUG_ENABLED) {
                              console.error("[Image Debug] Chapter publication image failed", {
                                publicationId: pub.id,
                                title: pub.title,
                                photoUrl,
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
                    ) : (
                      <div className="relative w-full aspect-video bg-muted flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ImageOff className="h-8 w-8" />
                          <span className="text-sm">No image provided</span>
                        </div>
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg leading-tight">
                          {truncateText(pub.title, 80)}
                        </CardTitle>
                        <Badge variant="secondary" className="shrink-0">
                          {getChapterName(pub.chapterId)}
                        </Badge>
                      </div>
                      <CardDescription>
                        {new Date(pub.publishedAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex h-full flex-col">
                      <p className="text-sm text-muted-foreground break-words mb-3 min-h-[4.5rem]">
                        {truncateText(pub.content, 190)}
                      </p>
                      {pub.facebookLink && (
                        <a 
                          href={pub.facebookLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-auto"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Facebook className="h-4 w-4" />
                          View on Facebook
                        </a>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
                {filteredPublications.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-8">
                    No publications found
                  </p>
                )}
              </div>

              <PaginationControls
                currentPage={publicationsPagination.currentPage}
                totalPages={publicationsPagination.totalPages}
                itemsPerPage={publicationsPagination.itemsPerPage}
                totalItems={publicationsPagination.totalItems}
                startItem={publicationsPagination.startItem}
                endItem={publicationsPagination.endItem}
                onPageChange={publicationsPagination.setCurrentPage}
                onItemsPerPageChange={publicationsPagination.setItemsPerPage}
                itemLabel="publications"
              />
            </div>
          </TabsContent>

          <Dialog
            open={Boolean(selectedPublication)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedPublication(null);
              }
            }}
          >
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              {selectedPublication && (
                <div className="space-y-4">
                  <DialogHeader>
                    <DialogTitle>{selectedPublication.title}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">{getChapterName(selectedPublication.chapterId)}</Badge>
                      <span>{new Date(selectedPublication.publishedAt).toLocaleString()}</span>
                    </DialogDescription>
                  </DialogHeader>

                  {(() => {
                    const selectedPhotoUrl = getPublicationPhotoUrl(selectedPublication as Publication & { imageUrl?: string | null });
                    const selectedImageError = Boolean(failedPublicationImages[selectedPublication.id]);

                    if (selectedPhotoUrl && !selectedImageError) {
                      return (
                        <img
                          src={selectedPhotoUrl}
                          alt={selectedPublication.title}
                          className="w-full max-h-[360px] object-cover rounded-md"
                          loading="lazy"
                          decoding="async"
                          onError={() => {
                            setFailedPublicationImages((prev) => ({ ...prev, [selectedPublication.id]: true }));
                          }}
                        />
                      );
                    }

                    return (
                      <div className="relative w-full aspect-video bg-muted flex items-center justify-center rounded-md">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ImageOff className="h-8 w-8" />
                          <span className="text-sm">No image available</span>
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {selectedPublication.content}
                  </p>

                  {selectedPublication.facebookLink && (
                    <a
                      href={selectedPublication.facebookLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Facebook className="h-4 w-4" />
                      View on Facebook
                    </a>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          <TabsContent value="chapters">
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search chapters..."
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-chapter-search"
                  />
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => setChapterSort(s => s === "asc" ? "desc" : "asc")}
                  data-testid="button-sort-chapters"
                >
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  Sort {chapterSort === "asc" ? "A-Z" : "Z-A"}
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {chaptersPagination.paginatedItems.map((chapter) => (
                  <Card key={chapter.id} data-testid={`card-chapter-${chapter.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{chapter.name}</CardTitle>
                      {chapter.nextgenBatch && (
                        <Badge variant="outline">{chapter.nextgenBatch}</Badge>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{chapter.location}</span>
                      </div>
                      {chapter.contactPerson && (
                        <div className="text-sm text-muted-foreground">
                          Contact: {chapter.contactPerson}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a href={`tel:${chapter.contact}`} className="text-primary hover:underline">
                          {chapter.contact}
                        </a>
                      </div>
                      {chapter.facebookLink && (
                        <a 
                          href={chapter.facebookLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <Facebook className="h-4 w-4" />
                          Facebook Page
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <PaginationControls
                currentPage={chaptersPagination.currentPage}
                totalPages={chaptersPagination.totalPages}
                itemsPerPage={chaptersPagination.itemsPerPage}
                totalItems={chaptersPagination.totalItems}
                startItem={chaptersPagination.startItem}
                endItem={chaptersPagination.endItem}
                onPageChange={chaptersPagination.setCurrentPage}
                onItemsPerPageChange={chaptersPagination.setItemsPerPage}
                itemLabel="chapters"
              />
            </div>
          </TabsContent>

          <TabsContent value="leaderboard">
            <Suspense fallback={renderTabFallback("Loading leaderboard...")}>
              <EnhancedLeaderboard currentChapterId={authUser?.chapterId} />
            </Suspense>
          </TabsContent>

          <TabsContent value="national">
            <Suspense fallback={renderTabFallback("Loading inbox...")}>
              <NationalRequestPanel senderType="chapter" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        if (!authUser?.mustChangePassword) {
          setShowPasswordDialog(open);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password Required</DialogTitle>
            <DialogDescription>
              Please set a new password for your account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="input-confirm-password"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={changePasswordMutation.isPending}
              data-testid="button-change-password"
            >
              {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
