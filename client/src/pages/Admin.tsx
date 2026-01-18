import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LogOut } from "lucide-react";
import ProgramsManager from "@/components/admin/ProgramsManager";
import ChaptersManager from "@/components/admin/ChaptersManager";
import VolunteerManager from "@/components/admin/VolunteerManager";
import StatsManager from "@/components/admin/StatsManager";
import ContactManager from "@/components/admin/ContactManager";
import PublicationsManager from "@/components/admin/PublicationsManager";
import ChapterAccountsManager from "@/components/admin/ChapterAccountsManager";
import KpiManager from "@/components/admin/KpiManager";
import MemberListManager from "@/components/admin/MemberListManager";
import OfficerListManager from "@/components/admin/OfficerListManager";

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

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
            <TabsTrigger value="accounts" data-testid="tab-accounts">Chapter Accounts</TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>
            <TabsTrigger value="officers" data-testid="tab-officers">Officers</TabsTrigger>
            <TabsTrigger value="kpis" data-testid="tab-kpis">KPIs</TabsTrigger>
            <TabsTrigger value="volunteer" data-testid="tab-volunteer">Volunteer</TabsTrigger>
            <TabsTrigger value="contact" data-testid="tab-contact">Contact</TabsTrigger>
          </TabsList>

          <TabsContent value="stats">
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

          <TabsContent value="accounts">
            <ChapterAccountsManager />
          </TabsContent>

          <TabsContent value="members">
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

          <TabsContent value="contact">
            <ContactManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
