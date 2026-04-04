import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  resetImageFallback,
} from "@/lib/driveUtils";
import { formatManilaDateTime12, isPastDateTime, toManilaDateTimeInput, toManilaUtcIsoFromInput } from "@/lib/manilaTime";
import LoadingState from "@/components/ui/loading-state";
import {
  HandHeart,
  Plus,
  Calendar,
  MapPin,
  Clock,
  User,
  AlertTriangle,
  Image,
  ExternalLink,
  Eye,
  Edit,
  Trash2,
  Search,
  ListFilter,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import type { Chapter, VolunteerOpportunity } from "@shared/schema";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

const VOLUNTEER_DISCLAIMER = "Volunteers are reminded that they are responsible for their own safety and situational awareness during activities. Participation is advised for individuals 18 years old and above. Volunteers below 18 years old must submit a Parent's Consent Form prior to participation.";

type ScopeFilter = "all" | "city" | "barangay";
type StatusFilter = "all" | "open" | "done";
type AffiliationModerationFilter = "all" | VolunteerAffiliationStatus;

type VolunteerFormState = {
  eventName: string;
  date: string;
  time: string;
  venue: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  ageRequirement: string;
  description: string;
  deadlineAt: string;
  learnMoreUrl: string;
  applyUrl: string;
};

interface VolunteerOpportunityPanelProps {
  chapterId: string;
  role?: "chapter" | "barangay";
  barangayId?: string;
}

interface ChapterBarangayOption {
  id: string;
  barangayName: string;
}

interface BarangayOpportunityGroup {
  key: string;
  label: string;
  opportunities: VolunteerOpportunityRow[];
}

type VolunteerAffiliationStatus = "pending" | "approved" | "rejected";

interface VolunteerOpportunityRow extends VolunteerOpportunity {
  isAffiliatedOpportunity?: boolean;
  affiliationId?: string;
  affiliationStatus?: VolunteerAffiliationStatus;
  affiliationShowName?: boolean;
  affiliationSourceChapterId?: string;
  affiliationSourceChapterName?: string;
  affiliatedChapterIds?: string[];
  affiliatedChapterNames?: string[];
}

const EMPTY_FORM: VolunteerFormState = {
  eventName: "",
  date: "",
  time: "",
  venue: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  ageRequirement: "18+",
  description: "",
  deadlineAt: "",
  learnMoreUrl: "",
  applyUrl: "",
};

function parseCsvIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return Array.from(new Set(parts));
}

function getConnectedBarangayIds(opportunity: VolunteerOpportunity): string[] {
  const linked = parseCsvIds(opportunity.barangayIds || null);
  if (linked.length > 0) {
    return linked;
  }

  return opportunity.barangayId ? [opportunity.barangayId] : [];
}

