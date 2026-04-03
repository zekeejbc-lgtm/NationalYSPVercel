import { Link, useLocation } from "wouter";
import { Menu, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";

export default function Navigation() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { themeMode, resolvedTheme, cycleThemeMode } = useTheme();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/programs", label: "Programs" },
    { href: "/publications", label: "Publications" },
    { href: "/membership", label: "Membership & Chapters" },
    { href: "/volunteer", label: "Volunteer" },
    { href: "/contact", label: "Contact" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return location === href;
    return location.startsWith(href);
  };

  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "dark" ? Moon : Monitor;
  const themeIconKey = themeMode === "system" ? `system-${resolvedTheme}` : themeMode;
  const currentThemeLabel =
    themeMode === "system"
      ? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
      : themeMode === "dark"
        ? "Dark"
        : "Light";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" data-testid="link-home">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 hover-elevate px-2 py-1 rounded-md transition-all">
              <img 
                src="/images/ysp-logo.png" 
                alt="Youth Service Philippines Logo" 
                className="h-8 sm:h-10 w-auto"
              />
              <span className="font-bold text-sm sm:text-lg inline max-w-[180px] sm:max-w-none truncate">
                Youth Service Philippines
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <span
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    isActive(link.href)
                      ? "text-primary border-b-2 border-primary pb-1"
                      : "text-foreground"
                  }`}
                >
                  {link.label}
                </span>
              </Link>
            ))}
            <Link href="/login">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground border border-primary-border hover:bg-primary/90"
                data-testid="button-sign-in"
              >
                Sign In
              </Button>
            </Link>
            <Button
              variant="outline"
              size="icon"
              onClick={cycleThemeMode}
              data-testid="button-theme-cycle"
              aria-label={`Current theme ${currentThemeLabel}. Click to cycle theme.`}
              title="Cycle theme: Light -> Dark -> System"
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={themeIconKey}
                  initial={{ opacity: 0, scale: 0.6, rotate: -35, filter: "blur(2px)" }}
                  animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.6, rotate: 35, filter: "blur(2px)" }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="flex items-center justify-center"
                >
                  <ThemeIcon className="h-4 w-4" />
                </motion.span>
              </AnimatePresence>
            </Button>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <Button
              variant="outline"
              size="icon"
              onClick={cycleThemeMode}
              data-testid="mobile-button-theme-cycle"
              aria-label={`Current theme ${currentThemeLabel}. Click to cycle theme.`}
              title="Cycle theme: Light -> Dark -> System"
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={themeIconKey}
                  initial={{ opacity: 0, scale: 0.6, rotate: -35, filter: "blur(2px)" }}
                  animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.6, rotate: 35, filter: "blur(2px)" }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="flex items-center justify-center"
                >
                  <ThemeIcon className="h-4 w-4" />
                </motion.span>
              </AnimatePresence>
            </Button>

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px]">
                <nav className="flex flex-col gap-4 mt-8">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      data-testid={`mobile-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <span
                        className={`text-base font-medium block py-2 px-3 rounded-md hover-elevate transition-colors ${
                          isActive(link.href)
                            ? "bg-primary/10 text-primary"
                            : "text-foreground"
                        }`}
                      >
                        {link.label}
                      </span>
                    </Link>
                  ))}
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button
                      className="w-full bg-primary text-primary-foreground border border-primary-border hover:bg-primary/90"
                      data-testid="mobile-button-sign-in"
                    >
                      Sign In
                    </Button>
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
