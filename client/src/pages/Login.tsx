import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, Shield } from "lucide-react";

type LoginRole = "chapter" | "admin" | null;

interface AuthResponse {
  authenticated: boolean;
  user?: {
    id: string;
    username: string;
    role: "admin" | "chapter";
    chapterId?: string;
    mustChangePassword?: boolean;
  };
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [role, setRole] = useState<LoginRole>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<{ role: string; mustChangePassword?: boolean } | null>(null);
  const hasRedirected = useRef(false);

  const { data: authData, isLoading: authLoading, refetch } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/check"],
  });

  useEffect(() => {
    console.log("[Login] Auth state:", { authLoading, authenticated: authData?.authenticated, role: authData?.user?.role, pendingRedirect, hasRedirected: hasRedirected.current });
    
    if (hasRedirected.current) return;
    
    if (!authLoading && authData?.authenticated && authData.user) {
      const userRole = authData.user.role;
      console.log("[Login] Already authenticated, role:", userRole);
      hasRedirected.current = true;
      
      if (userRole === "admin") {
        console.log("[Login] Redirecting to /admin");
        setLocation("/admin");
      } else if (userRole === "chapter") {
        console.log("[Login] Redirecting to /chapter-dashboard");
        if (authData.user.mustChangePassword) {
          setLocation("/chapter-dashboard?changePassword=true");
        } else {
          setLocation("/chapter-dashboard");
        }
      } else {
        console.log("[Login] Unknown role:", userRole);
        hasRedirected.current = false;
        toast({
          title: "Error",
          description: "Role not found. Please contact admin.",
          variant: "destructive",
        });
      }
    }
  }, [authData, authLoading, setLocation, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log("[Login] Login started");

    try {
      const endpoint = role === "admin" ? "/api/auth/login/admin" : "/api/auth/login/chapter";
      console.log("[Login] Attempting login as:", role, "endpoint:", endpoint);
      
      const data = await apiRequest("POST", endpoint, { username, password });
      console.log("[Login] Login response:", data);
      
      if (!data?.success) {
        throw new Error("Login failed");
      }
      
      console.log("[Login] Session saved, role:", data.user?.role);
      
      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      
      console.log("[Login] Refetching auth state...");
      await queryClient.refetchQueries({ queryKey: ["/api/auth/check"] });
      console.log("[Login] Auth refetch complete");
      
      const targetPath = role === "admin" ? "/admin" : "/chapter-dashboard";
      console.log("[Login] Redirecting to:", targetPath);
      hasRedirected.current = true;
      
      if (role === "admin") {
        setLocation("/admin");
      } else {
        if (data?.user?.mustChangePassword) {
          setLocation("/chapter-dashboard?changePassword=true");
        } else {
          setLocation("/chapter-dashboard");
        }
      }
    } catch (error: any) {
      console.log("[Login] Login failed:", error.message);
      toast({
        title: "Error",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img 
              src="/images/ysp-logo.png" 
              alt="YSP Logo" 
              className="h-16 w-auto mx-auto mb-4"
            />
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              Select your account type to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              variant="outline" 
              className="w-full h-24 flex-col gap-2"
              onClick={() => setRole("chapter")}
              data-testid="button-login-chapter"
            >
              <Building2 className="h-8 w-8 text-primary" />
              <span className="font-medium">Sign in as Chapter</span>
              <span className="text-xs text-muted-foreground">For chapter representatives</span>
            </Button>
            <Button 
              variant="outline" 
              className="w-full h-24 flex-col gap-2"
              onClick={() => setRole("admin")}
              data-testid="button-login-admin"
            >
              <Shield className="h-8 w-8 text-primary" />
              <span className="font-medium">Sign in as Admin</span>
              <span className="text-xs text-muted-foreground">For website administrators</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img 
            src="/images/ysp-logo.png" 
            alt="YSP Logo" 
            className="h-16 w-auto mx-auto mb-4"
          />
          <CardTitle className="text-2xl">
            {role === "admin" ? "Admin Login" : "Chapter Login"}
          </CardTitle>
          <CardDescription>
            {role === "admin" 
              ? "Sign in to manage website content" 
              : "Sign in to submit project reports"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
              data-testid="button-login-submit"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              className="w-full"
              onClick={() => setRole(null)}
              data-testid="button-back"
            >
              Back to role selection
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
