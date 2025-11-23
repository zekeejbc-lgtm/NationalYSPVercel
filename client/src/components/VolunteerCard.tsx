import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Phone, Mail } from "lucide-react";
import { format } from "date-fns";

interface VolunteerCardProps {
  id: string;
  eventName: string;
  date: Date;
  chapter: string;
  sdgs: number[];
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
}

const SDG_COLORS: Record<number, string> = {
  1: "bg-[#E5243B]",
  2: "bg-[#DDA63A]",
  3: "bg-[#4C9F38]",
  4: "bg-[#C5192D]",
  5: "bg-[#FF3A21]",
  6: "bg-[#26BDE2]",
  7: "bg-[#FCC30B]",
  8: "bg-[#A21942]",
  9: "bg-[#FD6925]",
  10: "bg-[#DD1367]",
  11: "bg-[#FD9D24]",
  12: "bg-[#BF8B2E]",
  13: "bg-[#3F7E44]",
  14: "bg-[#0A97D9]",
  15: "bg-[#56C02B]",
  16: "bg-[#00689D]",
  17: "bg-[#19486A]",
};

export default function VolunteerCard({
  id,
  eventName,
  date,
  chapter,
  sdgs,
  contactName,
  contactPhone,
  contactEmail,
}: VolunteerCardProps) {
  return (
    <Card 
      className="hover-elevate transition-all"
      data-testid={`card-volunteer-${id}`}
    >
      <CardHeader>
        <h3 className="text-lg font-semibold">{eventName}</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{format(date, "MMM dd, yyyy")}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{chapter}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium mb-2">SDGs Impacted:</p>
          <div className="flex flex-wrap gap-1.5">
            {sdgs.map((sdg) => (
              <Badge
                key={sdg}
                className={`${SDG_COLORS[sdg]} text-white border-0 hover:${SDG_COLORS[sdg]}`}
                data-testid={`badge-sdg-${sdg}`}
              >
                SDG {sdg}
              </Badge>
            ))}
          </div>
        </div>
        <div className="pt-2 border-t">
          <p className="text-sm font-medium mb-2">Contact: {contactName}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <a 
                href={`tel:${contactPhone}`} 
                className="text-primary hover:underline"
                data-testid={`link-call-${id}`}
              >
                {contactPhone}
              </a>
            </div>
            {contactEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <a 
                  href={`mailto:contactEmail`} 
                  className="text-primary hover:underline"
                  data-testid={`link-email-${id}`}
                >
                  {contactEmail}
                </a>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
