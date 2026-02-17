import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Key, Lock, Unlock, Search, Building2, MapPin, Copy, Check } from "lucide-react";

interface AccountInfo {
  id: string;
  accountName: string;
  accountType: "Chapter" | "Barangay";
  username: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
}

export default function AccountManagementPanel() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "Chapter" | "Barangay">("all");
  const [tempPasswordDialog, setTempPasswordDialog] = useState<{ open: boolean; password: string; accountName: string }>({
    open: false,
    password: "",
    accountName: "",
  });
  const [copied, setCopied] = useState(false);

  const { data: accounts = [], isLoading } = useQuery<AccountInfo[]>({
    queryKey: ["/api/all-accounts"],
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ accountType, id }: { accountType: string; id: string }) => {
      return await apiRequest("POST", `/api/reset-password/${accountType.toLowerCase()}/${id}`);
    },
    onSuccess: (data, variables) => {
      const account = accounts.find(a => a.id === variables.id);
      setTempPasswordDialog({
        open: true,
        password: data.temporaryPassword,
        accountName: account?.accountName || "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/all-accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async ({ accountType, id }: { accountType: string; id: string }) => {
      await apiRequest("POST", `/api/unlock-account/${accountType.toLowerCase()}/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Account unlocked successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/all-accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ accountType, id, isActive }: { accountType: string; id: string; isActive: boolean }) => {
      const endpoint = accountType === "Chapter" ? `/api/chapter-users/${id}` : `/api/barangay-users/${id}`;
      await apiRequest("PUT", endpoint, { isActive });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Account status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/all-accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCopyPassword = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Info", description: "Please copy the password manually" });
    }
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = searchTerm === "" ||
      account.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || account.accountType === filterType;
    return matchesSearch && matchesType;
  });

  const isLocked = (account: AccountInfo) => {
    return account.lockedUntil && new Date(account.lockedUntil) > new Date();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-account-management-title">Account Management</CardTitle>
        <CardDescription>
          View and manage all Chapter and Barangay login accounts. Reset passwords securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-account-search"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterType === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("all")}
              data-testid="button-filter-all"
            >
              All ({accounts.length})
            </Button>
            <Button
              variant={filterType === "Chapter" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("Chapter")}
              data-testid="button-filter-chapter"
            >
              <Building2 className="h-4 w-4 mr-1" />
              Chapter
            </Button>
            <Button
              variant={filterType === "Barangay" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("Barangay")}
              data-testid="button-filter-barangay"
            >
              <MapPin className="h-4 w-4 mr-1" />
              Barangay
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground py-4">Loading accounts...</p>
        ) : filteredAccounts.length === 0 ? (
          <p className="text-muted-foreground py-4">No accounts found.</p>
        ) : (
          <div className="space-y-3">
            {filteredAccounts.map((account) => (
              <div
                key={`${account.accountType}-${account.id}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-md gap-3"
                data-testid={`account-row-${account.id}`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate" data-testid={`text-account-name-${account.id}`}>
                      {account.accountName}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {account.accountType === "Chapter" ? (
                        <Building2 className="h-3 w-3 mr-1" />
                      ) : (
                        <MapPin className="h-3 w-3 mr-1" />
                      )}
                      {account.accountType}
                    </Badge>
                    <Badge variant={account.isActive ? "default" : "secondary"}>
                      {account.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {account.mustChangePassword && (
                      <Badge variant="outline" className="text-xs">Must Change Password</Badge>
                    )}
                    {isLocked(account) && (
                      <Badge variant="destructive" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Locked
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
                    <span>Username: <span className="font-mono">{account.username}</span></span>
                    {account.passwordChangedAt && (
                      <span>Password changed: {new Date(account.passwordChangedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${account.accountType}-${account.id}`} className="text-sm">
                      Active
                    </Label>
                    <Switch
                      id={`active-${account.accountType}-${account.id}`}
                      checked={account.isActive}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({
                          accountType: account.accountType,
                          id: account.id,
                          isActive: checked,
                        })
                      }
                      data-testid={`switch-active-${account.id}`}
                    />
                  </div>
                  {isLocked(account) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        unlockMutation.mutate({
                          accountType: account.accountType,
                          id: account.id,
                        })
                      }
                      disabled={unlockMutation.isPending}
                      data-testid={`button-unlock-${account.id}`}
                    >
                      <Unlock className="h-4 w-4 mr-1" />
                      Unlock
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      resetPasswordMutation.mutate({
                        accountType: account.accountType,
                        id: account.id,
                      })
                    }
                    disabled={resetPasswordMutation.isPending}
                    data-testid={`button-reset-password-${account.id}`}
                  >
                    <Key className="h-4 w-4 mr-1" />
                    Reset Password
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={tempPasswordDialog.open} onOpenChange={(open) => {
          if (!open) {
            setTempPasswordDialog({ open: false, password: "", accountName: "" });
            setCopied(false);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Temporary Password Generated</DialogTitle>
              <DialogDescription>
                A new temporary password has been generated for <strong>{tempPasswordDialog.accountName}</strong>.
                The user will be required to change this password on their next login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-md">
                <Label className="text-sm text-muted-foreground mb-2 block">Temporary Password (shown once only)</Label>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 text-lg font-mono tracking-wider select-all"
                    data-testid="text-temp-password"
                  >
                    {tempPasswordDialog.password}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyPassword(tempPasswordDialog.password)}
                    data-testid="button-copy-password"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Please copy this password now and share it securely with the account holder.
                This password will not be shown again.
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setTempPasswordDialog({ open: false, password: "", accountName: "" });
                    setCopied(false);
                  }}
                  data-testid="button-close-temp-password"
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