export default function VolunteerOpportunityPanel({
  chapterId,
  role = "chapter",
  barangayId,
}: VolunteerOpportunityPanelProps) {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<VolunteerOpportunityRow | null>(null);
  const [targetScope, setTargetScope] = useState<"chapter" | "barangay">("chapter");
  const [selectedBarangayIds, setSelectedBarangayIds] = useState<string[]>([]);
  const [selectedAffiliatedChapterIds, setSelectedAffiliatedChapterIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [publicPreviewOpportunity, setPublicPreviewOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [publicPreviewFullImageUrl, setPublicPreviewFullImageUrl] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [affiliationModerationFilter, setAffiliationModerationFilter] = useState<AffiliationModerationFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCreatedOpportunityIdRef = useRef<string | null>(null);
  const [formData, setFormData] = useState<VolunteerFormState>(EMPTY_FORM);

  const selectedFilePreviewUrl = useMemo(() => {
    if (!selectedFile) {
      return "";
    }
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFilePreviewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(selectedFilePreviewUrl);
    };
  }, [selectedFilePreviewUrl]);

  const existingPhotoPreviewUrl = useMemo(() => {
    if (!editingOpportunity?.photoUrl) {
      return "";
    }
    return getDisplayImageUrl(editingOpportunity.photoUrl);
  }, [editingOpportunity?.photoUrl]);

  const activePhotoPreviewUrl = selectedFilePreviewUrl || existingPhotoPreviewUrl;

  const publicPreviewDisplayPhoto = publicPreviewOpportunity?.photoUrl
    ? getDisplayImageUrl(publicPreviewOpportunity.photoUrl)
    : "";
  const publicPreviewIsDone = publicPreviewOpportunity
    ? isPastDateTime(publicPreviewOpportunity.deadlineAt || publicPreviewOpportunity.date)
    : false;
  const publicPreviewLinkedBarangayIds = publicPreviewOpportunity
    ? getConnectedBarangayIds(publicPreviewOpportunity)
    : [];
  const publicPreviewLinkedBarangayNames = publicPreviewLinkedBarangayIds
    .map((id) => barangayNameById.get(id) || id)
    .filter((name, index, source) => source.indexOf(name) === index);
  const publicPreviewConnectionType = !publicPreviewOpportunity
    ? "city"
    : !publicPreviewOpportunity.chapterId
    ? "national"
    : publicPreviewLinkedBarangayIds.length > 0
    ? "barangay"
    : "city";
  const publicPreviewConnectionLabel = !publicPreviewOpportunity
    ? ""
    : publicPreviewConnectionType === "national"
    ? "National Chapter"
    : publicPreviewOpportunity.chapter || "Chapter";
  const publicPreviewSdgs = publicPreviewOpportunity?.sdgs
    ? publicPreviewOpportunity.sdgs
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

  const opportunitiesQueryEnabled = role === "barangay" ? Boolean(barangayId) : Boolean(chapterId);

  const {
    data: opportunities = [],
    isLoading,
    isFetched: opportunitiesFetched,
    isError: opportunitiesQueryFailed,
    error: opportunitiesQueryError,
  } = useQuery<VolunteerOpportunityRow[]>({
    queryKey: ["/api/volunteer-opportunities", role, chapterId, barangayId],
    queryFn: async () => {
      const endpoint = role === "barangay"
        ? "/api/volunteer-opportunities/by-barangay"
        : `/api/volunteer-opportunities/by-chapter?chapterId=${chapterId}`;

      console.log("[VolunteerDebug] fetch opportunities start", {
        role,
        chapterId,
        barangayId,
        endpoint,
      });

      const response = await fetch(endpoint, { credentials: "include" });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const canUseChapterFallback =
          role === "chapter" &&
          response.status === 404 &&
          errorText.includes("Volunteer opportunity not found");

        if (canUseChapterFallback) {
          console.warn("[VolunteerDebug] by-chapter endpoint returned 404; using fallback list endpoint", {
            chapterId,
            endpoint,
          });

          const fallbackResponse = await fetch("/api/volunteer-opportunities", {
            credentials: "include",
          });

          if (fallbackResponse.ok) {
            const fallbackItems = (await fallbackResponse.json()) as VolunteerOpportunityRow[];
            const chapterScoped = fallbackItems.filter((item) => item.chapterId === chapterId);
            console.log("[VolunteerDebug] fallback list success", {
              chapterId,
              totalFallbackCount: fallbackItems.length,
              chapterScopedCount: chapterScoped.length,
              chapterScopedIds: chapterScoped.slice(0, 10).map((item) => item.id),
            });
            return chapterScoped;
          }

          const fallbackErrorText = await fallbackResponse.text().catch(() => "");
          console.error("[VolunteerDebug] fallback list failed", {
            chapterId,
            status: fallbackResponse.status,
            statusText: fallbackResponse.statusText,
            errorText: fallbackErrorText,
          });
        }

        console.error("[VolunteerDebug] fetch opportunities failed", {
          role,
          chapterId,
          barangayId,
          endpoint,
          status: response.status,
          statusText: response.statusText,
          errorText,
        });
        const safeDetails = (errorText || "").trim();
        throw new Error(
          safeDetails
            ? `Failed to fetch volunteer opportunities (${response.status}): ${safeDetails}`
            : `Failed to fetch volunteer opportunities (${response.status})`,
        );
      }

      const fetched = (await response.json()) as VolunteerOpportunityRow[];
      console.log("[VolunteerDebug] fetch opportunities success", {
        role,
        chapterId,
        barangayId,
        endpoint,
        count: fetched.length,
        ids: fetched.slice(0, 10).map((item) => item.id),
      });
      return fetched;
    },
    enabled: opportunitiesQueryEnabled,
  });

  const {
    data: barangays = [],
    isLoading: barangaysLoading,
    isFetched: barangaysFetched,
  } = useQuery<ChapterBarangayOption[]>({
    queryKey: ["/api/chapters", chapterId, "barangays", "volunteer-panel"],
    queryFn: async () => {
      const response = await fetch(`/api/chapters/${chapterId}/barangays`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch barangays");
      }
      return response.json();
    },
    enabled: Boolean(chapterId),
  });

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters", "volunteer-panel", "affiliations"],
    queryFn: async () => {
      const response = await fetch("/api/chapters", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch chapters");
      }
      return response.json();
    },
    enabled: role === "chapter",
  });

  const isOpportunitiesPending = opportunitiesQueryEnabled && (!opportunitiesFetched || isLoading);
  const isBarangaysPending = Boolean(chapterId) && (!barangaysFetched || barangaysLoading);
  const isChaptersPending = role === "chapter" && (!chaptersFetched || chaptersLoading);
  const isDashboardDataLoading =
    (isOpportunitiesPending || isBarangaysPending || isChaptersPending) && !opportunitiesQueryFailed;

  const barangayNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of barangays) {
      map.set(item.id, item.barangayName);
    }
    return map;
  }, [barangays]);

  const chapterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of chapters) {
      map.set(item.id, item.name);
    }
    return map;
  }, [chapters]);

  const availableAffiliatedChapters = useMemo(() => {
    return chapters.filter((chapter) => chapter.id !== chapterId);
  }, [chapterId, chapters]);

  const selectedBarangayLabel = useMemo(() => {
    if (selectedBarangayIds.length === 0) {
      return "Select connected barangays";
    }

    const names = selectedBarangayIds
      .map((id) => barangayNameById.get(id) || id)
      .filter((name, index, source) => source.indexOf(name) === index);

    if (names.length <= 2) {
      return names.join(", ");
    }

    return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  }, [barangayNameById, selectedBarangayIds]);

  const selectedAffiliatedChapterLabel = useMemo(() => {
    if (selectedAffiliatedChapterIds.length === 0) {
      return "Select affiliated chapters (optional)";
    }

    const names = selectedAffiliatedChapterIds
      .map((id) => chapterNameById.get(id) || id)
      .filter((name, index, source) => source.indexOf(name) === index);

    if (names.length <= 2) {
      return names.join(", ");
    }

    return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  }, [chapterNameById, selectedAffiliatedChapterIds]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Error", description: "File must be under 2MB", variant: "destructive" });
      event.target.value = "";
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Error", description: "Only JPG, PNG, or WebP images allowed", variant: "destructive" });
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const resetForm = () => {
    setEditingOpportunity(null);
    setIsDialogOpen(false);
    setTargetScope(role === "chapter" ? "chapter" : "barangay");
    setSelectedBarangayIds([]);
    setSelectedAffiliatedChapterIds([]);
    setSelectedFile(null);
    setFormData(EMPTY_FORM);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openCreateDialog = () => {
    setEditingOpportunity(null);
    setTargetScope(role === "chapter" ? "chapter" : "barangay");
    setSelectedBarangayIds([]);
    setSelectedAffiliatedChapterIds([]);
    setFormData(EMPTY_FORM);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsDialogOpen(true);
  };

  const openEditDialog = (opportunity: VolunteerOpportunityRow) => {
    const connectedBarangayIds = getConnectedBarangayIds(opportunity);
    setEditingOpportunity(opportunity);
    setTargetScope(role === "chapter" && connectedBarangayIds.length > 0 ? "barangay" : "chapter");
    setSelectedBarangayIds(connectedBarangayIds);
    setSelectedAffiliatedChapterIds(opportunity.affiliatedChapterIds || []);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setFormData({
      eventName: opportunity.eventName,
      date: format(new Date(opportunity.date), "yyyy-MM-dd"),
      time: opportunity.time || "",
      venue: opportunity.venue || "",
      contactName: opportunity.contactName,
      contactPhone: opportunity.contactPhone,
      contactEmail: opportunity.contactEmail || "",
      ageRequirement: opportunity.ageRequirement || "18+",
      description: opportunity.description || "",
      deadlineAt: toManilaDateTimeInput(opportunity.deadlineAt),
      learnMoreUrl: opportunity.learnMoreUrl || "",
      applyUrl: opportunity.applyUrl || "",
    });

    setIsDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, file }: { data: VolunteerFormState; file: File | null }) => {
      const payload = new FormData();
      const deadlineAt = toManilaUtcIsoFromInput(data.deadlineAt);

      console.log("[VolunteerDebug] create submit start", {
        role,
        chapterId,
        barangayId,
        targetScope,
        selectedBarangayIds,
        hasPhoto: Boolean(file),
        eventName: data.eventName,
        date: data.date,
        time: data.time,
        venue: data.venue,
        contactName: data.contactName,
        deadlineAt,
      });

      payload.append("eventName", data.eventName);
      payload.append("date", data.date);
      payload.append("time", data.time);
      payload.append("venue", data.venue);
      payload.append("description", data.description);
      payload.append("contactName", data.contactName);
      payload.append("contactPhone", data.contactPhone);
      payload.append("ageRequirement", data.ageRequirement);
      if (data.contactEmail) payload.append("contactEmail", data.contactEmail);
      if (data.learnMoreUrl) payload.append("learnMoreUrl", data.learnMoreUrl);
      if (data.applyUrl) payload.append("applyUrl", data.applyUrl);
      if (deadlineAt) payload.append("deadlineAt", deadlineAt);

      if (role === "chapter") {
        payload.append("targetScope", targetScope);
        if (targetScope === "barangay" && selectedBarangayIds.length > 0) {
          payload.append("barangayIds", selectedBarangayIds.join(","));
          payload.append("barangayId", selectedBarangayIds[0]);
        }
        payload.append("affiliatedChapterIds", selectedAffiliatedChapterIds.join(","));
      }

      if (file) {
        payload.append("photo", file);
      }

      const endpoint = role === "barangay"
        ? "/api/volunteer-opportunities/barangay"
        : "/api/volunteer-opportunities/chapter";

      const response = await fetch(endpoint, {
        method: "POST",
        body: payload,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[VolunteerDebug] create submit failed", {
          role,
          chapterId,
          barangayId,
          endpoint,
          status: response.status,
          statusText: response.statusText,
          errorData,
        });
        throw new Error(errorData?.error || "Failed to create volunteer opportunity");
      }

      const created = (await response.json()) as VolunteerOpportunity;
      console.log("[VolunteerDebug] create submit success", {
        role,
        chapterId,
        barangayId,
        endpoint,
        createdId: created?.id,
        createdEventName: created?.eventName,
        createdChapterId: created?.chapterId,
        createdBarangayId: created?.barangayId,
        createdBarangayIds: created?.barangayIds,
      });
      return created;
    },
    onSuccess: (createdOpportunity) => {
      lastCreatedOpportunityIdRef.current = createdOpportunity?.id || null;
      console.log("[VolunteerDebug] invalidating volunteer opportunities queries after create", {
        role,
        chapterId,
        barangayId,
        createdId: createdOpportunity?.id,
      });
      toast({ title: "Success", description: "Volunteer opportunity saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities", role, chapterId, barangayId] });
      resetForm();
    },
    onError: (error: any) => {
      console.error("[VolunteerDebug] create mutation onError", {
        role,
        chapterId,
        barangayId,
        message: error?.message,
      });
      toast({ title: "Error", description: error?.message || "Failed to create volunteer opportunity", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, file }: { id: string; data: VolunteerFormState; file: File | null }) => {
      const payload = new FormData();
      const deadlineAt = toManilaUtcIsoFromInput(data.deadlineAt);

      payload.append("eventName", data.eventName);
      payload.append("date", data.date);
      payload.append("time", data.time || "TBD");
      payload.append("venue", data.venue || "TBD");
      payload.append("description", data.description);
      payload.append("contactName", data.contactName);
      payload.append("contactPhone", data.contactPhone);
      payload.append("ageRequirement", data.ageRequirement);
      if (data.contactEmail) payload.append("contactEmail", data.contactEmail);
      if (data.learnMoreUrl) payload.append("learnMoreUrl", data.learnMoreUrl);
      if (data.applyUrl) payload.append("applyUrl", data.applyUrl);
      if (deadlineAt) payload.append("deadlineAt", deadlineAt);

      if (role === "chapter") {
        payload.append("targetScope", targetScope);
        if (targetScope === "barangay" && selectedBarangayIds.length > 0) {
          payload.append("barangayIds", selectedBarangayIds.join(","));
          payload.append("barangayId", selectedBarangayIds[0]);
        }
        payload.append("affiliatedChapterIds", selectedAffiliatedChapterIds.join(","));
      }

      if (file) {
        payload.append("photo", file);
      }

      const endpoint = role === "chapter"
        ? `/api/volunteer-opportunities/chapter/${id}`
        : `/api/volunteer-opportunities/barangay/${id}`;

      const response = await fetch(endpoint, {
        method: "PUT",
        body: payload,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Failed to update volunteer opportunity");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Volunteer opportunity updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities", role, chapterId, barangayId] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update volunteer opportunity", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const endpoint = role === "chapter"
        ? `/api/volunteer-opportunities/chapter/${id}`
        : `/api/volunteer-opportunities/barangay/${id}`;

      const response = await fetch(endpoint, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Failed to delete volunteer opportunity");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Volunteer opportunity deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities", role, chapterId, barangayId] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to delete volunteer opportunity", variant: "destructive" });
    },
  });

  const reviewAffiliationMutation = useMutation({
    mutationFn: async ({
      affiliationId,
      action,
    }: {
      affiliationId: string;
      action: "approve" | "reject";
    }) => {
      const response = await fetch(`/api/volunteer-opportunities/affiliations/${affiliationId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Failed to review affiliation");
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Success",
        description:
          variables.action === "approve"
            ? "Affiliation approved. Chapter name is now visible on landing page."
            : "Affiliation rejected. Chapter name is now hidden on landing page.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities", role, chapterId, barangayId] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to review affiliation", variant: "destructive" });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    console.log("[VolunteerDebug] form submit", {
      mode: editingOpportunity ? "update" : "create",
      role,
      chapterId,
      barangayId,
      targetScope,
      selectedBarangayIds,
      selectedAffiliatedChapterIds,
      eventName: formData.eventName,
      date: formData.date,
      time: formData.time,
      venue: formData.venue,
    });

    if (!formData.eventName || !formData.date || !formData.time || !formData.venue || !formData.description || !formData.contactName || !formData.contactPhone) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (role === "chapter" && targetScope === "barangay" && selectedBarangayIds.length === 0) {
      toast({ title: "Error", description: "Please select at least one connected barangay", variant: "destructive" });
      return;
    }

    if (editingOpportunity) {
      updateMutation.mutate({ id: editingOpportunity.id, data: formData, file: selectedFile });
    } else {
      createMutation.mutate({ data: formData, file: selectedFile });
    }
  };

  const handleDelete = async (opportunity: VolunteerOpportunity) => {
    if (!(await confirmDelete(`Delete volunteer opportunity ${opportunity.eventName}?`))) {
      return;
    }

    deleteMutation.mutate(opportunity.id);
  };

  const openPublicPreview = (opportunity: VolunteerOpportunity) => {
    setPublicPreviewOpportunity(opportunity);
    setPublicPreviewFullImageUrl(null);
    console.log("[VolunteerDebug] open public preview", {
      opportunityId: opportunity.id,
      mode: "modal",
    });
  };

  const toggleBarangaySelection = (candidateId: string, checked: boolean) => {
    if (checked) {
      setSelectedBarangayIds((current) => {
        if (current.includes(candidateId)) {
          return current;
        }
        return [...current, candidateId];
      });
      return;
    }

    setSelectedBarangayIds((current) => current.filter((id) => id !== candidateId));
  };

  const toggleAffiliatedChapterSelection = (candidateId: string, checked: boolean) => {
    if (checked) {
      setSelectedAffiliatedChapterIds((current) => {
        if (current.includes(candidateId)) {
          return current;
        }
        return [...current, candidateId];
      });
      return;
    }

    setSelectedAffiliatedChapterIds((current) => current.filter((id) => id !== candidateId));
  };

  const sortedOpportunities = useMemo(() => {
    return [...opportunities].sort((left, right) => {
      const leftDate = new Date(left.deadlineAt || left.date).getTime();
      const rightDate = new Date(right.deadlineAt || right.date).getTime();
      return rightDate - leftDate;
    });
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return sortedOpportunities.filter((opportunity) => {
      const linkedBarangayIds = getConnectedBarangayIds(opportunity);
      const isBarangayTargeted = linkedBarangayIds.length > 0;
      const isDone = isPastDateTime(opportunity.deadlineAt || opportunity.date);

      if (role === "chapter") {
        if (scopeFilter === "city" && isBarangayTargeted) {
          return false;
        }
        if (scopeFilter === "barangay" && !isBarangayTargeted) {
          return false;
        }
      }

      if (statusFilter === "open" && isDone) {
        return false;
      }
      if (statusFilter === "done" && !isDone) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const targetBarangayNames = linkedBarangayIds
        .map((id) => barangayNameById.get(id) || id)
        .join(" ")
        .toLowerCase();

      const searchable = [
        opportunity.eventName,
        opportunity.chapter,
        opportunity.description || "",
        opportunity.contactName,
        opportunity.contactPhone,
        targetBarangayNames,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(keyword);
    });
  }, [barangayNameById, role, scopeFilter, searchTerm, sortedOpportunities, statusFilter]);

  const localFilteredOpportunities = useMemo(() => {
    return filteredOpportunities.filter((opportunity) => !opportunity.isAffiliatedOpportunity);
  }, [filteredOpportunities]);

  const affiliatedFilteredOpportunities = useMemo(() => {
    return filteredOpportunities.filter((opportunity) => opportunity.isAffiliatedOpportunity);
  }, [filteredOpportunities]);

  const moderatedAffiliatedOpportunities = useMemo(() => {
    if (role !== "chapter" || affiliationModerationFilter === "all") {
      return affiliatedFilteredOpportunities;
    }

    return affiliatedFilteredOpportunities.filter(
      (opportunity) => opportunity.affiliationStatus === affiliationModerationFilter,
    );
  }, [affiliatedFilteredOpportunities, affiliationModerationFilter, role]);

  const cityChapterOpportunities = useMemo(() => {
    return localFilteredOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length === 0);
  }, [localFilteredOpportunities]);

  const barangayOpportunityGroups = useMemo<BarangayOpportunityGroup[]>(() => {
    const groups = new Map<string, BarangayOpportunityGroup>();

    for (const opportunity of localFilteredOpportunities) {
      const linkedBarangayIds = getConnectedBarangayIds(opportunity);
      if (linkedBarangayIds.length === 0) {
        continue;
      }

      for (const linkedBarangayId of linkedBarangayIds) {
        const key = linkedBarangayId;
        const label = barangayNameById.get(linkedBarangayId) || `Barangay ${linkedBarangayId}`;

        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label,
            opportunities: [],
          });
        }

        groups.get(key)!.opportunities.push(opportunity);
      }
    }

    return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [barangayNameById, localFilteredOpportunities]);

  const affiliatedCityChapterOpportunities = useMemo(() => {
    return moderatedAffiliatedOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length === 0);
  }, [moderatedAffiliatedOpportunities]);

  const affiliatedBarangayOpportunities = useMemo(() => {
    return moderatedAffiliatedOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length > 0);
  }, [moderatedAffiliatedOpportunities]);

  const barangayOwnedOpportunities = useMemo(() => {
    if (!barangayId) {
      return [] as VolunteerOpportunityRow[];
    }
    return localFilteredOpportunities.filter((opportunity) => opportunity.barangayId === barangayId);
  }, [barangayId, localFilteredOpportunities]);

  const barangayConnectedFromCity = useMemo(() => {
    if (!barangayId) {
      return [] as VolunteerOpportunityRow[];
    }

    return localFilteredOpportunities.filter((opportunity) => {
      if (opportunity.barangayId === barangayId) {
        return false;
      }
      return getConnectedBarangayIds(opportunity).includes(barangayId);
    });
  }, [barangayId, localFilteredOpportunities]);

  const barangayGroupedOpportunityCount = useMemo(() => {
    return barangayOpportunityGroups.reduce((sum, group) => sum + group.opportunities.length, 0);
  }, [barangayOpportunityGroups]);

  const chapterScopedOpportunityCount = useMemo(() => {
    return filteredOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length === 0).length;
  }, [filteredOpportunities]);

  const barangayScopedOpportunityCount = useMemo(() => {
    return filteredOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length > 0).length;
  }, [filteredOpportunities]);

  const averageBarangaySharePercent = useMemo(() => {
    if (filteredOpportunities.length === 0) {
      return 0;
    }

    return Math.round((barangayScopedOpportunityCount / filteredOpportunities.length) * 100);
  }, [barangayScopedOpportunityCount, filteredOpportunities.length]);

  useEffect(() => {
    console.log("[VolunteerDebug] panel list state", {
      role,
      chapterId,
      barangayId,
      scopeFilter,
      statusFilter,
      affiliationModerationFilter,
      searchTerm,
      opportunitiesCount: opportunities.length,
      filteredCount: filteredOpportunities.length,
      localFilteredCount: localFilteredOpportunities.length,
      affiliatedFilteredCount: affiliatedFilteredOpportunities.length,
      moderatedAffiliatedCount: moderatedAffiliatedOpportunities.length,
      cityChapterCount: cityChapterOpportunities.length,
      barangayGroupedCount: barangayGroupedOpportunityCount,
      affiliatedCityCount: affiliatedCityChapterOpportunities.length,
      affiliatedBarangayCount: affiliatedBarangayOpportunities.length,
      barangayOwnedCount: barangayOwnedOpportunities.length,
      barangayConnectedFromCityCount: barangayConnectedFromCity.length,
    });

    if (!lastCreatedOpportunityIdRef.current) {
      return;
    }

    const createdId = lastCreatedOpportunityIdRef.current;
    const existsInFetched = opportunities.some((item) => item.id === createdId);
    const existsInFiltered = filteredOpportunities.some((item) => item.id === createdId);

    if (!existsInFetched) {
      console.error("[VolunteerDebug] created opportunity missing from fetched opportunities", {
        createdId,
        role,
        chapterId,
        barangayId,
      });
      return;
    }

    if (!existsInFiltered) {
      console.error("[VolunteerDebug] created opportunity is fetched but hidden by filters", {
        createdId,
        scopeFilter,
        statusFilter,
        searchTerm,
      });
      return;
    }

    console.log("[VolunteerDebug] created opportunity is visible in current view", {
      createdId,
    });
  }, [
    affiliatedBarangayOpportunities.length,
    affiliatedCityChapterOpportunities.length,
    affiliatedFilteredOpportunities.length,
    affiliationModerationFilter,
    barangayConnectedFromCity.length,
    barangayGroupedOpportunityCount,
    barangayId,
    barangayOwnedOpportunities.length,
    chapterId,
    cityChapterOpportunities.length,
    filteredOpportunities,
    localFilteredOpportunities.length,
    opportunities,
    moderatedAffiliatedOpportunities.length,
    role,
    scopeFilter,
    searchTerm,
    statusFilter,
  ]);

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reviewAffiliationMutation.isPending;

  const handleAffiliationReview = (opportunity: VolunteerOpportunityRow, action: "approve" | "reject") => {
    if (!opportunity.affiliationId) {
      return;
    }

    reviewAffiliationMutation.mutate({
      affiliationId: opportunity.affiliationId,
      action,
    });
  };

  const renderOpportunityCard = (
    opportunity: VolunteerOpportunityRow,
    options: { canManage: boolean; canReviewAffiliation?: boolean },
  ) => {
    const { canManage, canReviewAffiliation = false } = options;
    const displayPhotoUrl = opportunity.photoUrl ? getDisplayImageUrl(opportunity.photoUrl) : "";
    const linkedBarangayIds = getConnectedBarangayIds(opportunity);
    const linkedBarangayNames = linkedBarangayIds
      .map((id) => barangayNameById.get(id) || id)
      .filter((name, index, source) => source.indexOf(name) === index);
    const isDone = isPastDateTime(opportunity.deadlineAt || opportunity.date);

    return (
      <div key={opportunity.id} className="rounded-xl border bg-card/40 p-3 sm:p-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            {displayPhotoUrl && (
              <img
                src={displayPhotoUrl}
                alt={opportunity.eventName}
                className="h-14 w-14 flex-none rounded-md object-cover sm:h-16 sm:w-16"
                loading="lazy"
                decoding="async"
                onLoad={(event) => {
                  resetImageFallback(event.currentTarget);
                }}
                onError={(event) => {
                  console.error("[VolunteerDebug] card image failed to load", {
                    opportunityId: opportunity.id,
                    photoUrl: opportunity.photoUrl,
                    attemptedSrc: displayPhotoUrl,
                  });
                  if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                    event.currentTarget.style.display = "none";
                  }
                }}
              />
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <h4 className="text-sm font-semibold leading-tight break-words sm:text-base">{opportunity.eventName}</h4>
                <Badge className="max-w-full shrink-0 whitespace-normal text-center">{opportunity.ageRequirement}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={isDone ? "secondary" : "default"}>{isDone ? "Done" : "Open"}</Badge>
                {linkedBarangayIds.length > 0 ? (
                  <Badge variant="outline">Barangay Opportunity</Badge>
                ) : (
                  <Badge variant="outline">City Chapter Opportunity</Badge>
                )}
                {opportunity.isAffiliatedOpportunity && <Badge variant="secondary">Affiliated</Badge>}
                {opportunity.affiliationStatus && (
                  <Badge variant="outline">
                    Affiliation {opportunity.affiliationStatus === "approved" ? "Approved" : opportunity.affiliationStatus === "rejected" ? "Rejected" : "Pending"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-1.5 text-xs text-muted-foreground sm:text-sm">
            <p className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{format(new Date(opportunity.date), "MMM d, yyyy")}</span>
            </p>
            <p className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{opportunity.time || "TBD"}</span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{opportunity.venue || "TBD"}</span>
            </p>
            <p className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{opportunity.contactName}</span>
            </p>
          </div>

          {opportunity.deadlineAt && (
            <p className="rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              Deadline (Manila): {formatManilaDateTime12(opportunity.deadlineAt)}
            </p>
          )}

          {linkedBarangayNames.length > 0 && (
            <p className="text-xs text-muted-foreground break-words">
              Connected barangays: {linkedBarangayNames.join(", ")}
            </p>
          )}

          {opportunity.isAffiliatedOpportunity && (
            <p className="text-xs text-muted-foreground break-words">
              Source chapter: {opportunity.affiliationSourceChapterName || opportunity.chapter || "Unknown chapter"}
            </p>
          )}

          {opportunity.isAffiliatedOpportunity && opportunity.affiliationStatus && (
            <p className="text-xs text-muted-foreground break-words">
              Landing page visibility: {opportunity.affiliationStatus === "approved" && opportunity.affiliationShowName ? "Visible" : "Hidden"}
            </p>
          )}

          {opportunity.description && (
            <p className="text-sm leading-relaxed text-muted-foreground break-words">{opportunity.description}</p>
          )}

          {(opportunity.learnMoreUrl || opportunity.applyUrl) && (
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {opportunity.learnMoreUrl && (
                <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                  <a href={opportunity.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                    Learn More
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              {opportunity.applyUrl && (
                <Button asChild size="sm" className="w-full sm:w-auto">
                  <a href={opportunity.applyUrl} target="_blank" rel="noopener noreferrer">
                    Apply Here
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          )}

          {canReviewAffiliation && opportunity.affiliationId && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="default"
                size="sm"
                className="h-9"
                onClick={() => handleAffiliationReview(opportunity, "approve")}
                disabled={reviewAffiliationMutation.isPending || opportunity.affiliationStatus === "approved"}
                data-testid={`button-approve-affiliation-${opportunity.affiliationId}`}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Approve (Show Name)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => handleAffiliationReview(opportunity, "reject")}
                disabled={reviewAffiliationMutation.isPending || opportunity.affiliationStatus === "rejected"}
                data-testid={`button-reject-affiliation-${opportunity.affiliationId}`}
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Reject (Hide Name)
              </Button>
            </div>
          )}

          {canManage && (
            <div className="grid gap-2 pt-1 sm:grid-cols-3">
              <Button
                variant="secondary"
                size="sm"
                className="h-9"
                onClick={() => openPublicPreview(opportunity)}
                data-testid={`button-public-preview-opportunity-${opportunity.id}`}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Public Preview
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => openEditDialog(opportunity)}
                data-testid={`button-edit-opportunity-${opportunity.id}`}
              >
                <Edit className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-9"
                onClick={() => handleDelete(opportunity)}
                data-testid={`button-delete-opportunity-${opportunity.id}`}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandHeart className="h-5 w-5" />
          Volunteer Opportunities
        </CardTitle>
        <CardDescription>
          {role === "chapter"
            ? "Create city chapter and connected barangay opportunities."
            : "View connected opportunities and manage entries created by your barangay account."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">{VOLUNTEER_DISCLAIMER}</AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button className="w-full sm:w-auto" onClick={openCreateDialog} data-testid="button-create-opportunity">
            <Plus className="mr-2 h-4 w-4" />
            Create Volunteer Opportunity
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search event, contact, chapter, or barangay"
              className="pl-9"
              data-testid="input-volunteer-search"
            />
          </div>
          <div className={role === "chapter" ? "grid gap-2 sm:grid-cols-3 md:grid-cols-3" : "grid gap-2 sm:grid-cols-2 md:grid-cols-2"}>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger data-testid="select-volunteer-status-filter">
                <div className="flex items-center gap-2">
                  <ListFilter className="h-3.5 w-3.5" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>

            {role === "chapter" ? (
              <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
                <SelectTrigger data-testid="select-volunteer-scope-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="city">City Chapter</SelectItem>
                  <SelectItem value="barangay">Barangay</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div />
            )}

            {role === "chapter" ? (
              <Select
                value={affiliationModerationFilter}
                onValueChange={(value) => setAffiliationModerationFilter(value as AffiliationModerationFilter)}
              >
                <SelectTrigger data-testid="select-volunteer-affiliation-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Affiliations: All</SelectItem>
                  <SelectItem value="pending">Affiliations: Pending</SelectItem>
                  <SelectItem value="approved">Affiliations: Approved</SelectItem>
                  <SelectItem value="rejected">Affiliations: Rejected</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        {!isDashboardDataLoading && !opportunitiesQueryFailed && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">All Opportunities</p>
              <p className="mt-1 text-2xl font-semibold">{filteredOpportunities.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Per Chapter</p>
              <p className="mt-1 text-2xl font-semibold">{chapterScopedOpportunityCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Per Barangay</p>
              <p className="mt-1 text-2xl font-semibold">{barangayScopedOpportunityCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Average %</p>
              <p className="mt-1 text-2xl font-semibold">{averageBarangaySharePercent}%</p>
            </div>
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : resetForm())}>
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[calc(100vh-1.5rem)] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingOpportunity ? "Edit Volunteer Opportunity" : "Create Volunteer Opportunity"}</DialogTitle>
              <DialogDescription>
                {role === "chapter"
                  ? "Choose city chapter or one or more connected barangays. Multiple barangays are stored as a comma-separated list."
                  : "This entry stays linked to your barangay account."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {role === "chapter" && (
                  <>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Connect Opportunity To *</Label>
                      <Select value={targetScope} onValueChange={(value: "chapter" | "barangay") => setTargetScope(value)}>
                        <SelectTrigger data-testid="select-target-scope">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chapter">City Chapter</SelectItem>
                          <SelectItem value="barangay">Barangay</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {targetScope === "barangay" && (
                      <div className="space-y-2 md:col-span-2">
                        <Label>Select Connected Barangays *</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-between font-normal"
                              disabled={barangays.length === 0}
                              data-testid="dropdown-connected-barangays"
                            >
                              <span className="truncate text-left">{selectedBarangayLabel}</span>
                              <Badge variant="secondary">{selectedBarangayIds.length}</Badge>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-80 overflow-y-auto" align="start">
                            <DropdownMenuLabel>Select one or more barangays</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {barangays.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No active barangays found for this chapter.</div>
                            ) : (
                              barangays.map((barangayOption) => {
                                const checked = selectedBarangayIds.includes(barangayOption.id);
                                return (
                                  <DropdownMenuCheckboxItem
                                    key={barangayOption.id}
                                    checked={checked}
                                    onCheckedChange={(nextChecked) => toggleBarangaySelection(barangayOption.id, nextChecked === true)}
                                    onSelect={(event) => event.preventDefault()}
                                    data-testid={`checkbox-barangay-${barangayOption.id}`}
                                  >
                                    {barangayOption.barangayName}
                                  </DropdownMenuCheckboxItem>
                                );
                              })
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}

                    <div className="space-y-2 md:col-span-2">
                      <Label>Affiliated Chapters (optional)</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal"
                            disabled={availableAffiliatedChapters.length === 0}
                            data-testid="dropdown-affiliated-chapters"
                          >
                            <span className="truncate text-left">{selectedAffiliatedChapterLabel}</span>
                            <Badge variant="secondary">{selectedAffiliatedChapterIds.length}</Badge>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-80 overflow-y-auto" align="start">
                          <DropdownMenuLabel>Select chapters to request affiliation</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {availableAffiliatedChapters.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">No other chapters available.</div>
                          ) : (
                            availableAffiliatedChapters.map((chapterOption) => {
                              const checked = selectedAffiliatedChapterIds.includes(chapterOption.id);
                              return (
                                <DropdownMenuCheckboxItem
                                  key={chapterOption.id}
                                  checked={checked}
                                  onCheckedChange={(nextChecked) =>
                                    toggleAffiliatedChapterSelection(chapterOption.id, nextChecked === true)
                                  }
                                  onSelect={(event) => event.preventDefault()}
                                  data-testid={`checkbox-affiliated-chapter-${chapterOption.id}`}
                                >
                                  {chapterOption.name}
                                </DropdownMenuCheckboxItem>
                              );
                            })
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <p className="text-xs text-muted-foreground">
                        Selected chapters can approve or reject whether their chapter name appears on the public volunteer page.
                      </p>
                    </div>
                  </>
                )}

                <div className="space-y-2 md:col-span-2">
                  <Label>Activity Name *</Label>
                  <Input
                    value={formData.eventName}
                    onChange={(event) => setFormData({ ...formData, eventName: event.target.value })}
                    placeholder="Community Clean-up Drive"
                    data-testid="input-event-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(event) => setFormData({ ...formData, date: event.target.value })}
                    data-testid="input-event-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Time *</Label>
                  <Input
                    type="time"
                    value={formData.time}
                    onChange={(event) => setFormData({ ...formData, time: event.target.value })}
                    data-testid="input-event-time"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Venue / Place *</Label>
                  <Input
                    value={formData.venue}
                    onChange={(event) => setFormData({ ...formData, venue: event.target.value })}
                    placeholder="Barangay Hall, Quezon City"
                    data-testid="input-event-venue"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Description *</Label>
                  <Textarea
                    rows={4}
                    value={formData.description}
                    onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                    placeholder="Describe this volunteer opportunity"
                    data-testid="input-event-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contact Person *</Label>
                  <Input
                    value={formData.contactName}
                    onChange={(event) => setFormData({ ...formData, contactName: event.target.value })}
                    placeholder="Juan Dela Cruz"
                    data-testid="input-contact-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contact Phone *</Label>
                  <Input
                    value={formData.contactPhone}
                    onChange={(event) => setFormData({ ...formData, contactPhone: event.target.value })}
                    placeholder="09171234567"
                    data-testid="input-contact-phone"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contact Email (optional)</Label>
                  <Input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(event) => setFormData({ ...formData, contactEmail: event.target.value })}
                    placeholder="email@example.com"
                    data-testid="input-contact-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Age Requirement</Label>
                  <Select value={formData.ageRequirement} onValueChange={(value) => setFormData({ ...formData, ageRequirement: value })}>
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
                  <Label>Deadline (Manila time, optional)</Label>
                  <Input
                    type="datetime-local"
                    value={formData.deadlineAt}
                    onChange={(event) => setFormData({ ...formData, deadlineAt: event.target.value })}
                    data-testid="input-event-deadline"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Learn More Link (optional)</Label>
                  <Input
                    type="url"
                    value={formData.learnMoreUrl}
                    onChange={(event) => setFormData({ ...formData, learnMoreUrl: event.target.value })}
                    placeholder="https://example.com/more-info"
                    data-testid="input-learn-more-url"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Apply Here Link (optional)</Label>
                  <Input
                    type="url"
                    value={formData.applyUrl}
                    onChange={(event) => setFormData({ ...formData, applyUrl: event.target.value })}
                    placeholder="https://example.com/apply"
                    data-testid="input-apply-url"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Photo / Pubmat (optional)</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    data-testid="input-event-photo"
                  />
                  <p className="text-xs text-muted-foreground">JPG, PNG, or WebP only. Max 2MB.</p>
                  {editingOpportunity && !selectedFile && existingPhotoPreviewUrl && (
                    <p className="text-xs text-muted-foreground">No new file selected. Current image will be kept.</p>
                  )}
                  {selectedFile && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Image className="h-4 w-4" />
                      <span>Selected: {selectedFile.name}</span>
                    </div>
                  )}
                  {activePhotoPreviewUrl && (
                    <div className="space-y-2 rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">
                        {selectedFile ? "Selected image preview" : "Current image preview"}
                      </p>
                      <img
                        src={activePhotoPreviewUrl}
                        alt={selectedFile ? "Selected volunteer image" : "Current volunteer image"}
                        className="h-32 w-full rounded-md object-cover"
                        loading="lazy"
                        decoding="async"
                        onLoad={(event) => {
                          resetImageFallback(event.currentTarget);
                        }}
                        onError={(event) => {
                          console.error("[VolunteerDebug] dialog image preview failed", {
                            editingId: editingOpportunity?.id,
                            photoUrl: editingOpportunity?.photoUrl,
                            selectedFileName: selectedFile?.name,
                            attemptedSrc: activePhotoPreviewUrl,
                          });
                          if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                            event.currentTarget.style.display = "none";
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="submit" className="w-full sm:w-auto" disabled={isPending} data-testid="button-submit-opportunity">
                  {editingOpportunity ? "Save Changes" : "Create Opportunity"}
                </Button>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(publicPreviewOpportunity)}
          onOpenChange={(open) => {
            if (!open) {
              setPublicPreviewOpportunity(null);
              setPublicPreviewFullImageUrl(null);
            }
          }}
        >
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[calc(100vh-1.5rem)] max-w-3xl overflow-hidden p-0">
            <DialogHeader className="sticky top-0 z-10 border-b bg-background px-4 py-3 pr-12 sm:px-6 sm:py-4 sm:pr-14">
              <DialogTitle>{publicPreviewOpportunity?.eventName || "Public Preview"}</DialogTitle>
              <DialogDescription>
                Public preview mode: this mirrors how the opportunity appears on the public volunteer page.
              </DialogDescription>
            </DialogHeader>

            {publicPreviewOpportunity && (
              <div className="max-h-[calc(85vh-108px)] space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                {publicPreviewDisplayPhoto && (
                  <div className="h-64 w-full overflow-hidden rounded-lg border">
                    <img
                      src={publicPreviewDisplayPhoto}
                      alt={publicPreviewOpportunity.eventName}
                      className="h-full w-full cursor-zoom-in object-cover"
                      loading="lazy"
                      decoding="async"
                      onClick={() => setPublicPreviewFullImageUrl(publicPreviewDisplayPhoto)}
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

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={publicPreviewIsDone ? "secondary" : "default"}>
                    {publicPreviewIsDone ? "Done" : "Open"}
                  </Badge>
                  <Badge variant="outline">
                    {publicPreviewConnectionType === "national"
                      ? "National"
                      : publicPreviewConnectionType === "city"
                      ? "City Chapter"
                      : "Barangay"}
                  </Badge>
                  <Badge variant="secondary">Public Preview Mode</Badge>
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(publicPreviewOpportunity.date), "MMMM dd, yyyy")}
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {publicPreviewOpportunity.time || "TBD"}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {publicPreviewOpportunity.venue || "TBD"}
                  </p>
                  <p>Age Requirement: {publicPreviewOpportunity.ageRequirement || "N/A"}</p>
                  <p className="md:col-span-2">Connected To: {publicPreviewConnectionLabel}</p>
                  {publicPreviewOpportunity.deadlineAt && (
                    <p className="md:col-span-2">
                      Deadline (Manila): {formatManilaDateTime12(publicPreviewOpportunity.deadlineAt)}
                    </p>
                  )}
                </div>

                {publicPreviewLinkedBarangayNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Connected barangays: {publicPreviewLinkedBarangayNames.join(", ")}
                  </p>
                )}

                {publicPreviewSdgs.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">SDGs Impacted</p>
                    <div className="flex flex-wrap gap-2">
                      {publicPreviewSdgs.map((sdg) => (
                        <Badge key={`${publicPreviewOpportunity.id}-preview-sdg-${sdg}`} variant="secondary">
                          SDG {sdg}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-sm font-medium">Description</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {publicPreviewOpportunity.description || "No description provided."}
                  </p>
                </div>

                <div className="border-t pt-2">
                  <p className="mb-2 text-sm font-medium">Contact</p>
                  <p className="text-sm text-muted-foreground">{publicPreviewOpportunity.contactName}</p>
                  <div className="mt-2 flex flex-col gap-1 text-sm">
                    <a
                      href={`tel:${publicPreviewOpportunity.contactPhone}`}
                      className="w-fit text-primary underline underline-offset-4"
                    >
                      Call: {publicPreviewOpportunity.contactPhone}
                    </a>
                    {publicPreviewOpportunity.contactEmail && (
                      <a
                        href={`mailto:${publicPreviewOpportunity.contactEmail}`}
                        className="w-fit text-primary underline underline-offset-4"
                      >
                        Email: {publicPreviewOpportunity.contactEmail}
                      </a>
                    )}
                  </div>
                </div>

                {(publicPreviewOpportunity.learnMoreUrl || publicPreviewOpportunity.applyUrl) && (
                  <div className="flex flex-wrap gap-2 border-t pt-2">
                    {publicPreviewOpportunity.learnMoreUrl && (
                      <Button asChild variant="outline">
                        <a href={publicPreviewOpportunity.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                          Learn More
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {publicPreviewOpportunity.applyUrl && (
                      <Button asChild>
                        <a href={publicPreviewOpportunity.applyUrl} target="_blank" rel="noopener noreferrer">
                          Apply Here
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(publicPreviewFullImageUrl)}
          onOpenChange={(open) => {
            if (!open) {
              setPublicPreviewFullImageUrl(null);
            }
          }}
        >
          <DialogContent className="max-h-[95vh] max-w-6xl overflow-hidden p-2">
            {publicPreviewFullImageUrl && (
              <img
                src={publicPreviewFullImageUrl}
                alt={publicPreviewOpportunity?.eventName || "Volunteer full image preview"}
                className="max-h-[90vh] w-full rounded-md object-contain"
                loading="lazy"
                decoding="async"
                onLoad={(event) => {
                  resetImageFallback(event.currentTarget);
                }}
                onError={(event) => {
                  if (!applyImageFallback(event.currentTarget, DEFAULT_IMAGE_FALLBACK_SRC)) {
                    event.currentTarget.style.display = "none";
                  }
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {isDashboardDataLoading && <LoadingState label="Loading volunteer opportunities..." rows={3} compact />}

        {!isDashboardDataLoading && role === "chapter" && !chapterId && (
          <Alert variant="destructive">
            <AlertDescription>
              Chapter scope is missing from your account session. Please log out, log in again, and refresh.
            </AlertDescription>
          </Alert>
        )}

        {!isDashboardDataLoading && role === "barangay" && (!chapterId || !barangayId) && (
          <Alert variant="destructive">
            <AlertDescription>
              Barangay scope is missing from your account session. Please log out, log in again, and refresh.
            </AlertDescription>
          </Alert>
        )}

        {!isDashboardDataLoading && opportunitiesQueryFailed && (
          <Alert variant="destructive">
            <AlertDescription>
              {opportunitiesQueryError instanceof Error
                ? opportunitiesQueryError.message
                : "Failed to load volunteer opportunities."}
            </AlertDescription>
          </Alert>
        )}

        {!isDashboardDataLoading && !opportunitiesQueryFailed && role === "chapter" && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">City Chapter Opportunities</h3>
                <Badge variant="outline">{cityChapterOpportunities.length}</Badge>
              </div>
              {cityChapterOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No city chapter opportunities match your filter.
                </p>
              ) : (
                <div className="space-y-3">
                  {cityChapterOpportunities.map((opportunity) =>
                    renderOpportunityCard(opportunity, { canManage: true }),
                  )}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Barangay Opportunities</h3>
                <Badge variant="outline">{barangayGroupedOpportunityCount}</Badge>
              </div>
              {barangayOpportunityGroups.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No barangay opportunities match your filter.
                </p>
              ) : (
                <div className="space-y-4">
                  {barangayOpportunityGroups.map((group) => (
                    <div key={group.key} className="space-y-3 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-medium break-words">{group.label}</h4>
                        <Badge variant="secondary">{group.opportunities.length}</Badge>
                      </div>
                      <div className="space-y-3">
                        {group.opportunities.map((opportunity) =>
                          renderOpportunityCard(opportunity, { canManage: true }),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Affiliated Chapter Opportunities</h3>
                <Badge variant="outline">{affiliatedCityChapterOpportunities.length}</Badge>
              </div>
              {affiliatedCityChapterOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No affiliated city chapter opportunities match your filter.
                </p>
              ) : (
                <div className="space-y-3">
                  {affiliatedCityChapterOpportunities.map((opportunity) =>
                    renderOpportunityCard(opportunity, { canManage: false, canReviewAffiliation: true }),
                  )}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Affiliated Barangay Opportunities</h3>
                <Badge variant="outline">{affiliatedBarangayOpportunities.length}</Badge>
              </div>
              {affiliatedBarangayOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No affiliated barangay opportunities match your filter.
                </p>
              ) : (
                <div className="space-y-3">
                  {affiliatedBarangayOpportunities.map((opportunity) =>
                    renderOpportunityCard(opportunity, { canManage: false, canReviewAffiliation: true }),
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {!isDashboardDataLoading && !opportunitiesQueryFailed && role === "barangay" && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">My Barangay Opportunities</h3>
                <Badge variant="outline">{barangayOwnedOpportunities.length}</Badge>
              </div>
              {barangayOwnedOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No opportunities created by your barangay yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {barangayOwnedOpportunities.map((opportunity) =>
                    renderOpportunityCard(opportunity, { canManage: true }),
                  )}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Connected from City Chapter</h3>
                <Badge variant="outline">{barangayConnectedFromCity.length}</Badge>
              </div>
              {barangayConnectedFromCity.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No connected city chapter opportunities found.
                </p>
              ) : (
                <div className="space-y-3">
                  {barangayConnectedFromCity.map((opportunity) =>
                    renderOpportunityCard(opportunity, { canManage: false }),
                  )}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Affiliated Chapter Opportunities</h3>
                <Badge variant="outline">{affiliatedCityChapterOpportunities.length}</Badge>
              </div>
              {affiliatedCityChapterOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No affiliated city chapter opportunities found.
                </p>
              ) : (
                <div className="space-y-3">
                  {affiliatedCityChapterOpportunities.map((opportunity) =>
                    renderOpportunityCard(opportunity, { canManage: false }),
                  )}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Affiliated Barangay Opportunities</h3>
                <Badge variant="outline">{affiliatedBarangayOpportunities.length}</Badge>
              </div>
              {affiliatedBarangayOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No affiliated barangay opportunities found.
                </p>
              ) : (
                <div className="space-y-3">
                  {affiliatedBarangayOpportunities.map((opportunity) =>
                    renderOpportunityCard(opportunity, { canManage: false }),
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {!isDashboardDataLoading && !opportunitiesQueryFailed && filteredOpportunities.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            No volunteer opportunities found for your current filters.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
