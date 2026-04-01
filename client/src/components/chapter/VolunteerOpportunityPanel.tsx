import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import LoadingState from "@/components/ui/loading-state";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { HandHeart, Plus, Calendar, MapPin, Clock, User, AlertTriangle, Image } from "lucide-react";
import { format } from "date-fns";
import type { VolunteerOpportunity } from "@shared/schema";

const VOLUNTEER_DISCLAIMER = "Volunteers are reminded that they are responsible for their own safety and situational awareness during activities. Participation is advised for individuals 18 years old and above. Volunteers below 18 years old must submit a Parent's Consent Form prior to participation.";

interface VolunteerOpportunityPanelProps {
  chapterId: string;
}

export default function VolunteerOpportunityPanel({ chapterId }: VolunteerOpportunityPanelProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: "Error", description: "File must be under 2MB", variant: "destructive" });
        e.target.value = "";
        return;
      }
      const validTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        toast({ title: "Error", description: "Only JPG, PNG, or WebP images allowed", variant: "destructive" });
        e.target.value = "";
        return;
      }
      setSelectedFile(file);
    }
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, file }: { data: typeof formData; file: File | null }) => {
      const formDataObj = new FormData();
      formDataObj.append("eventName", data.eventName);
      formDataObj.append("date", data.date);
      formDataObj.append("time", data.time);
      formDataObj.append("venue", data.venue);
      formDataObj.append("contactName", data.contactName);
      formDataObj.append("contactPhone", data.contactPhone);
      formDataObj.append("ageRequirement", data.ageRequirement);
      if (data.contactEmail) formDataObj.append("contactEmail", data.contactEmail);
      if (file) formDataObj.append("photo", file);

      const res = await fetch("/api/volunteer-opportunities/chapter", {
        method: "POST",
        body: formDataObj,
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Volunteer opportunity created and published to the main website" });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities/by-chapter", { chapterId }] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setIsCreating(false);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

    createMutation.mutate({ data: formData, file: selectedFile });
  };

  const upcomingOpportunities = opportunities.filter(o => new Date(o.date) >= new Date());
  const pastOpportunities = opportunities.filter(o => new Date(o.date) < new Date());

  const upcomingPagination = usePagination(upcomingOpportunities, {
    pageSize: 5,
    resetKey: upcomingOpportunities.length,
  });

  const pastPagination = usePagination(pastOpportunities, {
    pageSize: 5,
    resetKey: pastOpportunities.length,
  });

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
                  <div className="space-y-2 md:col-span-2">
                    <Label>Photo/Pubmat (Optional)</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      data-testid="input-event-photo"
                    />
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, or WebP only. Max 2MB.
                    </p>
                    {selectedFile && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <Image className="h-4 w-4" />
                        <span>Selected: {selectedFile.name}</span>
                      </div>
                    )}
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
          {isLoading && (
            <LoadingState label="Loading volunteer opportunities..." rows={3} compact />
          )}

          {!isLoading && upcomingOpportunities.length > 0 && (
            <div>
              <h3 className="font-medium mb-3">Upcoming Activities ({upcomingOpportunities.length})</h3>
              <div className="space-y-3">
                {upcomingPagination.paginatedItems.map((opp) => {
                  const displayPhotoUrl = opp.photoUrl ? getDisplayImageUrl(opp.photoUrl) : "";

                  return (
                  <div key={opp.id} className="p-4 border rounded-lg hover-elevate">
                    <div className="flex items-start justify-between gap-4">
                      {displayPhotoUrl && (
                        <img 
                          src={displayPhotoUrl} 
                          alt={opp.eventName}
                          className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                        />
                      )}
                      <div className="flex-1">
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
                  );
                })}

                <PaginationControls
                  currentPage={upcomingPagination.currentPage}
                  totalPages={upcomingPagination.totalPages}
                  itemsPerPage={upcomingPagination.itemsPerPage}
                  totalItems={upcomingPagination.totalItems}
                  startItem={upcomingPagination.startItem}
                  endItem={upcomingPagination.endItem}
                  onPageChange={upcomingPagination.setCurrentPage}
                  onItemsPerPageChange={upcomingPagination.setItemsPerPage}
                  itemLabel="upcoming activities"
                />
              </div>
            </div>
          )}

          {!isLoading && pastOpportunities.length > 0 && (
            <div>
              <h3 className="font-medium mb-3 text-muted-foreground">Past Activities ({pastOpportunities.length})</h3>
              <div className="space-y-2">
                {pastPagination.paginatedItems.map((opp) => (
                  <div key={opp.id} className="p-3 border rounded-lg opacity-60">
                    <div className="flex items-center justify-between">
                      <span>{opp.eventName}</span>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(opp.date), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                ))}

                <PaginationControls
                  currentPage={pastPagination.currentPage}
                  totalPages={pastPagination.totalPages}
                  itemsPerPage={pastPagination.itemsPerPage}
                  totalItems={pastPagination.totalItems}
                  startItem={pastPagination.startItem}
                  endItem={pastPagination.endItem}
                  onPageChange={pastPagination.setCurrentPage}
                  onItemsPerPageChange={pastPagination.setItemsPerPage}
                  itemLabel="past activities"
                />
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
