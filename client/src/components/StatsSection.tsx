import { Card } from "@/components/ui/card";
import { Users, MapPin, FolderCheck } from "lucide-react";

interface StatsSectionProps {
  projects: number;
  chapters: number;
  members: number;
}

export default function StatsSection({ projects, chapters, members }: StatsSectionProps) {
  const stats = [
    {
      icon: FolderCheck,
      value: projects,
      label: "Projects Completed",
      color: "text-primary",
    },
    {
      icon: MapPin,
      value: chapters,
      label: "Active Chapters",
      color: "text-primary",
    },
    {
      icon: Users,
      value: members,
      label: "Youth Members",
      color: "text-primary",
    },
  ];

  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card 
                key={index} 
                className="p-8 text-center hover-elevate transition-all"
                data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className={`h-12 w-12 mx-auto mb-4 ${stat.color}`} />
                <div className={`text-5xl font-bold mb-2 ${stat.color}`}>
                  {stat.value.toLocaleString()}
                </div>
                <div className="text-muted-foreground font-medium">
                  {stat.label}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
