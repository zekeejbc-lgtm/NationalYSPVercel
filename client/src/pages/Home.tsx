import { useState } from "react";
import HeroSection from "@/components/HeroSection";
import StatsSection from "@/components/StatsSection";
import ProgramCard from "@/components/ProgramCard";
import ChapterCard from "@/components/ChapterCard";
import ProgramDetailsDialog from "@/components/ProgramDetailsDialog";
import { useQuery } from "@tanstack/react-query";
import type { Program, Chapter, Stats } from "@shared/schema";
import { Link } from "wouter";

export default function Home() {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

  const { data: stats } = useQuery<Stats>({ 
    queryKey: ["/api/stats"] 
  });

  const { data: programs = [] } = useQuery<Program[]>({ 
    queryKey: ["/api/programs"] 
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({ 
    queryKey: ["/api/chapters"] 
  });

  return (
    <div className="min-h-screen flex flex-col">
      <HeroSection />
      
      <StatsSection 
        projects={stats?.projects || 150} 
        chapters={stats?.chapters || 25} 
        members={stats?.members || 5000} 
      />

      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Programs</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover the various ways we serve communities across the Philippines
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {programs.slice(0, 4).map((program) => (
              <ProgramCard
                key={program.id}
                id={program.id}
                title={program.title}
                description={program.description}
                image={program.image}
                onClick={() => setSelectedProgram(program)}
              />
            ))}
          </div>

          {programs.length > 4 && (
            <div className="mt-6 flex justify-center">
              <Link
                href="/programs"
                data-testid="link-home-programs-show-more"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:underline"
              >
                Show more
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Chapters</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Find a YSP chapter near you and join our community of young leaders
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {chapters.slice(0, 4).map((chapter) => (
              <ChapterCard key={chapter.id} {...chapter} />
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            <Link
              href="/membership"
              data-testid="link-home-chapters-show-more"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:underline"
            >
              Show more
            </Link>
          </div>
        </div>
      </section>

      <ProgramDetailsDialog
        program={selectedProgram}
        open={!!selectedProgram}
        onOpenChange={(open) => {
          if (!open) setSelectedProgram(null);
        }}
      />
    </div>
  );
}
