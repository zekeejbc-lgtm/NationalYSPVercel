import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MapPin, Phone, Mail, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDisplayImageUrl } from "@/lib/driveUtils";

const WEBSITE_LOGO_SRC = "/images/ysp-logo.png";

function isUnsupportedPhotoUrl(photoUrl: string): boolean {
  const normalized = photoUrl.toLowerCase();
  return normalized.includes("facebook.com/") || normalized.includes("fb.com/");
}

interface ChapterCardProps {
  id: string;
  name: string;
  location: string;
  contact: string;
  email?: string | null;
  photo?: string | null;
  representative?: string | null;
  contactPerson?: string | null;
  onSelect?: () => void;
}

export default function ChapterCard({ 
  id, 
  name, 
  location, 
  contact, 
  email,
  photo,
  representative,
  contactPerson,
  onSelect
}: ChapterCardProps) {
  const chapterRepresentative = representative ?? contactPerson;
  const normalizedPhoto = photo?.trim() || "";
  const displayPhotoUrl = normalizedPhoto && !isUnsupportedPhotoUrl(normalizedPhoto)
    ? getDisplayImageUrl(normalizedPhoto)
    : undefined;
  const [avatarSrc, setAvatarSrc] = useState(displayPhotoUrl || WEBSITE_LOGO_SRC);

  useEffect(() => {
    setAvatarSrc(displayPhotoUrl || WEBSITE_LOGO_SRC);
  }, [displayPhotoUrl]);

  return (
    <Card 
      className={`hover-elevate transition-all h-full ${onSelect ? "cursor-pointer" : ""}`}
      data-testid={`card-chapter-${id}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!onSelect) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? "button" : undefined}
      aria-label={onSelect ? `Open chapter details for ${name}` : undefined}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage
              src={avatarSrc}
              alt={`${name} logo`}
              onError={() => {
                setAvatarSrc((currentSrc) =>
                  currentSrc === WEBSITE_LOGO_SRC ? currentSrc : WEBSITE_LOGO_SRC,
                );
              }}
            />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              <img
                src={WEBSITE_LOGO_SRC}
                alt="YSP logo fallback"
                className="h-full w-full rounded-full object-cover"
              />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{name}</h3>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="h-3.5 w-3.5" />
              <span>{location}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {chapterRepresentative && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{chapterRepresentative}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <a 
            href={`tel:${contact}`} 
            className="text-primary hover:underline"
            data-testid={`link-call-${id}`}
            onClick={(event) => event.stopPropagation()}
          >
            {contact}
          </a>
        </div>
        {email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <a 
              href={`mailto:${email}`} 
              className="text-primary hover:underline"
              data-testid={`link-email-${id}`}
              onClick={(event) => event.stopPropagation()}
            >
              {email}
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
