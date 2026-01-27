import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  LogOut,
  Users,
  UserCheck,
  MapPin,
  Target,
  Trophy
} from "lucide-react";
import type { Chapter, Member, ChapterOfficer } from "@shared/schema";
import MemberDashboardPanel from "@/components/chapter/MemberDashboardPanel";
import OfficersPanel from "@/components/chapter/OfficersPanel";
import BarangayKpiPanel from "@/components/chapter/BarangayKpiPanel";
import BarangayLeaderboard from "@/components/chapter/BarangayLeaderboard";

interface AuthUser {
  id: string;
  username: string;
  role: "barangay";
  chapterId?: string;
  chapterName?: string;
  barangayId?: string;
  barangayName?: string;
  mustChangePassword?: boolean;
}

export default function BarangayDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("members");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
    enabled: authenticated,
  });

  useEffect(() => {
    const checkAuth = async () => {
      console.log("[Barangay] DASHBOARD_MOUNTED, checking auth...");
      try {
        const response = await fetch("/api/auth/check", { credentials: "include" });
        const data = await response.json();
        console.log("[Barangay] Auth check result:", { authenticated: data.authenticated, role: data.user?.role });
        
        if (!data.authenticated) {
          console.log("[Barangay] Not authenticated, redirecting to /login");
          setLocation("/login");
          return;
        }
        
        if (data.user?.role === "admin") {
          console.log("[Barangay] User is admin, redirecting to /admin");
          setLocation("/admin");
          return;
        }

        if (data.user?.role === "chapter") {
          console.log("[Barangay] User is chapter, redirecting to /chapter-dashboard");
          setLocation("/chapter-dashboard");
          return;
        }
        
        if (data.user?.role !== "barangay") {
          console.log("[Barangay] Unknown role:", data.user?.role, "redirecting to /login");
          setLocation("/login");
          return;
        }
        
        console.log("[Barangay] AUTH_STATE: authenticated=true, role=BARANGAY, barangayName:", data.user?.barangayName);
        setAuthenticated(true);
        setAuthUser(data.user);
        
        if (data.user?.mustChangePassword) {
          setShowPasswordDialog(true);
        }
      } catch (error) {
        console.log("[Barangay] Auth check error:", error);
        setLocation("/login");
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, [setLocation]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    try {
      await apiRequest("POST", "/api/auth/change-password", { newPassword });
      toast({ title: "Success", description: "Password changed successfully" });
      setShowPasswordDialog(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      queryClient.clear();
      console.log("[Barangay] Logged out successfully");
      setLocation("/login");
    } catch (error) {
      console.log("[Barangay] Logout error:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authenticated || !authUser) {
    return null;
  }

  const parentChapter = chapters.find(c => c.id === authUser.chapterId);

  return (
    <div className="min-h-screen bg-muted/30">
      <Dialog open={showPasswordDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Change Password Required</DialogTitle>
            <DialogDescription>
              You must change your password before continuing. Please enter a new password.
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
                placeholder="Enter new password"
                required
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
                placeholder="Confirm new password"
                required
                data-testid="input-confirm-password"
              />
            </div>
            <Button type="submit" className="w-full" data-testid="button-change-password">
              Change Password
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <header className="bg-background border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <img src="/images/ysp-logo.png" alt="YSP Logo" className="h-10 w-auto" />
            <div>
              <h1 className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Barangay Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                {authUser?.barangayName} - {parentChapter?.name || authUser?.chapterName}
              </p>
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
            <TabsTrigger value="members" className="gap-2" data-testid="tab-members">
              <Users className="h-4 w-4" />
              Members
            </TabsTrigger>
            <TabsTrigger value="officers" className="gap-2" data-testid="tab-officers">
              <UserCheck className="h-4 w-4" />
              Officers
            </TabsTrigger>
            <TabsTrigger value="kpis" className="gap-2" data-testid="tab-kpis">
              <Target className="h-4 w-4" />
              KPIs
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2" data-testid="tab-leaderboard">
              <Trophy className="h-4 w-4" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>Barangay Members</CardTitle>
                <CardDescription>
                  View and manage members in your barangay chapter.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MemberDashboardPanel 
                  chapterId={authUser.chapterId || ""} 
                  barangayId={authUser.barangayId}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="officers">
            <Card>
              <CardHeader>
                <CardTitle>Barangay Officers</CardTitle>
                <CardDescription>
                  Manage the officers for your barangay chapter.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OfficersPanel 
                  chapterId={authUser.chapterId || ""} 
                  level="barangay"
                  barangayId={authUser.barangayId}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="kpis">
            {authUser?.chapterId && authUser?.barangayId && (
              <BarangayKpiPanel 
                chapterId={authUser.chapterId} 
                barangayId={authUser.barangayId}
              />
            )}
          </TabsContent>

          <TabsContent value="leaderboard">
            {authUser?.chapterId && authUser?.barangayId && (
              <BarangayLeaderboard 
                chapterId={authUser.chapterId} 
                currentBarangayId={authUser.barangayId}
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
