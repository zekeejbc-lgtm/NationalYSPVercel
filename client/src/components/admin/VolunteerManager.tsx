import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import { Trash2, Edit, Plus, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import type { VolunteerOpportunity } from "@shared/schema";

export default function VolunteerManager() {
  const { toast } = useToast();
  const [editingOpportunity, setEditingOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    eventName: "",
    date: "",
    chapter: "",
    sdgs: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
  });

  const { data: opportunities = [], isLoading } = useQuery<VolunteerOpportunity[]>({
    queryKey: ["/api/volunteer-opportunities"]
  });

  const handleAdd = () => {
    setEditingOpportunity(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFormData({
      eventName: "",
      date: "",
      chapter: "",
      sdgs: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (opportunity: VolunteerOpportunity) => {
    setEditingOpportunity(opportunity);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFormData({
      eventName: opportunity.eventName,
      date: format(new Date(opportunity.date), "yyyy-MM-dd"),
      chapter: opportunity.chapter,
      sdgs: opportunity.sdgs || "",
      contactName: opportunity.contactName,
      contactPhone: opportunity.contactPhone,
      contactEmail: opportunity.contactEmail || "",
    });
    setIsDialogOpen(true);
  };

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
      formDataObj.append("date", new Date(data.date).toISOString());
      formDataObj.append("time", "TBD");
      formDataObj.append("venue", "TBD");
      formDataObj.append("chapter", data.chapter);
      formDataObj.append("sdgs", data.sdgs);
      formDataObj.append("contactName", data.contactName);
      formDataObj.append("contactPhone", data.contactPhone);
      if (data.contactEmail) formDataObj.append("contactEmail", data.contactEmail);
      if (file) formDataObj.append("photo", file);

      const res = await fetch("/api/volunteer-opportunities", {
        method: "POST",
        body: formDataObj,
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "Volunteer opportunity created successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create volunteer opportunity",
        variant: "destructive",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, file }: { id: string; data: typeof formData; file: File | null }) => {
      const formDataObj = new FormData();
      formDataObj.append("eventName", data.eventName);
      formDataObj.append("date", new Date(data.date).toISOString());
      formDataObj.append("time", "TBD");
      formDataObj.append("venue", "TBD");
      formDataObj.append("chapter", data.chapter);
      formDataObj.append("sdgs", data.sdgs);
      formDataObj.append("contactName", data.contactName);
      formDataObj.append("contactPhone", data.contactPhone);
      if (data.contactEmail) formDataObj.append("contactEmail", data.contactEmail);
      if (file) formDataObj.append("photo", file);

      const res = await fetch(`/api/volunteer-opportunities/${id}`, {
        method: "PUT",
        body: formDataObj,
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "Volunteer opportunity updated successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update volunteer opportunity",
        variant: "destructive",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/volunteer-opportunities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "Volunteer opportunity deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete volunteer opportunity",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOpportunity) {
      updateMutation.mutate({ id: editingOpportunity.id, data: formData, file: selectedFile });
    } else {
      createMutation.mutate({ data: formData, file: selectedFile });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this volunteer opportunity?")) return;
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading volunteer opportunities">
        <div className="h-5 w-64 rounded-md bg-muted skeleton-shimmer" />
        <div className="h-24 w-full rounded-lg bg-muted skeleton-shimmer" />
        <div className="h-24 w-full rounded-lg bg-muted skeleton-shimmer" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Volunteer Opportunities</CardTitle>
              <CardDescription>Manage upcoming volunteer activities and events</CardDescription>
            </div>
            <Button onClick={handleAdd} data-testid="button-add-volunteer">
              <Plus className="h-4 w-4 mr-2" />
              Add Opportunity
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <p className="text-muted-foreground">No volunteer opportunities yet. Add your first one!</p>
          ) : (
            <div className="space-y-4">
              {opportunities.map((opportunity) => {
                const displayPhotoUrl = opportunity.photoUrl ? getDisplayImageUrl(opportunity.photoUrl) : "";

                return (
                <Card key={opportunity.id} className="hover-elevate transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {displayPhotoUrl && (
                        <img 
                          src={displayPhotoUrl} 
                          alt={opportunity.eventName}
                          className="w-20 h-20 object-cover rounded-md flex-shrink-0"
                          data-testid={`img-volunteer-${opportunity.id}`}
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold">{opportunity.eventName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(opportunity.date), "MMM dd, yyyy")} • {opportunity.chapter}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          SDGs: {opportunity.sdgs}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Contact: {opportunity.contactName} ({opportunity.contactPhone})
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEdit(opportunity)}
                          data-testid={`button-edit-volunteer-${opportunity.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(opportunity.id)}
                          data-testid={`button-delete-volunteer-${opportunity.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingOpportunity ? "Edit Volunteer Opportunity" : "Add New Volunteer Opportunity"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventName">Event Name</Label>
              <Input
                id="eventName"
                value={formData.eventName}
                onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
                required
                placeholder="Community Clean-up Drive"
                data-testid="input-volunteer-event-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                data-testid="input-volunteer-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapter">YSP Chapter</Label>
              <Input
                id="chapter"
                value={formData.chapter}
                onChange={(e) => setFormData({ ...formData, chapter: e.target.value })}
                required
                placeholder="YSP Manila"
                data-testid="input-volunteer-chapter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sdgs">SDGs Impacted</Label>
              <Input
                id="sdgs"
                value={formData.sdgs}
                onChange={(e) => setFormData({ ...formData, sdgs: e.target.value })}
                required
                placeholder="1,2,3"
                data-testid="input-volunteer-sdgs"
              />
              <p className="text-xs text-muted-foreground">
                Enter SDG numbers separated by commas (e.g., 1,2,3)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Person Name</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                required
                placeholder="Juan Dela Cruz"
                data-testid="input-volunteer-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                type="tel"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                required
                placeholder="09171234567"
                data-testid="input-volunteer-contact-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email (Optional)</Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="juan@youthservice.ph"
                data-testid="input-volunteer-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo">Photo/Pubmat (Optional)</Label>
              <Input
                id="photo"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                data-testid="input-volunteer-photo"
              />
              <p className="text-xs text-muted-foreground">
                JPG, PNG, or WebP only. Max 2MB.
              </p>
              {editingOpportunity?.photoUrl && !selectedFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Image className="h-4 w-4" />
                  <span>Current image: {editingOpportunity.photoUrl.split('/').pop()}</span>
                </div>
              )}
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Image className="h-4 w-4" />
                  <span>Selected: {selectedFile.name}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending} 
                data-testid="button-save-volunteer"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Opportunity"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-volunteer"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
