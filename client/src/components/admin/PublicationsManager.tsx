import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Edit, Plus, Calendar, Facebook, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Publication } from "@shared/schema";
import { format } from "date-fns";

export default function PublicationsManager() {
  const { toast } = useToast();
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    imageUrl: "",
    facebookLink: "",
  });

  const { data: publications = [], isLoading } = useQuery<Publication[]>({
    queryKey: ["/api/publications"]
  });

  const handleAdd = () => {
    setEditingPublication(null);
    setFormData({
      title: "",
      content: "",
      imageUrl: "",
      facebookLink: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (publication: Publication) => {
    setEditingPublication(publication);
    setFormData({
      title: publication.title,
      content: publication.content,
      imageUrl: publication.imageUrl || "",
      facebookLink: publication.facebookLink || "",
    });
    setIsDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const uploadFormData = new FormData();
    uploadFormData.append("image", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setFormData({ ...formData, imageUrl: data.url });
      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/publications", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      toast({
        title: "Success",
        description: "Publication created successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create publication",
        variant: "destructive",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof formData }) => 
      apiRequest("PUT", `/api/publications/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      toast({
        title: "Success",
        description: "Publication updated successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update publication",
        variant: "destructive",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/publications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
      toast({
        title: "Success",
        description: "Publication deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete publication",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPublication) {
      updateMutation.mutate({ id: editingPublication.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this publication?")) return;
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Programs Publication</CardTitle>
              <CardDescription>Manage blog posts and publications</CardDescription>
            </div>
            <Button onClick={handleAdd} data-testid="button-add-publication">
              <Plus className="h-4 w-4 mr-2" />
              Add Publication
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {publications.length === 0 ? (
            <p className="text-muted-foreground">No publications yet. Add your first publication!</p>
          ) : (
            <div className="space-y-4">
              {publications.map((publication) => (
                <Card key={publication.id} className="hover-elevate transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                      {publication.imageUrl ? (
                        <img 
                          src={publication.imageUrl} 
                          alt={publication.title} 
                          className="w-24 h-24 object-cover rounded-md flex-shrink-0"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                          <Image className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{publication.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {publication.content}
                        </p>
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(publication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                          {publication.facebookLink && (
                            <a 
                              href={publication.facebookLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Facebook className="h-3 w-3" />
                              View on Facebook
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleEdit(publication)}
                          data-testid={`button-edit-publication-${publication.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleDelete(publication.id)}
                          data-testid={`button-delete-publication-${publication.id}`}
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
              {editingPublication ? "Edit Publication" : "Add New Publication"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Enter publication title"
                data-testid="input-publication-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Write-up / Content</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                required
                rows={6}
                placeholder="Write your publication content here..."
                data-testid="input-publication-content"
              />
            </div>
            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    data-testid="input-publication-image-upload"
                  />
                </div>
                <span className="text-sm text-muted-foreground">or</span>
                <div className="flex-1 min-w-[200px]">
                  <Input
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="Paste image URL"
                    data-testid="input-publication-image-url"
                  />
                </div>
              </div>
              {isUploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
              {formData.imageUrl && (
                <div className="mt-2">
                  <img 
                    src={formData.imageUrl} 
                    alt="Preview" 
                    className="max-w-xs h-32 object-cover rounded-md"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="facebookLink">Facebook Link (Optional)</Label>
              <Input
                id="facebookLink"
                type="url"
                value={formData.facebookLink}
                onChange={(e) => setFormData({ ...formData, facebookLink: e.target.value })}
                placeholder="https://facebook.com/..."
                data-testid="input-publication-facebook-link"
              />
              <p className="text-xs text-muted-foreground">
                Link to the related Facebook post if available
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending || isUploading} 
                data-testid="button-save-publication"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Publication"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-publication"
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
