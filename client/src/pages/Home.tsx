import { useState } from "react";
import HeroSection from "@/components/HeroSection";
import StatsSection from "@/components/StatsSection";
import ProgramCard from "@/components/ProgramCard";
import ChapterCard from "@/components/ChapterCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import educationImage from "@assets/generated_images/education_program_teaching_children.png";
import environmentImage from "@assets/generated_images/environmental_program_tree_planting.png";
import outreachImage from "@assets/generated_images/community_outreach_food_distribution.png";
import healthImage from "@assets/generated_images/health_awareness_workshop_program.png";

//todo: remove mock data
const mockPrograms = [
  {
    id: "1",
    title: "Education & Literacy Program",
    description: "Providing quality education and tutoring to underprivileged children in rural communities. We focus on improving literacy rates and academic performance through dedicated volunteer teachers.",
    image: educationImage,
    fullDescription: "Our Education & Literacy Program reaches out to children in underserved communities across the Philippines. Through tutoring sessions, book donations, and learning materials distribution, we help bridge the educational gap. Our volunteer teachers work with students to improve reading comprehension, mathematics skills, and critical thinking abilities."
  },
  {
    id: "2",
    title: "Environmental Conservation",
    description: "Leading tree-planting initiatives and coastal clean-ups to protect our environment. We engage communities in sustainable practices and environmental awareness campaigns.",
    image: environmentImage,
    fullDescription: "Join us in our mission to protect and preserve the Philippines' natural beauty. Our environmental program includes regular tree-planting activities, beach clean-ups, waste segregation education, and advocacy for sustainable living. We've planted over 10,000 trees and cleaned hundreds of kilometers of coastline."
  },
  {
    id: "3",
    title: "Community Outreach",
    description: "Distributing food packages and essential supplies to families in need. We organize feeding programs and livelihood support for marginalized communities.",
    image: outreachImage,
    fullDescription: "Our Community Outreach Program provides direct assistance to families facing economic hardships. We conduct regular feeding programs, distribute relief goods during calamities, and support livelihood projects that help families become self-sufficient. Every month, we reach over 500 families in need."
  },
  {
    id: "4",
    title: "Health & Wellness",
    description: "Conducting health awareness workshops and medical missions in barangays. We promote preventive healthcare and provide basic medical services to underserved areas.",
    image: healthImage,
    fullDescription: "Health is wealth, and we bring healthcare closer to communities that need it most. Our program includes medical missions with volunteer doctors and nurses, health education seminars, mental health awareness campaigns, and distribution of vitamins and medicines. We've served thousands of beneficiaries across multiple provinces."
  },
];

//todo: remove mock data
const mockChapters = [
  { id: "1", name: "YSP Manila", location: "Manila, Metro Manila", contact: "09171234567", representative: "Juan Dela Cruz" },
  { id: "2", name: "YSP Cebu", location: "Cebu City, Cebu", contact: "09181234567", representative: "Maria Santos" },
  { id: "3", name: "YSP Davao", location: "Davao City, Davao del Sur", contact: "09191234567", representative: "Pedro Reyes" },
  { id: "4", name: "YSP Baguio", location: "Baguio City, Benguet", contact: "09201234567", representative: "Ana Garcia" },
];

export default function Home() {
  const [selectedProgram, setSelectedProgram] = useState<typeof mockPrograms[0] | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <HeroSection />
      
      <StatsSection projects={150} chapters={25} members={5000} />

      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Programs</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover the various ways we serve communities across the Philippines
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {mockPrograms.map((program) => (
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

      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Chapters</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Find a YSP chapter near you and join our community of young leaders
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {mockChapters.map((chapter) => (
              <ChapterCard key={chapter.id} {...chapter} />
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
