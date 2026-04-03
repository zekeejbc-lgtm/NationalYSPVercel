import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import Programs from "@/pages/Programs";
import Publications from "@/pages/Publications";
import Membership from "@/pages/Membership";
import Volunteer from "@/pages/Volunteer";
import Contact from "@/pages/Contact";
import Admin from "@/pages/Admin";
import AdminAccounts from "@/pages/AdminAccounts";
import AdminLogin from "@/pages/AdminLogin";
import Login from "@/pages/Login";
import ChapterDashboard from "@/pages/ChapterDashboard";
import BarangayDashboard from "@/pages/BarangayDashboard";
import MyProfile from "@/pages/MyProfile";
import NotFound from "@/pages/not-found";
import { IMAGE_DEBUG_ENABLED } from "@/lib/driveUtils";
import { ConfirmDialogProvider } from "@/hooks/use-confirm-dialog";

type RouteSeo = {
  title: string;
  description: string;
  path: string;
  indexable: boolean;
  keywords: string[];
};

const SITE_NAME = "Youth Service Philippines National";
const SITE_BASE_URL = "https://youthserviceph.org";
const OG_IMAGE_URL = `${SITE_BASE_URL}/images/ysp-logo.png`;
const DEFAULT_DESCRIPTION =
  "Youth Service Philippines National empowers Filipino youth through programs, volunteer opportunities, and community-led development across the Philippines.";
const DEFAULT_KEYWORDS = [
  "youth service philippines",
  "youth service philippines national",
  "youth volunteer opportunities philippines",
  "community service philippines",
  "youth leadership programs philippines",
  "filipino youth empowerment",
  "youth civic engagement philippines",
  "join youth organization philippines",
  "start a youth chapter philippines",
  "youthserviceph.org",
];

const ROUTE_SEO: Record<string, RouteSeo> = {
  "/": {
    title: "Youth Service Philippines National | Empowering Filipino Youth Through Service",
    description:
      "Join Youth Service Philippines in programs and initiatives that create meaningful impact through youth leadership and volunteerism.",
    path: "/",
    indexable: true,
    keywords: [
      "youth service philippines",
      "youth service philippines national",
      "empowering filipino youth",
      "community service philippines",
      "youthserviceph.org",
    ],
  },
  "/programs": {
    title: "Programs | Youth Service Philippines National",
    description:
      "Explore YSP programs focused on leadership, civic engagement, and community development across the Philippines.",
    path: "/programs",
    indexable: true,
    keywords: [
      "youth leadership programs philippines",
      "community development programs philippines",
      "youth service philippines programs",
    ],
  },
  "/publications": {
    title: "Publications | Youth Service Philippines National",
    description:
      "Read YSP publications, updates, and reports documenting youth-driven initiatives and impact in communities.",
    path: "/publications",
    indexable: true,
    keywords: [
      "youth service philippines publications",
      "youth community reports philippines",
      "youthserviceph updates",
    ],
  },
  "/membership": {
    title: "Membership | Youth Service Philippines National",
    description:
      "Become a member of Youth Service Philippines and help drive positive change with fellow youth leaders.",
    path: "/membership",
    indexable: true,
    keywords: [
      "join youth service philippines",
      "youth membership philippines",
      "start a youth chapter philippines",
    ],
  },
  "/volunteer": {
    title: "Volunteer Opportunities | Youth Service Philippines National",
    description:
      "Find volunteer opportunities with Youth Service Philippines and participate in meaningful community service projects.",
    path: "/volunteer",
    indexable: true,
    keywords: [
      "youth volunteer opportunities philippines",
      "volunteer youth service philippines",
      "community volunteer philippines",
    ],
  },
  "/contact": {
    title: "Contact | Youth Service Philippines National",
    description:
      "Connect with Youth Service Philippines for partnerships, inquiries, and opportunities to support youth-centered initiatives.",
    path: "/contact",
    indexable: true,
    keywords: [
      "contact youth service philippines",
      "youthserviceph partnership",
      "youth organization philippines contact",
    ],
  },
  "/login": {
    title: "Member Login | Youth Service Philippines National",
    description: "Secure login portal for YSP chapter and barangay members.",
    path: "/login",
    indexable: false,
    keywords: ["youth service philippines login"],
  },
  "/admin/login": {
    title: "Admin Login | Youth Service Philippines National",
    description: "Secure admin access for Youth Service Philippines management.",
    path: "/admin/login",
    indexable: false,
    keywords: ["youth service philippines admin login"],
  },
  "/admin": {
    title: "Admin Dashboard | Youth Service Philippines National",
    description: "Administrative dashboard for managing YSP content and operations.",
    path: "/admin",
    indexable: false,
    keywords: ["youth service philippines admin dashboard"],
  },
  "/admin/accounts": {
    title: "Admin Accounts | Youth Service Philippines National",
    description: "Manage administrator accounts and permissions for Youth Service Philippines.",
    path: "/admin/accounts",
    indexable: false,
    keywords: ["youth service philippines admin accounts"],
  },
  "/chapter-dashboard": {
    title: "Chapter Dashboard | Youth Service Philippines National",
    description: "Chapter dashboard for managing local YSP chapter activities.",
    path: "/chapter-dashboard",
    indexable: false,
    keywords: ["youth service philippines chapter dashboard"],
  },
  "/barangay-dashboard": {
    title: "Barangay Dashboard | Youth Service Philippines National",
    description: "Barangay dashboard for coordinating local YSP initiatives.",
    path: "/barangay-dashboard",
    indexable: false,
    keywords: ["youth service philippines barangay dashboard"],
  },
  "/my-profile": {
    title: "My Profile | Youth Service Philippines National",
    description: "Manage your account profile and password.",
    path: "/my-profile",
    indexable: false,
    keywords: ["youth service philippines profile"],
  },
};

