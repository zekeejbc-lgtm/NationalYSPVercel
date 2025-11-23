import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Navigation() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/programs", label: "Programs" },
    { href: "/membership", label: "Membership & Chapters" },
    { href: "/volunteer", label: "Volunteer Opportunities" },
    { href: "/contact", label: "Contact" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return location === href;
    return location.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" data-testid="link-home">
            <div className="flex items-center gap-3 hover-elevate px-2 py-1 rounded-md transition-all">
              <img 
                src="/images/ysp-logo.png" 
                alt="Youth Service Philippines Logo" 
                className="h-10 w-auto"
              />
              <span className="font-bold text-lg hidden sm:inline">
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
            <Link href="/membership">
              <Button size="sm" data-testid="button-join-now">
                Join Now
              </Button>
            </Link>
          </nav>

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
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
                <Link href="/membership" onClick={() => setIsOpen(false)}>
                  <Button className="w-full" data-testid="mobile-button-join-now">
                    Join Now
                  </Button>
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
