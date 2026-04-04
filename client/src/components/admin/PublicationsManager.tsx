import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PublicationsManagerSkeleton from "@/components/admin/PublicationsManagerSkeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Edit, Plus, Calendar, Facebook, Image, CheckCircle2, X, Search, FilterX, Eye, EyeOff, ArrowUp, ArrowDown, XCircle, GripVertical, RotateCcw } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PublicationsAnalyticsPanel from "@/components/admin/PublicationsAnalyticsPanel";
import type { Chapter, Publication } from "@shared/schema";
import { format } from "date-fns";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  resetImageFallback,
} from "@/lib/driveUtils";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

type PublicationListItem = Publication & { chapterName?: string | null; imageUrl?: string | null };

export default function PublicationsManager() {
  const ADMIN_PUBLICATIONS_QUERY_KEY = "/api/publications?includeAll=true";
  const CHAPTER_FILTER_ALL = "all";
  const CHAPTER_FILTER_NONE = "none";

  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [pendingSearchTerm, setPendingSearchTerm] = useState("");
  const [approvedSearchTerm, setApprovedSearchTerm] = useState("");
  const [pendingChapterFilter, setPendingChapterFilter] = useState(CHAPTER_FILTER_ALL);
  const [approvedChapterFilter, setApprovedChapterFilter] = useState(CHAPTER_FILTER_ALL);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [draggingPublicationId, setDraggingPublicationId] = useState<string | null>(null);
  const [dragOverPublicationId, setDragOverPublicationId] = useState<string | null>(null);
  const lastApprovedDragClientYRef = useRef<number | null>(null);
  const lastApprovedDragAtRef = useRef<number>(0);
  const approvedAutoScrollFrameRef = useRef<number | null>(null);
  const [rejectingPublication, setRejectingPublication] = useState<Publication | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [fallbackImages, setFallbackImages] = useState<Record<string, boolean>>({});
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [uploadedPhotoPreviewUrl, setUploadedPhotoPreviewUrl] = useState("");
  const [selectedImageSource, setSelectedImageSource] = useState<"upload" | "url" | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    photoUrl: "",
    facebookLink: "",
  });

  const getPublicationPhotoUrl = (publication: PublicationListItem) => {
    const raw = publication.photoUrl || publication.imageUrl || "";
    return getDisplayImageUrl(raw.trim());
  };

  const selectedPhotoUrlRaw = selectedImageSource === "upload" ? uploadedPhotoPreviewUrl : formData.photoUrl;
  const previewUrl = getDisplayImageUrl(selectedPhotoUrlRaw.trim());

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const {
    data: publications = [],
    isLoading: publicationsLoading,
    isFetched: publicationsFetched,
  } = useQuery<Publication[]>({
    queryKey: [ADMIN_PUBLICATIONS_QUERY_KEY],
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  const isDashboardDataLoading =
    chaptersLoading ||
    !chaptersFetched ||
    publicationsLoading ||
    !publicationsFetched;

  const chapterNameById = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter.name])),
    [chapters],
  );

  const getPublicationChapterName = (publication: PublicationListItem) => {
    const explicitChapterName = publication.chapterName?.trim();
    if (explicitChapterName) return explicitChapterName;
    if (!publication.chapterId) return "National / Unassigned";
    return chapterNameById.get(publication.chapterId) || "Unknown Chapter";
  };

  const matchesSearch = (publication: PublicationListItem, searchTerm: string) => {
    if (!searchTerm.trim()) return true;
    const normalizedSearch = searchTerm.toLowerCase();
    const haystack = [
      publication.title,
      publication.content,
      publication.facebookLink || "",
      getPublicationChapterName(publication),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  };

  const matchesChapterFilter = (publication: PublicationListItem, chapterFilter: string) => {
    if (chapterFilter === CHAPTER_FILTER_ALL) return true;
    if (chapterFilter === CHAPTER_FILTER_NONE) return !publication.chapterId;
    return publication.chapterId === chapterFilter;
  };

  const formatCountLabel = (visibleCount: number, totalCount: number) =>
    visibleCount === totalCount ? String(totalCount) : `${visibleCount} / ${totalCount}`;

  const getPublicationModerationStatus = (publication: PublicationListItem | Publication) => {
    if (publication.isApproved) return "approved" as const;
    if (publication.isRejected) return "rejected" as const;
    return "pending" as const;
  };

  const sortApprovedPublicationsForShowcase = (items: PublicationListItem[]) => {
    return [...items].sort((left, right) => {
      const leftOrder = typeof left.showcaseOrder === "number" ? left.showcaseOrder : Number.POSITIVE_INFINITY;
      const rightOrder = typeof right.showcaseOrder === "number" ? right.showcaseOrder : Number.POSITIVE_INFINITY;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const leftPublishedAt = new Date(left.publishedAt).getTime();
      const rightPublishedAt = new Date(right.publishedAt).getTime();

      if (leftPublishedAt !== rightPublishedAt) {
        return rightPublishedAt - leftPublishedAt;
      }

      return left.id.localeCompare(right.id);
    });
  };

  const pendingPublications = (publications as PublicationListItem[]).filter(
    (publication) => getPublicationModerationStatus(publication) === "pending",
  );
  const rejectedPublications = (publications as PublicationListItem[]).filter(
    (publication) => getPublicationModerationStatus(publication) === "rejected",
  );
  const approvedPublications = sortApprovedPublicationsForShowcase(
    (publications as PublicationListItem[]).filter(
      (publication) => getPublicationModerationStatus(publication) === "approved",
    ),
  );

  const filteredPendingPublications = pendingPublications.filter(
    (publication) =>
      matchesSearch(publication, pendingSearchTerm) &&
      matchesChapterFilter(publication, pendingChapterFilter),
  );

  const filteredApprovedPublications = approvedPublications.filter(
    (publication) =>
      matchesSearch(publication, approvedSearchTerm) &&
      matchesChapterFilter(publication, approvedChapterFilter),
  );

  const hasPendingFilters = pendingSearchTerm.trim().length > 0 || pendingChapterFilter !== CHAPTER_FILTER_ALL;
  const hasApprovedFilters = approvedSearchTerm.trim().length > 0 || approvedChapterFilter !== CHAPTER_FILTER_ALL;
  const approvedPublicationOrderIds = approvedPublications.map((publication) => publication.id);
  const approvedPublicationIndexById = useMemo(
    () => new Map(approvedPublicationOrderIds.map((publicationId, index) => [publicationId, index])),
    [approvedPublicationOrderIds],
  );

  const invalidatePublicationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
    queryClient.invalidateQueries({ queryKey: [ADMIN_PUBLICATIONS_QUERY_KEY] });
  };

  const clearPublicationImageState = (publicationId: string) => {
    setFailedImages((prev) => {
      if (!prev[publicationId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[publicationId];
      return next;
    });

    setFallbackImages((prev) => {
      if (!prev[publicationId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[publicationId];
      return next;
    });
  };

  const sortPublicationsForDashboard = (items: Publication[]) => {
    return [...items].sort(
      (left, right) => {
        if (left.isApproved && right.isApproved) {
          const leftOrder = typeof left.showcaseOrder === "number" ? left.showcaseOrder : Number.POSITIVE_INFINITY;
          const rightOrder = typeof right.showcaseOrder === "number" ? right.showcaseOrder : Number.POSITIVE_INFINITY;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
        }

        return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
      },
    );
  };

  const upsertPublicationInCache = (publication: Publication) => {
    const upsert = (items: Publication[] = []) =>
      sortPublicationsForDashboard([publication, ...items.filter((item) => item.id !== publication.id)]);

    queryClient.setQueryData<Publication[]>([ADMIN_PUBLICATIONS_QUERY_KEY], upsert);

    if (publication.isApproved && !publication.isHidden) {
      queryClient.setQueryData<Publication[]>(["/api/publications"], upsert);
    } else {
      queryClient.setQueryData<Publication[]>(["/api/publications"], (items: Publication[] = []) =>
        items.filter((item) => item.id !== publication.id),
      );
    }

    clearPublicationImageState(publication.id);
  };

  const removePublicationFromCache = (publicationId: string) => {
    const remove = (items: Publication[] = []) => items.filter((item) => item.id !== publicationId);

    queryClient.setQueryData<Publication[]>([ADMIN_PUBLICATIONS_QUERY_KEY], remove);
    queryClient.setQueryData<Publication[]>(["/api/publications"], remove);
    clearPublicationImageState(publicationId);
  };

  const revokeObjectUrl = (url: string) => {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const clearSelectedUpload = () => {
    revokeObjectUrl(uploadedPhotoPreviewUrl);
    setSelectedPhotoFile(null);
    setUploadedPhotoPreviewUrl("");
  };

  const uploadSelectedImage = async () => {
    if (selectedImageSource !== "upload") {
      return formData.photoUrl.trim();
    }

    if (!selectedPhotoFile) {
      return "";
    }

    setIsUploading(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("image", selectedPhotoFile);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      const uploadedUrl = typeof data?.url === "string" ? data.url.trim() : "";

      if (!uploadedUrl) {
        throw new Error("Upload URL missing");
      }

      return uploadedUrl;
    } finally {
      setIsUploading(false);
    }
  };

  const handleAdd = () => {
    setEditingPublication(null);
    clearSelectedUpload();
    setSelectedImageSource(null);
    setFormData({
      title: "",
      content: "",
      photoUrl: "",
      facebookLink: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (publication: Publication) => {
    const publicationPhotoUrl =
      (publication.photoUrl || (publication as Publication & { imageUrl?: string | null }).imageUrl || "").trim();

    setEditingPublication(publication);
    clearSelectedUpload();
    setSelectedImageSource(publicationPhotoUrl ? "url" : null);
    setFormData({
      title: publication.title,
      content: publication.content,
      photoUrl: publicationPhotoUrl,
      facebookLink: publication.facebookLink || "",
    });
    setIsDialogOpen(true);
  };

  const handlePhotoUrlChange = (value: string) => {
    setFormData((prev) => ({ ...prev, photoUrl: value }));
    if (value.trim()) {
      setSelectedImageSource("url");
      return;
    }

    setSelectedImageSource(uploadedPhotoPreviewUrl.trim() ? "upload" : null);
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

    clearSelectedUpload();
    const previewObjectUrl = URL.createObjectURL(file);
    setSelectedPhotoFile(file);
    setUploadedPhotoPreviewUrl(previewObjectUrl);
    setSelectedImageSource("upload");

    toast({
      title: "Image selected",
      description: "Image will upload only when you press Save Publication",
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/publications", data),
    onSuccess: (createdPublication: Publication) => {
      upsertPublicationInCache(createdPublication);
      invalidatePublicationQueries();
      clearSelectedUpload();
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
    onSuccess: (updatedPublication: Publication) => {
      upsertPublicationInCache(updatedPublication);
      setSelectedPublication((current) =>
        current && current.id === updatedPublication.id ? updatedPublication : current,
      );
      invalidatePublicationQueries();
      clearSelectedUpload();
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
    onSuccess: (_, deletedId) => {
      removePublicationFromCache(deletedId);
      setSelectedPublication((current) => (current?.id === deletedId ? null : current));
      setEditingPublication((current) => {
        if (current?.id !== deletedId) {
          return current;
        }

        setIsDialogOpen(false);
        clearSelectedUpload();
        return null;
      });
      invalidatePublicationQueries();
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

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/publications/${id}/approve`, {}),
    onSuccess: (updatedPublication: Publication) => {
      upsertPublicationInCache(updatedPublication);
      invalidatePublicationQueries();
      setSelectedPublication((current) =>
        current && current.id === updatedPublication.id ? updatedPublication : current,
      );
      toast({
        title: "Success",
        description: "Publication approved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve publication",
        variant: "destructive",
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("PATCH", `/api/publications/${id}/reject`, { reason }),
    onSuccess: (updatedPublication: Publication) => {
      upsertPublicationInCache(updatedPublication);
      invalidatePublicationQueries();
      setSelectedPublication((current) =>
        current && current.id === updatedPublication.id ? updatedPublication : current,
      );
      setRejectingPublication(null);
      setRejectReason("");
      toast({
        title: "Success",
        description: "Publication rejected",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject publication",
        variant: "destructive",
      });
    },
  });

  const undoRejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/publications/${id}/unreject`, {}),
    onSuccess: (updatedPublication: Publication) => {
      upsertPublicationInCache(updatedPublication);
      invalidatePublicationQueries();
      setSelectedPublication((current) =>
        current && current.id === updatedPublication.id ? updatedPublication : current,
      );
      toast({
        title: "Success",
        description: "Rejection removed. Publication is now pending review.",
      });
    },
    onError: (error) => {
      const rawMessage = error instanceof Error ? error.message : "Failed to undo rejection";
      const isUnauthorized = /^401:/.test(rawMessage) || /admin access required/i.test(rawMessage);
      const normalizedMessage = rawMessage.replace(/^\d{3}:\s*/, "").trim() || "Failed to undo rejection";
      toast({
        title: "Error",
        description: isUnauthorized ? "Session expired. Please log in again as Admin." : normalizedMessage,
        variant: "destructive",
      });
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
      apiRequest("PATCH", `/api/publications/${id}/visibility`, { isHidden }),
    onSuccess: (updatedPublication: Publication) => {
      upsertPublicationInCache(updatedPublication);
      setEditingPublication((current) =>
        current && current.id === updatedPublication.id ? updatedPublication : current,
      );
      setSelectedPublication((current) =>
        current && current.id === updatedPublication.id ? updatedPublication : current,
      );
      invalidatePublicationQueries();
      toast({
        title: "Success",
        description: updatedPublication.isHidden
          ? "Publication hidden from landing page"
          : "Publication is now visible on landing page",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update publication visibility",
        variant: "destructive",
      });
    },
  });

  const syncApprovedShowcaseOrderInCache = (updatedApprovedPublications: Publication[]) => {
    const updatedApprovedById = new Map(updatedApprovedPublications.map((publication) => [publication.id, publication]));

    queryClient.setQueryData<Publication[]>([ADMIN_PUBLICATIONS_QUERY_KEY], (items: Publication[] = []) => {
      const mergedItems = items.map((item) => updatedApprovedById.get(item.id) || item);
      const mergedIds = new Set(mergedItems.map((item) => item.id));
      const missingApprovedItems = updatedApprovedPublications.filter((item) => !mergedIds.has(item.id));
      return sortPublicationsForDashboard([...mergedItems, ...missingApprovedItems]);
    });

    queryClient.setQueryData<Publication[]>(["/api/publications"], () =>
      sortPublicationsForDashboard(
        updatedApprovedPublications.filter((publication) => publication.isApproved && !publication.isHidden),
      ),
    );
  };

  const buildOptimisticApprovedPublications = (orderedIds: string[]) => {
    const adminPublications = queryClient.getQueryData<Publication[]>([ADMIN_PUBLICATIONS_QUERY_KEY]) || [];
    const approvedPublicationsById = new Map(
      adminPublications.filter((publication) => publication.isApproved).map((publication) => [publication.id, publication]),
    );

    const optimisticApprovedPublications: Publication[] = [];

    for (const publicationId of orderedIds) {
      const existingPublication = approvedPublicationsById.get(publicationId);
      if (!existingPublication) {
        continue;
      }

      optimisticApprovedPublications.push({
        ...existingPublication,
        showcaseOrder: optimisticApprovedPublications.length + 1,
      });
      approvedPublicationsById.delete(publicationId);
    }

    for (const remainingPublication of sortPublicationsForDashboard(Array.from(approvedPublicationsById.values()))) {
      optimisticApprovedPublications.push({
        ...remainingPublication,
        showcaseOrder: optimisticApprovedPublications.length + 1,
      });
    }

    return optimisticApprovedPublications;
  };

  const reorderMutation = useMutation<
    Publication[],
    Error,
    string[],
    { previousAdminPublications?: Publication[]; previousPublicPublications?: Publication[] }
  >({
    mutationFn: (orderedIds: string[]) =>
      apiRequest("POST", "/api/publications/reorder", { orderedIds }) as Promise<Publication[]>,
    onMutate: async (orderedIds: string[]) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: [ADMIN_PUBLICATIONS_QUERY_KEY] }),
        queryClient.cancelQueries({ queryKey: ["/api/publications"] }),
      ]);

      const previousAdminPublications = queryClient.getQueryData<Publication[]>([ADMIN_PUBLICATIONS_QUERY_KEY]);
      const previousPublicPublications = queryClient.getQueryData<Publication[]>(["/api/publications"]);

      const optimisticApprovedPublications = buildOptimisticApprovedPublications(orderedIds);
      if (optimisticApprovedPublications.length > 0) {
        syncApprovedShowcaseOrderInCache(optimisticApprovedPublications);
      }

      return {
        previousAdminPublications,
        previousPublicPublications,
      };
    },
    onSuccess: (updatedApprovedPublications: Publication[]) => {
      if (Array.isArray(updatedApprovedPublications)) {
        syncApprovedShowcaseOrderInCache(updatedApprovedPublications);
      }
      invalidatePublicationQueries();
      toast({
        title: "Success",
        description: "Publication showcase order updated",
      });
    },
    onError: (_error, _orderedIds, context) => {
      if (context?.previousAdminPublications) {
        queryClient.setQueryData<Publication[]>([ADMIN_PUBLICATIONS_QUERY_KEY], context.previousAdminPublications);
      }
      if (context?.previousPublicPublications) {
        queryClient.setQueryData<Publication[]>(["/api/publications"], context.previousPublicPublications);
      }
      toast({
        title: "Error",
        description: "Failed to reorder publications",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const uploadedPhotoUrl = await uploadSelectedImage();
      const submissionData = {
        ...formData,
        photoUrl: uploadedPhotoUrl,
        facebookLink: formData.facebookLink.trim(),
      };

      if (editingPublication) {
        updateMutation.mutate({ id: editingPublication.id, data: submissionData });
      } else {
        createMutation.mutate(submissionData);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDelete("Are you sure you want to delete this publication?"))) return;
    deleteMutation.mutate(id);
  };

  const handleToggleVisibility = (publication: PublicationListItem) => {
    visibilityMutation.mutate({
      id: publication.id,
      isHidden: !publication.isHidden,
    });
  };

  const getApprovedDragAutoScrollDelta = (clientY: number) => {
    const viewportHeight = window.innerHeight;
    const edgeThreshold = 140;
    const maxScrollStep = 24;

    if (clientY < edgeThreshold) {
      const intensity = (edgeThreshold - clientY) / edgeThreshold;
      return -Math.max(4, Math.round(intensity * maxScrollStep));
    }

    if (clientY > viewportHeight - edgeThreshold) {
      const intensity = (clientY - (viewportHeight - edgeThreshold)) / edgeThreshold;
      return Math.max(4, Math.round(intensity * maxScrollStep));
    }

    return 0;
  };

  useEffect(() => {
    if (!draggingPublicationId) {
      lastApprovedDragClientYRef.current = null;
      lastApprovedDragAtRef.current = 0;
      if (approvedAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(approvedAutoScrollFrameRef.current);
        approvedAutoScrollFrameRef.current = null;
      }
      return;
    }

    const autoScrollTick = () => {
      const lastClientY = lastApprovedDragClientYRef.current;
      const isDragSignalFresh = Date.now() - lastApprovedDragAtRef.current < 160;

      if (lastClientY !== null && isDragSignalFresh) {
        const scrollDelta = getApprovedDragAutoScrollDelta(lastClientY);
        if (scrollDelta !== 0) {
          window.scrollBy({ top: scrollDelta, left: 0, behavior: "auto" });
        }
      }

      approvedAutoScrollFrameRef.current = window.requestAnimationFrame(autoScrollTick);
    };

    approvedAutoScrollFrameRef.current = window.requestAnimationFrame(autoScrollTick);

    return () => {
      if (approvedAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(approvedAutoScrollFrameRef.current);
        approvedAutoScrollFrameRef.current = null;
      }
    };
  }, [draggingPublicationId]);

  const resetApprovedDragState = () => {
    setDraggingPublicationId(null);
    setDragOverPublicationId(null);
    lastApprovedDragClientYRef.current = null;
    lastApprovedDragAtRef.current = 0;
  };

  const buildReorderedApprovedIds = (draggedPublicationId: string, targetPublicationId: string) => {
    const currentIds = [...approvedPublicationOrderIds];
    const draggedIndex = currentIds.indexOf(draggedPublicationId);
    const targetIndex = currentIds.indexOf(targetPublicationId);

    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
      return null;
    }

    const [movedPublicationId] = currentIds.splice(draggedIndex, 1);
    if (!movedPublicationId) {
      return null;
    }

    currentIds.splice(targetIndex, 0, movedPublicationId);
    return currentIds;
  };

  const handleApprovedDragStart = (event: React.DragEvent<HTMLElement>, publicationId: string) => {
    if (reorderMutation.isPending) {
      return;
    }

    setDraggingPublicationId(publicationId);
    setDragOverPublicationId(null);
    lastApprovedDragClientYRef.current = event.clientY;
    lastApprovedDragAtRef.current = Date.now();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", publicationId);
  };

  const handleApprovedDragOver = (event: React.DragEvent<HTMLElement>, publicationId: string) => {
    if (reorderMutation.isPending || !draggingPublicationId || draggingPublicationId === publicationId) {
      return;
    }

    event.preventDefault();
    lastApprovedDragClientYRef.current = event.clientY;
    lastApprovedDragAtRef.current = Date.now();
    event.dataTransfer.dropEffect = "move";
    if (dragOverPublicationId !== publicationId) {
      setDragOverPublicationId(publicationId);
    }
  };

  const handleApprovedDragLeave = (event: React.DragEvent<HTMLElement>, publicationId: string) => {
    if (dragOverPublicationId !== publicationId) {
      return;
    }

    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setDragOverPublicationId(null);
    }
  };

  const handleApprovedDrop = (event: React.DragEvent<HTMLElement>, publicationId: string) => {
    if (reorderMutation.isPending) {
      return;
    }

    event.preventDefault();
    const draggedPublicationId = draggingPublicationId || event.dataTransfer.getData("text/plain");

    if (!draggedPublicationId || draggedPublicationId === publicationId) {
      resetApprovedDragState();
      return;
    }

    const nextOrderIds = buildReorderedApprovedIds(draggedPublicationId, publicationId);
    resetApprovedDragState();

    if (!nextOrderIds) {
      return;
    }

    reorderMutation.mutate(nextOrderIds);
  };

  const handleApprovedDragEnd = () => {
    resetApprovedDragState();
  };

  const handleMovePublication = (publicationId: string, direction: "up" | "down") => {
    const currentIndex = approvedPublicationIndexById.get(publicationId);
    if (typeof currentIndex !== "number") {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= approvedPublicationOrderIds.length) {
      return;
    }

    const nextOrderIds = [...approvedPublicationOrderIds];
    const [movedId] = nextOrderIds.splice(currentIndex, 1);
    if (!movedId) {
      return;
    }
    nextOrderIds.splice(targetIndex, 0, movedId);
    reorderMutation.mutate(nextOrderIds);
  };

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  const openRejectDialog = (publication: Publication) => {
    setRejectingPublication(publication);
    setRejectReason(publication.rejectionReason || "");
  };

  const handleReject = () => {
    if (!rejectingPublication) {
      return;
    }

    const normalizedReason = rejectReason.trim();
    if (!normalizedReason) {
      toast({
        title: "Rejection reason required",
        description: "Please provide a reason before rejecting this publication.",
        variant: "destructive",
      });
      return;
    }

    rejectMutation.mutate({ id: rejectingPublication.id, reason: normalizedReason });
  };

  const handleOpenDetails = (publication: Publication) => {
    setSelectedPublication(publication);
  };

  if (isDashboardDataLoading) {
    return <PublicationsManagerSkeleton label="Loading publications..." />;
  }

  return (
    <>
      <Tabs defaultValue="manage" className="space-y-4" data-testid="tabs-admin-program-publications">
        <TabsList>
          <TabsTrigger value="manage" data-testid="tab-admin-publications-manage">Manage Publications</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-admin-publications-analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Programs Publication</CardTitle>
                  <CardDescription>Manage blog posts, pending publications, and approvals</CardDescription>
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
                <div className="space-y-8">
              <section className="space-y-3" data-testid="section-publications-pending">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Pending Review</h3>
                  <Badge variant="secondary">
                    {formatCountLabel(filteredPendingPublications.length, pendingPublications.length)}
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="pending-publications-search">Search</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="pending-publications-search"
                        value={pendingSearchTerm}
                        onChange={(event) => setPendingSearchTerm(event.target.value)}
                        placeholder="Search title, content, chapter"
                        className="pl-9"
                        data-testid="input-pending-publications-search"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Chapter</Label>
                    <Select value={pendingChapterFilter} onValueChange={setPendingChapterFilter}>
                      <SelectTrigger data-testid="select-pending-publications-chapter-filter">
                        <SelectValue placeholder="Filter by chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CHAPTER_FILTER_ALL}>All Chapters</SelectItem>
                        <SelectItem value={CHAPTER_FILTER_NONE}>National / Unassigned</SelectItem>
                        {chapters.map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.id}>
                            {chapter.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPendingSearchTerm("");
                        setPendingChapterFilter(CHAPTER_FILTER_ALL);
                      }}
                      disabled={!hasPendingFilters}
                      className="w-full md:w-auto"
                      data-testid="button-clear-pending-publication-filters"
                    >
                      <FilterX className="mr-2 h-4 w-4" />
                      Clear Filters
                    </Button>
                  </div>
                </div>

                {pendingPublications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No publications pending approval.</p>
                ) : filteredPendingPublications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending publications match your filters.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredPendingPublications.map((publication) => {
                    const publicationPhotoUrl = getPublicationPhotoUrl(publication);
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
                      className="hover-elevate transition-all cursor-pointer h-[20rem] overflow-hidden"
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
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="secondary">Pending Approval</Badge>
                            {(publication.resubmissionCount || 0) > 0 && (
                              <Badge variant="outline">Resubmission #{publication.resubmissionCount}</Badge>
                            )}
                            <Badge variant="outline">{getPublicationChapterName(publication)}</Badge>
                          </div>
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
                              variant="default"
                              size="icon"
                              onClick={() => handleApprove(publication.id)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-publication-${publication.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => openRejectDialog(publication)}
                              disabled={rejectMutation.isPending}
                              data-testid={`button-reject-publication-${publication.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleEdit(publication)}
                              data-testid={`button-edit-publication-${publication.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    );
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-3" data-testid="section-publications-rejected">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Rejected Publications</h3>
                  <Badge variant="destructive">{rejectedPublications.length}</Badge>
                </div>

                {rejectedPublications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rejected publications.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {rejectedPublications.map((publication) => {
                      const publicationPhotoUrl = getPublicationPhotoUrl(publication);
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
                          className="hover-elevate transition-all cursor-pointer h-[20rem] overflow-hidden border-destructive/30"
                          onClick={() => handleOpenDetails(publication)}
                          data-testid={`card-publication-rejected-${publication.id}`}
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
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge variant="destructive">Rejected</Badge>
                                {(publication.resubmissionCount || 0) > 0 && (
                                  <Badge variant="outline">Resubmission #{publication.resubmissionCount}</Badge>
                                )}
                                <Badge variant="outline">{getPublicationChapterName(publication)}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap break-words line-clamp-2">
                                {publication.rejectionReason?.trim() || "No rejection reason provided."}
                              </p>
                              <div className="flex items-center gap-3 mt-2 overflow-hidden">
                                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(publication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                                </span>
                              </div>
                            </div>
                            <div
                              className="mt-auto pt-2 border-t flex items-center justify-between gap-2 flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-primary">View details</span>
                              <div className="flex gap-2">
                                <Button
                                  variant="default"
                                  size="icon"
                                  onClick={() => handleApprove(publication.id)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-approve-rejected-publication-${publication.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => undoRejectMutation.mutate(publication.id)}
                                  disabled={undoRejectMutation.isPending}
                                  data-testid={`button-undo-reject-publication-${publication.id}`}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleEdit(publication)}
                                  data-testid={`button-edit-rejected-publication-${publication.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-3" data-testid="section-publications-approved">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Approved Publications</h3>
                    <p className="text-xs text-muted-foreground">Drag the grip icon on a card to reorder landing page showcase sequence.</p>
                  </div>
                  <Badge variant="default">
                    {formatCountLabel(filteredApprovedPublications.length, approvedPublications.length)}
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="approved-publications-search">Search</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="approved-publications-search"
                        value={approvedSearchTerm}
                        onChange={(event) => setApprovedSearchTerm(event.target.value)}
                        placeholder="Search title, content, chapter"
                        className="pl-9"
                        data-testid="input-approved-publications-search"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Chapter</Label>
                    <Select value={approvedChapterFilter} onValueChange={setApprovedChapterFilter}>
                      <SelectTrigger data-testid="select-approved-publications-chapter-filter">
                        <SelectValue placeholder="Filter by chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CHAPTER_FILTER_ALL}>All Chapters</SelectItem>
                        <SelectItem value={CHAPTER_FILTER_NONE}>National / Unassigned</SelectItem>
                        {chapters.map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.id}>
                            {chapter.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setApprovedSearchTerm("");
                        setApprovedChapterFilter(CHAPTER_FILTER_ALL);
                      }}
                      disabled={!hasApprovedFilters}
                      className="w-full md:w-auto"
                      data-testid="button-clear-approved-publication-filters"
                    >
                      <FilterX className="mr-2 h-4 w-4" />
                      Clear Filters
                    </Button>
                  </div>
                </div>

                {approvedPublications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No approved publications yet.</p>
                ) : filteredApprovedPublications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No approved publications match your filters.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredApprovedPublications.map((publication) => {
                const publicationPhotoUrl = getPublicationPhotoUrl(publication);
                const usesFallbackImage = Boolean(fallbackImages[publication.id]);
                const hasImageError = Boolean(failedImages[publication.id]);
                const approvedPublicationIndex = approvedPublicationIndexById.get(publication.id) ?? -1;
                const isFirstApproved = approvedPublicationIndex <= 0;
                const isLastApproved = approvedPublicationIndex === approvedPublicationOrderIds.length - 1;
                const isDragSource = draggingPublicationId === publication.id;
                const isDropTarget = dragOverPublicationId === publication.id && draggingPublicationId !== publication.id;
                const cardImageSrc = hasImageError
                  ? ""
                  : usesFallbackImage
                    ? DEFAULT_IMAGE_FALLBACK_SRC
                    : publicationPhotoUrl;

                return (
                <Card
                  key={publication.id}
                  className={`hover-elevate transition-all cursor-pointer h-[20rem] overflow-hidden ${isDragSource ? "opacity-60" : ""} ${isDropTarget ? "ring-2 ring-primary border-primary/60" : ""}`}
                  onClick={() => handleOpenDetails(publication)}
                  onDragOver={(event) => handleApprovedDragOver(event, publication.id)}
                  onDragLeave={(event) => handleApprovedDragLeave(event, publication.id)}
                  onDrop={(event) => handleApprovedDrop(event, publication.id)}
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
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={publication.isApproved ? "default" : "secondary"}>
                            {publication.isApproved ? "Approved" : "Pending Approval"}
                          </Badge>
                          <Badge variant="secondary">
                            Showcase #{approvedPublicationIndex + 1}
                          </Badge>
                          <Badge variant={publication.isHidden ? "secondary" : "outline"}>
                            {publication.isHidden ? "Hidden on Landing Page" : "Visible on Landing Page"}
                          </Badge>
                          <Badge variant="outline">{getPublicationChapterName(publication)}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap break-words line-clamp-3 text-justify">
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
                          draggable={!reorderMutation.isPending}
                          onDragStart={(event) => handleApprovedDragStart(event, publication.id)}
                          onDragEnd={handleApprovedDragEnd}
                          onClick={(event) => event.preventDefault()}
                          className="cursor-grab active:cursor-grabbing"
                          disabled={reorderMutation.isPending}
                          data-testid={`button-drag-publication-${publication.id}`}
                          title="Drag to reorder showcase"
                        >
                          <GripVertical className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleMovePublication(publication.id, "up")}
                          disabled={reorderMutation.isPending || isFirstApproved}
                          data-testid={`button-move-publication-up-${publication.id}`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleMovePublication(publication.id, "down")}
                          disabled={reorderMutation.isPending || isLastApproved}
                          data-testid={`button-move-publication-down-${publication.id}`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleEdit(publication)}
                          data-testid={`button-edit-publication-${publication.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
                    })}
                  </div>
                )}
              </section>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-0">
          <PublicationsAnalyticsPanel />
        </TabsContent>
      </Tabs>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            clearSelectedUpload();
            setSelectedImageSource(formData.photoUrl.trim() ? "url" : null);
          }

          setIsDialogOpen(open);
        }}
      >
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
                    type="text"
                    value={formData.photoUrl}
                    onChange={(e) => handlePhotoUrlChange(e.target.value)}
                    placeholder="Paste image URL"
                    data-testid="input-publication-image-url"
                  />
                </div>
              </div>
              {isUploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
              {selectedImageSource === "upload" && selectedPhotoFile && (
                <p className="text-xs text-muted-foreground break-all">Using selected media: {selectedPhotoFile.name}</p>
              )}
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
                type="text"
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
                disabled={
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  deleteMutation.isPending ||
                  visibilityMutation.isPending ||
                  isUploading
                }
                data-testid="button-save-publication"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Publication"}
              </Button>
              {editingPublication?.isApproved && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleToggleVisibility(editingPublication)}
                  disabled={
                    visibilityMutation.isPending ||
                    deleteMutation.isPending ||
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    isUploading
                  }
                  data-testid="button-toggle-publication-visibility-modal"
                >
                  {visibilityMutation.isPending ? (
                    "Updating..."
                  ) : editingPublication.isHidden ? (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Show on Landing Page
                    </>
                  ) : (
                    <>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Hide on Landing Page
                    </>
                  )}
                </Button>
              )}
              {editingPublication && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleDelete(editingPublication.id)}
                  disabled={
                    deleteMutation.isPending ||
                    visibilityMutation.isPending ||
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    isUploading
                  }
                  data-testid="button-delete-publication-modal"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              )}
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={deleteMutation.isPending || visibilityMutation.isPending}
                data-testid="button-cancel-publication"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectingPublication)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingPublication(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Publication</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Provide a reason so the chapter can correct and re-submit.
            </p>
            <Textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={5}
              placeholder="State the reason for rejection"
              data-testid="textarea-publication-reject-reason"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRejectingPublication(null);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                data-testid="button-confirm-publication-reject"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject Publication"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPublication} onOpenChange={(open) => !open && setSelectedPublication(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden p-0 gap-0" hideClose>
          {selectedPublication && (
            <div className="flex max-h-[85vh] flex-col">
              <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 md:px-6">
                <div className="flex items-start justify-between gap-3 pr-2">
                  <DialogTitle className="text-left break-words">{selectedPublication.title}</DialogTitle>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Close dialog">
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogClose>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-4 py-4 md:px-6 md:py-5">
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
                <Badge
                  variant={
                    selectedPublication.isApproved
                      ? "default"
                      : selectedPublication.isRejected
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {selectedPublication.isApproved
                    ? "Approved"
                    : selectedPublication.isRejected
                      ? "Rejected"
                      : "Pending Approval"}
                </Badge>
                {selectedPublication.isApproved && (
                  <Badge variant={selectedPublication.isHidden ? "secondary" : "outline"}>
                    {selectedPublication.isHidden ? "Hidden on Landing Page" : "Visible on Landing Page"}
                  </Badge>
                )}
                {(selectedPublication.resubmissionCount || 0) > 0 && (
                  <Badge variant="outline">Resubmission #{selectedPublication.resubmissionCount}</Badge>
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(selectedPublication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
                {!selectedPublication.isApproved && (
                  <Button
                    size="sm"
                    onClick={() => handleApprove(selectedPublication.id)}
                    disabled={approveMutation.isPending}
                    data-testid={`button-approve-publication-detail-${selectedPublication.id}`}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                )}
                {!selectedPublication.isRejected && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => openRejectDialog(selectedPublication)}
                    disabled={rejectMutation.isPending}
                    data-testid={`button-reject-publication-detail-${selectedPublication.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                )}
                {selectedPublication.isRejected && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => undoRejectMutation.mutate(selectedPublication.id)}
                    disabled={undoRejectMutation.isPending}
                    data-testid={`button-undo-reject-publication-detail-${selectedPublication.id}`}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Undo Reject
                  </Button>
                )}
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

              {selectedPublication.isRejected && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-destructive">Reason for rejection</p>
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {selectedPublication.rejectionReason?.trim() || "No rejection reason provided."}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-semibold">Full Details</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words text-justify">
                  {selectedPublication.content}
                </p>
              </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
