import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ImageOff } from "lucide-react";
import { getDisplayImageUrl } from "@/lib/driveUtils";

interface ProgramCardProps {
  id: string;
  title: string;
  description: string;
  image: string;
  onClick?: () => void;
}

export default function ProgramCard({ id, title, description, image, onClick }: ProgramCardProps) {
  const [imgError, setImgError] = useState(false);
  const displayUrl = getDisplayImageUrl(image);

  return (
    <Card 
      className="overflow-hidden hover-elevate transition-all group cursor-pointer h-full flex flex-col"
      onClick={onClick}
      data-testid={`card-program-${id}`}
    >
      <div className="aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center">
        {displayUrl && !imgError ? (
          <img 
            src={displayUrl} 
            alt={title}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageOff className="h-10 w-10" />
            <span className="text-sm">No photo</span>
          </div>
        )}
      </div>
      <CardHeader>
        <h3 className="text-xl font-semibold">{title}</h3>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-muted-foreground line-clamp-3">{description}</p>
      </CardContent>
      <CardFooter>
        <Button 
          variant="ghost" 
          className="w-full group/btn"
          data-testid={`button-learn-more-${id}`}
        >
          Learn More
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
        </Button>
      </CardFooter>
    </Card>
  );
}
