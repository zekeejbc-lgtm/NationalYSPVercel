import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, Facebook } from "lucide-react";

export default function Contact() {
  return (
    <div className="min-h-screen">
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Have questions or want to get involved? We'd love to hear from you. 
              Reach out to us through any of the following channels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover-elevate transition-all text-center">
              <CardHeader>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Email Us</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href="mailto:phyouthservice@gmail.com"
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-email"
                >
                  phyouthservice@gmail.com
                </a>
                <p className="text-sm text-muted-foreground mt-2">
                  Send us an email anytime
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all text-center">
              <CardHeader>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Call Us</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href="tel:09177798413"
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-phone"
                >
                  09177798413
                </a>
                <p className="text-sm text-muted-foreground mt-2">
                  Mon-Fri, 9:00 AM - 5:00 PM
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all text-center">
              <CardHeader>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Facebook className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Follow Us</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href="https://www.facebook.com/YOUTHSERVICEPHILIPPINES"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-facebook"
                >
                  @YOUTHSERVICEPHILIPPINES
                </a>
                <p className="text-sm text-muted-foreground mt-2">
                  Stay updated with our activities
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-12 hover-elevate transition-all">
            <CardHeader>
              <CardTitle className="text-center text-2xl">Get Involved</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-6">
                Whether you want to volunteer, start a chapter, or partner with us, 
                we're excited to work with you. Contact us today and let's make a difference together!
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a 
                  href="/membership"
                  className="text-primary hover:underline font-medium"
                  data-testid="link-become-member"
                >
                  Become a Member →
                </a>
                <a 
                  href="/volunteer"
                  className="text-primary hover:underline font-medium"
                  data-testid="link-volunteer"
                >
                  View Volunteer Opportunities →
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
