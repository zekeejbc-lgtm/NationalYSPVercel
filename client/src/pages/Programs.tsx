import { useState } from "react";
import ProgramCard from "@/components/ProgramCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import type { Program } from "@shared/schema";

export default function Programs() {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

  const { data: programs = [] } = useQuery<Program[]>({ 
    queryKey: ["/api/programs"] 
  });

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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {programs.map((program) => (
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
        </div>
      </section>

      <Dialog open={!!selectedProgram} onOpenChange={() => setSelectedProgram(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedProgram?.title}</DialogTitle>
          </DialogHeader>
          {selectedProgram && (
            <div className="space-y-4">
              <img 
                src={selectedProgram.image} 
                alt={selectedProgram.title}
                className="w-full rounded-lg"
              />
              <p className="text-muted-foreground leading-relaxed">
                {selectedProgram.fullDescription}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
