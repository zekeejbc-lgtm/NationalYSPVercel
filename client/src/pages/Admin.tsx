import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LogOut, Users, Home, Cake } from "lucide-react";
import ProgramsManager from "@/components/admin/ProgramsManager";
import ChaptersManager from "@/components/admin/ChaptersManager";
import VolunteerManager from "@/components/admin/VolunteerManager";
import StatsManager from "@/components/admin/StatsManager";
import ContactManager from "@/components/admin/ContactManager";
import PublicationsManager from "@/components/admin/PublicationsManager";
import ChapterAccountsManager from "@/components/admin/ChapterAccountsManager";
import BarangayAccountsManager from "@/components/admin/BarangayAccountsManager";
import AccountManagementPanel from "@/components/admin/AccountManagementPanel";
import KpiManager from "@/components/admin/KpiManager";
import MemberListManager from "@/components/admin/MemberListManager";
import OfficerListManager from "@/components/admin/OfficerListManager";
import ImportantDocumentsManager from "@/components/admin/ImportantDocumentsManager";
import ChapterRequestsPanel from "@/components/admin/ChapterRequestsPanel";
import NationalRequestsManager from "@/components/admin/NationalRequestsManager";

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
      setLocation("/login");
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/images/ysp-logo.png" 
                alt="YSP Logo" 
                className="h-10 w-auto"
              />
              <div>
                <h1 className="text-xl font-bold">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">Manage website content</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <Tabs defaultValue="stats" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="stats" data-testid="tab-stats">Stats</TabsTrigger>
            <TabsTrigger value="programs" data-testid="tab-programs">Programs</TabsTrigger>
            <TabsTrigger value="publications" data-testid="tab-publications">Publications</TabsTrigger>
            <TabsTrigger value="chapters" data-testid="tab-chapters">Chapters</TabsTrigger>
            <TabsTrigger value="account-management" data-testid="tab-account-management">Account Management</TabsTrigger>
            <TabsTrigger value="accounts" data-testid="tab-accounts">Chapter Accounts</TabsTrigger>
            <TabsTrigger value="barangay-accounts" data-testid="tab-barangay-accounts">Barangay Accounts</TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>
            <TabsTrigger value="officers" data-testid="tab-officers">Officers</TabsTrigger>
            <TabsTrigger value="kpis" data-testid="tab-kpis">KPIs</TabsTrigger>
            <TabsTrigger value="volunteer" data-testid="tab-volunteer">Volunteer</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
            <TabsTrigger value="requests" data-testid="tab-requests">Funding</TabsTrigger>
            <TabsTrigger value="inbox" data-testid="tab-inbox">National Inbox</TabsTrigger>
            <TabsTrigger value="contact" data-testid="tab-contact">Contact</TabsTrigger>
          </TabsList>

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
            <StatsManager />
          </TabsContent>

          <TabsContent value="programs">
            <ProgramsManager />
          </TabsContent>

          <TabsContent value="publications">
            <PublicationsManager />
          </TabsContent>

          <TabsContent value="chapters">
            <ChaptersManager />
          </TabsContent>

          <TabsContent value="account-management">
            <AccountManagementPanel />
          </TabsContent>

          <TabsContent value="accounts">
            <ChapterAccountsManager />
          </TabsContent>

          <TabsContent value="barangay-accounts">
            <BarangayAccountsManager />
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
            <MemberListManager />
          </TabsContent>

          <TabsContent value="officers">
            <OfficerListManager />
          </TabsContent>

          <TabsContent value="kpis">
            <KpiManager />
          </TabsContent>

          <TabsContent value="volunteer">
            <VolunteerManager />
          </TabsContent>

          <TabsContent value="documents">
            <ImportantDocumentsManager />
          </TabsContent>

          <TabsContent value="requests">
            <ChapterRequestsPanel />
          </TabsContent>

          <TabsContent value="inbox">
            <NationalRequestsManager />
          </TabsContent>

          <TabsContent value="contact">
            <ContactManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
