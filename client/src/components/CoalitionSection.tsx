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
              Apply through our Coalition Membership Form as an individual
              member or a group / organization. Individual registration and YSP
              membership are now one application.
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              Your application details and uploaded certificates stay private.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {(
              [
                {
                  type: "individual",
                  title: "Individual Membership",
                  text: "Join YSP and the Coalition through one membership application.",
                  Icon: UserRound,
                },
                {
                  type: "organization",
                  title: "Group / Organization",
                  text: "Register your group, with optional YORP status, registration number, certificate, and other registration details.",
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
                      {type === "individual" ? "Apply for membership" : "Register your group"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6">
            <Link href="/membership#application-status" className="inline-flex text-sm font-medium text-primary hover:underline min-h-11 items-center">Track individual membership</Link>
            <Link href="/coalition-track" className="inline-flex text-sm font-medium text-primary hover:underline min-h-11 items-center">Track organization application</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
