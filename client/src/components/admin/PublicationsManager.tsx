import { useEffect, useState } from "react";
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
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  resetImageFallback,
} from "@/lib/driveUtils";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

export default function PublicationsManager() {
  const INITIAL_VISIBLE_PUBLICATIONS = 6;
  const CARD_ANIMATION_MS = 220;

  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [visiblePublicationsCount, setVisiblePublicationsCount] = useState(INITIAL_VISIBLE_PUBLICATIONS);
  const [animatedFromIndex, setAnimatedFromIndex] = useState<number | null>(null);
  const [isCollapsingPublications, setIsCollapsingPublications] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [fallbackImages, setFallbackImages] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    photoUrl: "",
    facebookLink: "",
  });

  const getPublicationPhotoUrl = (publication: Publication & { imageUrl?: string | null }) => {
    const raw = publication.photoUrl || publication.imageUrl || "";
    return getDisplayImageUrl(raw.trim());
  };

  const previewUrl = getDisplayImageUrl(formData.photoUrl.trim());

  const { data: publications = [], isLoading } = useQuery<Publication[]>({
    queryKey: ["/api/publications"]
  });

  const visiblePublications = publications.slice(0, visiblePublicationsCount);
  const hasMorePublications = visiblePublicationsCount < publications.length;
  const canCollapsePublications = publications.length > INITIAL_VISIBLE_PUBLICATIONS;
  const isPublicationsExpanded = visiblePublicationsCount > INITIAL_VISIBLE_PUBLICATIONS;
  const remainingPublications = Math.max(publications.length - visiblePublicationsCount, 0);

  useEffect(() => {
    if (animatedFromIndex === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setAnimatedFromIndex(null);
    }, CARD_ANIMATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [animatedFromIndex]);

  const handleAdd = () => {
    setEditingPublication(null);
    setFormData({
      title: "",
      content: "",
      photoUrl: "",
      facebookLink: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (publication: Publication) => {
    setEditingPublication(publication);
    setFormData({
      title: publication.title,
      content: publication.content,
      photoUrl: (publication.photoUrl || (publication as Publication & { imageUrl?: string | null }).imageUrl || "").trim(),
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
      setFormData({ ...formData, photoUrl: data.url });
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
    if (!(await confirmDelete("Are you sure you want to delete this publication?"))) return;
    deleteMutation.mutate(id);
  };

  const handleOpenDetails = (publication: Publication) => {
    setSelectedPublication(publication);
  };

  const handleShowMorePublications = () => {
    if (isCollapsingPublications || !hasMorePublications) {
      return;
    }

    setAnimatedFromIndex(visiblePublicationsCount);
    setVisiblePublicationsCount((prev) => Math.min(prev + INITIAL_VISIBLE_PUBLICATIONS, publications.length));
  };

  const handleHidePublications = () => {
    if (!isPublicationsExpanded || isCollapsingPublications) {
      return;
    }

    setIsCollapsingPublications(true);
    window.setTimeout(() => {
      setVisiblePublicationsCount(INITIAL_VISIBLE_PUBLICATIONS);
      setIsCollapsingPublications(false);
    }, CARD_ANIMATION_MS);
  };

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading publications">
        <div className="h-5 w-56 rounded-md bg-muted skeleton-shimmer" />
        <div className="h-24 w-full rounded-lg bg-muted skeleton-shimmer" />
        <div className="h-24 w-full rounded-lg bg-muted skeleton-shimmer" />
      </div>
    );
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
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visiblePublications.map((publication, index) => {
                const publicationPhotoUrl = getPublicationPhotoUrl(publication as Publication & { imageUrl?: string | null });
                const usesFallbackImage = Boolean(fallbackImages[publication.id]);
                const hasImageError = Boolean(failedImages[publication.id]);
                const cardImageSrc = hasImageError
                  ? ""
                  : usesFallbackImage
                    ? DEFAULT_IMAGE_FALLBACK_SRC
                    : publicationPhotoUrl;

                return (
                <Card
                  key={publication.id}
                  className={`hover-elevate transition-all cursor-pointer h-[20rem] overflow-hidden ${
                    animatedFromIndex !== null && index >= animatedFromIndex ? "admin-card-enter" : ""
                  } ${isCollapsingPublications && index >= INITIAL_VISIBLE_PUBLICATIONS ? "admin-card-exit" : ""}`}
                  onClick={() => handleOpenDetails(publication)}
                  data-testid={`card-publication-admin-${publication.id}`}
                >
                  <CardContent className="p-4 h-full flex flex-col gap-3">
                    <div className="h-32 rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                      {cardImageSrc ? (
                        <img 
                          src={cardImageSrc}
                          alt={publication.title} 
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onLoad={(event) => {
                            resetImageFallback(event.currentTarget);
                          }}
                          onError={(event) => {
                            if (!usesFallbackImage && applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                              setFallbackImages((prev) => ({ ...prev, [publication.id]: true }));
                              return;
                            }

                            setFailedImages((prev) => ({ ...prev, [publication.id]: true }));
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-muted rounded-md flex items-center justify-center">
                          <Image className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                        <h3 className="font-semibold text-base leading-tight break-words line-clamp-2">{publication.title}</h3>
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap break-words line-clamp-3">
                          {publication.content}
                        </p>
                        <div className="flex items-center gap-3 mt-2 overflow-hidden">
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(publication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                          {publication.facebookLink && (
                            <a 
                              href={publication.facebookLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                            >
                              <Facebook className="h-3 w-3" />
                              View on Facebook
                            </a>
                          )}
                        </div>
                    </div>
                    <div
                      className="mt-auto pt-2 border-t flex items-center justify-between gap-2 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs text-primary">View details</span>
                      <div className="flex gap-2">
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
                );
                })}
              </div>

              {canCollapsePublications && (
                <div className="mt-4 flex justify-center">
                  <div className="flex items-center gap-2">
                    {hasMorePublications && (
                      <Button
                        variant="outline"
                        onClick={handleShowMorePublications}
                        disabled={isCollapsingPublications}
                        data-testid="button-show-more-publications"
                      >
                        {`Show More (${Math.min(INITIAL_VISIBLE_PUBLICATIONS, remainingPublications)} next)`}
                      </Button>
                    )}
                    {isPublicationsExpanded && (
                      <Button
                        variant="ghost"
                        onClick={handleHidePublications}
                        disabled={isCollapsingPublications}
                        data-testid="button-hide-publications"
                      >
                        {isCollapsingPublications ? "Hiding..." : "Hide"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
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
                    value={formData.photoUrl}
                    onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                    placeholder="Paste image URL"
                    data-testid="input-publication-image-url"
                  />
                </div>
              </div>
              {isUploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
              {previewUrl && (
                <div className="mt-2">
                  <img 
                    src={previewUrl}
                    alt="Preview" 
                    className="max-w-xs h-32 object-cover rounded-md"
                    onLoad={(event) => {
                      resetImageFallback(event.currentTarget);
                    }}
                    onError={(event) => {
                      if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                        event.currentTarget.style.display = "none";
                      }
                    }}
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

      <Dialog open={!!selectedPublication} onOpenChange={(open) => !open && setSelectedPublication(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPublication?.title}</DialogTitle>
          </DialogHeader>
          {selectedPublication && (
            <div className="space-y-4">
              <div className="rounded-md overflow-hidden border bg-muted">
                {(() => {
                  const selectedPhotoUrl = getPublicationPhotoUrl(selectedPublication as Publication & { imageUrl?: string | null });
                  const selectedUsesFallback = Boolean(fallbackImages[selectedPublication.id]);
                  const selectedImageError = Boolean(failedImages[selectedPublication.id]);
                  const selectedImageSrc = selectedImageError
                    ? ""
                    : selectedUsesFallback
                      ? DEFAULT_IMAGE_FALLBACK_SRC
                      : selectedPhotoUrl;

                  if (!selectedImageSrc) {
                    return (
                      <div className="h-48 flex items-center justify-center text-muted-foreground">
                        <Image className="h-8 w-8" />
                      </div>
                    );
                  }

                  return (
                  <img
                    src={selectedImageSrc}
                    alt={selectedPublication.title}
                    className="w-full max-h-[320px] object-contain"
                    loading="lazy"
                    decoding="async"
                    onLoad={(event) => {
                      resetImageFallback(event.currentTarget);
                    }}
                    onError={(event) => {
                      if (!selectedUsesFallback && applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                        setFallbackImages((prev) => ({ ...prev, [selectedPublication.id]: true }));
                        return;
                      }

                      setFailedImages((prev) => ({ ...prev, [selectedPublication.id]: true }));
                    }}
                  />
                  );
                })()}
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(selectedPublication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
                {selectedPublication.facebookLink && (
                  <a
                    href={selectedPublication.facebookLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Facebook className="h-3 w-3" />
                    View on Facebook
                  </a>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Full Details</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {selectedPublication.content}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
