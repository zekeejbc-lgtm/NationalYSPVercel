import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import AuthLoadingScreen from "@/components/ui/auth-loading-screen";
import SessionRecoveryPanel from "@/components/ui/session-recovery-panel";
import { useToast } from "@/hooks/use-toast";
import { checkAuthSession } from "@/lib/authSession";
import { apiRequest, clearSessionQueryPersistence, queryClient } from "@/lib/queryClient";
import AdaptiveDashboardNav, { type AdaptiveDashboardTab } from "@/components/dashboard/AdaptiveDashboardNav";
import UniversalDashboardHeader from "@/components/dashboard/UniversalDashboardHeader";
import DashboardTabSkeleton from "@/components/dashboard/DashboardTabSkeleton";
import {
  Eye,
  EyeOff,
  Users,
  UserCheck,
  HandHeart,
  Target,
  Trophy,
  MessageSquare
} from "lucide-react";
import type { Chapter } from "@shared/schema";

const MemberDashboardPanel = lazy(() => import("@/components/chapter/MemberDashboardPanel"));
const OfficersPanel = lazy(() => import("@/components/chapter/OfficersPanel"));
const BarangayKpiPanel = lazy(() => import("@/components/chapter/BarangayKpiPanel"));
const BarangayLeaderboard = lazy(() => import("@/components/chapter/BarangayLeaderboard"));
const NationalRequestPanel = lazy(() => import("@/components/chapter/NationalRequestPanel"));
const VolunteerOpportunityPanel = lazy(() => import("@/components/chapter/VolunteerOpportunityPanel"));

const BARANGAY_ACTIVE_TAB_STORAGE_KEY = "ysp:barangay-active-tab:v1";

