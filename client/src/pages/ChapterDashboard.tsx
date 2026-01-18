import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  HandHeart
} from "lucide-react";
import type { Chapter, Publication } from "@shared/schema";
import OfficersPanel from "@/components/chapter/OfficersPanel";
import SocialMediaPanel from "@/components/chapter/SocialMediaPanel";
import VolunteerOpportunityPanel from "@/components/chapter/VolunteerOpportunityPanel";
import ChapterKpiPanel from "@/components/chapter/ChapterKpiPanel";
import EnhancedLeaderboard from "@/components/chapter/EnhancedLeaderboard";

interface AuthUser {
  id: string;
  username: string;
  role: "chapter";
  chapterId: string;
  chapterName: string;
  mustChangePassword: boolean;
}


export default function ChapterDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reports");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [projectName, setProjectName] = useState("");
  const [projectWriteup, setProjectWriteup] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [facebookLink, setFacebookLink] = useState("");
  const [uploading, setUploading] = useState(false);
  
  const [publicationFilter, setPublicationFilter] = useState<"all" | "mine">("all");
  const [chapterSearch, setChapterSearch] = useState("");
  const [chapterSort, setChapterSort] = useState<"asc" | "desc">("asc");

  const { data: authData, isLoading: authLoading } = useQuery<{ authenticated: boolean; user?: AuthUser }>({
    queryKey: ["/api/auth/check"],
  });

  const { data: publications = [] } = useQuery<Publication[]>({
    queryKey: ["/api/publications"],
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });


  useEffect(() => {
    if (!authLoading && (!authData?.authenticated || authData.user?.role !== "chapter")) {
      setLocation("/login");
    }
    if (authData?.user?.mustChangePassword) {
      setShowPasswordDialog(true);
    }
  }, [authData, authLoading, setLocation]);

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
      toast({ title: "Success", description: "Password changed successfully" });
      setShowPasswordDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/auth/logout", {});
    queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
    setLocation("/");
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
    submitReportMutation.mutate({
      projectName,
      projectWriteup,
      photoUrl: photoUrl || null,
      facebookPostLink: facebookLink
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate(newPassword);
  };

  const filteredPublications = publications.filter(pub => {
    if (publicationFilter === "mine") {
      return pub.chapterId === authData?.user?.chapterId;
    }
    return true;
  });

  const getChapterName = (chapterId: string | null) => {
    if (!chapterId) return "Unknown Chapter";
    return chapters.find(c => c.id === chapterId)?.name || "Unknown Chapter";
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

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/ysp-logo.png" alt="YSP Logo" className="h-10 w-auto" />
            <div>
              <h1 className="font-semibold">Chapter Dashboard</h1>
              <p className="text-sm text-muted-foreground">{authData?.user?.chapterName}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex flex-wrap gap-1">
            <TabsTrigger value="reports" className="gap-2" data-testid="tab-reports">
              <FileText className="h-4 w-4" />
              Submit Report
            </TabsTrigger>
            <TabsTrigger value="officers" className="gap-2" data-testid="tab-officers">
              <UserCheck className="h-4 w-4" />
              Officers
            </TabsTrigger>
            <TabsTrigger value="kpis" className="gap-2" data-testid="tab-kpis">
              <BarChart3 className="h-4 w-4" />
              KPIs
            </TabsTrigger>
            <TabsTrigger value="volunteer" className="gap-2" data-testid="tab-volunteer">
              <HandHeart className="h-4 w-4" />
              Volunteer
            </TabsTrigger>
            <TabsTrigger value="social" className="gap-2" data-testid="tab-social">
              <Share2 className="h-4 w-4" />
              Social Media
            </TabsTrigger>
            <TabsTrigger value="publications" className="gap-2" data-testid="tab-publications">
              <Newspaper className="h-4 w-4" />
              Publications
            </TabsTrigger>
            <TabsTrigger value="chapters" className="gap-2" data-testid="tab-chapters">
              <Building2 className="h-4 w-4" />
              Chapters
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2" data-testid="tab-leaderboard">
              <Trophy className="h-4 w-4" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

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
                        <img src={photoUrl} alt="Preview" className="h-20 w-20 object-cover rounded" />
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

          <TabsContent value="officers">
            {authData?.user?.chapterId && (
              <OfficersPanel chapterId={authData.user.chapterId} />
            )}
          </TabsContent>

          <TabsContent value="kpis">
            {authData?.user?.chapterId && (
              <ChapterKpiPanel chapterId={authData.user.chapterId} />
            )}
          </TabsContent>

          <TabsContent value="volunteer">
            {authData?.user?.chapterId && (
              <VolunteerOpportunityPanel chapterId={authData.user.chapterId} />
            )}
          </TabsContent>

          <TabsContent value="social">
            {authData?.user?.chapterId && (
              <SocialMediaPanel chapterId={authData.user.chapterId} />
            )}
          </TabsContent>

          <TabsContent value="publications">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Select value={publicationFilter} onValueChange={(v: "all" | "mine") => setPublicationFilter(v)}>
                  <SelectTrigger className="w-48" data-testid="select-publication-filter">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Chapters</SelectItem>
                    <SelectItem value="mine">My Chapter Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredPublications.map((pub) => (
                  <Card key={pub.id} data-testid={`card-publication-${pub.id}`}>
                    {pub.photoUrl && (
                      <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                        <img src={pub.photoUrl} alt={pub.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{pub.title}</CardTitle>
                        <Badge variant="secondary" className="shrink-0">
                          {getChapterName(pub.chapterId)}
                        </Badge>
                      </div>
                      <CardDescription>
                        {new Date(pub.publishedAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                        {pub.content}
                      </p>
                      {pub.facebookLink && (
                        <a 
                          href={pub.facebookLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <Facebook className="h-4 w-4" />
                          View on Facebook
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {filteredPublications.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-8">
                    No publications found
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

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
                {filteredChapters.map((chapter) => (
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
            </div>
          </TabsContent>

          <TabsContent value="leaderboard">
            <EnhancedLeaderboard currentChapterId={authData?.user?.chapterId} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        if (!authData?.user?.mustChangePassword) {
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
                minLength={6}
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
