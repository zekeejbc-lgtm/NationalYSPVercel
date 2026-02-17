import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Trash2, MapPin, Key } from "lucide-react";
import type { Chapter, BarangayUser } from "@shared/schema";

export default function BarangayAccountsManager() {
  const { toast } = useToast();
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBarangayName, setNewBarangayName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: barangayUsers = [], isLoading: usersLoading } = useQuery<BarangayUser[]>({
    queryKey: ["/api/barangay-users", { chapterId: selectedChapterId }],
    queryFn: async () => {
      const res = await fetch(`/api/barangay-users?chapterId=${selectedChapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch barangay users");
      return res.json();
    },
    enabled: !!selectedChapterId,
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/barangay-users", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Barangay user created successfully" });
      setShowCreateDialog(false);
      setNewBarangayName("");
      setNewUsername("");
      setNewPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-users", { chapterId: selectedChapterId }] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/barangay-users/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-users", { chapterId: selectedChapterId }] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/barangay-users/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-users", { chapterId: selectedChapterId }] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapterId || !newBarangayName || !newUsername || !newPassword) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    createUserMutation.mutate({
      chapterId: selectedChapterId,
      barangayName: newBarangayName,
      username: newUsername,
      password: newPassword,
      isActive: true,
      mustChangePassword: true
    });
  };

  const handleToggleActive = (user: BarangayUser) => {
    updateUserMutation.mutate({
      id: user.id,
      data: { isActive: !user.isActive }
    });
  };

  const handleResetPassword = (user: BarangayUser) => {
    const tempPassword = Math.random().toString(36).slice(-8);
    updateUserMutation.mutate({
      id: user.id,
      data: { password: tempPassword, mustChangePassword: true }
    });
    toast({
      title: "Password Reset",
      description: `New temporary password: ${tempPassword}`,
    });
  };

  const selectedChapter = chapters.find(c => c.id === selectedChapterId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Barangay Chapter Accounts
        </CardTitle>
        <CardDescription>
          Create and manage barangay chapter login accounts. Each barangay belongs to a parent chapter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex-1 space-y-2">
            <Label>Select Parent Chapter</Label>
            <Select value={selectedChapterId} onValueChange={setSelectedChapterId}>
              <SelectTrigger data-testid="select-barangay-parent-chapter">
                <SelectValue placeholder="Choose a chapter..." />
              </SelectTrigger>
              <SelectContent>
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.name} - {chapter.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedChapterId && (
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-barangay-user">
              <Plus className="h-4 w-4 mr-2" />
              Create Barangay Account
            </Button>
          )}
        </div>

        {selectedChapterId && (
          <div className="space-y-4 mt-4">
            {usersLoading ? (
              <p className="text-muted-foreground">Loading barangay accounts...</p>
            ) : barangayUsers.length === 0 ? (
              <p className="text-muted-foreground">No barangay accounts for this chapter yet.</p>
            ) : (
              <div className="space-y-3">
                {barangayUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{user.barangayName}</span>
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {user.mustChangePassword && (
                          <Badge variant="outline" className="text-xs">
                            <Key className="h-3 w-3 mr-1" />
                            Must change password
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Username: {user.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${user.id}`} className="text-sm">Active</Label>
                        <Switch
                          id={`active-${user.id}`}
                          checked={user.isActive}
                          onCheckedChange={() => handleToggleActive(user)}
                          data-testid={`switch-barangay-user-active-${user.id}`}
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleResetPassword(user)}
                        data-testid={`button-reset-barangay-password-${user.id}`}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this barangay account?")) {
                            deleteUserMutation.mutate(user.id);
                          }
                        }}
                        disabled={deleteUserMutation.isPending}
                        data-testid={`button-delete-barangay-user-${user.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Barangay Account</DialogTitle>
              <DialogDescription>
                Create a new login account for a barangay chapter under {selectedChapter?.name}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="barangayName">Barangay Name *</Label>
                <Input
                  id="barangayName"
                  value={newBarangayName}
                  onChange={(e) => setNewBarangayName(e.target.value)}
                  placeholder="e.g., Barangay San Antonio"
                  data-testid="input-barangay-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g., brgy_sanantonio"
                  data-testid="input-barangay-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Initial Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Temporary password"
                  data-testid="input-barangay-password"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-barangay-user">
                  {createUserMutation.isPending ? "Creating..." : "Create Account"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
