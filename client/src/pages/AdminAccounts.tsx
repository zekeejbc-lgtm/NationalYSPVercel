import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LoadingState from "@/components/ui/loading-state";
import AuthLoadingScreen from "@/components/ui/auth-loading-screen";
import { useToast } from "@/hooks/use-toast";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Edit, LogOut, Plus, ShieldAlert, Trash2, UserRound } from "lucide-react";

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
  const [searchTerm, setSearchTerm] = useState("");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<AccountFormState>(defaultFormState);

  const [editingAccount, setEditingAccount] = useState<AdminAccount | null>(null);
  const [editForm, setEditForm] = useState<AccountFormState>(defaultFormState);

  useEffect(() => {
    void checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/check", { credentials: "include" });
      const data = await response.json();

      if (data.authenticated && data.user?.role === "admin") {
        setAuthenticated(true);
        return;
      }

      if (data.authenticated && data.user?.role === "chapter") {
        setLocation("/chapter-dashboard");
        return;
      }

      if (data.authenticated && data.user?.role === "barangay") {
        setLocation("/barangay-dashboard");
        return;
      }

      setLocation("/login");
    } catch {
      setLocation("/login");
    } finally {
      setLoading(false);
    }
  };

  const {
    data: adminAccounts = [],
    isLoading: accountsLoading,
    isError: accountsError,
    error: accountsErrorDetails,
  } = useQuery<AdminAccount[]>({
    queryKey: ["/api/admin-users"],
    enabled: authenticated,
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

  if (loading) {
    return <AuthLoadingScreen label="Loading admin accounts..." />;
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/images/ysp-logo.png" alt="YSP Logo" className="h-10 w-auto" />
              <div>
                <h1 className="text-xl font-bold">Admin Account Management</h1>
                <p className="text-sm text-muted-foreground">Create, update, and remove admin users</p>
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
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-admin-account">
            <Plus className="h-4 w-4 mr-2" />
            Create Admin Account
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Admin Users</CardTitle>
            <CardDescription>
              Accounts created by another admin cannot modify or delete their creator account.
            </CardDescription>
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
                          <Badge variant="outline" className="border-amber-500 text-amber-700">
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
                        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
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
