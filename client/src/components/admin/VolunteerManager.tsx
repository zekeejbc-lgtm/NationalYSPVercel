import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/ui/loading-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  applyImageFallback,
  DEFAULT_IMAGE_FALLBACK_SRC,
  getDisplayImageUrl,
  resetImageFallback,
} from "@/lib/driveUtils";
import { formatManilaDateTime12, isPastDateTime, toManilaDateTimeInput, toManilaUtcIsoFromInput } from "@/lib/manilaTime";
import {
  ArrowLeft,
  Building2,
  Edit,
  ExternalLink,
  Image,
  ListFilter,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import type { Chapter, VolunteerOpportunity } from "@shared/schema";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

const NATIONAL_CHAPTER_VALUE = "national";

type ScopeFilter = "all" | "city" | "barangay";
type StatusFilter = "all" | "open" | "done";
type ChapterListFilter = "all" | "with-opportunities" | "empty";

type VolunteerFormState = {
  eventName: string;
  date: string;
  time: string;
  venue: string;
  chapterId: string;
  barangayIds: string;
  sdgs: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  ageRequirement: string;
  description: string;
  deadlineAt: string;
  learnMoreUrl: string;
  applyUrl: string;
};

type ChapterSummary = {
  id: string;
  name: string;
  opportunitiesCount: number;
  cityCount: number;
  barangayCount: number;
};

type BarangayOpportunityGroup = {
  key: string;
  label: string;
  opportunities: VolunteerOpportunity[];
};

const EMPTY_FORM: VolunteerFormState = {
  eventName: "",
  date: "",
  time: "",
  venue: "",
  chapterId: NATIONAL_CHAPTER_VALUE,
  barangayIds: "",
  sdgs: "",
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

export default function VolunteerManager() {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [editingOpportunity, setEditingOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string>("");
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [previewOpportunity, setPreviewOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [chapterSearch, setChapterSearch] = useState("");
  const [chapterListFilter, setChapterListFilter] = useState<ChapterListFilter>("all");
  const [detailSearch, setDetailSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<VolunteerFormState>(EMPTY_FORM);

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const {
    data: opportunities = [],
    isLoading: opportunitiesLoading,
    isFetched: opportunitiesFetched,
  } = useQuery<VolunteerOpportunity[]>({
    queryKey: ["/api/volunteer-opportunities"],
  });

  const activeBarangayHintChapterId = useMemo(() => {
    if (formData.chapterId && formData.chapterId !== NATIONAL_CHAPTER_VALUE) {
      return formData.chapterId;
    }

    if (selectedChapterId && selectedChapterId !== NATIONAL_CHAPTER_VALUE) {
      return selectedChapterId;
    }

    return "";
  }, [formData.chapterId, selectedChapterId]);

  const {
    data: activeChapterBarangays = [],
    isLoading: activeChapterBarangaysLoading,
    isFetched: activeChapterBarangaysFetched,
  } = useQuery<Array<{ id: string; barangayName: string }>>({
    queryKey: ["/api/chapters", activeBarangayHintChapterId, "barangays", "admin-volunteer"],
    queryFn: async () => {
      const response = await fetch(`/api/chapters/${activeBarangayHintChapterId}/barangays`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch barangays for chapter");
      }
      return response.json();
    },
    enabled: Boolean(activeBarangayHintChapterId),
  });

  const isDashboardDataLoading =
    chaptersLoading ||
    !chaptersFetched ||
    opportunitiesLoading ||
    !opportunitiesFetched ||
    (Boolean(activeBarangayHintChapterId) && (activeChapterBarangaysLoading || !activeChapterBarangaysFetched));

  const barangayNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const barangay of activeChapterBarangays) {
      map.set(barangay.id, barangay.barangayName);
    }
    return map;
  }, [activeChapterBarangays]);

  const selectedFormBarangayIds = useMemo(() => parseCsvIds(formData.barangayIds), [formData.barangayIds]);

  const selectedFormBarangayLabel = useMemo(() => {
    if (selectedFormBarangayIds.length === 0) {
      return "Select connected barangays";
    }

    const names = selectedFormBarangayIds
      .map((id) => barangayNameById.get(id) || id)
      .filter((name, index, source) => source.indexOf(name) === index);

    if (names.length <= 2) {
      return names.join(", ");
    }

    return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  }, [barangayNameById, selectedFormBarangayIds]);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFilePreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setSelectedFilePreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const chapterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chapter of chapters) {
      map.set(chapter.id, chapter.name);
    }
    return map;
  }, [chapters]);

  const chapterSummaries = useMemo<ChapterSummary[]>(() => {
    const summaryMap = new Map<string, ChapterSummary>();

    summaryMap.set(NATIONAL_CHAPTER_VALUE, {
      id: NATIONAL_CHAPTER_VALUE,
      name: "National Chapter",
      opportunitiesCount: 0,
      cityCount: 0,
      barangayCount: 0,
    });

    for (const chapter of chapters) {
      summaryMap.set(chapter.id, {
        id: chapter.id,
        name: chapter.name,
        opportunitiesCount: 0,
        cityCount: 0,
        barangayCount: 0,
      });
    }

    for (const opportunity of opportunities) {
      const key = opportunity.chapterId || NATIONAL_CHAPTER_VALUE;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          id: key,
          name: key === NATIONAL_CHAPTER_VALUE ? "National Chapter" : "Unknown Chapter",
          opportunitiesCount: 0,
          cityCount: 0,
          barangayCount: 0,
        });
      }

      const summary = summaryMap.get(key);
      if (!summary) {
        continue;
      }

      summary.opportunitiesCount += 1;
      if (getConnectedBarangayIds(opportunity).length > 0) {
        summary.barangayCount += 1;
      } else {
        summary.cityCount += 1;
      }
    }

    return Array.from(summaryMap.values()).sort((left, right) => {
      if (left.id === NATIONAL_CHAPTER_VALUE) return -1;
      if (right.id === NATIONAL_CHAPTER_VALUE) return 1;
      return left.name.localeCompare(right.name);
    });
  }, [chapters, opportunities]);

  const filteredChapterSummaries = useMemo(() => {
    const keyword = chapterSearch.trim().toLowerCase();

    return chapterSummaries.filter((summary) => {
      if (keyword && !summary.name.toLowerCase().includes(keyword)) {
        return false;
      }

      if (chapterListFilter === "with-opportunities") {
        return summary.opportunitiesCount > 0;
      }

      if (chapterListFilter === "empty") {
        return summary.opportunitiesCount === 0;
      }

      return true;
    });
  }, [chapterListFilter, chapterSearch, chapterSummaries]);

  const selectedChapterSummary = useMemo(() => {
    if (!selectedChapterId) {
      return null;
    }

    return chapterSummaries.find((summary) => summary.id === selectedChapterId) || null;
  }, [chapterSummaries, selectedChapterId]);

  const chapterScopedOpportunities = useMemo(() => {
    if (!selectedChapterId) {
      return [] as VolunteerOpportunity[];
    }

    if (selectedChapterId === NATIONAL_CHAPTER_VALUE) {
      return opportunities.filter((opportunity) => !opportunity.chapterId);
    }

    return opportunities.filter((opportunity) => opportunity.chapterId === selectedChapterId);
  }, [opportunities, selectedChapterId]);

  const filteredDetailOpportunities = useMemo(() => {
    const keyword = detailSearch.trim().toLowerCase();

    return chapterScopedOpportunities.filter((opportunity) => {
      const connectedBarangayIds = getConnectedBarangayIds(opportunity);
      const isBarangay = connectedBarangayIds.length > 0;
      const isDone = isPastDateTime(opportunity.deadlineAt || opportunity.date);

      if (scopeFilter === "city" && isBarangay) {
        return false;
      }
      if (scopeFilter === "barangay" && !isBarangay) {
        return false;
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

      const searchable = [
        opportunity.eventName,
        opportunity.description || "",
        opportunity.contactName,
        opportunity.contactPhone,
        opportunity.chapter,
        connectedBarangayIds.map((id) => barangayNameById.get(id) || id).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(keyword);
    });
  }, [barangayNameById, chapterScopedOpportunities, detailSearch, scopeFilter, statusFilter]);

  const cityOpportunities = useMemo(() => {
    return filteredDetailOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length === 0);
  }, [filteredDetailOpportunities]);

  const globalChapterScopedCount = useMemo(() => {
    return opportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length === 0).length;
  }, [opportunities]);

  const globalBarangayScopedCount = useMemo(() => {
    return opportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length > 0).length;
  }, [opportunities]);

  const globalAverageBarangaySharePercent = useMemo(() => {
    if (opportunities.length === 0) {
      return 0;
    }

    return Math.round((globalBarangayScopedCount / opportunities.length) * 100);
  }, [globalBarangayScopedCount, opportunities.length]);

  const detailBarangayScopedCount = useMemo(() => {
    return filteredDetailOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length > 0).length;
  }, [filteredDetailOpportunities]);

  const detailAverageBarangaySharePercent = useMemo(() => {
    if (filteredDetailOpportunities.length === 0) {
      return 0;
    }

    return Math.round((detailBarangayScopedCount / filteredDetailOpportunities.length) * 100);
  }, [detailBarangayScopedCount, filteredDetailOpportunities.length]);

  const barangayGroups = useMemo<BarangayOpportunityGroup[]>(() => {
    const groups = new Map<string, BarangayOpportunityGroup>();

    for (const opportunity of filteredDetailOpportunities) {
      const connectedBarangayIds = getConnectedBarangayIds(opportunity);
      if (connectedBarangayIds.length === 0) {
        continue;
      }

      for (const connectedBarangayId of connectedBarangayIds) {
        const label = barangayNameById.get(connectedBarangayId) || `Barangay ${connectedBarangayId}`;
        if (!groups.has(connectedBarangayId)) {
          groups.set(connectedBarangayId, {
            key: connectedBarangayId,
            label,
            opportunities: [],
          });
        }

        groups.get(connectedBarangayId)!.opportunities.push(opportunity);
      }
    }

    return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [barangayNameById, filteredDetailOpportunities]);

  const resetDialog = () => {
    setEditingOpportunity(null);
    setIsDialogOpen(false);
    setSelectedFile(null);
    setSelectedFilePreviewUrl("");
    setFormData(EMPTY_FORM);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openCreateDialog = () => {
    const defaultChapterId = selectedChapterId || NATIONAL_CHAPTER_VALUE;
    setEditingOpportunity(null);
    setSelectedFile(null);
    setSelectedFilePreviewUrl("");
    setFormData({ ...EMPTY_FORM, chapterId: defaultChapterId });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsDialogOpen(true);
  };

  const openEditDialog = (opportunity: VolunteerOpportunity) => {
    setEditingOpportunity(opportunity);
    setSelectedFile(null);
    setSelectedFilePreviewUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setFormData({
      eventName: opportunity.eventName,
      date: format(new Date(opportunity.date), "yyyy-MM-dd"),
      time: opportunity.time || "",
      venue: opportunity.venue || "",
      chapterId: opportunity.chapterId || NATIONAL_CHAPTER_VALUE,
      barangayIds: opportunity.barangayIds || opportunity.barangayId || "",
      sdgs: opportunity.sdgs || "",
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

  const toggleFormBarangaySelection = (candidateId: string, checked: boolean) => {
    setFormData((current) => {
      const selected = parseCsvIds(current.barangayIds);
      const next = checked
        ? Array.from(new Set([...selected, candidateId]))
        : selected.filter((value) => value !== candidateId);

      return {
        ...current,
        barangayIds: next.join(","),
      };
    });
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, file }: { data: VolunteerFormState; file: File | null }) => {
      const payload = new FormData();
      const deadlineAt = toManilaUtcIsoFromInput(data.deadlineAt);
      const connectedBarangayIds = parseCsvIds(data.barangayIds);

      payload.append("eventName", data.eventName);
      payload.append("date", new Date(data.date).toISOString());
      payload.append("time", data.time || "TBD");
      payload.append("venue", data.venue || "TBD");
      payload.append("chapterId", data.chapterId);
      payload.append("sdgs", data.sdgs);
      payload.append("description", data.description);
      payload.append("contactName", data.contactName);
      payload.append("contactPhone", data.contactPhone);
      payload.append("ageRequirement", data.ageRequirement);
      if (data.contactEmail) payload.append("contactEmail", data.contactEmail);
      if (data.learnMoreUrl) payload.append("learnMoreUrl", data.learnMoreUrl);
      if (data.applyUrl) payload.append("applyUrl", data.applyUrl);
      if (deadlineAt) payload.append("deadlineAt", deadlineAt);
      if (data.chapterId !== NATIONAL_CHAPTER_VALUE && connectedBarangayIds.length > 0) {
        payload.append("barangayIds", connectedBarangayIds.join(","));
      }
      if (file) payload.append("photo", file);

      const response = await fetch("/api/volunteer-opportunities", {
        method: "POST",
        body: payload,
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Failed to create volunteer opportunity");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({ title: "Success", description: "Volunteer opportunity created successfully" });
      resetDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create volunteer opportunity", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, file }: { id: string; data: VolunteerFormState; file: File | null }) => {
      const payload = new FormData();
      const deadlineAt = toManilaUtcIsoFromInput(data.deadlineAt);
      const connectedBarangayIds = parseCsvIds(data.barangayIds);

      payload.append("eventName", data.eventName);
      payload.append("date", new Date(data.date).toISOString());
      payload.append("time", data.time || "TBD");
      payload.append("venue", data.venue || "TBD");
      payload.append("chapterId", data.chapterId);
      payload.append("sdgs", data.sdgs);
      payload.append("description", data.description);
      payload.append("contactName", data.contactName);
      payload.append("contactPhone", data.contactPhone);
      payload.append("ageRequirement", data.ageRequirement);
      if (data.contactEmail) payload.append("contactEmail", data.contactEmail);
      if (data.learnMoreUrl) payload.append("learnMoreUrl", data.learnMoreUrl);
      if (data.applyUrl) payload.append("applyUrl", data.applyUrl);
      if (deadlineAt) payload.append("deadlineAt", deadlineAt);
      if (data.chapterId !== NATIONAL_CHAPTER_VALUE) {
        payload.append("barangayIds", connectedBarangayIds.join(","));
      }
      if (file) payload.append("photo", file);

      const response = await fetch(`/api/volunteer-opportunities/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({ title: "Success", description: "Volunteer opportunity updated successfully" });
      resetDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update volunteer opportunity", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/volunteer-opportunities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({ title: "Success", description: "Volunteer opportunity deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to delete volunteer opportunity", variant: "destructive" });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.eventName || !formData.date || !formData.contactName || !formData.contactPhone || !formData.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.chapterId !== NATIONAL_CHAPTER_VALUE) {
      const connected = parseCsvIds(formData.barangayIds);
      if (formData.barangayIds.trim().length > 0 && connected.length === 0) {
        toast({
          title: "Error",
          description: "Please select valid connected barangays from the dropdown",
          variant: "destructive",
        });
        return;
      }
    }

    if (editingOpportunity) {
      updateMutation.mutate({ id: editingOpportunity.id, data: formData, file: selectedFile });
    } else {
      createMutation.mutate({ data: formData, file: selectedFile });
    }
  };

  const handleDelete = async (id: string, eventName: string) => {
    if (!(await confirmDelete(`Delete volunteer opportunity ${eventName}?`))) {
      return;
    }
    deleteMutation.mutate(id);
  };

  const renderOpportunityCard = (opportunity: VolunteerOpportunity) => {
    const displayPhotoUrl = opportunity.photoUrl ? getDisplayImageUrl(opportunity.photoUrl) : "";
    const connectedBarangayIds = getConnectedBarangayIds(opportunity);
    const connectedBarangayNames = connectedBarangayIds
      .map((id) => barangayNameById.get(id) || id)
      .filter((name, index, source) => source.indexOf(name) === index);
    const isDone = isPastDateTime(opportunity.deadlineAt || opportunity.date);

    return (
      <Card key={opportunity.id} className="cursor-pointer hover-elevate transition-all" onClick={() => setPreviewOpportunity(opportunity)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {displayPhotoUrl && (
              <img
                src={displayPhotoUrl}
                alt={opportunity.eventName}
                className="h-20 w-20 flex-shrink-0 rounded-md object-cover"
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
                data-testid={`img-volunteer-${opportunity.id}`}
              />
            )}

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{opportunity.eventName}</h3>
                <Badge variant={isDone ? "secondary" : "default"}>{isDone ? "Done" : "Open"}</Badge>
                {connectedBarangayIds.length > 0 ? <Badge variant="outline">Barangay</Badge> : <Badge variant="outline">City</Badge>}
              </div>

              <p className="text-sm text-muted-foreground">
                {format(new Date(opportunity.date), "MMM dd, yyyy")} • {opportunity.chapter || chapterNameById.get(opportunity.chapterId || "") || "National Chapter"}
              </p>

              {opportunity.deadlineAt && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Deadline (Manila): {formatManilaDateTime12(opportunity.deadlineAt)}
                </p>
              )}

              {connectedBarangayNames.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connected barangays: {connectedBarangayNames.join(", ")}
                </p>
              )}

              {opportunity.description && (
                <p className="mt-1 text-sm text-muted-foreground">{opportunity.description}</p>
              )}

              <p className="mt-1 text-sm text-muted-foreground">SDGs: {opportunity.sdgs || "-"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Contact: {opportunity.contactName} ({opportunity.contactPhone})
              </p>

              {(opportunity.learnMoreUrl || opportunity.applyUrl) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {opportunity.learnMoreUrl && (
                    <Button asChild size="sm" variant="outline" onClick={(event) => event.stopPropagation()}>
                      <a href={opportunity.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                        Learn More
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  {opportunity.applyUrl && (
                    <Button asChild size="sm" onClick={(event) => event.stopPropagation()}>
                      <a href={opportunity.applyUrl} target="_blank" rel="noopener noreferrer">
                        Apply Here
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  event.stopPropagation();
                  openEditDialog(opportunity);
                }}
                data-testid={`button-edit-volunteer-${opportunity.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete(opportunity.id, opportunity.eventName);
                }}
                data-testid={`button-delete-volunteer-${opportunity.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isDashboardDataLoading) {
    return <LoadingState label="Loading volunteer opportunities..." rows={3} compact />;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Volunteer Opportunities</CardTitle>
              <CardDescription>
                {selectedChapterId
                  ? "Chapter view: city and barangay opportunities with full CRUD."
                  : "Select a chapter first, then open its categorized volunteer opportunities page."}
              </CardDescription>
            </div>
            {selectedChapterId && (
              <Button onClick={openCreateDialog} data-testid="button-add-volunteer">
                <Plus className="mr-2 h-4 w-4" />
                Add Opportunity
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!selectedChapterId ? (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="relative md:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={chapterSearch}
                    onChange={(event) => setChapterSearch(event.target.value)}
                    className="pl-9"
                    placeholder="Search chapter"
                    data-testid="input-volunteer-chapter-search"
                  />
                </div>

                <Select value={chapterListFilter} onValueChange={(value) => setChapterListFilter(value as ChapterListFilter)}>
                  <SelectTrigger data-testid="select-volunteer-chapter-list-filter">
                    <div className="flex items-center gap-2">
                      <ListFilter className="h-3.5 w-3.5" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Chapters</SelectItem>
                    <SelectItem value="with-opportunities">With Opportunities</SelectItem>
                    <SelectItem value="empty">No Opportunities</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">All Opportunities</p>
                  <p className="mt-1 text-2xl font-semibold">{opportunities.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Per Chapter</p>
                  <p className="mt-1 text-2xl font-semibold">{globalChapterScopedCount}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Per Barangay</p>
                  <p className="mt-1 text-2xl font-semibold">{globalBarangayScopedCount}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Average %</p>
                  <p className="mt-1 text-2xl font-semibold">{globalAverageBarangaySharePercent}%</p>
                </div>
              </div>

              {filteredChapterSummaries.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No chapters match your current filters.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredChapterSummaries.map((summary) => (
                    <button
                      key={summary.id}
                      type="button"
                      onClick={() => {
                        setSelectedChapterId(summary.id);
                        setDetailSearch("");
                        setScopeFilter("all");
                        setStatusFilter("all");
                      }}
                      className="rounded-lg border p-4 text-left transition-colors hover:bg-muted/40"
                      data-testid={`button-open-volunteer-chapter-${summary.id}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <h3 className="font-semibold">{summary.name}</h3>
                        </div>
                        <Badge variant="outline">{summary.opportunitiesCount}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">City opportunities: {summary.cityCount}</p>
                      <p className="text-xs text-muted-foreground">Barangay opportunities: {summary.barangayCount}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedChapterId(null)}
                  data-testid="button-back-volunteer-chapters"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Chapters
                </Button>
                <Badge variant="secondary">{selectedChapterSummary?.name || "Chapter"}</Badge>
                <Badge variant="outline">Total: {filteredDetailOpportunities.length}</Badge>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <div className="relative md:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={detailSearch}
                    onChange={(event) => setDetailSearch(event.target.value)}
                    className="pl-9"
                    placeholder="Search opportunities"
                    data-testid="input-volunteer-detail-search"
                  />
                </div>

                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger data-testid="select-volunteer-detail-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
                  <SelectTrigger data-testid="select-volunteer-detail-scope-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scopes</SelectItem>
                    <SelectItem value="city">City Chapter</SelectItem>
                    <SelectItem value="barangay">Barangay</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">All Opportunities</p>
                  <p className="mt-1 text-2xl font-semibold">{filteredDetailOpportunities.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Per Chapter</p>
                  <p className="mt-1 text-2xl font-semibold">{cityOpportunities.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Per Barangay</p>
                  <p className="mt-1 text-2xl font-semibold">{detailBarangayScopedCount}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Average %</p>
                  <p className="mt-1 text-2xl font-semibold">{detailAverageBarangaySharePercent}%</p>
                </div>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">City Chapter Opportunities</h3>
                  <Badge variant="outline">{cityOpportunities.length}</Badge>
                </div>
                {cityOpportunities.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No city chapter opportunities match your filter.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {cityOpportunities.map((opportunity) => renderOpportunityCard(opportunity))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Barangay Opportunities</h3>
                  <Badge variant="outline">{barangayGroups.reduce((sum, group) => sum + group.opportunities.length, 0)}</Badge>
                </div>

                {barangayGroups.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No barangay opportunities match your filter.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {barangayGroups.map((group) => (
                      <div key={group.key} className="space-y-3 rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{group.label}</h4>
                          <Badge variant="secondary">{group.opportunities.length}</Badge>
                        </div>
                        <div className="space-y-3">
                          {group.opportunities.map((opportunity) => renderOpportunityCard(opportunity))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {filteredDetailOpportunities.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No opportunities found under this chapter for your current filters.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : resetDialog())}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
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
                onChange={(event) => setFormData({ ...formData, eventName: event.target.value })}
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
                onChange={(event) => setFormData({ ...formData, date: event.target.value })}
                required
                data-testid="input-volunteer-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(event) => setFormData({ ...formData, time: event.target.value })}
                data-testid="input-volunteer-time"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">Venue / Place</Label>
              <Input
                id="venue"
                value={formData.venue}
                onChange={(event) => setFormData({ ...formData, venue: event.target.value })}
                placeholder="YSP Center"
                data-testid="input-volunteer-venue"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapter">Connect Opportunity To</Label>
              <Select value={formData.chapterId} onValueChange={(value) => setFormData({ ...formData, chapterId: value, barangayIds: "" })}>
                <SelectTrigger id="chapter" data-testid="select-volunteer-chapter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NATIONAL_CHAPTER_VALUE}>National Chapter</SelectItem>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.chapterId !== NATIONAL_CHAPTER_VALUE && (
              <div className="space-y-2">
                <Label>Connected Barangays</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      disabled={activeChapterBarangays.length === 0}
                      data-testid="dropdown-volunteer-barangays"
                    >
                      <span className="truncate text-left">{selectedFormBarangayLabel}</span>
                      <Badge variant="secondary">{selectedFormBarangayIds.length}</Badge>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-80 overflow-y-auto" align="start">
                    <DropdownMenuLabel>Select one or more barangays</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {activeChapterBarangays.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No barangays found for this chapter.</div>
                    ) : (
                      activeChapterBarangays.map((barangay) => (
                        <DropdownMenuCheckboxItem
                          key={barangay.id}
                          checked={selectedFormBarangayIds.includes(barangay.id)}
                          onCheckedChange={(checked) => toggleFormBarangaySelection(barangay.id, checked === true)}
                          onSelect={(event) => event.preventDefault()}
                          data-testid={`checkbox-volunteer-barangay-${barangay.id}`}
                        >
                          {barangay.barangayName}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sdgs">SDGs Impacted</Label>
              <Input
                id="sdgs"
                value={formData.sdgs}
                onChange={(event) => setFormData({ ...formData, sdgs: event.target.value })}
                required
                placeholder="1,2,3"
                data-testid="input-volunteer-sdgs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                required
                rows={4}
                placeholder="Describe what volunteers will do in this event."
                data-testid="input-volunteer-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Person Name</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(event) => setFormData({ ...formData, contactName: event.target.value })}
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
                onChange={(event) => setFormData({ ...formData, contactPhone: event.target.value })}
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
                onChange={(event) => setFormData({ ...formData, contactEmail: event.target.value })}
                placeholder="juan@youthservice.ph"
                data-testid="input-volunteer-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ageRequirement">Age Requirement</Label>
              <Select value={formData.ageRequirement} onValueChange={(value) => setFormData({ ...formData, ageRequirement: value })}>
                <SelectTrigger id="ageRequirement" data-testid="select-volunteer-age-requirement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="18+">18+ years old only</SelectItem>
                  <SelectItem value="16+">16+ years old (with consent)</SelectItem>
                  <SelectItem value="all">All ages welcome</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadlineAt">Deadline (Manila time)</Label>
              <Input
                id="deadlineAt"
                type="datetime-local"
                value={formData.deadlineAt}
                onChange={(event) => setFormData({ ...formData, deadlineAt: event.target.value })}
                data-testid="input-volunteer-deadline"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="learnMoreUrl">Learn More Link (optional)</Label>
              <Input
                id="learnMoreUrl"
                type="url"
                value={formData.learnMoreUrl}
                onChange={(event) => setFormData({ ...formData, learnMoreUrl: event.target.value })}
                placeholder="https://example.com/more-info"
                data-testid="input-volunteer-learn-more-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applyUrl">Apply Here Link (optional)</Label>
              <Input
                id="applyUrl"
                type="url"
                value={formData.applyUrl}
                onChange={(event) => setFormData({ ...formData, applyUrl: event.target.value })}
                placeholder="https://example.com/apply"
                data-testid="input-volunteer-apply-url"
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
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP only. Max 2MB.</p>
              {editingOpportunity?.photoUrl && !selectedFile && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Image className="h-4 w-4" />
                    <span>Current image</span>
                  </div>
                  <img
                    src={getDisplayImageUrl(editingOpportunity.photoUrl)}
                    alt={editingOpportunity.eventName}
                    className="h-40 w-full rounded-md border object-cover"
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
                    data-testid="img-volunteer-current-photo"
                  />
                </div>
              )}
              {selectedFile && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Image className="h-4 w-4" />
                    <span>Selected: {selectedFile.name}</span>
                  </div>
                  {selectedFilePreviewUrl && (
                    <img
                      src={selectedFilePreviewUrl}
                      alt="Selected volunteer upload preview"
                      className="h-40 w-full rounded-md border object-cover"
                      data-testid="img-volunteer-selected-photo-preview"
                    />
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-volunteer"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Opportunity"}
              </Button>
              <Button type="button" variant="outline" onClick={resetDialog} data-testid="button-cancel-volunteer">
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewOpportunity)} onOpenChange={(open) => !open && setPreviewOpportunity(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          {previewOpportunity && (
            <>
              <DialogHeader>
                <DialogTitle>{previewOpportunity.eventName}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {previewOpportunity.photoUrl && (
                  <div className="h-64 w-full overflow-hidden rounded-lg border">
                    <img
                      src={getDisplayImageUrl(previewOpportunity.photoUrl)}
                      alt={previewOpportunity.eventName}
                      className="h-full w-full object-cover"
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
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={isPastDateTime(previewOpportunity.deadlineAt || previewOpportunity.date) ? "secondary" : "default"}>
                    {isPastDateTime(previewOpportunity.deadlineAt || previewOpportunity.date) ? "Done" : "Open"}
                  </Badge>
                  {getConnectedBarangayIds(previewOpportunity).length > 0 ? (
                    <Badge variant="outline">Barangay Opportunity</Badge>
                  ) : (
                    <Badge variant="outline">City Chapter Opportunity</Badge>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  {format(new Date(previewOpportunity.date), "MMMM dd, yyyy")} • {previewOpportunity.time || "TBD"}
                </p>

                <p className="text-sm text-muted-foreground">Venue: {previewOpportunity.venue || "TBD"}</p>

                {previewOpportunity.deadlineAt && (
                  <p className="text-sm text-muted-foreground">
                    Deadline (Manila): {formatManilaDateTime12(previewOpportunity.deadlineAt)}
                  </p>
                )}

                {getConnectedBarangayIds(previewOpportunity).length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Connected barangays: {getConnectedBarangayIds(previewOpportunity)
                      .map((id) => barangayNameById.get(id) || id)
                      .filter((name, index, source) => source.indexOf(name) === index)
                      .join(", ")}
                  </p>
                )}

                <div>
                  <p className="text-sm font-medium">Description</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{previewOpportunity.description || "No description provided."}</p>
                </div>

                <div className="text-sm text-muted-foreground">
                  Contact: {previewOpportunity.contactName} ({previewOpportunity.contactPhone})
                  {previewOpportunity.contactEmail ? ` • ${previewOpportunity.contactEmail}` : ""}
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreviewOpportunity(null);
                      openEditDialog(previewOpportunity);
                    }}
                    data-testid="button-preview-edit-volunteer"
                  >
                    <Edit className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>

                  {previewOpportunity.learnMoreUrl && (
                    <Button asChild variant="outline">
                      <a href={previewOpportunity.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                        Learn More
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}

                  {previewOpportunity.applyUrl && (
                    <Button asChild>
                      <a href={previewOpportunity.applyUrl} target="_blank" rel="noopener noreferrer">
                        Apply Here
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
