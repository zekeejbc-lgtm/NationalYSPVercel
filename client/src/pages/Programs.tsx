import { useState } from "react";
import ProgramCard from "@/components/ProgramCard";
import ProgramDetailsDialog from "@/components/ProgramDetailsDialog";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import type { Program } from "@shared/schema";

const PROGRAMS_BATCH_SIZE = 6;

export default function Programs() {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [visibleCount, setVisibleCount] = useState(PROGRAMS_BATCH_SIZE);

  const {
    data: programs = [],
    isLoading: programsLoading,
    isFetched: programsFetched,
  } = useQuery<Program[]>({
    queryKey: ["/api/programs"] 
  });

  const isProgramsDataLoading = programsLoading || !programsFetched;

  const handleOpen = (program: Program) => {
    setSelectedProgram(program);
  };

  const visiblePrograms = programs.slice(0, visibleCount);
  const canShowMore = visibleCount < programs.length;
  const canHide = programs.length > PROGRAMS_BATCH_SIZE && visibleCount > PROGRAMS_BATCH_SIZE;

  const handleShowMore = () => {
    setVisibleCount((current) => Math.min(current + PROGRAMS_BATCH_SIZE, programs.length));
  };

  const handleHide = () => {
    setVisibleCount(PROGRAMS_BATCH_SIZE);
  };

  return (
    <div className="min-h-screen">
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Programs</h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Youth Service Philippines runs various programs designed to make a positive impact 
              on communities across the nation. Each program addresses specific needs and creates 
              opportunities for youth to serve and lead.
            </p>
          </div>
          
          {isProgramsDataLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" role="status" aria-label="Loading programs">
              {Array.from({ length: PROGRAMS_BATCH_SIZE }).map((_, index) => (
                <div key={`program-card-skeleton-${index}`} className="rounded-xl border bg-card p-4 space-y-3" aria-hidden="true">
                  <Skeleton className="h-40 w-full rounded-lg" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {visiblePrograms.map((program) => (
                <ProgramCard
                  key={program.id}
                  id={program.id}
                  title={program.title}
                  description={program.description}
                  image={program.image}
                  onClick={() => handleOpen(program)}
                />
              ))}
            </div>
          )}

          {!isProgramsDataLoading && (canShowMore || canHide) && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={canShowMore ? handleShowMore : handleHide}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:underline"
                data-testid="button-programs-toggle"
              >
                {canShowMore ? "Show more" : "Hide"}
              </button>
            </div>
          )}
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
