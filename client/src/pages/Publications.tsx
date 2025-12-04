import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Facebook, ExternalLink, Image } from "lucide-react";
import { format } from "date-fns";
import type { Publication } from "@shared/schema";

export default function Publications() {
  const { data: publications = [], isLoading, isError } = useQuery<Publication[]>({
    queryKey: ["/api/publications"]
  });

  return (
    <div className="min-h-screen flex flex-col">
      <section className="relative py-16 md:py-24 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Programs Publication
            </h1>
            <p className="text-lg text-muted-foreground">
              Stay updated with our latest activities, events, and stories from Youth Service Philippines
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-20 flex-1">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-48 mx-auto" />
                <div className="h-4 bg-muted rounded w-32 mx-auto" />
              </div>
            </div>
          ) : isError ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Failed to load publications. Please try again later.</p>
            </div>
          ) : publications.length === 0 ? (
            <div className="text-center py-16">
              <Image className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Publications Yet</h3>
              <p className="text-muted-foreground">
                Check back soon for updates and stories from our programs!
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {publications.map((publication, index) => (
                <Card 
                  key={publication.id} 
                  className="overflow-hidden hover-elevate transition-all"
                  data-testid={`card-publication-${publication.id}`}
                >
                  {publication.imageUrl && (
                    <div className="relative w-full aspect-video">
                      <img
                        src={publication.imageUrl}
                        alt={publication.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(publication.publishedAt), "MMMM d, yyyy 'at' h:mm a")}
                      </span>
                      {index === 0 && (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
                          Latest
                        </span>
                      )}
                    </div>
                    
                    <h2 className="text-2xl md:text-3xl font-bold mb-4">
                      {publication.title}
                    </h2>
                    
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none mb-6">
                      {publication.content.split('\n').map((paragraph, i) => (
                        <p key={i} className="text-muted-foreground leading-relaxed">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    
                    {publication.facebookLink && (
                      <div className="pt-4 border-t">
                        <Button
                          variant="outline"
                          asChild
                          className="gap-2"
                        >
                          <a
                            href={publication.facebookLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`link-facebook-${publication.id}`}
                          >
                            <Facebook className="h-4 w-4" />
                            View on Facebook
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
