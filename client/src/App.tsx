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
import AdminLogin from "@/pages/AdminLogin";
import Login from "@/pages/Login";
import ChapterDashboard from "@/pages/ChapterDashboard";
import NotFound from "@/pages/not-found";

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
      <Route path="/chapter-dashboard" component={ChapterDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const hideNavFooter = location.startsWith("/chapter-dashboard") || location === "/login";
  
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
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
