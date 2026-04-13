import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Facebook, Mail, Phone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ContactInfo } from "@shared/schema";
import { resolveMainFacebookUrl, sanitizeContactSocials } from "@/lib/contactSocials";

const DEFAULT_CONTACT_EMAIL = "phyouthservice@gmail.com";
const DEFAULT_CONTACT_PHONE = "09177798413";
const DEFAULT_CONTACT_FACEBOOK = "https://www.facebook.com/YOUTHSERVICEPHILIPPINES";

export default function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const { toast } = useToast();

  const { data: contactInfo } = useQuery<ContactInfo>({
    queryKey: ["/api/contact-info"],
  });

  const socials = sanitizeContactSocials(Array.isArray(contactInfo?.socials) ? contactInfo.socials : []);
  const mainFacebook =
    resolveMainFacebookUrl(contactInfo?.facebook || DEFAULT_CONTACT_FACEBOOK, socials) || DEFAULT_CONTACT_FACEBOOK;
  const contactEmail = contactInfo?.email || DEFAULT_CONTACT_EMAIL;
  const contactPhone = contactInfo?.phone || DEFAULT_CONTACT_PHONE;

  const subscribeMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest("POST", "/api/newsletter/subscribe", { email });
    },
    onSuccess: (result: { status?: string; message?: string }) => {
      const alreadySubscribed = result?.status === "already_subscribed";
      toast({
        title: alreadySubscribed ? "Already subscribed" : "Subscribed",
        description:
          result?.message ||
          (alreadySubscribed
            ? "This email is already subscribed to newsletter updates."
            : "You have been subscribed to newsletter updates."),
      });
      setNewsletterEmail("");
    },
    onError: (error: any) => {
      toast({
        title: "Subscription failed",
        description: error?.message || "Unable to subscribe to the newsletter.",
        variant: "destructive",
      });
    },
  });

  const handleNewsletterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalizedEmail = newsletterEmail.trim().toLowerCase();
    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !basicEmailRegex.test(normalizedEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    subscribeMutation.mutate(normalizedEmail);
  };

  return (
    <footer className="bg-muted/50 border-t mt-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <img 
                src="/images/ysp-logo.png" 
                alt="Youth Service Philippines Logo" 
                className="h-12 w-auto"
              />
              <h3 className="font-semibold leading-tight text-foreground">
                <span className="sm:hidden">Youth Service PH</span>
                <span className="hidden sm:inline">Youth Service Philippines</span>
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Empowering Filipino youth through community service and leadership development.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" data-testid="footer-link-home">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Home</span>
                </Link>
              </li>
              <li>
                <Link href="/programs" data-testid="footer-link-programs">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Programs</span>
                </Link>
              </li>
              <li>
                <Link href="/publications" data-testid="footer-link-publications">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Publications</span>
                </Link>
              </li>
              <li>
                <Link href="/membership" data-testid="footer-link-membership">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Membership</span>
                </Link>
              </li>
              <li>
                <Link href="/volunteer" data-testid="footer-link-volunteer">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Volunteer</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Get Involved</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/membership">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Become a Member</span>
                </Link>
              </li>
              <li>
                <Link href="/membership">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Start a Chapter</span>
                </Link>
              </li>
              <li>
                <Link href="/volunteer">
                  <span className="text-muted-foreground hover:text-primary transition-colors">Volunteer Opportunities</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Contact Us</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <a 
                  href={`mailto:${contactEmail}`}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  data-testid="footer-link-email"
                >
                  {contactEmail}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <a 
                  href={`tel:${contactPhone}`}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  data-testid="footer-link-phone"
                >
                  {contactPhone}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Facebook className="h-4 w-4 text-primary" />
                <a 
                  href={mainFacebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  data-testid="footer-link-facebook"
                >
                  Follow us on Facebook
                </a>
              </li>
              <li>
                <Link href="/contact" data-testid="footer-link-contact-show-more">
                  <span className="text-primary hover:underline font-medium">Show More</span>
                </Link>
              </li>
            </ul>

            <form className="mt-6" onSubmit={handleNewsletterSubmit}>
              <label htmlFor="footer-newsletter" className="mb-2 block text-sm font-medium text-foreground">
                Newsletter
              </label>
              <div className="flex gap-2">
                <input
                  id="footer-newsletter"
                  type="email"
                  placeholder="Enter your email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="footer-newsletter-email"
                  disabled={subscribeMutation.isPending}
                />
                <button
                  type="submit"
                  className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
                  data-testid="footer-newsletter-subscribe"
                  disabled={subscribeMutation.isPending}
                >
                  {subscribeMutation.isPending ? "Subscribing..." : "Subscribe"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 Youth Service Philippines. All rights reserved.</p>
          <p className="mt-1">
            Youth Service to the Filipino Youth, Inc. is the official owner and operator of youthserviceph.org. SEC Registration No. 2023010080782-00.
          </p>
        </div>
      </div>
    </footer>
  );
}
