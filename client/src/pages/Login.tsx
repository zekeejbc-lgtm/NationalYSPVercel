import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { clearSessionQueryPersistence, queryClient } from "@/lib/queryClient";
import { Eye, EyeOff } from "lucide-react";
import AuthLoadingScreen from "@/components/ui/auth-loading-screen";

interface AuthResponse {
  authenticated: boolean;
  user?: {
    id: string;
    username: string;
    role: "admin" | "chapter" | "barangay";
    chapterId?: string;
    barangayId?: string;
    barangayName?: string;
    mustChangePassword?: boolean;
  };
}

type ParsedResponsePayload<T = unknown> = {
  data: T | null;
  text: string;
};

const LAST_ROUTE_STORAGE_KEY = "ysp:last-route:v1";

function readLastRoute() {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return null;
  }

  const route = window.sessionStorage.getItem(LAST_ROUTE_STORAGE_KEY);
  return route && route.trim().length > 0 ? route : null;
}

function isAllowedRouteForRole(route: string, role: "admin" | "chapter" | "barangay") {
  const pathname = route.split("?")[0].split("#")[0] || "/";

  if (pathname === "/my-profile") {
    return true;
  }

  if (role === "admin") {
    return pathname === "/admin";
  }

  if (role === "chapter") {
    return pathname === "/chapter-dashboard";
  }

  return pathname === "/barangay-dashboard";
}

function resolveTargetRoute(
  role: "admin" | "chapter" | "barangay",
  mustChangePassword?: boolean,
) {
  const fallback =
    role === "admin"
      ? "/admin"
      : role === "chapter"
        ? mustChangePassword
          ? "/chapter-dashboard?changePassword=true"
          : "/chapter-dashboard"
        : mustChangePassword
          ? "/barangay-dashboard?changePassword=true"
          : "/barangay-dashboard";

  const lastRoute = readLastRoute();
  if (!lastRoute || !isAllowedRouteForRole(lastRoute, role)) {
    return fallback;
  }

  if (mustChangePassword && role === "chapter") {
    return "/chapter-dashboard?changePassword=true";
  }

  if (mustChangePassword && role === "barangay") {
    return "/barangay-dashboard?changePassword=true";
  }

  return lastRoute;
}

async function readResponsePayload<T = unknown>(response: Response): Promise<ParsedResponsePayload<T>> {
  const text = await response.text();
  if (!text) {
    return { data: null, text: "" };
  }

  try {
    return { data: JSON.parse(text) as T, text };
  } catch {
    return { data: null, text };
  }
}

export default function Login() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [debugInfo, setDebugInfo] = useState<{ hasSession: boolean; role: string; path: string } | null>(null);
  const hasRedirected = useRef(false);
  
  const showDebug = typeof window !== "undefined" && window.location.search.includes("debugAuth=1");

  useEffect(() => {
    hasRedirected.current = false;
    
    const checkExistingAuth = async () => {
      console.log("[Login] Checking existing auth...");
      try {
        const response = await fetch("/api/auth/check", { credentials: "include" });
        const payload = await readResponsePayload<AuthResponse>(response);
        const data = payload.data;

        if (!response.ok) {
          const fallbackMessage =
            payload.text.trim() || `Auth check failed (${response.status})`;
          throw new Error(fallbackMessage);
        }

        if (!data) {
          throw new Error("Auth check returned invalid response format");
        }

        console.log("[Login] Auth check result:", data);
        
        if (showDebug) {
          setDebugInfo({
            hasSession: data.authenticated,
            role: data.user?.role || "none",
            path: window.location.pathname,
          });
        }
        
        if (data.authenticated && data.user) {
          const userRole = data.user.role;
          console.log("[Login] Already authenticated, role:", userRole);
          if (userRole === "admin" || userRole === "chapter" || userRole === "barangay") {
            const targetRoute = resolveTargetRoute(userRole, data.user.mustChangePassword);
            console.log("[Login] Redirecting to:", targetRoute);
            hasRedirected.current = true;
            setLocation(targetRoute);
            return;
          } else {
            console.log("[Login] Unknown role:", userRole);
            toast({
              title: "Error",
              description: "Role not found. Please contact admin.",
              variant: "destructive",
            });
          }
        } else {
          console.log("[Login] Not authenticated, showing login form");
          queryClient.clear();
          clearSessionQueryPersistence();
        }
      } catch (error) {
        console.log("[Login] Auth check error:", error);
      } finally {
        setCheckingAuth(false);
      }
    };
    
    checkExistingAuth();
  }, [setLocation, toast, showDebug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log("[Login] LOGIN_STARTED");

    try {
      const endpoint = "/api/auth/login";
      console.log("[Login] Attempting unified login");
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const payload = await readResponsePayload<{ success?: boolean; user?: AuthResponse["user"]; error?: string; message?: string }>(response);
      const data = payload.data;
      
      if (!response.ok) {
        const errorMessage =
          data?.error ||
          data?.message ||
          payload.text.trim() ||
          "Invalid credentials";
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error("Login returned invalid response format");
      }

      console.log("[Login] LOGIN_SUCCESS, payload keys:", Object.keys(data));
      console.log("[Login] Login response:", data);
      
      if (!data?.success) {
        throw new Error("Login failed");
      }
      
      console.log("[Login] TOKEN_SAVED: true");
      console.log("[Login] ROLE_RESOLVED:", data.user?.role?.toUpperCase() || "UNKNOWN");

      const userRole = data?.user?.role;
      if (!userRole) {
        throw new Error("Role not found. Please contact admin.");
      }

      const targetPath = resolveTargetRoute(userRole, data.user?.mustChangePassword);
      console.log("[Login] REDIRECT_TO:", targetPath);
      
      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
      
      hasRedirected.current = true;
      setLocation(targetPath);
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

  const handleBack = () => {
    setLocation("/");
  };

  const DebugBanner = () => {
    if (!showDebug || !debugInfo) return null;
    return (
      <div className="fixed top-0 right-0 z-50 rounded-bl bg-yellow-100 p-2 font-mono text-xs text-yellow-800 dark:bg-yellow-900/80 dark:text-yellow-200">
        <div>hasSession: {String(debugInfo.hasSession)}</div>
        <div>role: {debugInfo.role}</div>
        <div>path: {debugInfo.path}</div>
      </div>
    );
  };

  if (checkingAuth) {
    return (
      <>
        <DebugBanner />
        <AuthLoadingScreen label="Checking your session..." />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <DebugBanner />
        <AuthLoadingScreen label="Preparing your dashboard..." />
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <DebugBanner />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img 
            src="/images/ysp-logo.png" 
            alt="YSP Logo" 
            className="h-16 w-auto mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>
            Use your username and password to continue
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
              data-testid="button-login-submit"
            >
              Sign In
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBack}
              disabled={loading}
              data-testid="button-login-back"
            >
              Back
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