function toKeywordsContent(keywords: string[]) {
  return Array.from(new Set([...DEFAULT_KEYWORDS, ...keywords])).join(", ");
}

function getRouteSeo(pathname: string): RouteSeo {
  const exactMatch = ROUTE_SEO[pathname];
  if (exactMatch) {
    return exactMatch;
  }

  return {
    title: `Page Not Found | ${SITE_NAME}`,
    description: DEFAULT_DESCRIPTION,
    path: pathname || "/",
    indexable: false,
    keywords: DEFAULT_KEYWORDS,
  };
}

function setMetaTag(attributeName: "name" | "property", attributeValue: string, content: string) {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attributeName}='${attributeValue}']`);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function setCanonicalLink(href: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='canonical']");

  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }

  link.setAttribute("href", href);
}

const LAST_ROUTE_STORAGE_KEY = "ysp:last-route:v1";
const SCROLL_POSITIONS_STORAGE_KEY = "ysp:scroll-positions:v1";

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function shouldPersistRoute(route: string) {
  const pathname = route.split("?")[0].split("#")[0] || "/";
  return pathname !== "/login" && pathname !== "/admin/login";
}

function isProtectedRoute(route: string) {
  const pathname = route.split("?")[0].split("#")[0] || "/";
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/chapter-dashboard") ||
    pathname.startsWith("/barangay-dashboard") ||
    pathname.startsWith("/my-profile")
  );
}

function readScrollPositions() {
  if (!canUseSessionStorage()) {
    return {} as Record<string, number>;
  }

  try {
    const raw = window.sessionStorage.getItem(SCROLL_POSITIONS_STORAGE_KEY);
    if (!raw) {
      return {} as Record<string, number>;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter(([, value]) => typeof value === "number");
    return Object.fromEntries(entries) as Record<string, number>;
  } catch {
    return {} as Record<string, number>;
  }
}

function writeScrollPositions(positions: Record<string, number>) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(SCROLL_POSITIONS_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Ignore storage errors.
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/programs" component={Programs} />
      <Route path="/publications" component={Publications} />
      <Route path="/membership" component={Membership} />
      <Route path="/volunteer" component={Volunteer} />
      <Route path="/contact" component={Contact} />
      <Route path="/login" component={Login} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/accounts" component={AdminAccounts} />
      <Route path="/chapter-dashboard" component={ChapterDashboard} />
      <Route path="/barangay-dashboard" component={BarangayDashboard} />
      <Route path="/my-profile" component={MyProfile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location, setLocation] = useLocation();
  const hideNavFooter =
    location.startsWith("/admin") ||
    location.startsWith("/chapter-dashboard") ||
    location.startsWith("/barangay-dashboard") ||
    location.startsWith("/my-profile") ||
    location === "/login";

  useEffect(() => {
    const cleanPath = location.split("?")[0].split("#")[0] || "/";
    const seo = getRouteSeo(cleanPath);
    const canonicalUrl = new URL(seo.path, SITE_BASE_URL).toString();

    document.title = seo.title;
    setCanonicalLink(canonicalUrl);

    setMetaTag("name", "description", seo.description);
    setMetaTag("name", "keywords", toKeywordsContent(seo.keywords));
    setMetaTag("name", "robots", seo.indexable ? "index, follow" : "noindex, nofollow");

    setMetaTag("property", "og:type", "website");
    setMetaTag("property", "og:site_name", SITE_NAME);
    setMetaTag("property", "og:title", seo.title);
    setMetaTag("property", "og:description", seo.description);
    setMetaTag("property", "og:url", canonicalUrl);
    setMetaTag("property", "og:image", OG_IMAGE_URL);

    setMetaTag("name", "twitter:card", "summary_large_image");
    setMetaTag("name", "twitter:title", seo.title);
    setMetaTag("name", "twitter:description", seo.description);
    setMetaTag("name", "twitter:image", OG_IMAGE_URL);
  }, [location]);

  useEffect(() => {
    if (!canUseSessionStorage()) {
      return;
    }

    if (shouldPersistRoute(location)) {
      window.sessionStorage.setItem(LAST_ROUTE_STORAGE_KEY, location);
    }
  }, [location]);

  useEffect(() => {
    if (!canUseSessionStorage()) {
      return;
    }

    if (window.history.scrollRestoration) {
      window.history.scrollRestoration = "manual";
    }

    return () => {
      if (window.history.scrollRestoration) {
        window.history.scrollRestoration = "auto";
      }
    };
  }, []);

  useEffect(() => {
    if (!canUseSessionStorage() || !shouldPersistRoute(location)) {
      return;
    }

    const persistCurrentScroll = () => {
      const positions = readScrollPositions();
      positions[location] = window.scrollY;
      writeScrollPositions(positions);
    };

    const handleScroll = () => {
      persistCurrentScroll();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("beforeunload", persistCurrentScroll);

    return () => {
      persistCurrentScroll();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", persistCurrentScroll);
    };
  }, [location]);

  useEffect(() => {
    if (!canUseSessionStorage()) {
      return;
    }

    const pathname = location.split("?")[0].split("#")[0] || "/";
    if (pathname !== "/") {
      return;
    }

    const lastRoute = window.sessionStorage.getItem(LAST_ROUTE_STORAGE_KEY);
    if (!lastRoute || !shouldPersistRoute(lastRoute) || lastRoute === location) {
      return;
    }

    if (!isProtectedRoute(lastRoute)) {
      setLocation(lastRoute);
      return;
    }

    let cancelled = false;

    const restoreProtectedRoute = async () => {
      try {
        const response = await fetch("/api/auth/check", { credentials: "include" });
        const data = (await response.json()) as { authenticated?: boolean };
        if (!cancelled && data?.authenticated) {
          setLocation(lastRoute);
        }
      } catch {
        // Ignore auth check failures and stay on the current route.
      }
    };

    restoreProtectedRoute();

    return () => {
      cancelled = true;
    };
  }, [location, setLocation]);

  useEffect(() => {
    if (!canUseSessionStorage()) {
      return;
    }

    const positions = readScrollPositions();
    const y = positions[location];

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: typeof y === "number" ? y : 0, left: 0, behavior: "auto" });
    });
  }, [location]);

  useEffect(() => {
    if (!IMAGE_DEBUG_ENABLED) {
      return;
    }

    const handleImageLoad = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) {
        return;
      }

      console.log("[Image Debug] Loaded", {
        page: window.location.pathname,
        src: target.currentSrc || target.src,
        alt: target.alt,
        naturalWidth: target.naturalWidth,
        naturalHeight: target.naturalHeight,
      });
    };

    const handleImageError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) {
        return;
      }

      console.error("[Image Debug] Failed to load", {
        page: window.location.pathname,
        src: target.currentSrc || target.src,
        alt: target.alt,
        complete: target.complete,
        naturalWidth: target.naturalWidth,
        naturalHeight: target.naturalHeight,
      });
    };

    document.addEventListener("load", handleImageLoad, true);
    document.addEventListener("error", handleImageError, true);

    return () => {
      document.removeEventListener("load", handleImageLoad, true);
      document.removeEventListener("error", handleImageError, true);
    };
  }, []);
  
  return (
    <div className="flex flex-col min-h-screen">
      {!hideNavFooter && <Navigation />}
      <main className="flex-1">
        <Router />
      </main>
      {!hideNavFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmDialogProvider>
          <AppContent />
          <Toaster />
        </ConfirmDialogProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
