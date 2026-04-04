import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, Facebook } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { ContactInfo } from "@shared/schema";

export default function Contact() {
  const {
    data: contactInfo,
    isLoading: contactInfoLoading,
    isFetched: contactInfoFetched,
  } = useQuery<ContactInfo>({
    queryKey: ["/api/contact-info"] 
  });

  const isContactDataLoading = contactInfoLoading || !contactInfoFetched;

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

          {isContactDataLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" role="status" aria-label="Loading contact information">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={`contact-card-skeleton-${index}`} className="text-center" aria-hidden="true">
                  <CardHeader>
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                    <Skeleton className="mx-auto h-6 w-28" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="mx-auto h-6 w-44" />
                    <Skeleton className="mx-auto h-4 w-36" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
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
                  href={`mailto:${contactInfo?.email || 'phyouthservice@gmail.com'}`}
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-email"
                >
                  {contactInfo?.email || 'phyouthservice@gmail.com'}
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
                  href={`tel:${contactInfo?.phone || '09177798413'}`}
                  className="text-primary hover:underline font-medium text-lg"
                  data-testid="link-phone"
                >
                  {contactInfo?.phone || '09177798413'}
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
                  href={contactInfo?.facebook || "https://www.facebook.com/YOUTHSERVICEPHILIPPINES"}
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
          )}

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
                <Link href="/membership" data-testid="link-become-member" className="text-primary hover:underline font-medium">
                  Become a Member →
                </Link>
                <Link href="/volunteer" data-testid="link-volunteer" className="text-primary hover:underline font-medium">
                  View Volunteer Opportunities →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
