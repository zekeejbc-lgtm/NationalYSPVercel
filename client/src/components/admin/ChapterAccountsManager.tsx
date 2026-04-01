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
import { Plus, Trash2, UserPlus, Key } from "lucide-react";
import type { Chapter, ChapterUser } from "@shared/schema";

export default function ChapterAccountsManager() {
  const { toast } = useToast();
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: chapterUsers = [], isLoading: usersLoading } = useQuery<ChapterUser[]>({
    queryKey: ["/api/chapters", selectedChapterId, "users"],
    queryFn: async () => {
      const res = await fetch(`/api/chapters/${selectedChapterId}/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chapter users");
      return res.json();
    },
    enabled: !!selectedChapterId,
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/chapter-users", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Chapter user created successfully" });
      setShowCreateDialog(false);
      setNewUsername("");
      setNewPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/chapters", selectedChapterId, "users"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/chapter-users/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapters", selectedChapterId, "users"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/chapter-users/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapters", selectedChapterId, "users"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapterId || !newUsername || !newPassword) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    createUserMutation.mutate({
      chapterId: selectedChapterId,
      username: newUsername,
      password: newPassword,
      isActive: true,
      mustChangePassword: true
    });
  };

  const handleToggleActive = (user: ChapterUser) => {
    updateUserMutation.mutate({
      id: user.id,
      data: { isActive: !user.isActive }
    });
  };

  const handleResetPassword = (user: ChapterUser) => {
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

  const handleDeleteUser = (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    deleteUserMutation.mutate(id);
  };

  const selectedChapter = chapters.find(c => c.id === selectedChapterId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chapter Account Management</CardTitle>
        <CardDescription>
          Create and manage login credentials for chapter representatives
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <Label>Select Chapter</Label>
            <Select value={selectedChapterId} onValueChange={setSelectedChapterId}>
              <SelectTrigger data-testid="select-chapter">
                <SelectValue placeholder="Select a chapter..." />
              </SelectTrigger>
              <SelectContent>
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedChapterId && (
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-user">
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          )}
        </div>

        {selectedChapterId && (
          <div className="space-y-4">
            <h3 className="font-medium">
              Users for {selectedChapter?.name}
            </h3>
            {usersLoading ? (
              <div className="space-y-3" role="status" aria-label="Loading chapter users">
                <div className="h-5 w-40 rounded-md bg-muted skeleton-shimmer" />
                <div className="h-14 w-full rounded-lg bg-muted skeleton-shimmer" />
              </div>
            ) : chapterUsers.length === 0 ? (
              <p className="text-muted-foreground">No users created for this chapter yet.</p>
            ) : (
              <div className="space-y-3">
                {chapterUsers.map((user) => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`user-card-${user.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{user.username}</span>
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? "Active" : "Disabled"}
                        </Badge>
                        {user.mustChangePassword && (
                          <Badge variant="outline">Must Change Password</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Created: {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${user.id}`} className="text-sm">
                          Active
                        </Label>
                        <Switch
                          id={`active-${user.id}`}
                          checked={user.isActive}
                          onCheckedChange={() => handleToggleActive(user)}
                          data-testid={`switch-active-${user.id}`}
                        />
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleResetPassword(user)}
                        data-testid={`button-reset-password-${user.id}`}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                        data-testid={`button-delete-${user.id}`}
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
              <DialogTitle>Create Chapter User</DialogTitle>
              <DialogDescription>
                Create login credentials for {selectedChapter?.name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  data-testid="input-new-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Temporary Password</Label>
                <Input
                  id="password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter temporary password"
                  required
                  data-testid="input-new-password"
                />
                <p className="text-xs text-muted-foreground">
                  User will be required to change this password on first login
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-create-user">
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