function readInitialBarangayTab() {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return "members";
  }

  return window.sessionStorage.getItem(BARANGAY_ACTIVE_TAB_STORAGE_KEY) || "members";
}

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
  const [activeTab, setActiveTab] = useState(readInitialBarangayTab);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
    enabled: authenticated,
  });

  useEffect(() => {
    const checkAuth = async () => {
      console.log("[Barangay] DASHBOARD_MOUNTED, checking auth...");
      setLoading(true);
      setAuthError(null);

      try {
        const authResult = await checkAuthSession();

        if (authResult.status === "error") {
          setAuthenticated(false);
          setAuthUser(null);
          setAuthError(authResult.message);
          return;
        }

        if (authResult.status === "unauthenticated") {
          console.log("[Barangay] Not authenticated, redirecting to /login");
          queryClient.clear();
          clearSessionQueryPersistence();
          setAuthenticated(false);
          setAuthUser(null);
          setLocation("/login");
          return;
        }

        console.log("[Barangay] Auth check result:", {
          authenticated: true,
          role: authResult.user.role,
        });
        
        if (authResult.user.role === "admin") {
          console.log("[Barangay] User is admin, redirecting to /admin");
          setLocation("/admin");
          return;
        }

        if (authResult.user.role === "chapter") {
          console.log("[Barangay] User is chapter, redirecting to /chapter-dashboard");
          setLocation("/chapter-dashboard");
          return;
        }
        
        if (authResult.user.role !== "barangay") {
          console.log("[Barangay] Unknown role:", authResult.user.role, "redirecting to /login");
          queryClient.clear();
          clearSessionQueryPersistence();
          setAuthenticated(false);
          setAuthUser(null);
          setLocation("/login");
          return;
        }
        
        console.log("[Barangay] AUTH_STATE: authenticated=true, role=BARANGAY, barangayName:", authResult.user.barangayName);
        const barangayUser: AuthUser = {
          id: authResult.user.id,
          username: authResult.user.username,
          role: "barangay",
          chapterId: authResult.user.chapterId,
          chapterName: authResult.user.chapterName,
          barangayId: authResult.user.barangayId,
          barangayName: authResult.user.barangayName,
          mustChangePassword: authResult.user.mustChangePassword,
        };
        setAuthenticated(true);
        setAuthUser(barangayUser);
        
        if (barangayUser.mustChangePassword) {
          setShowPasswordDialog(true);
        }
      } catch (error) {
        console.log("[Barangay] Auth check error:", error);
        setAuthenticated(false);
        setAuthUser(null);
        setAuthError("Unable to verify your session right now. Please retry.");
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, [setLocation]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
      return;
    }

    window.sessionStorage.setItem(BARANGAY_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    try {
      await apiRequest("POST", "/api/auth/change-password", { newPassword });
      toast({ title: "Success", description: "Password Updated Successfully." });
      setShowPasswordDialog(false);
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      queryClient.clear();
      clearSessionQueryPersistence();
      console.log("[Barangay] Logged out successfully");
      setLocation("/");
    } catch (error) {
      console.log("[Barangay] Logout error:", error);
    }
  };

  const isDashboardDataLoading = loading || (authenticated && (chaptersLoading || !chaptersFetched));

  if (isDashboardDataLoading) {
    return <AuthLoadingScreen label="Preparing barangay dashboard..." />;
  }

  if (authError && !authenticated) {
    return (
      <SessionRecoveryPanel
        message={authError}
        onRetry={() => {
          window.location.reload();
        }}
        onGoToLogin={() => setLocation("/login")}
      />
    );
  }

  if (!authenticated || !authUser) {
    return <AuthLoadingScreen label="Redirecting to sign in..." />;
  }

  const parentChapter = chapters.find(c => c.id === authUser.chapterId);
  const headerSubtitle = [authUser?.barangayName, parentChapter?.name || authUser?.chapterName]
    .filter((value): value is string => Boolean(value))
    .join(" - ");

  const dashboardTabs: AdaptiveDashboardTab[] = [
    { value: "members", label: "Members", icon: Users, group: "People", dataTestId: "tab-members", mobilePriority: true, desktopPriority: true },
    { value: "officers", label: "Officers", icon: UserCheck, group: "People", dataTestId: "tab-officers", mobilePriority: true, desktopPriority: true },
    { value: "volunteer", label: "Volunteer", icon: HandHeart, group: "Operations", dataTestId: "tab-volunteer", mobilePriority: true, desktopPriority: true },
    { value: "kpis", label: "KPIs", icon: Target, group: "Insights", dataTestId: "tab-kpis", mobilePriority: true, desktopPriority: true },
    { value: "leaderboard", label: "Leaderboard", icon: Trophy, group: "Insights", dataTestId: "tab-leaderboard", mobilePriority: true, desktopPriority: true },
    { value: "national", label: "Message National", icon: MessageSquare, group: "Communication", dataTestId: "tab-national", desktopPriority: true },
  ];

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
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                  className="pr-12"
                  data-testid="input-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-new-password"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  className="pr-12"
                  data-testid="input-confirm-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-confirm-password"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" data-testid="button-change-password">
              Change Password
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <UniversalDashboardHeader
        title="Barangay Dashboard"
        subtitle={headerSubtitle}
        onLogout={handleLogout}
      />

      <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <AdaptiveDashboardNav
            tabs={dashboardTabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            mobileTitle="Barangay Sections"
            mobileDescription="Use quick tabs below or open More for additional sections."
            desktopVisibleCount={5}
          />

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>Barangay Members</CardTitle>
                <CardDescription>
                  View and manage members in your barangay chapter.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<DashboardTabSkeleton variant="members" label="Loading members..." embedded />}>
                  <MemberDashboardPanel 
                    chapterId={authUser.chapterId || ""} 
                    barangayId={authUser.barangayId}
                  />
                </Suspense>
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
                <Suspense fallback={<DashboardTabSkeleton variant="officers" label="Loading officers..." embedded />}>
                  <OfficersPanel 
                    chapterId={authUser.chapterId || ""} 
                    level="barangay"
                    barangayId={authUser.barangayId}
                  />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="volunteer">
            <Suspense fallback={<DashboardTabSkeleton variant="volunteer" label="Loading volunteer opportunities..." />}>
              {authUser?.chapterId && authUser?.barangayId && (
                <VolunteerOpportunityPanel
                  chapterId={authUser.chapterId}
                  role="barangay"
                  barangayId={authUser.barangayId}
                />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="kpis">
            <Suspense fallback={<DashboardTabSkeleton variant="kpis" label="Loading KPIs..." />}>
              {authUser?.chapterId && authUser?.barangayId && (
                <BarangayKpiPanel 
                  chapterId={authUser.chapterId} 
                  barangayId={authUser.barangayId}
                />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="leaderboard">
            <Suspense fallback={<DashboardTabSkeleton variant="leaderboard" label="Loading leaderboard..." />}>
              {authUser?.chapterId && authUser?.barangayId && (
                <BarangayLeaderboard 
                  chapterId={authUser.chapterId} 
                  currentBarangayId={authUser.barangayId}
                />
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="national">
            <Suspense fallback={<DashboardTabSkeleton variant="inbox" label="Loading inbox..." />}>
              <NationalRequestPanel senderType="barangay" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
