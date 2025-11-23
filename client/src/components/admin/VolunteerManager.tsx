import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, Edit, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import type { VolunteerOpportunity } from "@shared/schema";

export default function VolunteerManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([]);
  const [editingOpportunity, setEditingOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    eventName: "",
    date: "",
    chapter: "",
    sdgs: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    try {
      const data = await apiRequest("GET", "/api/volunteer-opportunities");
      setOpportunities(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load volunteer opportunities",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingOpportunity(null);
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
    setFormData({
      eventName: opportunity.eventName,
      date: format(new Date(opportunity.date), "yyyy-MM-dd"),
      chapter: opportunity.chapter,
      sdgs: opportunity.sdgs,
      contactName: opportunity.contactName,
      contactPhone: opportunity.contactPhone,
      contactEmail: opportunity.contactEmail || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const submitData = {
        ...formData,
        date: new Date(formData.date).toISOString(),
        contactEmail: formData.contactEmail || undefined,
      };

      if (editingOpportunity) {
        await apiRequest("PUT", `/api/volunteer-opportunities/${editingOpportunity.id}`, submitData);
        toast({
          title: "Success",
          description: "Volunteer opportunity updated successfully",
        });
      } else {
        await apiRequest("POST", "/api/volunteer-opportunities", submitData);
        toast({
          title: "Success",
          description: "Volunteer opportunity created successfully",
        });
      }
      setIsDialogOpen(false);
      fetchOpportunities();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save volunteer opportunity",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this volunteer opportunity?")) return;

    try {
      await apiRequest("DELETE", `/api/volunteer-opportunities/${id}`);
      toast({
        title: "Success",
        description: "Volunteer opportunity deleted successfully",
      });
      fetchOpportunities();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete volunteer opportunity",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
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
              {opportunities.map((opportunity) => (
                <Card key={opportunity.id} className="hover-elevate transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
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
              ))}
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
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} data-testid="button-save-volunteer">
                {saving ? "Saving..." : "Save Opportunity"}
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
