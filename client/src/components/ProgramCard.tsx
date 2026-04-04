import { useEffect, useState } from "react";
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

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 170;
const PROGRAM_FALLBACK_IMAGE = "/images/ysp-logo.png";

function truncateText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export default function ProgramCard({ id, title, description, image, onClick }: ProgramCardProps) {
  const displayUrl = getDisplayImageUrl(image);
  const [currentImageSrc, setCurrentImageSrc] = useState(displayUrl || PROGRAM_FALLBACK_IMAGE);
  const [showImageFallbackText, setShowImageFallbackText] = useState(false);
  const displayTitle = truncateText(title, MAX_TITLE_LENGTH);
  const displayDescription = truncateText(description, MAX_DESCRIPTION_LENGTH);

  useEffect(() => {
    setCurrentImageSrc(displayUrl || PROGRAM_FALLBACK_IMAGE);
    setShowImageFallbackText(false);
  }, [displayUrl, id]);

  const handleImageError = () => {
    if (currentImageSrc !== PROGRAM_FALLBACK_IMAGE) {
      setCurrentImageSrc(PROGRAM_FALLBACK_IMAGE);
      return;
    }
    setShowImageFallbackText(true);
  };

  return (
    <Card 
      className="overflow-hidden hover-elevate transition-all group cursor-pointer h-[28rem] flex flex-col"
      onClick={onClick}
      data-testid={`card-program-${id}`}
    >
      <div className="h-56 overflow-hidden bg-muted flex items-center justify-center">
        {!showImageFallbackText && currentImageSrc ? (
          <img 
            src={currentImageSrc} 
            alt={title}
            className="w-full h-full object-cover"
            onError={handleImageError}
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageOff className="h-10 w-10" />
            <span className="text-sm">No photo</span>
          </div>
        )}
      </div>
      <CardHeader className="pb-3">
        <h3 className="text-xl font-semibold leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
          {displayTitle}
        </h3>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pt-0">
        <p
          className="text-muted-foreground leading-relaxed overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {displayDescription}
        </p>
      </CardContent>
      <CardFooter className="mt-auto pt-3">
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
