import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LoadingState from "@/components/ui/loading-state";
import AuthLoadingScreen from "@/components/ui/auth-loading-screen";
import SessionRecoveryPanel from "@/components/ui/session-recovery-panel";
import { useToast } from "@/hooks/use-toast";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";
import { checkAuthSession } from "@/lib/authSession";
import { apiRequest, clearSessionQueryPersistence, queryClient } from "@/lib/queryClient";
import { Activity, AlertTriangle, ArrowLeft, Edit, Keyboard, LogOut, Plus, Power, Radio, RefreshCw, ShieldAlert, Trash2, UserRound, Users } from "lucide-react";

type AdminAccount = {
  id: string;
  username: string;
  createdAt: string;
  createdByAdminId: string | null;
  createdByUsername: string | null;
  isCurrent: boolean;
  isMotherAccount: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type ActiveSession = {
  presenceId: string;
  userId: string;
  role: "admin" | "chapter" | "barangay";
  username: string;
  displayName: string;
  accountLabel: string;
  route: string;
  lastSeenAt: string;
  isTyping: boolean;
  typingRoute: string | null;
  typingLabel: string | null;
  isCurrentSession: boolean;
};

type ActiveSessionsPayload = {
  checkedAt: string;
  activeCount: number;
  typingCount: number;
  sessions: ActiveSession[];
};

type AccountFormState = {
  username: string;
  password: string;
};

const defaultFormState: AccountFormState = {
  username: "",
  password: "",
};

export default function AdminAccounts() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRefreshDialog, setShowRefreshDialog] = useState(false);
  const [createForm, setCreateForm] = useState<AccountFormState>(defaultFormState);

  const [editingAccount, setEditingAccount] = useState<AdminAccount | null>(null);
  const [editForm, setEditForm] = useState<AccountFormState>(defaultFormState);

  useEffect(() => {
    void checkAuth();
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    setAuthError(null);

    try {
      const authResult = await checkAuthSession();

      if (authResult.status === "error") {
        setAuthenticated(false);
        setAuthError(authResult.message);
        return;
      }

      if (authResult.status === "unauthenticated") {
        queryClient.clear();
        clearSessionQueryPersistence();
        setAuthenticated(false);
        setLocation("/login");
        return;
      }

      if (authResult.user.role === "admin") {
        setAuthenticated(true);
        return;
      }

      if (authResult.user.role === "chapter") {
        setLocation("/chapter-dashboard");
        return;
      }

      if (authResult.user.role === "barangay") {
        setLocation("/barangay-dashboard");
        return;
      }

      queryClient.clear();
      clearSessionQueryPersistence();
      setAuthenticated(false);
      setLocation("/login");
    } catch (error) {
      console.error("[AdminAccounts] Auth check error:", error);
      setAuthenticated(false);
      setAuthError("Unable to verify your session right now. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const {
    data: adminAccounts = [],
    isLoading: accountsLoading,
    isFetched: accountsFetched,
    isError: accountsError,
    error: accountsErrorDetails,
  } = useQuery<AdminAccount[]>({
    queryKey: ["/api/admin-users"],
    enabled: authenticated,
  });

  const {
    data: activeSessionsPayload,
    isLoading: activeSessionsLoading,
    isError: activeSessionsError,
    error: activeSessionsErrorDetails,
  } = useQuery<ActiveSessionsPayload>({
    queryKey: ["/api/admin/active-sessions"],
    enabled: authenticated,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const createAdminMutation = useMutation({
    mutationFn: async (payload: AccountFormState) => {
      return await apiRequest("POST", "/api/admin-users", payload);
    },
    onSuccess: () => {
      toast({ title: "Admin account created" });
      setShowCreateDialog(false);
      setCreateForm(defaultFormState);
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateAdminMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<AccountFormState> }) => {
      return await apiRequest("PUT", `/api/admin-users/${id}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Admin account updated" });
      setEditingAccount(null);
      setEditForm(defaultFormState);
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin-users/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Admin account deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const forceRefreshMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/force-refresh");
    },
    onSuccess: () => {
      toast({
        title: "Refresh queued",
        description: "Active devices will clear cache and reload on their next status check.",
      });
      setShowRefreshDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh failed",
        description: error.message || "Unable to queue the universal refresh right now.",
        variant: "destructive",
      });
    },
  });

  const forceLogoutMutation = useMutation({
    mutationFn: async (presenceId: string) => {
      return await apiRequest("POST", `/api/admin/active-sessions/${presenceId}/force-logout`);
    },
    onSuccess: () => {
      toast({
        title: "Session ended",
        description: "The selected device has been logged out and further operations are blocked.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/active-sessions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message || "Unable to end that session right now.",
        variant: "destructive",
      });
    },
  });

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
      setLocation("/");
    } catch {
      toast({ title: "Error", description: "Failed to logout", variant: "destructive" });
    }
  };

  const filteredAccounts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return adminAccounts;
    }

    return adminAccounts.filter((admin) => {
      const creatorText = admin.createdByUsername ? admin.createdByUsername.toLowerCase() : "";
      return (
        admin.username.toLowerCase().includes(keyword) ||
        creatorText.includes(keyword)
      );
    });
  }, [adminAccounts, searchTerm]);

  const activeSessions = activeSessionsPayload?.sessions || [];
  const activeUsersCount = activeSessionsPayload?.activeCount || 0;
  const typingUsersCount = activeSessionsPayload?.typingCount || 0;
  const activeNonAdminCount = activeSessions.filter((session) => session.role !== "admin").length;

  const formatRelativeSeen = (value: string) => {
    const diffSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (diffSeconds < 10) {
      return "just now";
    }
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    }
    return `${Math.round(diffSeconds / 60)}m ago`;
  };

  const onCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAdminMutation.mutate({
      username: createForm.username.trim(),
      password: createForm.password,
    });
  };

  const onEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingAccount) {
      return;
    }

    const payload: Partial<AccountFormState> = {};
    const username = editForm.username.trim();
    const password = editForm.password;

    if (username && username !== editingAccount.username) {
      payload.username = username;
    }

    if (password) {
      payload.password = password;
    }

    if (!payload.username && !payload.password) {
      toast({ title: "No changes detected" });
      return;
    }

    updateAdminMutation.mutate({
      id: editingAccount.id,
      payload,
    });
  };

  const onDeleteAdmin = async (admin: AdminAccount) => {
    if (!(await confirmDelete(`Delete admin account \"${admin.username}\"?`))) {
      return;
    }
    deleteAdminMutation.mutate(admin.id);
  };

  const openEditDialog = (admin: AdminAccount) => {
    setEditingAccount(admin);
    setEditForm({ username: admin.username, password: "" });
  };

  const isPageBootstrapLoading = loading || (authenticated && !accountsFetched && accountsLoading);

  if (isPageBootstrapLoading) {
    return <AuthLoadingScreen label="Loading admin accounts..." />;
  }

  if (authError && !authenticated) {
    return (
      <SessionRecoveryPanel
        message={authError}
        onRetry={() => {
          void checkAuth();
        }}
        onGoToLogin={() => setLocation("/login")}
      />
    );
  }

  if (!authenticated) {
    return <AuthLoadingScreen label="Redirecting to sign in..." />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/images/ysp-logo.png" alt="YSP Logo" className="h-10 w-auto" />
              <div>
                <h1 className="text-xl font-bold">Admin Control</h1>
                <p className="text-sm text-muted-foreground">Accounts, app refresh, and live user operations</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setLocation("/my-profile")}
                data-testid="button-my-profile"
              >
                <UserRound className="h-4 w-4 mr-2" />
                My Profile
              </Button>
              <Button
                variant="outline"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => setLocation("/admin")}
              data-testid="button-back-admin-mobile"
              className="sm:hidden"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setLocation("/admin")}
            className="w-full sm:w-auto"
            data-testid="button-back-admin"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin Dashboard
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Active Sessions</p>
                <p className="mt-1 text-2xl font-bold">{activeUsersCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Radio className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Currently Typing</p>
                <p className="mt-1 text-2xl font-bold">{typingUsersCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Keyboard className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Chapter/Barangay Online</p>
                <p className="mt-1 text-2xl font-bold">{activeNonAdminCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-3">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">App Refresh Control</CardTitle>
                  <CardDescription className="mt-1 max-w-3xl">
                    Use this only after publishing code changes or when users are stuck on stale cached data.
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowRefreshDialog(true)}
                data-testid="button-open-force-refresh"
                className="w-full border-amber-300 bg-background hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950 lg:w-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh App
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border border-amber-200 bg-background/70 p-3 text-sm text-muted-foreground dark:border-amber-900/60">
              Disclaimer: this does not edit accounts or database records. It tells active browsers to clear app caches, reload the latest code, and refetch updated data groups on their next status check. Devices with unsaved typed form input will wait until the form is saved or cleared before reloading.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Live Operations
                </CardTitle>
                <CardDescription>
                  See active logged-in devices and end a session when operations need to stop.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/active-sessions"] })}
                disabled={activeSessionsLoading}
                data-testid="button-refresh-active-sessions"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${activeSessionsLoading ? "animate-spin" : ""}`} />
                Update
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeSessionsLoading && activeSessions.length === 0 ? (
              <LoadingState label="Loading active sessions..." rows={3} compact />
            ) : activeSessionsError ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Live operations monitor is not available yet.</p>
                <p className="mt-1">
                  Restart the local server or deploy the latest backend so active-session tracking can start.
                </p>
                {activeSessionsErrorDetails instanceof Error ? (
                  <p className="mt-2 text-xs">Server response: {activeSessionsErrorDetails.message}</p>
                ) : null}
              </div>
            ) : activeSessions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No active logged-in devices reported recently.
              </div>
            ) : (
              <div className="space-y-3">
                {activeSessions.map((session) => (
                  <div
                    key={session.presenceId}
                    className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between"
                    data-testid={`active-session-row-${session.presenceId}`}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{session.displayName}</span>
                        <Badge variant="secondary">{session.role}</Badge>
                        {session.isCurrentSession ? <Badge variant="outline">Current Device</Badge> : null}
                        {session.isTyping ? (
                          <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                            Typing
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span>{session.accountLabel}</span>
                        <span>Username: {session.username}</span>
                        <span>Seen: {formatRelativeSeen(session.lastSeenAt)}</span>
                        <span>Page: {session.route}</span>
                      </div>
                      {session.isTyping ? (
                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          <Keyboard className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            Currently editing {session.typingLabel || "a form"}
                            {session.typingRoute ? ` on ${session.typingRoute}` : ""}. Typed content is not visible to admins.
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => forceLogoutMutation.mutate(session.presenceId)}
                      disabled={session.isCurrentSession || forceLogoutMutation.isPending}
                      data-testid={`button-force-logout-${session.presenceId}`}
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Force Logout
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Admin Accounts</CardTitle>
                <CardDescription>
                  Accounts created by another admin cannot modify or delete their creator account.
                </CardDescription>
              </div>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-admin-account">
                <Plus className="h-4 w-4 mr-2" />
                Create Admin Account
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by username or creator"
              data-testid="input-admin-search"
            />

            {accountsLoading ? (
              <LoadingState label="Loading admin users..." rows={3} compact />
            ) : accountsError ? (
              <p className="text-destructive py-4" data-testid="text-admin-accounts-load-error">
                Failed to load admin accounts: {accountsErrorDetails instanceof Error ? accountsErrorDetails.message : "Please try refreshing the page."}
              </p>
            ) : filteredAccounts.length === 0 ? (
              <p className="text-muted-foreground py-4">No admin accounts found.</p>
            ) : (
              <div className="space-y-3">
                {filteredAccounts.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between p-4 border rounded-lg gap-3"
                    data-testid={`admin-account-row-${admin.id}`}
                  >
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium break-all">{admin.username}</span>
                        {admin.isCurrent && <Badge variant="secondary">Current Account</Badge>}
                        {admin.isMotherAccount && (
                          <Badge variant="outline" className="border-amber-500 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                            Mother Account
                          </Badge>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground flex flex-wrap gap-3">
                        <span>
                          Created: {new Date(admin.createdAt).toLocaleDateString()}
                        </span>
                        <span>
                          Creator: {admin.createdByUsername || "System / Legacy"}
                        </span>
                      </div>

                      {admin.isMotherAccount && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>This account created yours. You cannot edit or delete it.</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(admin)}
                        disabled={!admin.canEdit || updateAdminMutation.isPending}
                        data-testid={`button-edit-admin-${admin.id}`}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onDeleteAdmin(admin)}
                        disabled={!admin.canDelete || deleteAdminMutation.isPending}
                        data-testid={`button-delete-admin-${admin.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Admin Account</DialogTitle>
            <DialogDescription>
              The new admin can manage other admins, except the account that created them.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-admin-username">Username</Label>
              <Input
                id="new-admin-username"
                value={createForm.username}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))}
                minLength={3}
                required
                data-testid="input-new-admin-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-admin-password">Password</Label>
              <Input
                id="new-admin-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                minLength={8}
                required
                data-testid="input-new-admin-password"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createAdminMutation.isPending} data-testid="button-submit-create-admin">
                {createAdminMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showRefreshDialog} onOpenChange={setShowRefreshDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle>Force App Refresh</DialogTitle>
            <DialogDescription>
              This queues a cache reset and reload for all active devices using the portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">What will happen</p>
              <p className="mt-1 text-muted-foreground">
                Open browsers will detect the refresh within about 45 seconds, clear local app cache, reload the page, and fetch fresh data.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-medium">Disclaimer</p>
              <p className="mt-1">
                Devices with unsaved typed form input will not reload immediately. The reload is postponed for that device until the form is saved or cleared. Offline or closed devices will update when they reconnect or open the app again.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRefreshDialog(false)}
              disabled={forceRefreshMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => forceRefreshMutation.mutate()}
              disabled={forceRefreshMutation.isPending}
              data-testid="button-confirm-force-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${forceRefreshMutation.isPending ? "animate-spin" : ""}`} />
              {forceRefreshMutation.isPending ? "Queuing..." : "Confirm Refresh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingAccount)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingAccount(null);
            setEditForm(defaultFormState);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Admin Account</DialogTitle>
            <DialogDescription>
              Update username and optionally set a new password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-admin-username">Username</Label>
              <Input
                id="edit-admin-username"
                value={editForm.username}
                onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))}
                minLength={3}
                required
                data-testid="input-edit-admin-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-admin-password">New Password (Optional)</Label>
              <Input
                id="edit-admin-password"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
                minLength={8}
                placeholder="Leave blank to keep current password"
                data-testid="input-edit-admin-password"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingAccount(null);
                  setEditForm(defaultFormState);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateAdminMutation.isPending} data-testid="button-submit-edit-admin">
                {updateAdminMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
