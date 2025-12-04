import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Edit, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Chapter } from "@shared/schema";

export default function ChaptersManager() {
  const { toast } = useToast();
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    contact: "",
    email: "",
    representative: "",
    photo: "",
    latitude: "",
    longitude: "",
  });

  const { data: chapters = [], isLoading } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"]
  });

  const handleAdd = () => {
    setEditingChapter(null);
    setFormData({
      name: "",
      location: "",
      contact: "",
      email: "",
      representative: "",
      photo: "",
      latitude: "",
      longitude: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (chapter: Chapter) => {
    setEditingChapter(chapter);
    setFormData({
      name: chapter.name,
      location: chapter.location,
      contact: chapter.contact,
      email: chapter.email || "",
      representative: chapter.representative || "",
      photo: chapter.photo || "",
      latitude: chapter.latitude || "",
      longitude: chapter.longitude || "",
    });
    setIsDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/chapters", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapters"] });
      toast({
        title: "Success",
        description: "Chapter created successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create chapter",
        variant: "destructive",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof formData }) =>
      apiRequest("PUT", `/api/chapters/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapters"] });
      toast({
        title: "Success",
        description: "Chapter updated successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update chapter",
        variant: "destructive",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/chapters/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapters"] });
      toast({
        title: "Success",
        description: "Chapter deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete chapter",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: Record<string, string | undefined> = {
      name: formData.name,
      location: formData.location,
      contact: formData.contact,
      email: formData.email || undefined,
      representative: formData.representative || undefined,
      photo: formData.photo || undefined,
      latitude: formData.latitude || undefined,
      longitude: formData.longitude || undefined,
    };

    if (editingChapter) {
      updateMutation.mutate({ id: editingChapter.id, data: submitData as any });
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this chapter?")) return;
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Chapters</CardTitle>
              <CardDescription>Manage YSP chapters across the Philippines</CardDescription>
            </div>
            <Button onClick={handleAdd} data-testid="button-add-chapter">
              <Plus className="h-4 w-4 mr-2" />
              Add Chapter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {chapters.length === 0 ? (
            <p className="text-muted-foreground">No chapters yet. Add your first chapter!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {chapters.map((chapter) => (
                <Card key={chapter.id} className="hover-elevate transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold">{chapter.name}</h3>
                        <p className="text-sm text-muted-foreground">{chapter.location}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEdit(chapter)}
                          data-testid={`button-edit-chapter-${chapter.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(chapter.id)}
                          data-testid={`button-delete-chapter-${chapter.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">📞 {chapter.contact}</p>
                      {chapter.email && <p className="text-muted-foreground">✉️ {chapter.email}</p>}
                      {chapter.representative && (
                        <p className="text-muted-foreground">👤 {chapter.representative}</p>
                      )}
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
              {editingChapter ? "Edit Chapter" : "Add New Chapter"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Chapter Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="YSP Manila"
                data-testid="input-chapter-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
                placeholder="Manila, Metro Manila"
                data-testid="input-chapter-location"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Contact Number</Label>
              <Input
                id="contact"
                type="tel"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                required
                placeholder="09171234567"
                data-testid="input-chapter-contact"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="manila@youthservice.ph"
                data-testid="input-chapter-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="representative">Representative Name (Optional)</Label>
              <Input
                id="representative"
                value={formData.representative}
                onChange={(e) => setFormData({ ...formData, representative: e.target.value })}
                placeholder="Juan Dela Cruz"
                data-testid="input-chapter-representative"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo">Photo URL (Optional)</Label>
              <Input
                id="photo"
                type="url"
                value={formData.photo}
                onChange={(e) => setFormData({ ...formData, photo: e.target.value })}
                placeholder="https://example.com/photo.jpg"
                data-testid="input-chapter-photo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude (for Map)</Label>
                <Input
                  id="latitude"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  placeholder="14.5995"
                  data-testid="input-chapter-latitude"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude (for Map)</Label>
                <Input
                  id="longitude"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  placeholder="120.9842"
                  data-testid="input-chapter-longitude"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              You can find coordinates using Google Maps. Right-click on a location and copy the coordinates.
            </p>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending} 
                data-testid="button-save-chapter"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Chapter"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-chapter"
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
