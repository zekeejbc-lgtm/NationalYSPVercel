import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MapPin, Phone, Mail, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ChapterCardProps {
  id: string;
  name: string;
  location: string;
  contact: string;
  email?: string;
  photo?: string;
  representative?: string;
}

export default function ChapterCard({ 
  id, 
  name, 
  location, 
  contact, 
  email,
  photo,
  representative 
}: ChapterCardProps) {
  return (
    <Card 
      className="hover-elevate transition-all h-full"
      data-testid={`card-chapter-${id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={photo} alt={name} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {name.substring(0, 2).toUpperCase()}
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
        {representative && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{representative}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <a 
            href={`tel:${contact}`} 
            className="text-primary hover:underline"
            data-testid={`link-call-${id}`}
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
            >
              {email}
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
