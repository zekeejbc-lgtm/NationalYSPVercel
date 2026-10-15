import { Link } from "wouter";
import { Building2, UserRound, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function CoalitionSection() {
  return (
    <section
      id="coalition"
      className="py-12 md:py-16 bg-primary/5 border-b"
      aria-labelledby="coalition-title"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="space-y-4">
            <span className="text-sm font-semibold text-primary uppercase tracking-wider">
              Together in service
            </span>
            <h2 id="coalition-title" className="text-3xl md:text-4xl font-bold">
              Join the Youth Service Coalition
            </h2>
            <p className="text-lg text-muted-foreground">
              Connect with individuals and organizations who share a commitment
              to youth leadership, volunteerism, and community service.
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              Just your basic details. Your information stays private.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {(
              [
                {
                  type: "individual",
                  title: "As an Individual",
                  text: "Bring your passion for service and connect with fellow changemakers.",
                  Icon: UserRound,
                },
                {
                  type: "organization",
                  title: "As an Organization",
                  text: "Connect your group with a wider community of service partners.",
                  Icon: Building2,
                },
              ] as const
            ).map(({ type, title, text, Icon }) => (
              <Card key={type} className="hover-elevate h-full">
                <CardContent className="p-6 flex flex-col h-full gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">{title}</h3>
                  <p className="text-muted-foreground text-sm flex-1">{text}</p>
                  <Button
                    asChild
                    variant={type === "individual" ? "default" : "outline"}
                    className="w-full min-h-11"
                  >
                    <Link
                      href={`/coalition-signup?type=${type}`}
                      data-testid={`button-coalition-${type}`}
                    >
                      Register as{" "}
                      {type === "individual" ? "Individual" : "Organization"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <Link
            href="/coalition-track"
            className="inline-flex text-sm font-medium text-primary hover:underline min-h-11 items-center"
          >
            Already applied? Track your application →
          </Link>
        </div>
      </div>
    </section>
  );
}
