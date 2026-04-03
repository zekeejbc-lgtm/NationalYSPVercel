import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Home, Cake, FileText, Newspaper, Building2, Target, HandHeart, ClipboardList, Send, MessageSquare, Phone, BarChart3, ShieldCheck } from "lucide-react";
import AdaptiveDashboardNav, { type AdaptiveDashboardTab } from "@/components/dashboard/AdaptiveDashboardNav";
import UniversalDashboardHeader from "@/components/dashboard/UniversalDashboardHeader";
import AuthLoadingScreen from "@/components/ui/auth-loading-screen";

const ProgramsManager = lazy(() => import("@/components/admin/ProgramsManager"));
const ChaptersManager = lazy(() => import("@/components/admin/ChaptersManager"));
const VolunteerManager = lazy(() => import("@/components/admin/VolunteerManager"));
const StatsManager = lazy(() => import("@/components/admin/StatsManager"));
const ContactManager = lazy(() => import("@/components/admin/ContactManager"));
const PublicationsManager = lazy(() => import("@/components/admin/PublicationsManager"));
const KpiManager = lazy(() => import("@/components/admin/KpiManager"));
const MemberListManager = lazy(() => import("@/components/admin/MemberListManager"));
const ImportantDocumentsManager = lazy(() => import("@/components/admin/ImportantDocumentsManager"));
const ChapterRequestsPanel = lazy(() => import("@/components/admin/ChapterRequestsPanel"));
const NationalRequestsManager = lazy(() => import("@/components/admin/NationalRequestsManager"));

const ADMIN_ACTIVE_TAB_STORAGE_KEY = "ysp:admin-active-tab:v1";
const ADMIN_TAB_FALLBACK = "stats";
const VALID_ADMIN_TABS = new Set([
  "stats",
  "programs",
  "publications",
  "chapters",
  "members",
  "kpis",
  "volunteer",
  "documents",
  "requests",
  "inbox",
  "contact",
]);

function readInitialAdminTab() {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return ADMIN_TAB_FALLBACK;
  }

  const savedTab = window.sessionStorage.getItem(ADMIN_ACTIVE_TAB_STORAGE_KEY);
  if (!savedTab || !VALID_ADMIN_TABS.has(savedTab)) {
    return ADMIN_TAB_FALLBACK;
  }

  return savedTab;
}

interface HouseholdSummary {
  totalSubmissions: number;
  totalHouseholdSize: number;
  averageHouseholdSize: number;
}

interface BirthdayData {
  members: Array<{ id: string; fullName: string; birthdate: string | null; chapterId: string }>;
  officers: Array<{ id: string; fullName: string; birthdate: string | null; chapterId: string }>;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState(readInitialAdminTab);

  const { data: householdSummary } = useQuery<HouseholdSummary>({
    queryKey: ["/api/household-summary"],
    enabled: authenticated,
  });

