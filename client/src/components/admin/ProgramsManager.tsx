import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LoadingState from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Edit, Plus, ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Program } from "@shared/schema";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  extractDriveFileId,
  getDisplayImageUrl,
  resetImageFallback,
} from "@/lib/driveUtils";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

export default function ProgramsManager() {
  const INITIAL_VISIBLE_PROGRAMS = 6;
  const CARD_ANIMATION_MS = 220;

  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [visibleProgramsCount, setVisibleProgramsCount] = useState(INITIAL_VISIBLE_PROGRAMS);
  const [animatedFromIndex, setAnimatedFromIndex] = useState<number | null>(null);
  const [isCollapsingPrograms, setIsCollapsingPrograms] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    fullDescription: "",
    image: "",
  });
  const [linkError, setLinkError] = useState("");

  const { data: programs = [], isLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"]
  });

  const visiblePrograms = programs.slice(0, visibleProgramsCount);
  const hasMorePrograms = visibleProgramsCount < programs.length;
  const canCollapsePrograms = programs.length > INITIAL_VISIBLE_PROGRAMS;
  const isProgramsExpanded = visibleProgramsCount > INITIAL_VISIBLE_PROGRAMS;
  const remainingPrograms = Math.max(programs.length - visibleProgramsCount, 0);

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
    setEditingProgram(null);
    setFormData({
      title: "",
      description: "",
      fullDescription: "",
      image: "",
    });
    setLinkError("");
    setIsDialogOpen(true);
  };

  const handleEdit = (program: Program) => {
    setEditingProgram(program);
    setFormData({
      title: program.title,
      description: program.description,
      fullDescription: program.fullDescription,
      image: program.image,
    });
    setLinkError("");
    setIsDialogOpen(true);
  };

  const handleImageLinkChange = (value: string) => {
    setFormData({ ...formData, image: value });
    if (value && value.includes("drive.google.com")) {
      const fileId = extractDriveFileId(value);
      if (!fileId) {
        setLinkError("Invalid Google Drive link format");
      } else {
        setLinkError("");
      }
    } else if (value) {
      setLinkError("");
    } else {
      setLinkError("");
    }
  };

  const previewUrl = getDisplayImageUrl(formData.image);

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/programs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      toast({
        title: "Success",
        description: "Program created successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create program",
        variant: "destructive",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof formData }) => 
      apiRequest("PUT", `/api/programs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      toast({
        title: "Success",
        description: "Program updated successfully",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update program",
        variant: "destructive",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/programs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programs"] });
      toast({
        title: "Success",
        description: "Program deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete program",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProgram) {
      updateMutation.mutate({ id: editingProgram.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDelete("Are you sure you want to delete this program?"))) return;
    deleteMutation.mutate(id);
  };

  const handleOpenDetails = (program: Program) => {
    setSelectedProgram(program);
  };

  const handleShowMorePrograms = () => {
    if (isCollapsingPrograms || !hasMorePrograms) {
      return;
    }

    setAnimatedFromIndex(visibleProgramsCount);
    setVisibleProgramsCount((prev) => Math.min(prev + INITIAL_VISIBLE_PROGRAMS, programs.length));
  };

  const handleHidePrograms = () => {
    if (!isProgramsExpanded || isCollapsingPrograms) {
      return;
    }

    setIsCollapsingPrograms(true);
    window.setTimeout(() => {
      setVisibleProgramsCount(INITIAL_VISIBLE_PROGRAMS);
      setIsCollapsingPrograms(false);
    }, CARD_ANIMATION_MS);
  };

  if (isLoading) {
    return <LoadingState label="Loading programs..." rows={3} compact />;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle>Programs</CardTitle>
              <CardDescription>Manage your organization's programs</CardDescription>
            </div>
            <Button onClick={handleAdd} data-testid="button-add-program">
              <Plus className="h-4 w-4 mr-2" />
              Add Program
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <p className="text-muted-foreground">No programs yet. Add your first program!</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visiblePrograms.map((program, index) => {
                const thumbUrl = getDisplayImageUrl(program.image);
                return (
                  <Card
                    key={program.id}
                    className={`hover-elevate transition-all cursor-pointer h-[18.5rem] overflow-hidden ${
                      animatedFromIndex !== null && index >= animatedFromIndex ? "admin-card-enter" : ""
                    } ${isCollapsingPrograms && index >= INITIAL_VISIBLE_PROGRAMS ? "admin-card-exit" : ""}`}
                    onClick={() => handleOpenDetails(program)}
                    data-testid={`card-program-admin-${program.id}`}
                  >
                    <CardContent className="p-4 h-full flex flex-col gap-3">
                      <div className="h-32 rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                          {thumbUrl ? (
                            <img 
                              src={thumbUrl} 
                              alt={program.title} 
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onLoad={(event) => {
                                resetImageFallback(event.currentTarget);
                              }}
                              onError={(event) => {
                                applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC);
                              }}
                            />
                          ) : (
                            <ImageOff className="h-8 w-8 text-muted-foreground" />
                          )}
                      </div>
                      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                        <h3 className="font-semibold text-base leading-tight break-words line-clamp-2">
                          {program.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2 break-words whitespace-pre-wrap line-clamp-3">
                          {program.description}
                        </p>
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
                            onClick={() => handleEdit(program)}
                            data-testid={`button-edit-program-${program.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => handleDelete(program.id)}
                            data-testid={`button-delete-program-${program.id}`}
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

              {canCollapsePrograms && (
                <div className="mt-4 flex justify-center">
                  <div className="flex items-center gap-2">
                    {hasMorePrograms && (
                      <Button
                        variant="outline"
                        onClick={handleShowMorePrograms}
                        disabled={isCollapsingPrograms}
                        data-testid="button-show-more-programs"
                      >
                        {`Show More (${Math.min(INITIAL_VISIBLE_PROGRAMS, remainingPrograms)} next)`}
                      </Button>
                    )}
                    {isProgramsExpanded && (
                      <Button
                        variant="ghost"
                        onClick={handleHidePrograms}
                        disabled={isCollapsingPrograms}
                        data-testid="button-hide-programs"
                      >
                        {isCollapsingPrograms ? "Hiding..." : "Hide"}
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
              {editingProgram ? "Edit Program" : "Add New Program"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Program Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                data-testid="input-program-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Short Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                rows={2}
                data-testid="input-program-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullDescription">Full Description</Label>
              <Textarea
                id="fullDescription"
                value={formData.fullDescription}
                onChange={(e) => setFormData({ ...formData, fullDescription: e.target.value })}
                required
                rows={4}
                data-testid="input-program-full-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Google Drive Photo Link</Label>
              <Input
                id="image"
                value={formData.image}
                onChange={(e) => handleImageLinkChange(e.target.value)}
                placeholder="https://drive.google.com/file/d/FILE_ID/view"
                data-testid="input-program-image"
              />
              <p className="text-xs text-muted-foreground">
                Paste a Google Drive sharing link or any direct image URL
              </p>
              {linkError && (
                <p className="text-xs text-destructive" data-testid="text-link-error">{linkError}</p>
              )}
              {previewUrl && !linkError && (
                <div className="mt-2 rounded-md overflow-hidden border bg-muted">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full max-h-[260px] object-contain"
                    onLoad={(event) => {
                      resetImageFallback(event.currentTarget);
                    }}
                    onError={(event) => {
                      if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                        event.currentTarget.style.display = "none";
                      }
                    }}
                    data-testid="img-program-preview"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending || !!linkError} 
                data-testid="button-save-program"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Program"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-program"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedProgram} onOpenChange={(open) => !open && setSelectedProgram(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProgram?.title}</DialogTitle>
          </DialogHeader>
          {selectedProgram && (
            <div className="space-y-4">
              <div className="rounded-md overflow-hidden border bg-muted">
                {selectedProgram.image ? (
                  <img
                    src={getDisplayImageUrl(selectedProgram.image)}
                    alt={selectedProgram.title}
                    className="w-full max-h-[320px] object-contain"
                    loading="lazy"
                    decoding="async"
                    onLoad={(event) => {
                      resetImageFallback(event.currentTarget);
                    }}
                    onError={(event) => {
                      applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC);
                    }}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    <ImageOff className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Short Description</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {selectedProgram.description}
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Full Details</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {selectedProgram.fullDescription || selectedProgram.description}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
