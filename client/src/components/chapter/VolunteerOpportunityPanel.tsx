import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HandHeart, Plus, Calendar, MapPin, Clock, User, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { VolunteerOpportunity } from "@shared/schema";

const VOLUNTEER_DISCLAIMER = "Volunteers are reminded that they are responsible for their own safety and situational awareness during activities. Participation is advised for individuals 18 years old and above. Volunteers below 18 years old must submit a Parent's Consent Form prior to participation.";

interface VolunteerOpportunityPanelProps {
  chapterId: string;
}

export default function VolunteerOpportunityPanel({ chapterId }: VolunteerOpportunityPanelProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    eventName: "",
    date: "",
    time: "",
    venue: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    ageRequirement: "18+"
  });

  const { data: opportunities = [], isLoading } = useQuery<VolunteerOpportunity[]>({
    queryKey: ["/api/volunteer-opportunities/by-chapter", { chapterId }],
    queryFn: async () => {
      const res = await fetch(`/api/volunteer-opportunities/by-chapter?chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch opportunities");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/volunteer-opportunities/chapter", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Volunteer opportunity created and published to the main website" });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setIsCreating(false);
    setFormData({
      eventName: "",
      date: "",
      time: "",
      venue: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      ageRequirement: "18+"
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.eventName || !formData.date || !formData.time || !formData.venue || !formData.contactName || !formData.contactPhone) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      eventName: formData.eventName,
      date: new Date(formData.date),
      time: formData.time,
      venue: formData.venue,
      contactName: formData.contactName,
      contactPhone: formData.contactPhone,
      contactEmail: formData.contactEmail || null,
      ageRequirement: formData.ageRequirement
    });
  };

  const upcomingOpportunities = opportunities.filter(o => new Date(o.date) >= new Date());
  const pastOpportunities = opportunities.filter(o => new Date(o.date) < new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandHeart className="h-5 w-5" />
          Volunteer Opportunities
        </CardTitle>
        <CardDescription>
          Create volunteer opportunities that will appear on the main website
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {VOLUNTEER_DISCLAIMER}
          </AlertDescription>
        </Alert>

        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} data-testid="button-create-opportunity">
            <Plus className="h-4 w-4 mr-2" />
            Create Volunteer Opportunity
          </Button>
        )}

        {isCreating && (
          <Card className="border-primary">
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Activity Name *</Label>
                    <Input
                      value={formData.eventName}
                      onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
                      placeholder="e.g., Community Clean-up Drive"
                      data-testid="input-event-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      data-testid="input-event-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time *</Label>
                    <Input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      data-testid="input-event-time"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Venue / Place *</Label>
                    <Input
                      value={formData.venue}
                      onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                      placeholder="e.g., Barangay Hall, Quezon City"
                      data-testid="input-event-venue"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Person *</Label>
                    <Input
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      placeholder="Full name"
                      data-testid="input-contact-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone *</Label>
                    <Input
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      placeholder="09171234567"
                      data-testid="input-contact-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Email (optional)</Label>
                    <Input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      placeholder="email@example.com"
                      data-testid="input-contact-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Age Requirement</Label>
                    <Select value={formData.ageRequirement} onValueChange={(v) => setFormData({ ...formData, ageRequirement: v })}>
                      <SelectTrigger data-testid="select-age-requirement">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="18+">18+ years old only</SelectItem>
                        <SelectItem value="16+">16+ years old (with consent)</SelectItem>
                        <SelectItem value="all">All ages welcome</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-opportunity">
                    {createMutation.isPending ? "Creating..." : "Create & Publish"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {upcomingOpportunities.length > 0 && (
            <div>
              <h3 className="font-medium mb-3">Upcoming Activities ({upcomingOpportunities.length})</h3>
              <div className="space-y-3">
                {upcomingOpportunities.map((opp) => (
                  <div key={opp.id} className="p-4 border rounded-lg hover-elevate">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{opp.eventName}</h4>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(opp.date), "MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {opp.time || "TBD"}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {opp.venue || "TBD"}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {opp.contactName}
                          </span>
                        </div>
                      </div>
                      <Badge>{opp.ageRequirement}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pastOpportunities.length > 0 && (
            <div>
              <h3 className="font-medium mb-3 text-muted-foreground">Past Activities ({pastOpportunities.length})</h3>
              <div className="space-y-2">
                {pastOpportunities.slice(0, 5).map((opp) => (
                  <div key={opp.id} className="p-3 border rounded-lg opacity-60">
                    <div className="flex items-center justify-between">
                      <span>{opp.eventName}</span>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(opp.date), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {opportunities.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8">
              No volunteer opportunities created yet. Create one to get started.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
