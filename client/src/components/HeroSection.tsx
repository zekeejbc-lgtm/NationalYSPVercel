import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import heroImage from "@assets/generated_images/hero_image_volunteers_building.png";

export default function HeroSection() {
  return (
    <section className="relative h-[70vh] min-h-[500px] w-full overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/20" />
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
    </section>
  );
}
