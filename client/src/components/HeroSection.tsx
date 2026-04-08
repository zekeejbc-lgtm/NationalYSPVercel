import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Publication } from "@shared/schema";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import heroImage from "@assets/generated_images/hero_image_volunteers_building.png";

const AUTOPLAY_DELAY_MS = 5000;
const DRAG_THRESHOLD_PX = 64;
const SLIDE_TRANSITION = "transform 950ms cubic-bezier(0.16, 1, 0.3, 1)";
const MAX_VISIBLE_DOTS = 5;

type HeroSlide = {
  id: string;
  imageUrl: string;
  title: string | null;
  publicationId: string | null;
  linkHref: string | null;
};

export default function HeroSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  const [loadedSlideIds, setLoadedSlideIds] = useState<Record<string, boolean>>({
    "landing-default": true,
  });
  const dragStateRef = useRef<{ active: boolean; startX: number; pointerId: number | null }>({
    active: false,
    startX: 0,
    pointerId: null,
  });

  const { data: publications = [] } = useQuery<Publication[]>({
    queryKey: ["/api/publications"],
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const publicationSlides = useMemo<HeroSlide[]>(() => {
    return publications
      .filter((publication) => Boolean(publication.photoUrl?.trim()))
      .map((publication) => ({
        id: `publication-${publication.id}`,
        imageUrl: getDisplayImageUrl((publication.photoUrl || "").trim()),
        title: publication.title,
        publicationId: publication.id,
        linkHref: `/publications?publicationId=${encodeURIComponent(publication.id)}`,
      }));
  }, [publications]);

  const slides = useMemo<HeroSlide[]>(
    () => [
      {
        id: "landing-default",
        imageUrl: heroImage,
        title: null,
        publicationId: null,
        linkHref: null,
      },
      ...publicationSlides,
    ],
    [publicationSlides],
  );

  const activeSlide = slides[currentIndex] || slides[0];
  const visibleDotIndices = useMemo(() => {
    const totalSlides = slides.length;
    if (totalSlides <= MAX_VISIBLE_DOTS) {
      return Array.from({ length: totalSlides }, (_, index) => index);
    }

    if (currentIndex <= 1) {
      return [0, 1, 2, 3, 4];
    }

    if (currentIndex >= totalSlides - 2) {
      return [
        totalSlides - 5,
        totalSlides - 4,
        totalSlides - 3,
        totalSlides - 2,
        totalSlides - 1,
      ];
    }

    return [
      currentIndex - 2,
      currentIndex - 1,
      currentIndex,
      currentIndex + 1,
      currentIndex + 2,
    ];
  }, [slides.length, currentIndex]);

  const goToSlide = (index: number) => {
    if (slides.length === 0) {
      return;
    }

    const normalizedIndex = (index + slides.length) % slides.length;
    setCurrentIndex(normalizedIndex);
  };

  const goToPreviousSlide = () => {
    goToSlide(currentIndex - 1);
  };

  const goToNextSlide = () => {
    goToSlide(currentIndex + 1);
  };

  useEffect(() => {
    if (currentIndex < slides.length) {
      return;
    }

    setCurrentIndex(0);
  }, [currentIndex, slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || isInteractionPaused || dragStateRef.current.active) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentIndex((previousIndex) => (previousIndex + 1) % slides.length);
    }, AUTOPLAY_DELAY_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [slides.length, isInteractionPaused]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const publicationSlidesOnly = slides.filter((slide) => slide.id !== "landing-default");
    if (publicationSlidesOnly.length === 0) {
      return;
    }

    const preloadedImages: HTMLImageElement[] = [];
    let isCancelled = false;

    setLoadedSlideIds((previous) => ({ ...previous, "landing-default": true }));

    publicationSlidesOnly.forEach((slide) => {
      const image = new window.Image();
      preloadedImages.push(image);

      image.onload = () => {
        if (isCancelled) {
          return;
        }

        setLoadedSlideIds((previous) => {
          if (previous[slide.id]) {
            return previous;
          }

          return { ...previous, [slide.id]: true };
        });
      };

      image.src = slide.imageUrl;
    });

    return () => {
      isCancelled = true;
      preloadedImages.forEach((image) => {
        image.onload = null;
      });
    };
  }, [slides]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (slides.length <= 1) {
      return;
    }

    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      pointerId: event.pointerId,
    };
    setDragOffset(0);
    setIsInteractionPaused(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) {
      return;
    }

    setDragOffset(event.clientX - dragStateRef.current.startX);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelNavigation: boolean) => {
    if (!dragStateRef.current.active) {
      return;
    }

    const offsetX = event.clientX - dragStateRef.current.startX;
    const pointerId = dragStateRef.current.pointerId;
    if (pointerId !== null && event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }

    dragStateRef.current = {
      active: false,
      startX: 0,
      pointerId: null,
    };
    setDragOffset(0);
    setIsInteractionPaused(false);

    if (cancelNavigation) {
      return;
    }

    if (Math.abs(offsetX) < DRAG_THRESHOLD_PX) {
      return;
    }

    if (offsetX < 0) {
      goToNextSlide();
      return;
    }

    goToPreviousSlide();
  };

  return (
    <section
      className="relative h-[70vh] min-h-[500px] w-full overflow-hidden select-none"
      onMouseEnter={() => setIsInteractionPaused(true)}
      onMouseLeave={() => setIsInteractionPaused(false)}
    >
      <div
        className="absolute inset-0 touch-pan-y"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDrag(event, false)}
        onPointerCancel={(event) => finishDrag(event, true)}
      >
        <div
          className="flex h-full w-full will-change-transform"
          style={{
            transform: `translateX(calc(-${currentIndex * 100}% + ${dragOffset}px))`,
            transition: dragStateRef.current.active ? "none" : SLIDE_TRANSITION,
          }}
        >
          {slides.map((slide, index) => {
            const isLoaded = slide.id === "landing-default" || Boolean(loadedSlideIds[slide.id]);
            const nextIndex = (currentIndex + 1) % slides.length;
            const shouldPrioritizeImage = index === currentIndex || index === nextIndex;

            return (
              <div key={slide.id} className="relative h-full w-full shrink-0">
                <img
                  src={isLoaded ? slide.imageUrl : heroImage}
                  alt={slide.title || "Youth Service Philippines hero background"}
                  className="h-full w-full object-cover"
                  draggable={false}
                  loading={shouldPrioritizeImage ? "eager" : "lazy"}
                  decoding="async"
                  onLoad={(event) => {
                    delete event.currentTarget.dataset.heroFallbackApplied;
                  }}
                  onError={(event) => {
                    if (event.currentTarget.dataset.heroFallbackApplied === "true") {
                      return;
                    }

                    event.currentTarget.dataset.heroFallbackApplied = "true";
                    event.currentTarget.src = heroImage;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/45 to-black/15" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative h-full max-w-7xl mx-auto px-4 md:px-8 flex items-center">
        <div className="max-w-3xl text-white">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Empowering Filipino Youth Through Community Service
          </h1>
          <p className="text-lg md:text-xl mb-8 text-white/90">
            Join us in creating lasting change in communities across the Philippines.
            Together, we build a better future through service, leadership, and compassion.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/membership">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 backdrop-blur-md"
                data-testid="button-join-us"
              >
                Join Us
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/programs">
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md border-white/40 text-white"
                data-testid="button-learn-more"
              >
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20">
        <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
          <div className="pointer-events-auto mx-auto flex w-full max-w-[78vw] flex-col items-center gap-1.5 sm:ml-auto sm:mr-0 sm:w-auto sm:max-w-[420px] sm:items-end">
            {activeSlide?.publicationId && activeSlide.linkHref && activeSlide.title && (
              <Link
                href={activeSlide.linkHref}
                className="block w-full truncate text-center text-[11px] font-medium text-white/80 transition-colors hover:text-white sm:text-right"
                title={activeSlide.title}
              >
                {activeSlide.title}
              </Link>
            )}

            <div className="flex w-full items-center justify-center gap-1.5 sm:justify-end">
              <button
                type="button"
                onClick={goToPreviousSlide}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                aria-label="Go to previous slide"
                data-testid="button-hero-slide-prev"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-1 px-0.5" role="tablist" aria-label="Hero slides">
                {visibleDotIndices.map((slideIndex) => (
                  <button
                    key={`dot-${slides[slideIndex]?.id || slideIndex}`}
                    type="button"
                    onClick={() => goToSlide(slideIndex)}
                    className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                      slideIndex === currentIndex ? "w-4 bg-white/95" : "w-1.5 bg-white/45 hover:bg-white/70"
                    }`}
                    aria-label={`Go to slide ${slideIndex + 1}`}
                    aria-selected={slideIndex === currentIndex}
                    role="tab"
                    data-testid={`button-hero-slide-dot-${slideIndex + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={goToNextSlide}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                aria-label="Go to next slide"
                data-testid="button-hero-slide-next"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
