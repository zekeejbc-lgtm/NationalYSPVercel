import { useMemo, useRef, useState } from "react";
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
  Edit,
  Trash2,
  Search,
  ListFilter,
} from "lucide-react";
import { format } from "date-fns";
import type { VolunteerOpportunity } from "@shared/schema";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

const VOLUNTEER_DISCLAIMER = "Volunteers are reminded that they are responsible for their own safety and situational awareness during activities. Participation is advised for individuals 18 years old and above. Volunteers below 18 years old must submit a Parent's Consent Form prior to participation.";

type ScopeFilter = "all" | "city" | "barangay";
type StatusFilter = "all" | "open" | "done";

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
  opportunities: VolunteerOpportunity[];
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
  const [editingOpportunity, setEditingOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [targetScope, setTargetScope] = useState<"chapter" | "barangay">("chapter");
  const [selectedBarangayIds, setSelectedBarangayIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<VolunteerFormState>(EMPTY_FORM);

  const { data: opportunities = [], isLoading } = useQuery<VolunteerOpportunity[]>({
    queryKey: ["/api/volunteer-opportunities", role, chapterId, barangayId],
    queryFn: async () => {
      const endpoint = role === "barangay"
        ? "/api/volunteer-opportunities/by-barangay"
        : `/api/volunteer-opportunities/by-chapter?chapterId=${chapterId}`;

      const response = await fetch(endpoint, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch volunteer opportunities");
      }
      return response.json();
    },
    enabled: role === "barangay" ? Boolean(barangayId) : Boolean(chapterId),
  });

  const { data: barangays = [] } = useQuery<ChapterBarangayOption[]>({
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

  const barangayNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of barangays) {
      map.set(item.id, item.barangayName);
    }
    return map;
  }, [barangays]);

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
    setFormData(EMPTY_FORM);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsDialogOpen(true);
  };

  const openEditDialog = (opportunity: VolunteerOpportunity) => {
    const connectedBarangayIds = getConnectedBarangayIds(opportunity);
    setEditingOpportunity(opportunity);
    setTargetScope(role === "chapter" && connectedBarangayIds.length > 0 ? "barangay" : "chapter");
    setSelectedBarangayIds(connectedBarangayIds);
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
        throw new Error(errorData?.error || "Failed to create volunteer opportunity");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Volunteer opportunity saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities", role, chapterId, barangayId] });
      resetForm();
    },
    onError: (error: any) => {
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

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

  const cityChapterOpportunities = useMemo(() => {
    return filteredOpportunities.filter((opportunity) => getConnectedBarangayIds(opportunity).length === 0);
  }, [filteredOpportunities]);

  const barangayOpportunityGroups = useMemo<BarangayOpportunityGroup[]>(() => {
    const groups = new Map<string, BarangayOpportunityGroup>();

    for (const opportunity of filteredOpportunities) {
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
  }, [barangayNameById, filteredOpportunities]);

  const barangayOwnedOpportunities = useMemo(() => {
    if (!barangayId) {
      return [] as VolunteerOpportunity[];
    }
    return filteredOpportunities.filter((opportunity) => opportunity.barangayId === barangayId);
  }, [barangayId, filteredOpportunities]);

  const barangayConnectedFromCity = useMemo(() => {
    if (!barangayId) {
      return [] as VolunteerOpportunity[];
    }

    return filteredOpportunities.filter((opportunity) => {
      if (opportunity.barangayId === barangayId) {
        return false;
      }
      return getConnectedBarangayIds(opportunity).includes(barangayId);
    });
  }, [barangayId, filteredOpportunities]);

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const renderOpportunityCard = (opportunity: VolunteerOpportunity, canManage: boolean) => {
    const displayPhotoUrl = opportunity.photoUrl ? getDisplayImageUrl(opportunity.photoUrl) : "";
    const linkedBarangayIds = getConnectedBarangayIds(opportunity);
    const linkedBarangayNames = linkedBarangayIds
      .map((id) => barangayNameById.get(id) || id)
      .filter((name, index, source) => source.indexOf(name) === index);
    const isDone = isPastDateTime(opportunity.deadlineAt || opportunity.date);

    return (
      <div key={opportunity.id} className="rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {displayPhotoUrl && (
              <img
                src={displayPhotoUrl}
                alt={opportunity.eventName}
                className="h-16 w-16 rounded-md object-cover"
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

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold">{opportunity.eventName}</h4>
                <Badge variant={isDone ? "secondary" : "default"}>{isDone ? "Done" : "Open"}</Badge>
                {linkedBarangayIds.length > 0 ? (
                  <Badge variant="outline">Barangay Opportunity</Badge>
                ) : (
                  <Badge variant="outline">City Chapter Opportunity</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(opportunity.date), "MMM d, yyyy")}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {opportunity.time || "TBD"}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {opportunity.venue || "TBD"}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {opportunity.contactName}
                </span>
              </div>

              {opportunity.deadlineAt && (
                <p className="text-xs text-muted-foreground">
                  Deadline (Manila): {formatManilaDateTime12(opportunity.deadlineAt)}
                </p>
              )}

              {linkedBarangayNames.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Connected barangays: {linkedBarangayNames.join(", ")}
                </p>
              )}

              {opportunity.description && (
                <p className="text-sm text-muted-foreground">{opportunity.description}</p>
              )}

              {(opportunity.learnMoreUrl || opportunity.applyUrl) && (
                <div className="flex flex-wrap gap-2">
                  {opportunity.learnMoreUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={opportunity.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                        Learn More
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  {opportunity.applyUrl && (
                    <Button asChild size="sm">
                      <a href={opportunity.applyUrl} target="_blank" rel="noopener noreferrer">
                        Apply Here
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge>{opportunity.ageRequirement}</Badge>
            {canManage && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditDialog(opportunity)}
                  data-testid={`button-edit-opportunity-${opportunity.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(opportunity)}
                  data-testid={`button-delete-opportunity-${opportunity.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
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
          <Button onClick={openCreateDialog} data-testid="button-create-opportunity">
            <Plus className="mr-2 h-4 w-4" />
            Create Volunteer Opportunity
          </Button>
          <div className="text-xs text-muted-foreground">CRUD actions are available per role permissions.</div>
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
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-2">
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
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : resetForm())}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
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
                  {selectedFile && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Image className="h-4 w-4" />
                      <span>Selected: {selectedFile.name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isPending} data-testid="button-submit-opportunity">
                  {editingOpportunity ? "Save Changes" : "Create Opportunity"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {isLoading && <LoadingState label="Loading volunteer opportunities..." rows={3} compact />}

        {!isLoading && role === "chapter" && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">City Chapter Opportunities</h3>
                <Badge variant="outline">{cityChapterOpportunities.length}</Badge>
              </div>
              {cityChapterOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No city chapter opportunities match your filter.
                </p>
              ) : (
                <div className="space-y-3">
                  {cityChapterOpportunities.map((opportunity) => renderOpportunityCard(opportunity, true))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Barangay Opportunities</h3>
                <Badge variant="outline">{barangayOpportunityGroups.reduce((sum, group) => sum + group.opportunities.length, 0)}</Badge>
              </div>
              {barangayOpportunityGroups.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No barangay opportunities match your filter.
                </p>
              ) : (
                <div className="space-y-4">
                  {barangayOpportunityGroups.map((group) => (
                    <div key={group.key} className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{group.label}</h4>
                        <Badge variant="secondary">{group.opportunities.length}</Badge>
                      </div>
                      <div className="space-y-3">
                        {group.opportunities.map((opportunity) => renderOpportunityCard(opportunity, true))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {!isLoading && role === "barangay" && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">My Barangay Opportunities</h3>
                <Badge variant="outline">{barangayOwnedOpportunities.length}</Badge>
              </div>
              {barangayOwnedOpportunities.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No opportunities created by your barangay yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {barangayOwnedOpportunities.map((opportunity) => renderOpportunityCard(opportunity, true))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Connected from City Chapter</h3>
                <Badge variant="outline">{barangayConnectedFromCity.length}</Badge>
              </div>
              {barangayConnectedFromCity.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No connected city chapter opportunities found.
                </p>
              ) : (
                <div className="space-y-3">
                  {barangayConnectedFromCity.map((opportunity) => renderOpportunityCard(opportunity, false))}
                </div>
              )}
            </section>
          </div>
        )}

        {!isLoading && filteredOpportunities.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            No volunteer opportunities found for your current filters.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
