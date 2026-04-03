import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  resetImageFallback,
} from "@/lib/driveUtils";
import { formatManilaDateTime12, isPastDateTime } from "@/lib/manilaTime";
import { Calendar, MapPin, Phone, Mail, Clock3, ExternalLink } from "lucide-react";
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
  description?: string | null;
  learnMoreUrl?: string | null;
  applyUrl?: string | null;
  deadlineAt?: string | Date | null;
  photoUrl?: string | null;
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
  description,
  learnMoreUrl,
  applyUrl,
  deadlineAt,
  photoUrl,
}: VolunteerCardProps) {
  const displayPhotoUrl = photoUrl ? getDisplayImageUrl(photoUrl) : "";
  const [currentPhotoSrc, setCurrentPhotoSrc] = useState(displayPhotoUrl);
  const isDone = isPastDateTime(deadlineAt);

  useEffect(() => {
    setCurrentPhotoSrc(displayPhotoUrl);
  }, [displayPhotoUrl, id]);

  return (
    <Card 
      className="hover-elevate transition-all overflow-hidden"
      data-testid={`card-volunteer-${id}`}
    >
      {currentPhotoSrc && (
        <div className="w-full h-48 overflow-hidden">
          <img 
            src={currentPhotoSrc} 
            alt={eventName}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onLoad={(event) => {
              resetImageFallback(event.currentTarget);
            }}
            onError={(event) => {
              if (applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                setCurrentPhotoSrc(DEFAULT_IMAGE_FALLBACK_SRC);
                return;
              }

              setCurrentPhotoSrc("");
            }}
          />
        </div>
      )}
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold">{eventName}</h3>
          <Badge variant={isDone ? "secondary" : "default"}>{isDone ? "Done" : "Open"}</Badge>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{format(date, "MMM dd, yyyy")}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{chapter}</span>
          </div>
          {deadlineAt && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              <span>Deadline: {formatManilaDateTime12(deadlineAt)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {sdgs.length > 0 && (
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
        )}
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
                  href={`mailto:${contactEmail}`} 
                  className="text-primary hover:underline"
                  data-testid={`link-email-${id}`}
                >
                  {contactEmail}
                </a>
              </div>
            )}
          </div>
        </div>
        {(learnMoreUrl || applyUrl) && (
          <div className="pt-2 border-t flex flex-wrap gap-2">
            {learnMoreUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer">
                  Learn More
                  <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            )}
            {applyUrl && (
              <Button asChild size="sm">
                <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                  Apply Here
                  <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
