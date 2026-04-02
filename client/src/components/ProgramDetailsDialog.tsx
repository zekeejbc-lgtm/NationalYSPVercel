import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Program } from "@shared/schema";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import { ImageOff } from "lucide-react";

interface ProgramDetailsDialogProps {
  program: Program | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROGRAM_FALLBACK_IMAGE = "/images/ysp-logo.png";

export default function ProgramDetailsDialog({ program, open, onOpenChange }: ProgramDetailsDialogProps) {
  const dialogImageUrl = program ? getDisplayImageUrl(program.image) : "";
  const [currentImageSrc, setCurrentImageSrc] = useState(dialogImageUrl || PROGRAM_FALLBACK_IMAGE);
  const [showImageFallbackText, setShowImageFallbackText] = useState(false);

  useEffect(() => {
    setCurrentImageSrc(dialogImageUrl || PROGRAM_FALLBACK_IMAGE);
    setShowImageFallbackText(false);
  }, [dialogImageUrl, program?.id, open]);

  const handleImageError = () => {
    if (currentImageSrc !== PROGRAM_FALLBACK_IMAGE) {
      setCurrentImageSrc(PROGRAM_FALLBACK_IMAGE);
      return;
    }

    setShowImageFallbackText(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border p-0 gap-0 flex flex-col sm:w-full">
        <DialogHeader className="flex-none z-10 border-b bg-background/95 px-4 py-3 pr-14 backdrop-blur-sm md:px-6">
          <DialogTitle className="text-left text-lg leading-tight md:text-2xl">
            {program?.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Program details and full description.
          </DialogDescription>
        </DialogHeader>

        {program && (
          <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-4 py-4 md:px-6 md:py-5">
            {!showImageFallbackText && currentImageSrc ? (
              <img
                src={currentImageSrc}
                alt={program.title}
                className="w-full max-h-[420px] object-contain rounded-xl bg-muted"
                onError={handleImageError}
              />
            ) : (
              <div className="w-full h-48 bg-muted rounded-xl flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="h-10 w-10" />
                  <span className="text-sm">No photo available</span>
                </div>
              </div>
            )}

            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
              {program.fullDescription || program.description}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}