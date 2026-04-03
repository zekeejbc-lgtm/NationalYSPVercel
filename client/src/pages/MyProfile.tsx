import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, KeyRound, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MyProfileProps {
  embedded?: boolean;
  hideEmbeddedHeading?: boolean;
}

type AuthRole = "admin" | "chapter" | "barangay";

interface ProfileResponse {
  id: string;
  username: string;
  role: AuthRole;
  chapterId?: string;
  chapterName?: string;
  barangayId?: string;
  barangayName?: string;
  mustChangePassword?: boolean;
}

interface AuthCheckResponse {
  authenticated: boolean;
  user?: ProfileResponse;
}

type ParsedResponsePayload<T = unknown> = {
  data: T | null;
  text: string;
};

async function readResponsePayload<T = unknown>(res: Response): Promise<ParsedResponsePayload<T>> {
  const text = await res.text();
  if (!text) {
    return { data: null, text: "" };
  }

  try {
    return { data: JSON.parse(text) as T, text };
  } catch {
    return { data: null, text };
  }
}

function isProfileResponse(value: unknown): value is ProfileResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProfileResponse>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.username === "string" &&
    (candidate.role === "admin" || candidate.role === "chapter" || candidate.role === "barangay")
  );
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("Unexpected token '<'") || message.includes("<!DOCTYPE")) {
    return "Profile endpoint is unavailable on the current server instance. Please restart the dev server and try again.";
  }
  return message || fallback;
}

function getDashboardPath(role: AuthRole) {
  if (role === "admin") return "/admin";
  if (role === "barangay") return "/barangay-dashboard";
  return "/chapter-dashboard";
}

export default function MyProfile({ embedded = false, hideEmbeddedHeading = false }: MyProfileProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);

  const [username, setUsername] = useState("");
  const [barangayName, setBarangayName] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const applyProfile = (data: ProfileResponse) => {
          setProfile(data);
          setUsername(data.username || "");
          setBarangayName(data.barangayName || "");
        };

        const response = await fetch("/api/auth/profile", { credentials: "include" });

        if (response.status === 401) {
          setLocation("/login");
          return;
        }

        const payload = await readResponsePayload<ProfileResponse | { error?: string; message?: string }>(response);

        if (response.ok && isProfileResponse(payload.data)) {
          applyProfile(payload.data);
          return;
        }

        // Fallback for older/stale server instances that do not yet expose /api/auth/profile.
        const authCheckResponse = await fetch("/api/auth/check", { credentials: "include" });
        const authPayload = await readResponsePayload<AuthCheckResponse>(authCheckResponse);

        if (!authCheckResponse.ok) {
          const message =
            (authPayload.data as { error?: string; message?: string } | null)?.error ||
            (authPayload.data as { error?: string; message?: string } | null)?.message ||
            authPayload.text.trim() ||
            "Failed to load profile";
          throw new Error(message);
        }

        if (!authPayload.data?.authenticated || !isProfileResponse(authPayload.data.user)) {
          setLocation("/login");
          return;
        }

        applyProfile(authPayload.data.user);
      } catch (error: any) {
        toast({
          title: "Error",
          description: normalizeErrorMessage(error, "Failed to load profile"),
          variant: "destructive",
        });
        setLocation("/login");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [setLocation, toast]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const payload: { username: string; barangayName?: string } = {
        username: username.trim(),
      };

      if (profile?.role === "barangay") {
        payload.barangayName = barangayName.trim();
      }

      return await apiRequest("PUT", "/api/auth/profile", payload);
    },
    onSuccess: (updated: ProfileResponse) => {
      setProfile(updated);
      setUsername(updated.username || "");
      setBarangayName(updated.barangayName || "");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      toast({ title: "Success", description: "Profile updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: normalizeErrorMessage(error, "Failed to update profile"),
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/change-password", {
        newPassword,
      });
    },
    onSuccess: () => {
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
      toast({ title: "Success", description: "Password updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const dashboardPath = useMemo(() => {
    if (!profile) {
      return "/login";
    }
    return getDashboardPath(profile.role);
  }, [profile]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (username.trim().length < 3) {
      toast({
        title: "Error",
        description: "Username must be at least 3 characters",
        variant: "destructive",
      });
      return;
    }

    if (profile?.role === "barangay" && !barangayName.trim()) {
      toast({
        title: "Error",
        description: "Barangay name is required",
        variant: "destructive",
      });
      return;
    }

    updateProfileMutation.mutate();
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate();
  };

  if (loading) {
    if (embedded) {
      return (
        <div className="w-full">
          <LoadingState label="Loading profile..." rows={3} compact />
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
        <div className="w-full max-w-2xl">
          <LoadingState label="Loading profile..." rows={3} compact />
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const profileContent = (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            Update your account details. Changes apply to your next session checks immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-role">Role</Label>
              <Input id="profile-role" value={profile.role} readOnly className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-username">Username</Label>
              <Input
                id="profile-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                required
                data-testid="input-profile-username"
              />
            </div>

            {profile.chapterName && (
              <div className="space-y-2">
                <Label htmlFor="profile-chapter">Chapter</Label>
                <Input id="profile-chapter" value={profile.chapterName} readOnly className="bg-muted" />
              </div>
            )}

            {profile.role === "barangay" && (
              <div className="space-y-2">
                <Label htmlFor="profile-barangay-name">Barangay Name</Label>
                <Input
                  id="profile-barangay-name"
                  value={barangayName}
                  onChange={(e) => setBarangayName(e.target.value)}
                  required
                  data-testid="input-profile-barangay-name"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Set a new password for your account. Use at least 8 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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

            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
              data-testid="button-change-password"
            >
              {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-6">
        {!hideEmbeddedHeading && (
          <div>
            <h2 className="text-lg font-semibold">My Profile</h2>
            <p className="text-sm text-muted-foreground">Manage your account information and password</p>
          </div>
        )}
        <div className="space-y-6" data-testid="panel-my-profile-modal">
          {profileContent}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <img src="/images/ysp-logo.png" alt="YSP Logo" className="h-10 w-auto" />
            <div>
              <h1 className="font-semibold">My Profile</h1>
              <p className="text-sm text-muted-foreground">Manage your account information and password</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation(dashboardPath)} data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-3xl">{profileContent}</main>
    </div>
  );
}