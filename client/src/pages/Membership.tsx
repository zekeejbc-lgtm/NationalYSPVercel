import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import ChapterCard from "@/components/ChapterCard";
import { ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Chapter } from "@shared/schema";

export default function Membership() {
  const { data: chapters = [] } = useQuery<Chapter[]>({ 
    queryKey: ["/api/chapters"] 
  });
  return (
    <div className="min-h-screen">
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Join Youth Service Philippines</h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Be part of a movement that empowers Filipino youth to create positive change 
              in their communities. Whether you want to become a member or start your own chapter, 
              we welcome you!
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
            <Card className="hover-elevate transition-all">
              <CardHeader>
                <CardTitle className="text-2xl">Become a Member</CardTitle>
                <CardDescription>
                  Join thousands of young Filipinos making a difference. Fill out the form below 
                  to start your journey with YSP.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 mb-4">
                  <iframe
                    src="https://docs.google.com/forms/d/e/1FAIpQLSdwMKgIjQNrlLH-j-Qdx0MrKxefxaLRC6gMI_oOgMTosDi_sQ/viewform?embedded=true"
                    width="100%"
                    height="800"
                    frameBorder="0"
                    marginHeight={0}
                    marginWidth={0}
                    className="rounded-lg"
                    title="Become a Member Form"
                    data-testid="iframe-membership-form"
                  >
                    Loading…
                  </iframe>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all">
              <CardHeader>
                <CardTitle className="text-2xl">Create a Chapter</CardTitle>
                <CardDescription>
                  Want to bring YSP to your community? Start your own chapter and lead youth 
                  service initiatives in your area.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                  <h3 className="font-semibold text-lg mb-3">Ready to Start a Chapter?</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Fill out our chapter application form. Our team will review your application 
                    and contact you within 5-7 business days.
                  </p>
                  <a
                    href="https://forms.gle/cWPsgBJKLaQoLuUr8"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                    data-testid="link-create-chapter-form"
                  >
                    Open Chapter Application Form
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm text-muted-foreground italic">
                    <strong>Note:</strong> You will be contacted if your chapter is approved. 
                    We look for passionate leaders committed to making a difference in their communities.
                  </p>
                </div>

                <div className="pt-4">
                  <h4 className="font-semibold mb-3">Chapter Requirements:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Minimum of 10 committed members</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Designated chapter president and officers</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Commitment to organize quarterly service activities</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>Active communication with YSP national office</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Existing Chapters</h2>
              <p className="text-muted-foreground">
                Connect with a YSP chapter near you
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {chapters.map((chapter) => (
                <ChapterCard key={chapter.id} {...chapter} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
