import { useState } from "react";
import ProgramCard from "@/components/ProgramCard";
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
    fullDescription: "Our Education & Literacy Program reaches out to children in underserved communities across the Philippines. Through tutoring sessions, book donations, and learning materials distribution, we help bridge the educational gap. Our volunteer teachers work with students to improve reading comprehension, mathematics skills, and critical thinking abilities. We also provide scholarships and school supplies to deserving students who cannot afford them."
  },
  {
    id: "2",
    title: "Environmental Conservation",
    description: "Leading tree-planting initiatives and coastal clean-ups to protect our environment. We engage communities in sustainable practices and environmental awareness campaigns.",
    image: environmentImage,
    fullDescription: "Join us in our mission to protect and preserve the Philippines' natural beauty. Our environmental program includes regular tree-planting activities, beach clean-ups, waste segregation education, and advocacy for sustainable living. We've planted over 10,000 trees and cleaned hundreds of kilometers of coastline. We also conduct workshops on composting, recycling, and reducing carbon footprint in local communities."
  },
  {
    id: "3",
    title: "Community Outreach",
    description: "Distributing food packages and essential supplies to families in need. We organize feeding programs and livelihood support for marginalized communities.",
    image: outreachImage,
    fullDescription: "Our Community Outreach Program provides direct assistance to families facing economic hardships. We conduct regular feeding programs, distribute relief goods during calamities, and support livelihood projects that help families become self-sufficient. Every month, we reach over 500 families in need. We also partner with local businesses to provide skills training and employment opportunities for community members."
  },
  {
    id: "4",
    title: "Health & Wellness",
    description: "Conducting health awareness workshops and medical missions in barangays. We promote preventive healthcare and provide basic medical services to underserved areas.",
    image: healthImage,
    fullDescription: "Health is wealth, and we bring healthcare closer to communities that need it most. Our program includes medical missions with volunteer doctors and nurses, health education seminars, mental health awareness campaigns, and distribution of vitamins and medicines. We've served thousands of beneficiaries across multiple provinces. We also advocate for mental health support and conduct stress management workshops for students and community members."
  },
];

export default function Programs() {
  const [selectedProgram, setSelectedProgram] = useState<typeof mockPrograms[0] | null>(null);

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
