import { Link } from "wouter";
import { Facebook, Mail, Phone } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-muted/50 border-t mt-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <img 
              src="/images/ysp-logo.png" 
              alt="Youth Service Philippines Logo" 
              className="h-12 w-auto mb-4"
            />
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
                  href="mailto:phyouthservice@gmail.com" 
                  className="text-muted-foreground hover:text-primary transition-colors"
                  data-testid="footer-link-email"
                >
                  phyouthservice@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <a 
                  href="tel:09177798413" 
                  className="text-muted-foreground hover:text-primary transition-colors"
                  data-testid="footer-link-phone"
                >
                  09177798413
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Facebook className="h-4 w-4 text-primary" />
                <a 
                  href="https://www.facebook.com/YOUTHSERVICEPHILIPPINES" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  data-testid="footer-link-facebook"
                >
                  Follow us on Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {currentYear} Youth Service Philippines. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