  const { data: birthdaysToday } = useQuery<BirthdayData>({
    queryKey: ["/api/birthdays-today"],
    enabled: authenticated,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
      return;
    }

    window.sessionStorage.setItem(ADMIN_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const checkAuth = async () => {
    console.log("[Admin] DASHBOARD_MOUNTED, checking auth...");
    try {
      const response = await fetch("/api/auth/check", { credentials: "include" });
      const data = await response.json();
      console.log("[Admin] Auth check result:", { authenticated: data.authenticated, role: data.user?.role });
      
      if (data.authenticated && data.user?.role === "admin") {
        console.log("[Admin] AUTH_STATE: authenticated=true, role=ADMIN");
        setAuthenticated(true);
      } else if (data.authenticated && data.user?.role === "chapter") {
        console.log("[Admin] User is chapter, redirecting to /chapter-dashboard");
        setLocation("/chapter-dashboard");
        return;
      } else if (data.authenticated && !data.user?.role) {
        console.log("[Admin] Authenticated but no role, redirecting to /login");
        setLocation("/login");
        return;
      } else {
        console.log("[Admin] Not authenticated, redirecting to /login");
        setLocation("/login");
        return;
      }
    } catch (error) {
      console.log("[Admin] Auth check error:", error);
      setLocation("/login");
      return;
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      console.log("[Admin] Logged out successfully");
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
      setLocation("/");
    } catch (error) {
      console.log("[Admin] Logout error:", error);
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <AuthLoadingScreen label="Preparing admin dashboard..." />;
  }

  if (!authenticated) {
    return null;
  }

  const dashboardTabs: AdaptiveDashboardTab[] = [
    { value: "stats", label: "Stats", icon: BarChart3, group: "Insights", dataTestId: "tab-stats", mobilePriority: true, desktopPriority: true },
    { value: "programs", label: "Programs", icon: FileText, group: "Content", dataTestId: "tab-programs", desktopPriority: true },
    { value: "publications", label: "Publications", icon: Newspaper, group: "Content", dataTestId: "tab-publications", desktopPriority: true },
    { value: "chapters", label: "Chapters", icon: Building2, group: "People", dataTestId: "tab-chapters", desktopPriority: true },
    { value: "members", label: "Members", icon: Users, group: "People", dataTestId: "tab-members", mobilePriority: true, desktopPriority: true },
    { value: "kpis", label: "KPIs", icon: Target, group: "Insights", dataTestId: "tab-kpis", mobilePriority: true, desktopPriority: true },
    { value: "volunteer", label: "Volunteer", icon: HandHeart, group: "Operations", dataTestId: "tab-volunteer" },
    { value: "documents", label: "Documents", icon: ClipboardList, group: "Operations", dataTestId: "tab-documents" },
    { value: "requests", label: "Funding", icon: Send, group: "Operations", dataTestId: "tab-requests" },
    { value: "inbox", label: "National Inbox", icon: MessageSquare, group: "Communication", dataTestId: "tab-inbox", mobilePriority: true, desktopPriority: true },
    { value: "contact", label: "Contact", icon: Phone, group: "Communication", dataTestId: "tab-contact" },
    { value: "admin-accounts-action", label: "Admin Accounts", icon: ShieldCheck, group: "Account", dataTestId: "tab-admin-accounts" },
  ];

  const handleDashboardNavChange = (value: string) => {
    if (value === "admin-accounts-action") {
      setLocation("/admin/accounts");
      return;
    }

    setActiveTab(value);
  };

  const renderTabFallback = (label: string) => (
    <Card>
      <CardContent className="p-6">
        <LoadingState label={label} rows={3} compact />
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <UniversalDashboardHeader
        title="Admin Dashboard"
        subtitle="Manage website content"
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 pb-24 md:pb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <AdaptiveDashboardNav
            tabs={dashboardTabs}
            activeTab={activeTab}
            onChange={handleDashboardNavChange}
            mobileTitle="Admin Sections"
            mobileDescription="Use quick tabs below or open More for management sections."
            desktopVisibleCount={8}
          />

          <TabsContent value="stats">
            {birthdaysToday && (birthdaysToday.members.length > 0 || birthdaysToday.officers.length > 0) && (
              <Card className="mb-6" data-testid="card-birthdays-today">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Cake className="h-5 w-5 text-primary" />
                    Birthdays Today
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {birthdaysToday.members.map((member) => (
                      <div key={member.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                        <span className="font-medium">{member.fullName}</span>
                        <span className="text-sm text-muted-foreground">(Member)</span>
                      </div>
                    ))}
                    {birthdaysToday.officers.map((officer) => (
                      <div key={officer.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                        <span className="font-medium">{officer.fullName}</span>
                        <span className="text-sm text-muted-foreground">(Officer)</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <Suspense fallback={renderTabFallback("Loading stats...")}>
              <StatsManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="programs">
            <Suspense fallback={renderTabFallback("Loading programs...")}>
              <ProgramsManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="publications">
            <Suspense fallback={renderTabFallback("Loading publications...")}>
              <PublicationsManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="chapters">
            <Suspense fallback={renderTabFallback("Loading chapters...")}>
              <ChaptersManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="members">
            {householdSummary && (
              <Card className="mb-6" data-testid="card-household-summary">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Home className="h-5 w-5" />
                    Household Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-total-submissions">
                        {householdSummary.totalSubmissions}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Submissions</div>
                    </div>
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-total-household-size">
                        {householdSummary.totalHouseholdSize}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Household Size</div>
                    </div>
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-avg-household-size">
                        {householdSummary.averageHouseholdSize}
                      </div>
                      <div className="text-sm text-muted-foreground">Average Household Size</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <Suspense fallback={renderTabFallback("Loading members...")}>
              <MemberListManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="kpis">
            <Suspense fallback={renderTabFallback("Loading KPIs...")}>
              <KpiManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="volunteer">
            <Suspense fallback={renderTabFallback("Loading volunteer opportunities...")}>
              <VolunteerManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="documents">
            <Suspense fallback={renderTabFallback("Loading documents...")}>
              <ImportantDocumentsManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="requests">
            <Suspense fallback={renderTabFallback("Loading funding requests...")}>
              <ChapterRequestsPanel />
            </Suspense>
          </TabsContent>

          <TabsContent value="inbox">
            <Suspense fallback={renderTabFallback("Loading inbox...")}>
              <NationalRequestsManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="contact">
            <Suspense fallback={renderTabFallback("Loading contact section...")}>
              <ContactManager />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
