import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, Edit, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Chapter } from "@shared/schema";

export default function ChaptersManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    contact: "",
    email: "",
    representative: "",
    photo: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchChapters();
  }, []);

  const fetchChapters = async () => {
    try {
      const data = await apiRequest("GET", "/api/chapters");
      setChapters(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load chapters",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingChapter(null);
    setFormData({
      name: "",
      location: "",
      contact: "",
      email: "",
      representative: "",
      photo: "",
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
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const submitData = {
        ...formData,
        email: formData.email || undefined,
        representative: formData.representative || undefined,
        photo: formData.photo || undefined,
      };

      if (editingChapter) {
        await apiRequest("PUT", `/api/chapters/${editingChapter.id}`, submitData);
        toast({
          title: "Success",
          description: "Chapter updated successfully",
        });
      } else {
        await apiRequest("POST", "/api/chapters", submitData);
        toast({
          title: "Success",
          description: "Chapter created successfully",
        });
      }
      setIsDialogOpen(false);
      fetchChapters();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save chapter",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this chapter?")) return;

    try {
      await apiRequest("DELETE", `/api/chapters/${id}`);
      toast({
        title: "Success",
        description: "Chapter deleted successfully",
      });
      fetchChapters();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete chapter",
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
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} data-testid="button-save-chapter">
                {saving ? "Saving..." : "Save Chapter"}
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
