import VolunteerCard from "@/components/VolunteerCard";
import { useQuery } from "@tanstack/react-query";
import type { VolunteerOpportunity } from "@shared/schema";

export default function Volunteer() {
  const { data: opportunities = [] } = useQuery<VolunteerOpportunity[]>({ 
    queryKey: ["/api/volunteer-opportunities"] 
  });
  return (
    <div className="min-h-screen">
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Volunteer Opportunities</h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Make a difference in your community. Browse upcoming volunteer activities 
              and connect with chapter coordinators to get involved.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {opportunities.map((opportunity) => (
              <VolunteerCard 
                key={opportunity.id} 
                {...opportunity}
                date={new Date(opportunity.date)}
                sdgs={opportunity.sdgs.split(',').map(s => parseInt(s.trim()))}
              />
            ))}
          </div>

          {opportunities.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                No volunteer opportunities available at the moment. Check back soon!
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
