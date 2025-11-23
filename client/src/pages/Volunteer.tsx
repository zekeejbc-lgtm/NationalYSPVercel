import VolunteerCard from "@/components/VolunteerCard";

//todo: remove mock data
const mockOpportunities = [
  {
    id: "1",
    eventName: "Community Clean-up Drive",
    date: new Date("2024-12-15"),
    chapter: "YSP Manila",
    sdgs: [11, 13, 15],
    contactName: "Maria Santos",
    contactPhone: "09171234567",
    contactEmail: "maria@youthservice.ph",
  },
  {
    id: "2",
    eventName: "Tutoring Session for Elementary Students",
    date: new Date("2024-12-20"),
    chapter: "YSP Cebu",
    sdgs: [4, 10],
    contactName: "Juan Dela Cruz",
    contactPhone: "09181234567",
    contactEmail: "juan@youthservice.ph",
  },
  {
    id: "3",
    eventName: "Medical Mission in Rural Barangay",
    date: new Date("2024-12-28"),
    chapter: "YSP Davao",
    sdgs: [3, 10],
    contactName: "Pedro Reyes",
    contactPhone: "09191234567",
    contactEmail: "pedro@youthservice.ph",
  },
  {
    id: "4",
    eventName: "Tree Planting Activity",
    date: new Date("2025-01-05"),
    chapter: "YSP Baguio",
    sdgs: [13, 15],
    contactName: "Ana Garcia",
    contactPhone: "09201234567",
    contactEmail: "ana@youthservice.ph",
  },
  {
    id: "5",
    eventName: "Feeding Program for Street Children",
    date: new Date("2025-01-10"),
    chapter: "YSP Iloilo",
    sdgs: [1, 2, 10],
    contactName: "Carlos Mendoza",
    contactPhone: "09211234567",
    contactEmail: "carlos@youthservice.ph",
  },
  {
    id: "6",
    eventName: "Blood Donation Drive",
    date: new Date("2025-01-15"),
    chapter: "YSP Cagayan de Oro",
    sdgs: [3],
    contactName: "Sofia Lim",
    contactPhone: "09221234567",
    contactEmail: "sofia@youthservice.ph",
  },
];

export default function Volunteer() {
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
            {mockOpportunities.map((opportunity) => (
              <VolunteerCard key={opportunity.id} {...opportunity} />
            ))}
          </div>

          {mockOpportunities.length === 0 && (
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
