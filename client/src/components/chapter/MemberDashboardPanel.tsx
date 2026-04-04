import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/ui/loading-state";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { createPdfExportContract } from "@/lib/export/pdfContract";
import { reportPdfFallbackRequest } from "@/lib/export/pdfFallback";
import { createSafeFileToken, formatManilaDateTime, getIsoDateFileStamp } from "@/lib/export/pdfStandards";
import { createYspPdfReport } from "@/lib/pdfReport";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import { Users, Phone, Calendar, Plus, Check, X, Search, Loader2, GitMerge, Trash2, FileDown } from "lucide-react";
import { format } from "date-fns";
import { usePagination } from "@/hooks/use-pagination";
import PaginationControls from "@/components/ui/pagination-controls";
import ViewModeToggle, { type ViewMode } from "@/components/ui/view-mode-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";
import MemberAnalyticsTab from "@/components/chapter/MemberAnalyticsTab";
import { getComparisonColor } from "@/lib/chartColors";
import type { Member } from "@shared/schema";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

export interface MemberDashboardPanelProps {
  chapterId: string;
  chapterName?: string;
  barangayId?: string;
}

interface AddMemberFormData {
  fullName: string;
  age: number;
  householdSize: number;
  birthdate?: string;
  contactNumber: string;
  email: string;
  registeredVoter: boolean;
  facebookLink?: string;
  isActive: boolean;
}

interface DirectoryEditFormState {
  fullName: string;
  age: string;
  birthdate: string;
  contactNumber: string;
  email: string;
  facebookLink: string;
  barangayId: string;
}

interface BarangayOption {
  id: string;
  barangayName: string;
  chapterId: string;
}

interface DuplicateScoreBreakdown {
  name: number;
  contact: number;
  email: number;
  birthdate: number;
  age: number;
  barangay: number;
  facebook: number;
}

type MemberApplicationStatus = "approved" | "pending" | "rejected";
type MemberLifecycleState = "member" | "applying" | "rejected";

type MemberWithLifecycle = Member & {
  resolvedApplicationStatus?: MemberApplicationStatus;
  memberLifecycleState?: MemberLifecycleState;
  isCurrentMember?: boolean;
  isApplying?: boolean;
};

interface DuplicateCandidate {
  member: MemberWithLifecycle;
  probability: number;
  scores: DuplicateScoreBreakdown;
}

interface DuplicateAnalysis {
  candidates: DuplicateCandidate[];
  topProbability: number;
  riskLevel: "high" | "medium" | "low" | "none";
}

interface DuplicateActionContext {
  duplicateMemberId: string;
  mergePrimaryMemberId: string;
  mergeDuplicateMemberId: string;
  deleteLabel: string;
  mergeLabel: string;
  helperText: string;
}

const applicationAnalyticsChartConfig = {
  applications: {
    label: "Applications",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

type MergeFieldSource = "primary" | "duplicate";
type MergeSelectableField = "fullName" | "contactNumber" | "email" | "facebookLink" | "birthdate" | "age" | "barangayId" | "photoUrl";
type ApplicationScopeFilter = "all" | "chapter-direct" | "barangay-only";
type ApplicationVoterFilter = "all" | "registered-voter" | "not-registered-voter";
type ApplicationsExportSectionKey = "scope" | "applicationsTable" | "originByBarangay";
type DirectoryExportSectionKey = "scope" | "directoryTable";

type ApplicationsExportSections = Record<ApplicationsExportSectionKey, boolean>;
type ApplicationsExportColumns = {
  name: boolean;
  referenceId: boolean;
  type: boolean;
  barangay: boolean;
  contact: boolean;
  submitted: boolean;
  directoryCheck: boolean;
  duplicateCheck: boolean;
};

type DirectoryExportSections = Record<DirectoryExportSectionKey, boolean>;
type DirectoryExportColumns = {
  name: boolean;
  type: boolean;
  barangay: boolean;
  age: boolean;
  household: boolean;
  contact: boolean;
  voter: boolean;
  active: boolean;
  dateAdded: boolean;
};

type ExportPreset = "minimal" | "standard" | "full";

type MemberUpdatePayload = Omit<Partial<Member>, "birthdate" | "email" | "facebookLink" | "barangayId"> & {
  birthdate?: string | null;
  email?: string | null;
  facebookLink?: string | null;
  barangayId?: string | null;
};

const defaultDirectoryEditFormState: DirectoryEditFormState = {
  fullName: "",
  age: "",
  birthdate: "",
  contactNumber: "",
  email: "",
  facebookLink: "",
  barangayId: "chapter-direct",
};

const MEMBER_PHOTO_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MERGE_SELECTABLE_FIELDS: ReadonlyArray<{ key: MergeSelectableField; label: string }> = [
  { key: "fullName", label: "Name" },
  { key: "contactNumber", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "facebookLink", label: "Facebook" },
  { key: "birthdate", label: "Birthdate" },
  { key: "age", label: "Age" },
  { key: "barangayId", label: "Barangay" },
  { key: "photoUrl", label: "Photo" },
];

function hasMeaningfulMergeValue(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

function getDefaultMergeFieldSource(primaryValue: unknown, duplicateValue: unknown): MergeFieldSource {
  if (hasMeaningfulMergeValue(primaryValue)) {
    return "primary";
  }

  if (hasMeaningfulMergeValue(duplicateValue)) {
    return "duplicate";
  }

  return "primary";
}

function normalizeLooseText(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D+/g, "");
}

function normalizeUrl(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

function buildBigrams(value: string) {
  const normalizedValue = normalizeLooseText(value);
  if (normalizedValue.length < 2) {
    return normalizedValue ? [normalizedValue] : [];
  }

  const bigrams: string[] = [];
  for (let index = 0; index < normalizedValue.length - 1; index += 1) {
    bigrams.push(normalizedValue.slice(index, index + 2));
  }

  return bigrams;
}

function diceSimilarity(a: string, b: string) {
  const aBigrams = buildBigrams(a);
  const bBigrams = buildBigrams(b);

  if (aBigrams.length === 0 || bBigrams.length === 0) {
    return 0;
  }

  const aCounts = new Map<string, number>();
  for (const token of aBigrams) {
    aCounts.set(token, (aCounts.get(token) || 0) + 1);
  }

  let intersection = 0;
  for (const token of bBigrams) {
    const existingCount = aCounts.get(token) || 0;
    if (existingCount > 0) {
      intersection += 1;
      aCounts.set(token, existingCount - 1);
    }
  }

  return (2 * intersection) / (aBigrams.length + bBigrams.length);
}

function tokenOverlapSimilarity(a: string, b: string) {
  const aTokens = new Set(normalizeLooseText(a).split(" ").filter(Boolean));
  const bTokens = new Set(normalizeLooseText(b).split(" ").filter(Boolean));

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of Array.from(aTokens)) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function toDateKey(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function computeDuplicateProbability(member: MemberWithLifecycle, candidate: MemberWithLifecycle) {
  const normalizedName = normalizeLooseText(member.fullName);
  const normalizedCandidateName = normalizeLooseText(candidate.fullName);
  const nameScore = normalizedName === normalizedCandidateName
    ? 1
    : Math.max(
        diceSimilarity(normalizedName, normalizedCandidateName),
        tokenOverlapSimilarity(normalizedName, normalizedCandidateName),
      );

  const normalizedContact = normalizePhone(member.contactNumber);
  const normalizedCandidateContact = normalizePhone(candidate.contactNumber);
  let contactScore = 0;
  if (normalizedContact && normalizedCandidateContact) {
    if (normalizedContact === normalizedCandidateContact) {
      contactScore = 1;
    } else if (
      normalizedContact.length >= 7 &&
      normalizedCandidateContact.length >= 7 &&
      normalizedContact.slice(-7) === normalizedCandidateContact.slice(-7)
    ) {
      contactScore = 0.78;
    } else if (
      normalizedContact.includes(normalizedCandidateContact) ||
      normalizedCandidateContact.includes(normalizedContact)
    ) {
      contactScore = 0.65;
    } else {
      contactScore = diceSimilarity(normalizedContact, normalizedCandidateContact) * 0.7;
    }
  }

  const normalizedEmail = normalizeLooseText(member.email);
  const normalizedCandidateEmail = normalizeLooseText(candidate.email);
  let emailScore = 0;
  if (normalizedEmail && normalizedCandidateEmail) {
    if (normalizedEmail === normalizedCandidateEmail) {
      emailScore = 1;
    } else {
      const [localA = "", domainA = ""] = normalizedEmail.split("@");
      const [localB = "", domainB = ""] = normalizedCandidateEmail.split("@");
      const localScore = Math.max(diceSimilarity(localA, localB), tokenOverlapSimilarity(localA, localB));
      emailScore = domainA && domainA === domainB
        ? 0.55 + localScore * 0.45
        : localScore * 0.45;
    }
  }

  const birthdateA = toDateKey(member.birthdate);
  const birthdateB = toDateKey(candidate.birthdate);
  const birthdateScore = birthdateA && birthdateB
    ? (birthdateA === birthdateB ? 1 : 0)
    : 0;

  const ageDifference = Math.abs((member.age || 0) - (candidate.age || 0));
  const ageScore = ageDifference === 0 ? 1 : ageDifference === 1 ? 0.75 : ageDifference === 2 ? 0.45 : 0;

  const barangayScore = member.barangayId && candidate.barangayId
    ? (member.barangayId === candidate.barangayId ? 1 : 0)
    : (!member.barangayId && !candidate.barangayId ? 0.65 : 0);

  const normalizedFacebook = normalizeUrl(member.facebookLink);
  const normalizedCandidateFacebook = normalizeUrl(candidate.facebookLink);
  const facebookScore = normalizedFacebook && normalizedCandidateFacebook
    ? (normalizedFacebook === normalizedCandidateFacebook ? 1 : diceSimilarity(normalizedFacebook, normalizedCandidateFacebook) * 0.6)
    : 0;

  const scores: DuplicateScoreBreakdown = {
    name: nameScore,
    contact: contactScore,
    email: emailScore,
    birthdate: birthdateScore,
    age: ageScore,
    barangay: barangayScore,
    facebook: facebookScore,
  };

  const weightedScores = [
    { score: scores.name, weight: 0.35, available: Boolean(normalizedName && normalizedCandidateName) },
    { score: scores.contact, weight: 0.25, available: Boolean(normalizedContact && normalizedCandidateContact) },
    { score: scores.email, weight: 0.15, available: Boolean(normalizedEmail && normalizedCandidateEmail) },
    { score: scores.birthdate, weight: 0.1, available: Boolean(birthdateA && birthdateB) },
    { score: scores.age, weight: 0.05, available: Boolean(member.age && candidate.age) },
    { score: scores.barangay, weight: 0.05, available: true },
    { score: scores.facebook, weight: 0.05, available: Boolean(normalizedFacebook && normalizedCandidateFacebook) },
  ];

  const availableWeight = weightedScores.reduce((sum, entry) => sum + (entry.available ? entry.weight : 0), 0);
  const weightedTotal = weightedScores.reduce(
    (sum, entry) => sum + (entry.available ? entry.score * entry.weight : 0),
    0,
  );
  const probability = availableWeight > 0 ? weightedTotal / availableWeight : 0;

  return { probability, scores };
}

function getDuplicateRiskLevel(probability: number): "high" | "medium" | "low" | "none" {
  if (probability >= 0.85) return "high";
  if (probability >= 0.72) return "medium";
  if (probability >= 0.55) return "low";
  return "none";
}

function formatProbability(probability: number) {
  return `${Math.round(probability * 100)}%`;
}

function getMemberProfilePhotoSrc(photoUrl: string | null | undefined) {
  const normalizedPhotoUrl = (photoUrl || "").trim();
  if (!normalizedPhotoUrl) {
    return undefined;
  }

  return getDisplayImageUrl(normalizedPhotoUrl);
}

function getMemberInitials(fullName: string | null | undefined) {
  const normalizedName = (fullName || "").trim();
  if (!normalizedName) {
    return "NA";
  }

  const nameParts = normalizedName.split(/\s+/).filter(Boolean);
  const initials = nameParts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "NA";
}

function toDirectoryEditFormState(member: MemberWithLifecycle): DirectoryEditFormState {
  return {
    fullName: member.fullName || "",
    age: String(member.age ?? ""),
    birthdate: toDateKey(member.birthdate),
    contactNumber: member.contactNumber || "",
    email: member.email || "",
    facebookLink: member.facebookLink || "",
    barangayId: member.barangayId || "chapter-direct",
  };
}

export default function MemberDashboardPanel({ chapterId, chapterName, barangayId }: MemberDashboardPanelProps) {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const isMobile = useIsMobile();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [applicationSearchTerm, setApplicationSearchTerm] = useState("");
  const [applicationScopeFilter, setApplicationScopeFilter] = useState<ApplicationScopeFilter>("all");
  const [applicationBarangayFilter, setApplicationBarangayFilter] = useState<string>("all");
  const [applicationVoterFilter, setApplicationVoterFilter] = useState<ApplicationVoterFilter>("all");
  const [selectedBarangayFilter, setSelectedBarangayFilter] = useState("all");
  const [memberScopeFilter, setMemberScopeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [memberSubTab, setMemberSubTab] = useState<"applications" | "directory" | "analytics">("applications");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [applicantDetailsOpen, setApplicantDetailsOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<MemberWithLifecycle | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [selectedPrimaryApplication, setSelectedPrimaryApplication] = useState<MemberWithLifecycle | null>(null);
  const [selectedDuplicateCandidates, setSelectedDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [selectedComparisonCandidateId, setSelectedComparisonCandidateId] = useState<string | null>(null);
  const [mergeFieldSelectionByKey, setMergeFieldSelectionByKey] = useState<Partial<Record<MergeSelectableField, MergeFieldSource>>>({});
  const [directoryDetailsOpen, setDirectoryDetailsOpen] = useState(false);
  const [selectedDirectoryMemberId, setSelectedDirectoryMemberId] = useState<string | null>(null);
  const [directoryHouseholdSizeInput, setDirectoryHouseholdSizeInput] = useState("1");
  const [directoryEditRegisteredVoter, setDirectoryEditRegisteredVoter] = useState(false);
  const [directoryEditIsActive, setDirectoryEditIsActive] = useState(false);
  const [directoryPhotoFile, setDirectoryPhotoFile] = useState<File | null>(null);
  const [directoryPhotoPreviewUrl, setDirectoryPhotoPreviewUrl] = useState<string | null>(null);
  const [directoryPhotoMarkedForRemoval, setDirectoryPhotoMarkedForRemoval] = useState(false);
  const [isEditingDirectoryInfo, setIsEditingDirectoryInfo] = useState(false);
  const [directoryEditForm, setDirectoryEditForm] = useState<DirectoryEditFormState>(defaultDirectoryEditFormState);
  const [isExportingApplicationsPdf, setIsExportingApplicationsPdf] = useState(false);
  const [isExportingDirectoryPdf, setIsExportingDirectoryPdf] = useState(false);
  const [applicationsExportDialogOpen, setApplicationsExportDialogOpen] = useState(false);
  const [directoryExportDialogOpen, setDirectoryExportDialogOpen] = useState(false);
  const [applicationsExportReportTitle, setApplicationsExportReportTitle] = useState("Member Applications Report");
  const [directoryExportReportTitle, setDirectoryExportReportTitle] = useState("Member Directory Report");
  const [applicationsExportSections, setApplicationsExportSections] = useState<ApplicationsExportSections>({
    scope: true,
    applicationsTable: true,
    originByBarangay: true,
  });
  const [applicationsExportColumns, setApplicationsExportColumns] = useState<ApplicationsExportColumns>({
    name: true,
    referenceId: true,
    type: true,
    barangay: true,
    contact: true,
    submitted: true,
    directoryCheck: true,
    duplicateCheck: true,
  });
  const [directoryExportSections, setDirectoryExportSections] = useState<DirectoryExportSections>({
    scope: true,
    directoryTable: true,
  });
  const [directoryExportColumns, setDirectoryExportColumns] = useState<DirectoryExportColumns>({
    name: true,
    type: true,
    barangay: true,
    age: true,
    household: true,
    contact: true,
    voter: true,
    active: true,
    dateAdded: true,
  });

  useEffect(() => {
    if (isMobile) {
      setViewMode((current) => (current === "table" ? "tile" : current));
    }
  }, [isMobile]);

  const form = useForm<AddMemberFormData>({
    defaultValues: {
      fullName: "",
      age: 18,
      householdSize: 1,
      birthdate: "",
      contactNumber: "",
      email: "",
      registeredVoter: false,
      facebookLink: "",
      isActive: false,
    }
  });

  const membersQueryEnabled = !!chapterId;

  const {
    data: members = [],
    isLoading: membersLoading,
    isFetched: membersFetched,
  } = useQuery<MemberWithLifecycle[]>({
    queryKey: ["/api/members", { chapterId, barangayId }],
    queryFn: async () => {
      let url = `/api/members?chapterId=${chapterId}`;
      if (barangayId) {
        url += `&barangayId=${barangayId}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: membersQueryEnabled,
  });

  const {
    data: barangays = [],
    isLoading: barangaysLoading,
    isFetched: barangaysFetched,
  } = useQuery<BarangayOption[]>({
    queryKey: ["/api/chapters", chapterId, "barangays"],
    queryFn: async () => {
      if (!chapterId) return [];
      const res = await fetch(`/api/chapters/${chapterId}/barangays`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: membersQueryEnabled,
  });

  const isDashboardMembersLoading =
    membersQueryEnabled &&
    (membersLoading || !membersFetched || barangaysLoading || !barangaysFetched);

  const createMutation = useMutation({
    mutationFn: async (data: AddMemberFormData) => {
      return await apiRequest("POST", "/api/members", {
        ...data,
        birthdate: data.birthdate || null,
        chapterId,
        barangayId: barangayId || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MemberUpdatePayload }) => {
      setUpdatingMemberId(id);
      return await apiRequest("PATCH", `/api/members/${id}`, data);
    },
    onSuccess: (updatedMember: MemberWithLifecycle) => {
      toast({ title: "Success", description: "Member updated successfully" });
      queryClient.setQueriesData({ queryKey: ["/api/members"] }, (currentData: unknown) => {
        if (!Array.isArray(currentData)) {
          return currentData;
        }

        return currentData.map((member) => {
          if (!member || typeof member !== "object") {
            return member;
          }

          return (member as { id?: string }).id === updatedMember.id
            ? { ...(member as Record<string, unknown>), ...updatedMember }
            : member;
        });
      });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setUpdatingMemberId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setUpdatingMemberId(null);
    }
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return await apiRequest("DELETE", `/api/members/${memberId}`, {});
    },
    onSuccess: (_result, memberId) => {
      toast({ title: "Success", description: "Member deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });

      if (selectedDirectoryMemberId === memberId) {
        setDirectoryDetailsOpen(false);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete member", variant: "destructive" });
    },
  });

  const deleteDuplicateMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return await apiRequest("DELETE", `/api/members/${memberId}/duplicate`, {});
    },
    onSuccess: (_result, memberId) => {
      toast({ title: "Success", description: "Duplicate application deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });

      if (selectedPrimaryApplication?.id === memberId) {
        setDuplicateDialogOpen(false);
        setSelectedPrimaryApplication(null);
        setSelectedDuplicateCandidates([]);
        setSelectedComparisonCandidateId(null);
        return;
      }

      setSelectedDuplicateCandidates((currentCandidates) => {
        const remainingCandidates = currentCandidates.filter((candidate) => candidate.member.id !== memberId);
        if (remainingCandidates.length === 0) {
          setDuplicateDialogOpen(false);
          setSelectedPrimaryApplication(null);
          setSelectedComparisonCandidateId(null);
        } else if (selectedComparisonCandidateId === memberId) {
          setSelectedComparisonCandidateId(remainingCandidates[0].member.id);
        }

        return remainingCandidates;
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete duplicate application", variant: "destructive" });
    },
  });

  const mergeDuplicateMutation = useMutation({
    mutationFn: async ({
      primaryId,
      duplicateId,
      fieldSources,
    }: {
      primaryId: string;
      duplicateId: string;
      fieldSources?: Partial<Record<MergeSelectableField, string>>;
    }) => {
      return await apiRequest("POST", `/api/members/${primaryId}/merge`, {
        duplicateMemberId: duplicateId,
        fieldSources,
      });
    },
    onSuccess: (_result, variables) => {
      toast({ title: "Success", description: "Applications merged successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });

      if (selectedPrimaryApplication?.id === variables.duplicateId) {
        setDuplicateDialogOpen(false);
        setSelectedPrimaryApplication(null);
        setSelectedDuplicateCandidates([]);
        setSelectedComparisonCandidateId(null);
        return;
      }

      setSelectedDuplicateCandidates((currentCandidates) => {
        const remainingCandidates = currentCandidates.filter((candidate) => candidate.member.id !== variables.duplicateId);
        if (remainingCandidates.length === 0) {
          setDuplicateDialogOpen(false);
          setSelectedPrimaryApplication(null);
          setSelectedComparisonCandidateId(null);
        } else {
          setSelectedComparisonCandidateId(remainingCandidates[0].member.id);
        }

        return remainingCandidates;
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to merge applications", variant: "destructive" });
    },
  });

  const barangayNameById = useMemo(() => {
    return new Map(
      barangays
        .filter((barangay) => Boolean(barangay.id))
        .map((barangay) => [barangay.id, barangay.barangayName] as const)
    );
  }, [barangays]);

  const getBarangayLabel = (member: MemberWithLifecycle) => {
    if (!member.barangayId) return "Chapter Direct";
    return barangayNameById.get(member.barangayId) || "Unknown Barangay";
  };

  const getMemberScope = (member: MemberWithLifecycle) => (member.barangayId ? "barangay" : "chapter");

  const resolveMemberApplicationStatus = (member: MemberWithLifecycle): MemberApplicationStatus => {
    const normalizedResolvedStatus = (member.resolvedApplicationStatus || "").toLowerCase();
    if (normalizedResolvedStatus === "approved" || normalizedResolvedStatus === "pending" || normalizedResolvedStatus === "rejected") {
      return normalizedResolvedStatus;
    }

    const normalizedStatus = (member.applicationStatus || "").toLowerCase();
    if (normalizedStatus === "approved" || normalizedStatus === "pending" || normalizedStatus === "rejected") {
      return normalizedStatus;
    }

    return member.isActive ? "approved" : "pending";
  };

  const approvedDirectoryMembers = useMemo(
    () => members.filter((member) => resolveMemberApplicationStatus(member) === "approved"),
    [members],
  );

  const selectedDirectoryMember = useMemo(() => {
    if (!selectedDirectoryMemberId) {
      return null;
    }

    return approvedDirectoryMembers.find((member) => member.id === selectedDirectoryMemberId) || null;
  }, [approvedDirectoryMembers, selectedDirectoryMemberId]);

  useEffect(() => {
    if (!selectedDirectoryMemberId) {
      return;
    }

    const currentMember = approvedDirectoryMembers.find((member) => member.id === selectedDirectoryMemberId);
    if (!currentMember) {
      return;
    }

    setDirectoryHouseholdSizeInput(String(currentMember.householdSize ?? 1));
    setDirectoryEditRegisteredVoter(Boolean(currentMember.registeredVoter));
    setDirectoryEditIsActive(Boolean(currentMember.isActive));
    setDirectoryPhotoFile(null);
    setDirectoryPhotoMarkedForRemoval(false);
    setDirectoryPhotoPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return null;
    });
    setDirectoryEditForm(toDirectoryEditFormState(currentMember));
    setIsEditingDirectoryInfo(false);
  }, [approvedDirectoryMembers, selectedDirectoryMemberId]);

  useEffect(() => {
    return () => {
      setDirectoryPhotoPreviewUrl((currentPreviewUrl) => {
        if (currentPreviewUrl) {
          URL.revokeObjectURL(currentPreviewUrl);
        }
        return null;
      });
    };
  }, []);

  const filteredMembers = approvedDirectoryMembers.filter(member => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const matchesSearch = (
      member.fullName.toLowerCase().includes(search) ||
      member.email?.toLowerCase().includes(search) ||
      member.contactNumber?.toLowerCase().includes(search) ||
      member.applicationReferenceId?.toLowerCase().includes(search)
    );

    return matchesSearch;
  }).filter((member) => {
    if (memberScopeFilter !== "all" && getMemberScope(member) !== memberScopeFilter) {
      return false;
    }

    if (selectedBarangayFilter === "all") {
      return true;
    }

    if (selectedBarangayFilter === "chapter-direct") {
      return !member.barangayId;
    }

    return member.barangayId === selectedBarangayFilter;
  });

  const memberPagination = usePagination(filteredMembers, {
    pageSize: 10,
    resetKey: `${searchTerm}|${memberScopeFilter}|${selectedBarangayFilter}|${filteredMembers.length}`,
  });

  const onSubmit = (data: AddMemberFormData) => {
    createMutation.mutate({
      ...data,
      age: Number(data.age),
      householdSize: Math.max(1, Number(data.householdSize) || 1),
    });
  };

  const updateHouseholdSize = (member: MemberWithLifecycle, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast({
        title: "Invalid household size",
        description: "Household size must be a whole number of at least 1.",
        variant: "destructive",
      });
      return;
    }

    if (parsed === (member.householdSize ?? 1)) {
      return;
    }

    updateMutation.mutate({
      id: member.id,
      data: { householdSize: parsed },
    });
  };

  const totalMembers = members.length;
  const activeMembers = members.filter(m => m.isActive).length;
  const registeredVoters = members.filter(m => m.registeredVoter).length;

  const getMemberApplicationStatus = (member: MemberWithLifecycle): MemberApplicationStatus => {
    return resolveMemberApplicationStatus(member);
  };

  const getMemberLifecycleState = (member: MemberWithLifecycle): MemberLifecycleState => {
    const normalizedLifecycleState = (member.memberLifecycleState || "").toLowerCase();
    if (normalizedLifecycleState === "member" || normalizedLifecycleState === "applying" || normalizedLifecycleState === "rejected") {
      return normalizedLifecycleState;
    }

    const resolvedStatus = getMemberApplicationStatus(member);
    if (resolvedStatus === "approved") {
      return "member";
    }

    if (resolvedStatus === "pending") {
      return "applying";
    }

    return "rejected";
  };

  const getLifecycleLabel = (lifecycleState: MemberLifecycleState) => {
    if (lifecycleState === "member") {
      return "Already Member";
    }

    if (lifecycleState === "applying") {
      return "Still Applying";
    }

    return "Rejected";
  };

  const getLifecycleBadgeVariant = (lifecycleState: MemberLifecycleState): "default" | "secondary" | "destructive" => {
    if (lifecycleState === "member") {
      return "default";
    }

    if (lifecycleState === "applying") {
      return "secondary";
    }

    return "destructive";
  };

  const pendingApplications = members.filter((member) => getMemberApplicationStatus(member) === "pending");

  const getApplicationBarangayFilterKeyForMember = (member: MemberWithLifecycle) => {
    if (!member.barangayId) {
      return "chapter-direct";
    }

    if (!barangayNameById.has(member.barangayId)) {
      return "unknown-barangay";
    }

    return `barangay:${member.barangayId}`;
  };

  const filteredPendingApplications = useMemo(() => {
    const normalizedSearch = applicationSearchTerm.trim().toLowerCase();

    return pendingApplications.filter((member) => {
      const barangayLabel = getBarangayLabel(member);
      const barangayFilterKey = getApplicationBarangayFilterKeyForMember(member);

      const matchesSearch = !normalizedSearch || (
        member.fullName.toLowerCase().includes(normalizedSearch) ||
        (member.email || "").toLowerCase().includes(normalizedSearch) ||
        (member.contactNumber || "").toLowerCase().includes(normalizedSearch) ||
        (member.applicationReferenceId || "").toLowerCase().includes(normalizedSearch) ||
        barangayLabel.toLowerCase().includes(normalizedSearch)
      );

      const matchesScope =
        applicationScopeFilter === "all" ||
        (applicationScopeFilter === "chapter-direct" && !member.barangayId) ||
        (applicationScopeFilter === "barangay-only" && Boolean(member.barangayId));

      const matchesBarangay =
        applicationBarangayFilter === "all" ||
        barangayFilterKey === applicationBarangayFilter;

      const matchesVoter =
        applicationVoterFilter === "all" ||
        (applicationVoterFilter === "registered-voter" && member.registeredVoter) ||
        (applicationVoterFilter === "not-registered-voter" && !member.registeredVoter);

      return matchesSearch && matchesScope && matchesBarangay && matchesVoter;
    });
  }, [
    applicationBarangayFilter,
    applicationScopeFilter,
    applicationSearchTerm,
    applicationVoterFilter,
    barangayNameById,
    pendingApplications,
  ]);
  const duplicateComparisonPool = members.filter((member) => getMemberApplicationStatus(member) !== "rejected");
  const chapterDirectMembers = approvedDirectoryMembers.filter((member) => !member.barangayId).length;
  const barangayBasedMembers = approvedDirectoryMembers.length - chapterDirectMembers;

  const normalizeMemberName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizeContactNumber = (value?: string | null) => (value || "").replace(/\D+/g, "");
  const buildMemberIdentityKey = (member: Member) => {
    const chapterScope = member.chapterId || "no-chapter";
    return `${chapterScope}::${normalizeMemberName(member.fullName)}::${normalizeContactNumber(member.contactNumber)}`;
  };

  const approvedDirectoryIdentityKeys = new Set<string>();
  const memberIdentityCounts = new Map<string, number>();

  for (const member of members) {
    const identityKey = buildMemberIdentityKey(member);
    memberIdentityCounts.set(identityKey, (memberIdentityCounts.get(identityKey) || 0) + 1);

    if (getMemberApplicationStatus(member) === "approved") {
      approvedDirectoryIdentityKeys.add(identityKey);
    }
  }

  const getPendingApplicationInsights = (member: Member) => {
    const identityKey = buildMemberIdentityKey(member);
    const directoryRecordCount = memberIdentityCounts.get(identityKey) || 0;

    return {
      inOfficialDirectory: directoryRecordCount > 0,
      hasApprovedDirectoryRecord: approvedDirectoryIdentityKeys.has(identityKey),
      directoryRecordCount,
    };
  };

  const uniqueApplicantIdentityCount = useMemo(() => {
    const uniqueIdentities = new Set<string>();
    for (const member of pendingApplications) {
      uniqueIdentities.add(buildMemberIdentityKey(member));
    }

    return uniqueIdentities.size;
  }, [pendingApplications]);

  const chapterDirectPendingApplicationsCount = pendingApplications.filter((member) => !member.barangayId).length;
  const barangayBasedPendingApplicationsCount = pendingApplications.length - chapterDirectPendingApplicationsCount;

  const pendingApplicationsByBarangay = useMemo(() => {
    const counts = new Map<string, { filterKey: string; barangay: string; applications: number }>();

    for (const member of pendingApplications) {
      const filterKey = getApplicationBarangayFilterKeyForMember(member);
      const barangayLabel = getBarangayLabel(member);

      if (!counts.has(filterKey)) {
        counts.set(filterKey, {
          filterKey,
          barangay: barangayLabel,
          applications: 0,
        });
      }

      const currentEntry = counts.get(filterKey);
      if (currentEntry) {
        currentEntry.applications += 1;
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.applications - a.applications || a.barangay.localeCompare(b.barangay));
  }, [pendingApplications]);

  const chartPendingApplicationsByBarangay = useMemo(() => {
    const counts = new Map<string, { filterKey: string; barangay: string; applications: number }>();

    for (const member of filteredPendingApplications) {
      const filterKey = getApplicationBarangayFilterKeyForMember(member);
      const barangayLabel = member.barangayId
        ? barangayNameById.get(member.barangayId) || "Unknown Barangay"
        : "Chapter Direct";

      if (!counts.has(filterKey)) {
        counts.set(filterKey, {
          filterKey,
          barangay: barangayLabel,
          applications: 0,
        });
      }

      const currentEntry = counts.get(filterKey);
      if (currentEntry) {
        currentEntry.applications += 1;
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.applications - a.applications || a.barangay.localeCompare(b.barangay));
  }, [barangayNameById, filteredPendingApplications]);

  const selectableApplicationBarangayOptions = useMemo(() => {
    return pendingApplicationsByBarangay.filter((entry) => entry.filterKey.startsWith("barangay:"));
  }, [pendingApplicationsByBarangay]);

  const unknownBarangayPendingApplicationsCount = useMemo(() => {
    return pendingApplicationsByBarangay.find((entry) => entry.filterKey === "unknown-barangay")?.applications || 0;
  }, [pendingApplicationsByBarangay]);

  const pendingApplicationsScopeData = useMemo(() => {
    const filteredChapterDirectCount = filteredPendingApplications.filter((member) => !member.barangayId).length;
    const filteredBarangayCount = filteredPendingApplications.length - filteredChapterDirectCount;

    return [
      { scope: "Chapter Direct", applications: filteredChapterDirectCount, filterKey: "chapter-direct" as const },
      { scope: "Barangay Member", applications: filteredBarangayCount, filterKey: "barangay-only" as const },
    ].filter((entry) => entry.applications > 0);
  }, [filteredPendingApplications]);

  const pendingApplicationsVoterData = useMemo(() => {
    const registeredVoterCount = filteredPendingApplications.filter((member) => member.registeredVoter).length;

    return [
      { label: "Registered Voter", applications: registeredVoterCount, filterKey: "registered-voter" as const },
      { label: "Not Registered", applications: filteredPendingApplications.length - registeredVoterCount, filterKey: "not-registered-voter" as const },
    ].filter((entry) => entry.applications > 0);
  }, [filteredPendingApplications]);

  const originChartHeight = Math.min(520, Math.max(240, chartPendingApplicationsByBarangay.length * 44));

  const getApplicationBarangayFilterLabel = (filterKey: string) => {
    if (filterKey === "all") {
      return "All Application Barangays";
    }

    if (filterKey === "chapter-direct") {
      return "Chapter Direct";
    }

    if (filterKey === "unknown-barangay") {
      return "Unknown Barangay";
    }

    return pendingApplicationsByBarangay.find((entry) => entry.filterKey === filterKey)?.barangay || "Selected Barangay";
  };

  const clearApplicationFilters = () => {
    setApplicationSearchTerm("");
    setApplicationScopeFilter("all");
    setApplicationBarangayFilter("all");
    setApplicationVoterFilter("all");
  };

  const applyApplicationBarangayFilter = (nextFilter: string, syncScopeWhenAll = false) => {
    const normalizedFilter = nextFilter || "all";
    setApplicationBarangayFilter(normalizedFilter);

    if (normalizedFilter === "chapter-direct") {
      setApplicationScopeFilter("chapter-direct");
      return;
    }

    if (normalizedFilter !== "all") {
      setApplicationScopeFilter("barangay-only");
      return;
    }

    if (syncScopeWhenAll) {
      setApplicationScopeFilter("all");
    }
  };

  const applicationsPagination = usePagination(filteredPendingApplications, {
    pageSize: 10,
    resetKey: `${chapterId}|${barangayId || "all"}|${applicationSearchTerm}|${applicationScopeFilter}|${applicationBarangayFilter}|${applicationVoterFilter}|${filteredPendingApplications.length}`,
  });

  const duplicateAnalysisByMemberId = useMemo(() => {
    const analysisMap = new Map<string, DuplicateAnalysis>();

    for (const member of pendingApplications) {
      const candidates = duplicateComparisonPool
        .filter((candidate) => candidate.id !== member.id)
        .map((candidate) => {
          const duplicateScore = computeDuplicateProbability(member, candidate);
          return {
            member: candidate,
            probability: duplicateScore.probability,
            scores: duplicateScore.scores,
          };
        })
        .filter((candidate) => {
          const matchesStrongSignal =
            candidate.scores.name >= 0.62 ||
            candidate.scores.contact >= 0.75 ||
            candidate.scores.email >= 0.85 ||
            candidate.scores.birthdate === 1;

          return candidate.probability >= 0.55 && matchesStrongSignal;
        })
        .sort((a, b) => {
          const probabilityDiff = b.probability - a.probability;
          if (probabilityDiff !== 0) {
            return probabilityDiff;
          }

          const bStatusWeight = getMemberApplicationStatus(b.member) === "approved" ? 1 : 0;
          const aStatusWeight = getMemberApplicationStatus(a.member) === "approved" ? 1 : 0;
          return bStatusWeight - aStatusWeight;
        });

      const topProbability = candidates[0]?.probability || 0;
      analysisMap.set(member.id, {
        candidates,
        topProbability,
        riskLevel: getDuplicateRiskLevel(topProbability),
      });
    }

    return analysisMap;
  }, [duplicateComparisonPool, pendingApplications]);

  const duplicateFlaggedApplicationsCount = useMemo(() => {
    let flaggedCount = 0;

    for (const analysis of Array.from(duplicateAnalysisByMemberId.values())) {
      if (analysis.candidates.length > 0) {
        flaggedCount += 1;
      }
    }

    return flaggedCount;
  }, [duplicateAnalysisByMemberId]);

  const selectedComparisonCandidate = useMemo(() => {
    if (selectedDuplicateCandidates.length === 0) {
      return null;
    }

    return (
      selectedDuplicateCandidates.find((candidate) => candidate.member.id === selectedComparisonCandidateId) ||
      selectedDuplicateCandidates[0]
    );
  }, [selectedComparisonCandidateId, selectedDuplicateCandidates]);

  useEffect(() => {
    if (!selectedPrimaryApplication || !selectedComparisonCandidate) {
      setMergeFieldSelectionByKey({});
      return;
    }

    setMergeFieldSelectionByKey({
      fullName: getDefaultMergeFieldSource(selectedPrimaryApplication.fullName, selectedComparisonCandidate.member.fullName),
      contactNumber: getDefaultMergeFieldSource(selectedPrimaryApplication.contactNumber, selectedComparisonCandidate.member.contactNumber),
      email: getDefaultMergeFieldSource(selectedPrimaryApplication.email, selectedComparisonCandidate.member.email),
      facebookLink: getDefaultMergeFieldSource(selectedPrimaryApplication.facebookLink, selectedComparisonCandidate.member.facebookLink),
      birthdate: getDefaultMergeFieldSource(selectedPrimaryApplication.birthdate, selectedComparisonCandidate.member.birthdate),
      age: getDefaultMergeFieldSource(selectedPrimaryApplication.age, selectedComparisonCandidate.member.age),
      barangayId: getDefaultMergeFieldSource(selectedPrimaryApplication.barangayId, selectedComparisonCandidate.member.barangayId),
      photoUrl: getDefaultMergeFieldSource(selectedPrimaryApplication.photoUrl, selectedComparisonCandidate.member.photoUrl),
    });
  }, [selectedComparisonCandidate, selectedPrimaryApplication]);

  const getMergeFieldDisplayValue = (member: MemberWithLifecycle, fieldKey: MergeSelectableField) => {
    if (fieldKey === "birthdate") {
      return member.birthdate ? formatManilaDateTime(member.birthdate) : "-";
    }

    if (fieldKey === "age") {
      return typeof member.age === "number" ? String(member.age) : "-";
    }

    if (fieldKey === "barangayId") {
      return getBarangayLabel(member);
    }

    if (fieldKey === "photoUrl") {
      return hasMeaningfulMergeValue(member.photoUrl) ? "Photo available" : "No photo";
    }

    const rawValue = member[fieldKey as keyof MemberWithLifecycle];
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      return trimmed || "-";
    }

    if (rawValue === null || rawValue === undefined) {
      return "-";
    }

    return String(rawValue);
  };

  const getMergeFieldComparableValue = (member: MemberWithLifecycle, fieldKey: MergeSelectableField) => {
    if (fieldKey === "birthdate") {
      return toDateKey(member.birthdate);
    }

    if (fieldKey === "age") {
      return typeof member.age === "number" ? String(member.age) : "";
    }

    if (fieldKey === "contactNumber") {
      return normalizePhone(member.contactNumber);
    }

    if (fieldKey === "email") {
      return normalizeLooseText(member.email);
    }

    if (fieldKey === "facebookLink") {
      return normalizeUrl(member.facebookLink);
    }

    if (fieldKey === "barangayId") {
      return (member.barangayId || "").trim().toLowerCase();
    }

    if (fieldKey === "photoUrl") {
      return (member.photoUrl || "").trim();
    }

    return normalizeLooseText(member.fullName);
  };

  const mergeFieldsWithDiscrepancy = useMemo<ReadonlyArray<{ key: MergeSelectableField; label: string }>>(() => {
    if (!selectedPrimaryApplication || !selectedComparisonCandidate) {
      return [];
    }

    return MERGE_SELECTABLE_FIELDS.filter(({ key }) => {
      const primaryComparableValue = getMergeFieldComparableValue(selectedPrimaryApplication, key);
      const duplicateComparableValue = getMergeFieldComparableValue(selectedComparisonCandidate.member, key);
      return primaryComparableValue !== duplicateComparableValue;
    });
  }, [selectedComparisonCandidate, selectedPrimaryApplication]);

  const mergeFieldSourcesPayload = useMemo<Partial<Record<MergeSelectableField, string>>>(() => {
    if (!selectedPrimaryApplication || !selectedComparisonCandidate) {
      return {};
    }

    const payload: Partial<Record<MergeSelectableField, string>> = {};

    for (const { key } of mergeFieldsWithDiscrepancy) {
      const selectedSource = mergeFieldSelectionByKey[key] || "primary";
      payload[key] = selectedSource === "primary"
        ? selectedPrimaryApplication.id
        : selectedComparisonCandidate.member.id;
    }

    return payload;
  }, [mergeFieldSelectionByKey, mergeFieldsWithDiscrepancy, selectedComparisonCandidate, selectedPrimaryApplication]);

  const selectedDuplicateActionContext = useMemo<DuplicateActionContext | null>(() => {
    if (!selectedPrimaryApplication || !selectedComparisonCandidate) {
      return null;
    }

    const primaryStatus = getMemberApplicationStatus(selectedPrimaryApplication);
    const comparisonStatus = getMemberApplicationStatus(selectedComparisonCandidate.member);

    if (comparisonStatus === "pending") {
      return {
        duplicateMemberId: selectedComparisonCandidate.member.id,
        mergePrimaryMemberId: selectedPrimaryApplication.id,
        mergeDuplicateMemberId: selectedComparisonCandidate.member.id,
        deleteLabel: "Delete Duplicate",
        mergeLabel: "Merge Duplicate",
        helperText: "The compared record is still an application. Actions will be applied to that duplicate application.",
      };
    }

    if (primaryStatus === "pending") {
      return {
        duplicateMemberId: selectedPrimaryApplication.id,
        mergePrimaryMemberId: selectedComparisonCandidate.member.id,
        mergeDuplicateMemberId: selectedPrimaryApplication.id,
        deleteLabel: "Delete Re-Application",
        mergeLabel: "Merge Into Existing Member",
        helperText: "The compared record is already a member. Actions will target the current pending re-application as the duplicate.",
      };
    }

    return null;
  }, [selectedComparisonCandidate, selectedPrimaryApplication]);

  const openDuplicateReviewDialog = (member: Member) => {
    const duplicateAnalysis = duplicateAnalysisByMemberId.get(member.id);
    if (!duplicateAnalysis || duplicateAnalysis.candidates.length === 0) {
      return;
    }

    setSelectedPrimaryApplication(member);
    setSelectedDuplicateCandidates(duplicateAnalysis.candidates);
    setSelectedComparisonCandidateId(duplicateAnalysis.candidates[0].member.id);
    setDuplicateDialogOpen(true);
  };

  const openApplicantDetailsDialog = (member: Member) => {
    setSelectedApplicant(member);
    setApplicantDetailsOpen(true);
  };

  const openDirectoryMemberDetailsDialog = (member: MemberWithLifecycle) => {
    setSelectedDirectoryMemberId(member.id);
    setDirectoryHouseholdSizeInput(String(member.householdSize ?? 1));
    setDirectoryDetailsOpen(true);
  };

  const clearDirectoryPhotoSelection = (markForRemoval = false) => {
    setDirectoryPhotoFile(null);
    setDirectoryPhotoMarkedForRemoval(markForRemoval);
    setDirectoryPhotoPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return null;
    });
  };

  const handleDirectoryPhotoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!MEMBER_PHOTO_ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      toast({
        title: "Invalid image type",
        description: "Please upload a JPG, PNG, GIF, or WEBP image.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setDirectoryPhotoFile(file);
    setDirectoryPhotoMarkedForRemoval(false);
    setDirectoryPhotoPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return nextPreviewUrl;
    });
    event.target.value = "";
  };

  const submitDirectoryMemberInfoUpdate = async () => {
    if (!selectedDirectoryMember) {
      return;
    }

    const normalizedName = directoryEditForm.fullName.trim();
    const normalizedContact = directoryEditForm.contactNumber.trim();
    const normalizedEmail = directoryEditForm.email.trim().toLowerCase();
    const normalizedFacebook = directoryEditForm.facebookLink.trim();
    const normalizedBirthdate = directoryEditForm.birthdate.trim();
    const parsedAge = Number(directoryEditForm.age);
    const parsedHouseholdSize = Number(directoryHouseholdSizeInput);

    if (!normalizedName) {
      toast({
        title: "Name is required",
        description: "Please enter the member's full name.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isInteger(parsedAge) || parsedAge < 1) {
      toast({
        title: "Invalid age",
        description: "Age must be a whole number of at least 1.",
        variant: "destructive",
      });
      return;
    }

    if (!normalizedContact) {
      toast({
        title: "Contact number is required",
        description: "Please provide a contact number.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isInteger(parsedHouseholdSize) || parsedHouseholdSize < 1) {
      toast({
        title: "Invalid household size",
        description: "Household size must be a whole number of at least 1.",
        variant: "destructive",
      });
      return;
    }

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast({
        title: "Invalid email address",
        description: "Please enter a valid email address or leave it blank.",
        variant: "destructive",
      });
      return;
    }

    const payload: MemberUpdatePayload = {};

    if (normalizedName !== selectedDirectoryMember.fullName) {
      payload.fullName = normalizedName;
    }

    if (parsedAge !== selectedDirectoryMember.age) {
      payload.age = parsedAge;
    }

    if (normalizedContact !== selectedDirectoryMember.contactNumber) {
      payload.contactNumber = normalizedContact;
    }

    const currentEmail = (selectedDirectoryMember.email || "").trim().toLowerCase();
    if (normalizedEmail !== currentEmail) {
      payload.email = normalizedEmail || null;
    }

    const currentFacebook = (selectedDirectoryMember.facebookLink || "").trim();
    if (normalizedFacebook !== currentFacebook) {
      payload.facebookLink = normalizedFacebook || null;
    }

    if (parsedHouseholdSize !== (selectedDirectoryMember.householdSize ?? 1)) {
      payload.householdSize = parsedHouseholdSize;
    }

    if (directoryEditRegisteredVoter !== Boolean(selectedDirectoryMember.registeredVoter)) {
      payload.registeredVoter = directoryEditRegisteredVoter;
    }

    if (directoryEditIsActive !== Boolean(selectedDirectoryMember.isActive)) {
      payload.isActive = directoryEditIsActive;
    }

    const currentBirthdate = toDateKey(selectedDirectoryMember.birthdate);
    if (normalizedBirthdate !== currentBirthdate) {
      payload.birthdate = normalizedBirthdate || null;
    }

    if (!barangayId) {
      const nextBarangayId = directoryEditForm.barangayId === "chapter-direct"
        ? null
        : directoryEditForm.barangayId;
      const currentBarangayId = selectedDirectoryMember.barangayId || null;
      if (nextBarangayId !== currentBarangayId) {
        payload.barangayId = nextBarangayId;
      }
    }

    if (directoryPhotoFile) {
      try {
        const uploadFormData = new FormData();
        uploadFormData.append("image", directoryPhotoFile);

        const uploadResponse = await fetch("/api/upload/member-photo", {
          method: "POST",
          body: uploadFormData,
        });

        const uploadPayload = await uploadResponse.json().catch(() => null);
        if (!uploadResponse.ok) {
          const uploadError = typeof uploadPayload?.error === "string"
            ? uploadPayload.error
            : "Failed to upload profile photo.";
          throw new Error(uploadError);
        }

        if (typeof uploadPayload?.url !== "string" || !uploadPayload.url.trim()) {
          throw new Error("Failed to upload profile photo.");
        }

        payload.photoUrl = uploadPayload.url.trim();
      } catch (error: any) {
        toast({
          title: "Upload failed",
          description: error?.message || "Failed to upload profile photo.",
          variant: "destructive",
        });
        return;
      }
    } else if (directoryPhotoMarkedForRemoval && selectedDirectoryMember.photoUrl) {
      payload.photoUrl = null;
    }

    if (Object.keys(payload).length === 0) {
      toast({ title: "No changes detected" });
      setIsEditingDirectoryInfo(false);
      return;
    }

    updateMutation.mutate(
      {
        id: selectedDirectoryMember.id,
        data: payload,
      },
      {
        onSuccess: (updatedMember: MemberWithLifecycle) => {
          clearDirectoryPhotoSelection(false);
          setDirectoryEditForm(toDirectoryEditFormState(updatedMember));
          setDirectoryHouseholdSizeInput(String(updatedMember.householdSize ?? 1));
          setDirectoryEditRegisteredVoter(Boolean(updatedMember.registeredVoter));
          setDirectoryEditIsActive(Boolean(updatedMember.isActive));
          setIsEditingDirectoryInfo(false);
        },
      },
    );
  };

  const deleteDirectoryMember = async () => {
    if (!selectedDirectoryMember) {
      return;
    }

    const confirmed = await confirmDelete(
      `Are you sure you want to delete ${selectedDirectoryMember.fullName}? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    deleteMemberMutation.mutate(selectedDirectoryMember.id);
  };

  const getDirectoryCheckLabel = (insights: { hasApprovedDirectoryRecord: boolean; inOfficialDirectory: boolean }) => {
    if (insights.hasApprovedDirectoryRecord) {
      return "Official Directory (Approved Member)";
    }

    if (insights.inOfficialDirectory) {
      return "Directory Record (Pending Application, Not Yet Member)";
    }

    return "No Directory Record Yet";
  };

  const getMemberScopeFilterLabel = () => {
    if (memberScopeFilter === "chapter") {
      return "Chapter Direct Members";
    }

    if (memberScopeFilter === "barangay") {
      return "Barangay-Based Members";
    }

    return "All Members";
  };

  const getBarangayFilterLabel = () => {
    if (selectedBarangayFilter === "all") {
      return "All Barangays";
    }

    if (selectedBarangayFilter === "chapter-direct") {
      return "Chapter Direct (No Barangay)";
    }

    return barangayNameById.get(selectedBarangayFilter) || "Unknown Barangay";
  };

  const toggleApplicationsExportSection = (key: ApplicationsExportSectionKey, checked: boolean) => {
    setApplicationsExportSections((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const toggleApplicationsExportColumn = (key: keyof ApplicationsExportColumns, checked: boolean) => {
    setApplicationsExportColumns((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const toggleDirectoryExportSection = (key: DirectoryExportSectionKey, checked: boolean) => {
    setDirectoryExportSections((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const toggleDirectoryExportColumn = (key: keyof DirectoryExportColumns, checked: boolean) => {
    setDirectoryExportColumns((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const applyApplicationsExportPreset = (preset: ExportPreset) => {
    if (preset === "minimal") {
      setApplicationsExportSections({
        scope: true,
        applicationsTable: true,
        originByBarangay: false,
      });
      setApplicationsExportColumns({
        name: true,
        referenceId: true,
        type: true,
        barangay: true,
        contact: false,
        submitted: true,
        directoryCheck: false,
        duplicateCheck: false,
      });
      return;
    }

    if (preset === "standard") {
      setApplicationsExportSections({
        scope: true,
        applicationsTable: true,
        originByBarangay: true,
      });
      setApplicationsExportColumns({
        name: true,
        referenceId: true,
        type: true,
        barangay: true,
        contact: true,
        submitted: true,
        directoryCheck: true,
        duplicateCheck: false,
      });
      return;
    }

    setApplicationsExportSections({
      scope: true,
      applicationsTable: true,
      originByBarangay: true,
    });
    setApplicationsExportColumns({
      name: true,
      referenceId: true,
      type: true,
      barangay: true,
      contact: true,
      submitted: true,
      directoryCheck: true,
      duplicateCheck: true,
    });
  };

  const applyDirectoryExportPreset = (preset: ExportPreset) => {
    if (preset === "minimal") {
      setDirectoryExportSections({
        scope: true,
        directoryTable: true,
      });
      setDirectoryExportColumns({
        name: true,
        type: true,
        barangay: true,
        age: false,
        household: false,
        contact: true,
        voter: false,
        active: false,
        dateAdded: true,
      });
      return;
    }

    if (preset === "standard") {
      setDirectoryExportSections({
        scope: true,
        directoryTable: true,
      });
      setDirectoryExportColumns({
        name: true,
        type: true,
        barangay: true,
        age: true,
        household: false,
        contact: true,
        voter: true,
        active: true,
        dateAdded: true,
      });
      return;
    }

    setDirectoryExportSections({
      scope: true,
      directoryTable: true,
    });
    setDirectoryExportColumns({
      name: true,
      type: true,
      barangay: true,
      age: true,
      household: true,
      contact: true,
      voter: true,
      active: true,
      dateAdded: true,
    });
  };

  const createChapterFileToken = () => createSafeFileToken(chapterName || "chapter", "chapter");

  const handleExportApplicationsPdf = async () => {
    if (isExportingApplicationsPdf) {
      return;
    }

    if (!Object.values(applicationsExportSections).some(Boolean)) {
      toast({
        title: "Select at least one section",
        description: "Choose at least one report section before exporting the PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingApplicationsPdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      exportContract = createPdfExportContract({
        reportId: "chapter-member-applications",
        purpose: "chapter_membership_application_review",
        title: applicationsExportReportTitle.trim() || "Member Applications Report",
        subtitle: chapterName ? `${chapterName} | Pending application records` : "Pending application records",
        selectedSections: applicationsExportSections,
        selectedColumns: applicationsExportColumns,
        filters: {
          chapterName: chapterName || "-",
          search: applicationSearchTerm.trim() || "",
          pendingApplications: filteredPendingApplications.length,
        },
        filenamePolicy: {
          prefix: "YSP-Applications",
          includeChapterToken: true,
          includeDateStamp: true,
        },
        snapshotMetadata: {
          actorRole: "chapter",
          chapterId,
          barangayId,
        },
      });

      const report = await createYspPdfReport({
        reportTitle: exportContract.title,
        reportSubtitle: exportContract.subtitle,
      });

      if (applicationsExportSections.scope) {
        report.addSectionTitle("Report Scope");
        report.addMetricRow("Chapter", chapterName || "-");
        report.addMetricRow("Pending Applications", String(filteredPendingApplications.length));
        report.addMetricRow("Search Filter", applicationSearchTerm.trim() || "None");
        report.addMetricRow("Unique Applicants", String(uniqueApplicantIdentityCount));
        report.addMetricRow("Duplicate Alerts", String(duplicateFlaggedApplicationsCount));
        report.addMetricRow(
          "Applicant Type Mix",
          `${chapterDirectPendingApplicationsCount} Chapter Direct / ${barangayBasedPendingApplicationsCount} Barangay`,
        );
        report.addSpacer(8);
      }

      if (applicationsExportSections.applicationsTable) {
        report.addSectionTitle("Pending Applications Table");

        const selectedColumns: Array<{ header: string; key: string; width: number }> = [];
        if (applicationsExportColumns.name) selectedColumns.push({ header: "Name", key: "name", width: 2.2 });
        if (applicationsExportColumns.referenceId) selectedColumns.push({ header: "Reference ID", key: "referenceId", width: 1.8 });
        if (applicationsExportColumns.type) selectedColumns.push({ header: "Type", key: "type", width: 1.2 });
        if (applicationsExportColumns.barangay) selectedColumns.push({ header: "Barangay", key: "barangay", width: 1.5 });
        if (applicationsExportColumns.contact) selectedColumns.push({ header: "Contact", key: "contact", width: 1.4 });
        if (applicationsExportColumns.submitted) selectedColumns.push({ header: "Submitted", key: "submitted", width: 1.2 });
        if (applicationsExportColumns.directoryCheck) selectedColumns.push({ header: "Directory Check", key: "directoryCheck", width: 1.7 });
        if (applicationsExportColumns.duplicateCheck) selectedColumns.push({ header: "Duplicate Check", key: "duplicateCheck", width: 1.6 });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No application table columns selected.", "muted");
          report.addSpacer(6);
        } else {
          const rows = filteredPendingApplications.map((member) => {
            const applicationInsights = getPendingApplicationInsights(member);
            const duplicateAnalysis = duplicateAnalysisByMemberId.get(member.id);
            const duplicateCheckLabel = duplicateAnalysis && duplicateAnalysis.candidates.length > 0
              ? `${duplicateAnalysis.riskLevel.toUpperCase()} ${formatProbability(duplicateAnalysis.topProbability)} (${duplicateAnalysis.candidates.length})`
              : "No Duplicate";

            const row: Record<string, string | number> = {};
            if (applicationsExportColumns.name) row.name = member.fullName || "-";
            if (applicationsExportColumns.referenceId) row.referenceId = member.applicationReferenceId || "-";
            if (applicationsExportColumns.type) row.type = member.barangayId ? "Barangay Member" : "Chapter Member";
            if (applicationsExportColumns.barangay) row.barangay = getBarangayLabel(member);
            if (applicationsExportColumns.contact) row.contact = member.contactNumber || "-";
            if (applicationsExportColumns.submitted) row.submitted = format(new Date(member.createdAt), "MMM d, yyyy");
            if (applicationsExportColumns.directoryCheck) row.directoryCheck = getDirectoryCheckLabel(applicationInsights);
            if (applicationsExportColumns.duplicateCheck) row.duplicateCheck = duplicateCheckLabel;

            return row;
          });

          report.addTable(selectedColumns, rows, { emptyMessage: "No pending applications in this workspace." });
        }
      }

      if (applicationsExportSections.originByBarangay) {
        report.addSectionTitle("Applicant Origin by Barangay");
        report.addTable(
          [
            { header: "Barangay", key: "barangay", width: 2.5 },
            { header: "Applications", key: "applications", width: 1, align: "right" },
          ],
          pendingApplicationsByBarangay.map((entry) => ({
            barangay: entry.barangay,
            applications: entry.applications,
          })),
          { emptyMessage: "No barangay application data yet." },
        );
      }

      const fileDate = getIsoDateFileStamp();
      report.save(`YSP-Applications-${createChapterFileToken()}-${fileDate}.pdf`);

      setApplicationsExportDialogOpen(false);
      toast({ title: "PDF Exported", description: "Applications PDF report downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export applications PDF report", error);
      toast({
        title: "Export failed",
        description: "Unable to generate applications PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingApplicationsPdf(false);
    }
  };

  const handleExportDirectoryPdf = async () => {
    if (isExportingDirectoryPdf) {
      return;
    }

    if (!Object.values(directoryExportSections).some(Boolean)) {
      toast({
        title: "Select at least one section",
        description: "Choose at least one report section before exporting the PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingDirectoryPdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      exportContract = createPdfExportContract({
        reportId: "chapter-member-directory",
        purpose: "chapter_member_directory",
        title: directoryExportReportTitle.trim() || "Member Directory Report",
        subtitle: chapterName ? `${chapterName} | Directory records` : "Directory records",
        selectedSections: directoryExportSections,
        selectedColumns: directoryExportColumns,
        filters: {
          chapterName: chapterName || "-",
          memberScopeFilter: getMemberScopeFilterLabel(),
          barangayFilter: getBarangayFilterLabel(),
          search: searchTerm.trim() || "",
          viewMode,
          includedRecords: filteredMembers.length,
        },
        filenamePolicy: {
          prefix: "YSP-Directory",
          includeChapterToken: true,
          includeDateStamp: true,
        },
        snapshotMetadata: {
          actorRole: "chapter",
          chapterId,
          barangayId,
        },
      });

      const report = await createYspPdfReport({
        reportTitle: exportContract.title,
        reportSubtitle: exportContract.subtitle,
      });

      if (directoryExportSections.scope) {
        report.addSectionTitle("Report Scope");
        report.addMetricRow("Chapter", chapterName || "-");
        report.addMetricRow("Directory Records Included", String(filteredMembers.length));
        report.addMetricRow("Member Scope Filter", getMemberScopeFilterLabel());
        report.addMetricRow("Barangay Filter", getBarangayFilterLabel());
        report.addMetricRow("Search Filter", searchTerm.trim() || "None");
        report.addMetricRow("View Mode", viewMode === "table" ? "Table" : "Tile");
        report.addSpacer(8);
      }

      if (directoryExportSections.directoryTable) {
        report.addSectionTitle("Directory Table");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (directoryExportColumns.name) selectedColumns.push({ header: "Name", key: "name", width: 2.2 });
        if (directoryExportColumns.type) selectedColumns.push({ header: "Type", key: "type", width: 1.2 });
        if (directoryExportColumns.barangay) selectedColumns.push({ header: "Barangay", key: "barangay", width: 1.5 });
        if (directoryExportColumns.age) selectedColumns.push({ header: "Age", key: "age", width: 0.8, align: "right" });
        if (directoryExportColumns.household) selectedColumns.push({ header: "Household", key: "household", width: 1, align: "right" });
        if (directoryExportColumns.contact) selectedColumns.push({ header: "Contact", key: "contact", width: 1.4 });
        if (directoryExportColumns.voter) selectedColumns.push({ header: "Registered Voter", key: "voter", width: 1.1, align: "center" });
        if (directoryExportColumns.active) selectedColumns.push({ header: "Active", key: "active", width: 0.9, align: "center" });
        if (directoryExportColumns.dateAdded) selectedColumns.push({ header: "Date Added", key: "dateAdded", width: 1.2 });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No directory table columns selected.", "muted");
          report.addSpacer(6);
        } else {
          const rows = filteredMembers.map((member) => {
            const row: Record<string, string | number> = {};
            if (directoryExportColumns.name) row.name = member.fullName || "-";
            if (directoryExportColumns.type) row.type = member.barangayId ? "Barangay Member" : "Chapter Member";
            if (directoryExportColumns.barangay) row.barangay = getBarangayLabel(member);
            if (directoryExportColumns.age) row.age = member.age ?? "-";
            if (directoryExportColumns.household) row.household = member.householdSize ?? 1;
            if (directoryExportColumns.contact) row.contact = member.contactNumber || "-";
            if (directoryExportColumns.voter) row.voter = member.registeredVoter ? "Yes" : "No";
            if (directoryExportColumns.active) row.active = member.isActive ? "Yes" : "No";
            if (directoryExportColumns.dateAdded) row.dateAdded = format(new Date(member.createdAt), "MMM d, yyyy");

            return row;
          });

          report.addTable(selectedColumns, rows, { emptyMessage: "No members found for the selected filters." });
        }
      }

      const fileDate = getIsoDateFileStamp();
      report.save(`YSP-Directory-${createChapterFileToken()}-${fileDate}.pdf`);

      setDirectoryExportDialogOpen(false);
      toast({ title: "PDF Exported", description: "Directory PDF report downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export directory PDF report", error);
      toast({
        title: "Export failed",
        description: "Unable to generate directory PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingDirectoryPdf(false);
    }
  };

  const selectedApplicantDuplicateAnalysis = selectedApplicant
    ? duplicateAnalysisByMemberId.get(selectedApplicant.id)
    : undefined;
  const selectedApplicantInsights = selectedApplicant
    ? getPendingApplicationInsights(selectedApplicant)
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Member Dashboard
            </CardTitle>
            <CardDescription>
              Manage members for {chapterName}
            </CardDescription>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto" data-testid="button-add-chapter-member">
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Member</DialogTitle>
                <DialogDescription>Add a new member to {chapterName}</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    rules={{ required: "Name is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Full name" data-testid="input-chapter-member-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="age"
                    rules={{ required: "Age is required", min: { value: 1, message: "Age must be positive" } }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Age *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-chapter-member-age" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="householdSize"
                    rules={{ required: "Household size is required", min: { value: 1, message: "Must be at least 1" } }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Household Size *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            data-testid="input-chapter-member-household-size"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="birthdate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Birthdate</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            data-testid="input-chapter-member-birthdate" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="bg-muted/50 p-3 rounded-md">
                    <Label className="text-sm font-medium">Chapter</Label>
                    <p className="text-sm text-muted-foreground mt-1">{chapterName}</p>
                    <p className="text-xs text-muted-foreground mt-1">(Auto-filled from your account)</p>
                  </div>
                  <FormField
                    control={form.control}
                    name="contactNumber"
                    rules={{ required: "Contact number is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Phone number" data-testid="input-chapter-member-contact" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    rules={{
                      required: "Email is required",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Please enter a valid email address",
                      },
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address *</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            {...field}
                            placeholder="name@example.com"
                            data-testid="input-chapter-member-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="registeredVoter"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-chapter-member-voter"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Registered Voter</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="facebookLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Facebook Link (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://facebook.com/..." data-testid="input-chapter-member-facebook" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-chapter-member-active"
                          />
                        </FormControl>
                        <div>
                          <FormLabel className="!mt-0">Active</FormLabel>
                          <FormDescription className="text-xs">
                            Active members can participate in up to 2 programs.
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-chapter-member">
                      {createMutation.isPending ? "Adding..." : "Add Member"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-primary">{totalMembers}</div>
            <div className="text-sm text-muted-foreground">Total Members</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{activeMembers}</div>
            <div className="text-sm text-muted-foreground">Active Members</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{registeredVoters}</div>
            <div className="text-sm text-muted-foreground">Registered Voters</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{pendingApplications.length}</div>
            <div className="text-sm text-muted-foreground">Applicants</div>
          </Card>
        </div>

        <Tabs value={memberSubTab} onValueChange={(value) => setMemberSubTab(value as "applications" | "directory" | "analytics")} className="space-y-4">
          <TabsList className="w-full justify-start" data-testid="tabs-chapter-member-subpages">
            <TabsTrigger value="applications" data-testid="tab-chapter-member-applications-subpage">
              Applications
            </TabsTrigger>
            <TabsTrigger value="directory" data-testid="tab-chapter-member-directory-subpage">
              Directory
            </TabsTrigger>
            {!barangayId && (
              <TabsTrigger value="analytics" data-testid="tab-chapter-member-analytics-subpage">
                Analytics
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="applications" className="space-y-4">
            <Card data-testid="card-chapter-member-applications">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">Member Applications</CardTitle>
                    <Badge variant={pendingApplications.length > 0 ? "default" : "secondary"}>
                      {pendingApplications.length} Pending
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setApplicationsExportDialogOpen(true)}
                    disabled={isExportingApplicationsPdf}
                    data-testid="button-export-chapter-applications-pdf"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    {isExportingApplicationsPdf ? "Generating PDF..." : "Export PDF"}
                  </Button>
                </div>
                <CardDescription>
                  Applications submitted from the public membership form stay here until approved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p>PDF header and footer automatically include organization logo, organization name, full government name, motto, and SEC registry number.</p>
                  <p>Footer also includes Facebook, website, email, and export date in Manila local time (12-hour format).</p>
                </div>

                {pendingApplications.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No pending applications in this workspace.
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Unique Applicants</p>
                          <p className="text-xl font-semibold">{uniqueApplicantIdentityCount}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.max(pendingApplications.length - uniqueApplicantIdentityCount, 0)} possible duplicate entries
                          </p>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Duplicate Alerts</p>
                          <p className="text-xl font-semibold">{duplicateFlaggedApplicationsCount}</p>
                          <p className="text-xs text-muted-foreground">Applications with high/medium/low duplicate risk</p>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Top Applicant Category</p>
                          <p className="text-lg font-semibold break-words">
                            {pendingApplicationsByBarangay[0]?.barangay || "-"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pendingApplicationsByBarangay[0]?.applications || 0} applicants
                          </p>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Applicant Type Mix</p>
                          <p className="text-lg font-semibold">
                            {chapterDirectPendingApplicationsCount} Chapter Direct / {barangayBasedPendingApplicationsCount} Barangay
                          </p>
                          <p className="text-xs text-muted-foreground">Source of submitted applications</p>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-md border p-3 min-w-0 overflow-hidden lg:col-span-2">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">Applicant Origin by Barangay</p>
                            <p className="text-xs text-muted-foreground">Tap a bar to apply/remove barangay filter</p>
                          </div>

                          {chartPendingApplicationsByBarangay.length === 0 ? (
                            <div className="h-[240px] w-full rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                              No barangay application data yet.
                            </div>
                          ) : (
                            <div className="max-h-[420px] overflow-y-auto pr-1">
                              <div style={{ height: originChartHeight }} className="w-full min-w-0">
                                <ChartContainer config={applicationAnalyticsChartConfig} className="h-full w-full min-w-0 aspect-auto">
                                  <BarChart
                                    layout="vertical"
                                    data={chartPendingApplicationsByBarangay}
                                    margin={{ left: 2, right: 8, top: 8, bottom: 8 }}
                                  >
                                    <CartesianGrid horizontal={false} />
                                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                                    <YAxis
                                      type="category"
                                      dataKey="barangay"
                                      tickLine={false}
                                      axisLine={false}
                                      width={isMobile ? 130 : 200}
                                      tick={{ fontSize: 11 }}
                                      interval={0}
                                    />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                    <Bar dataKey="applications" radius={6} maxBarSize={22}>
                                      {chartPendingApplicationsByBarangay.map((entry, index) => {
                                        const isActive = applicationBarangayFilter === "all" || applicationBarangayFilter === entry.filterKey;
                                        return (
                                          <Cell
                                            key={`application-origin-bar-${entry.filterKey}`}
                                            fill={isActive ? getComparisonColor(index) : "hsl(var(--muted-foreground) / 0.2)"}
                                            style={{ cursor: "pointer" }}
                                            onClick={() => {
                                              const nextFilter = applicationBarangayFilter === entry.filterKey ? "all" : entry.filterKey;
                                              applyApplicationBarangayFilter(nextFilter, true);
                                            }}
                                          />
                                        );
                                      })}
                                    </Bar>
                                  </BarChart>
                                </ChartContainer>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="rounded-md border p-3 min-w-0 overflow-hidden">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">Applicant Scope Mix</p>
                            <p className="text-xs text-muted-foreground">Tap bars to filter scope</p>
                          </div>

                          {pendingApplicationsScopeData.length === 0 ? (
                            <div className="h-[220px] w-full rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                              No scope data yet.
                            </div>
                          ) : (
                            <ChartContainer config={applicationAnalyticsChartConfig} className="h-[240px] w-full min-w-0 aspect-auto">
                              <BarChart data={pendingApplicationsScopeData} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="scope" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
                                <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="applications" radius={6} maxBarSize={60}>
                                  {pendingApplicationsScopeData.map((entry, index) => {
                                    const isActive = applicationScopeFilter === "all" || applicationScopeFilter === entry.filterKey;
                                    return (
                                      <Cell
                                        key={`application-scope-bar-${entry.scope}-${index}`}
                                        fill={isActive ? getComparisonColor(index) : "hsl(var(--muted-foreground) / 0.2)"}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => {
                                          const nextScope = applicationScopeFilter === entry.filterKey ? "all" : entry.filterKey;
                                          setApplicationScopeFilter(nextScope);

                                          if (nextScope === "chapter-direct") {
                                            setApplicationBarangayFilter("chapter-direct");
                                          } else if (nextScope === "barangay-only" && applicationBarangayFilter === "chapter-direct") {
                                            setApplicationBarangayFilter("all");
                                          } else if (nextScope === "all" && applicationBarangayFilter === "chapter-direct") {
                                            setApplicationBarangayFilter("all");
                                          }
                                        }}
                                      />
                                    );
                                  })}
                                </Bar>
                              </BarChart>
                            </ChartContainer>
                          )}
                        </div>

                        <div className="rounded-md border p-3 min-w-0 overflow-hidden">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">Voter Count</p>
                            <p className="text-xs text-muted-foreground">Tap bars to filter by voter status</p>
                          </div>

                          {pendingApplicationsVoterData.length === 0 ? (
                            <div className="h-[220px] w-full rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                              No voter data yet.
                            </div>
                          ) : (
                            <ChartContainer config={applicationAnalyticsChartConfig} className="h-[240px] w-full min-w-0 aspect-auto">
                              <BarChart data={pendingApplicationsVoterData} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
                                <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="applications" radius={6} maxBarSize={60}>
                                  {pendingApplicationsVoterData.map((entry, index) => {
                                    const isActive = applicationVoterFilter === "all" || applicationVoterFilter === entry.filterKey;
                                    return (
                                      <Cell
                                        key={`application-voter-bar-${entry.label}-${index}`}
                                        fill={isActive ? getComparisonColor(index) : "hsl(var(--muted-foreground) / 0.2)"}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => {
                                          setApplicationVoterFilter((currentFilter) => (
                                            currentFilter === entry.filterKey ? "all" : entry.filterKey
                                          ));
                                        }}
                                      />
                                    );
                                  })}
                                </Bar>
                              </BarChart>
                            </ChartContainer>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={applicationSearchTerm}
                          onChange={(event) => setApplicationSearchTerm(event.target.value)}
                          placeholder="Search applications by name, email, phone, reference ID, or barangay..."
                          className="pl-10"
                          data-testid="input-search-chapter-applications"
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <div>
                          <Label className="mb-1.5 block text-xs text-muted-foreground">Applicant Scope</Label>
                          <Select
                            value={applicationScopeFilter}
                            onValueChange={(value) => {
                              const nextScope = value as ApplicationScopeFilter;
                              setApplicationScopeFilter(nextScope);

                              if (nextScope === "chapter-direct") {
                                setApplicationBarangayFilter("chapter-direct");
                              } else if (nextScope === "barangay-only" && applicationBarangayFilter === "chapter-direct") {
                                setApplicationBarangayFilter("all");
                              } else if (nextScope === "all" && applicationBarangayFilter === "chapter-direct") {
                                setApplicationBarangayFilter("all");
                              }
                            }}
                          >
                            <SelectTrigger data-testid="select-application-scope-filter">
                              <SelectValue placeholder="Filter by scope" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Applications</SelectItem>
                              <SelectItem value="chapter-direct">Chapter Direct Only</SelectItem>
                              <SelectItem value="barangay-only">Barangay Applicants Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="mb-1.5 block text-xs text-muted-foreground">Barangay</Label>
                          <Select
                            value={applicationBarangayFilter}
                            onValueChange={(value) => applyApplicationBarangayFilter(value)}
                          >
                            <SelectTrigger data-testid="select-application-barangay-filter">
                              <SelectValue placeholder="Filter by barangay" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Application Barangays</SelectItem>
                              <SelectItem value="chapter-direct">Chapter Direct</SelectItem>
                              {unknownBarangayPendingApplicationsCount > 0 && (
                                <SelectItem value="unknown-barangay">Unknown Barangay</SelectItem>
                              )}
                              {selectableApplicationBarangayOptions.map((entry) => (
                                <SelectItem key={entry.filterKey} value={entry.filterKey}>
                                  {entry.barangay}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="mb-1.5 block text-xs text-muted-foreground">Voter Status</Label>
                          <Select
                            value={applicationVoterFilter}
                            onValueChange={(value) => setApplicationVoterFilter(value as ApplicationVoterFilter)}
                          >
                            <SelectTrigger data-testid="select-application-voter-filter">
                              <SelectValue placeholder="Filter by voter status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Applicants</SelectItem>
                              <SelectItem value="registered-voter">Registered Voters</SelectItem>
                              <SelectItem value="not-registered-voter">Not Registered Voters</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={clearApplicationFilters}
                            disabled={
                              applicationSearchTerm.length === 0 &&
                              applicationScopeFilter === "all" &&
                              applicationBarangayFilter === "all" &&
                              applicationVoterFilter === "all"
                            }
                            data-testid="button-clear-application-filters"
                          >
                            Clear Filters
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">Filtered: {filteredPendingApplications.length}</Badge>
                        {applicationScopeFilter !== "all" && (
                          <Badge variant="secondary">
                            Scope: {applicationScopeFilter === "chapter-direct" ? "Chapter Direct" : "Barangay Applicants"}
                          </Badge>
                        )}
                        {applicationBarangayFilter !== "all" && (
                          <Badge variant="secondary">Barangay: {getApplicationBarangayFilterLabel(applicationBarangayFilter)}</Badge>
                        )}
                        {applicationVoterFilter !== "all" && (
                          <Badge variant="secondary">
                            Voter: {applicationVoterFilter === "registered-voter" ? "Registered" : "Not Registered"}
                          </Badge>
                        )}
                      </div>

                      {unknownBarangayPendingApplicationsCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Unknown Barangay appears when an application references a barangay ID that is no longer in this chapter barangay list.
                        </p>
                      )}
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full min-w-[1260px]">
                        <thead>
                          <tr className="bg-muted/40">
                            <th className="p-3 text-left text-sm font-medium">Name</th>
                            <th className="p-3 text-left text-sm font-medium">Reference ID</th>
                            <th className="p-3 text-left text-sm font-medium">Type</th>
                            <th className="p-3 text-left text-sm font-medium">Barangay</th>
                            <th className="p-3 text-left text-sm font-medium">Contact</th>
                            <th className="p-3 text-left text-sm font-medium">Submitted</th>
                            <th className="p-3 text-left text-sm font-medium">Directory Check</th>
                            <th className="p-3 text-left text-sm font-medium">Duplicate Check</th>
                            <th className="p-3 text-right text-sm font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {applicationsPagination.paginatedItems.length === 0 ? (
                            <tr className="border-t">
                              <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                                No applications found. Try adjusting your search.
                              </td>
                            </tr>
                          ) : (
                            applicationsPagination.paginatedItems.map((member) => {
                              const applicationInsights = getPendingApplicationInsights(member);
                              const duplicateAnalysis = duplicateAnalysisByMemberId.get(member.id);

                              return (
                                <tr
                                  key={member.id}
                                  className="border-t cursor-pointer hover:bg-muted/30"
                                  onClick={() => openApplicantDetailsDialog(member)}
                                  data-testid={`row-chapter-application-${member.id}`}
                                >
                                  <td className="p-3">
                                    <div className="flex items-center gap-3">
                                      <Avatar className="h-10 w-10 border">
                                        <AvatarImage
                                          src={getMemberProfilePhotoSrc(member.photoUrl)}
                                          alt={`${member.fullName} profile`}
                                        />
                                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                          {getMemberInitials(member.fullName)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="font-medium">{member.fullName}</p>
                                        <p className="text-xs text-muted-foreground">{member.email || "No email provided"}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-3 text-xs font-mono text-muted-foreground">
                                    {member.applicationReferenceId || "-"}
                                  </td>
                                  <td className="p-3">
                                    <Badge variant="outline">{member.barangayId ? "Barangay Member" : "Chapter Member"}</Badge>
                                  </td>
                                  <td className="p-3 text-sm text-muted-foreground">{getBarangayLabel(member)}</td>
                                  <td className="p-3 text-sm text-muted-foreground">{member.contactNumber}</td>
                                  <td className="p-3 text-sm text-muted-foreground">
                                    {format(new Date(member.createdAt), "MMM d, yyyy")}
                                  </td>
                                  <td className="p-3">
                                    {applicationInsights.hasApprovedDirectoryRecord ? (
                                      <Badge variant="default">Official Directory (Approved Member)</Badge>
                                    ) : applicationInsights.inOfficialDirectory ? (
                                      <Badge variant="outline">Directory Record (Pending, Not Yet Member)</Badge>
                                    ) : (
                                      <Badge variant="secondary">No Directory Record Yet</Badge>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {duplicateAnalysis && duplicateAnalysis.candidates.length > 0 ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={duplicateAnalysis.riskLevel === "high" ? "destructive" : "outline"}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openDuplicateReviewDialog(member);
                                        }}
                                        data-testid={`button-open-duplicate-review-${member.id}`}
                                      >
                                        {duplicateAnalysis.riskLevel === "high"
                                          ? "High"
                                          : duplicateAnalysis.riskLevel === "medium"
                                            ? "Medium"
                                            : "Low"}{" "}
                                        {formatProbability(duplicateAnalysis.topProbability)} ({duplicateAnalysis.candidates.length})
                                      </Button>
                                    ) : (
                                      <Badge variant="secondary">No Duplicate</Badge>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openApplicantDetailsDialog(member)}
                                        data-testid={`button-view-chapter-application-${member.id}`}
                                      >
                                        View
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-xs text-muted-foreground">
                        Showing {applicationsPagination.startItem}-{applicationsPagination.endItem} of {applicationsPagination.totalItems} applications
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => applicationsPagination.setCurrentPage(applicationsPagination.currentPage - 1)}
                          disabled={applicationsPagination.currentPage <= 1}
                          data-testid="button-chapter-applications-page-prev"
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Page {applicationsPagination.currentPage} / {applicationsPagination.totalPages}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => applicationsPagination.setCurrentPage(applicationsPagination.currentPage + 1)}
                          disabled={applicationsPagination.currentPage >= applicationsPagination.totalPages}
                          data-testid="button-chapter-applications-page-next"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Dialog
              open={applicantDetailsOpen}
              onOpenChange={(open) => {
                setApplicantDetailsOpen(open);
                if (!open) {
                  setSelectedApplicant(null);
                }
              }}
            >
              <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Applicant Details</DialogTitle>
                  <DialogDescription>
                    Review the submitted application details and decide whether to approve or reject.
                  </DialogDescription>
                </DialogHeader>

                {!selectedApplicant ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No applicant selected.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <div className="rounded-md border p-3 space-y-3">
                        <Avatar className="aspect-square h-auto w-full border">
                          <AvatarImage
                            src={getMemberProfilePhotoSrc(selectedApplicant.photoUrl)}
                            alt={`${selectedApplicant.fullName} submitted 1x1`}
                            className="object-cover"
                          />
                          <AvatarFallback className="bg-primary/10 text-primary text-3xl font-semibold">
                            {getMemberInitials(selectedApplicant.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Application Reference</p>
                          <p className="font-mono text-sm">{selectedApplicant.applicationReferenceId || "-"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{selectedApplicant.barangayId ? "Barangay Member" : "Chapter Member"}</Badge>
                          <Badge
                            variant={
                              getMemberApplicationStatus(selectedApplicant) === "approved"
                                ? "default"
                                : getMemberApplicationStatus(selectedApplicant) === "rejected"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {getMemberApplicationStatus(selectedApplicant).toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      <div className="rounded-md border p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Full Name</p>
                            <p className="text-sm font-medium">{selectedApplicant.fullName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Age</p>
                            <p className="text-sm font-medium">{selectedApplicant.age || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Contact Number</p>
                            <p className="text-sm font-medium">{selectedApplicant.contactNumber || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Email</p>
                            <p className="text-sm font-medium break-all">{selectedApplicant.email || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Birthdate</p>
                            <p className="text-sm font-medium">
                              {selectedApplicant.birthdate ? formatManilaDateTime(selectedApplicant.birthdate) : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Submitted</p>
                            <p className="text-sm font-medium">{format(new Date(selectedApplicant.createdAt), "MMM d, yyyy")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Barangay</p>
                            <p className="text-sm font-medium">{getBarangayLabel(selectedApplicant)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Chapter</p>
                            <p className="text-sm font-medium">{chapterName || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Registered Voter</p>
                            <p className="text-sm font-medium">{selectedApplicant.registeredVoter ? "Yes" : "No"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Household Size</p>
                            <p className="text-sm font-medium">{selectedApplicant.householdSize || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Household Voters</p>
                            <p className="text-sm font-medium">{selectedApplicant.householdVoters ?? "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Facebook</p>
                            <p className="text-sm font-medium break-all">{selectedApplicant.facebookLink || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Directory Check</p>
                            <p className="text-sm font-medium">
                              {selectedApplicantInsights?.hasApprovedDirectoryRecord
                                ? "Official Directory (Approved Member)"
                                : selectedApplicantInsights?.inOfficialDirectory
                                  ? "Directory Record (Pending Application, Not Yet Member)"
                                  : "No Directory Record Yet"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Duplicate Probability</p>
                            <p className="text-sm font-medium">
                              {selectedApplicantDuplicateAnalysis && selectedApplicantDuplicateAnalysis.candidates.length > 0
                                ? `${formatProbability(selectedApplicantDuplicateAnalysis.topProbability)} (${selectedApplicantDuplicateAnalysis.riskLevel.toUpperCase()})`
                                : "No strong duplicate match"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <DialogFooter className="gap-2">
                      {selectedApplicantDuplicateAnalysis && selectedApplicantDuplicateAnalysis.candidates.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (!selectedApplicant) return;
                            setApplicantDetailsOpen(false);
                            openDuplicateReviewDialog(selectedApplicant);
                          }}
                          data-testid="button-open-duplicate-review-from-applicant-details"
                        >
                          Open Duplicate Review
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          if (!selectedApplicant) return;
                          updateMutation.mutate({ id: selectedApplicant.id, data: { applicationStatus: "rejected" } });
                          setApplicantDetailsOpen(false);
                          setSelectedApplicant(null);
                        }}
                        disabled={selectedApplicant ? updatingMemberId === selectedApplicant.id : false}
                        data-testid="button-reject-from-applicant-details"
                      >
                        Reject Application
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!selectedApplicant) return;
                          updateMutation.mutate({ id: selectedApplicant.id, data: { applicationStatus: "approved" } });
                          setApplicantDetailsOpen(false);
                          setSelectedApplicant(null);
                        }}
                        disabled={selectedApplicant ? updatingMemberId === selectedApplicant.id : false}
                        data-testid="button-approve-from-applicant-details"
                      >
                        Approve Application
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog
              open={duplicateDialogOpen}
              onOpenChange={(open) => {
                setDuplicateDialogOpen(open);
                if (!open) {
                  setSelectedPrimaryApplication(null);
                  setSelectedDuplicateCandidates([]);
                  setSelectedComparisonCandidateId(null);
                }
              }}
            >
              <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Submitted Duplicate Report</DialogTitle>
                  <DialogDescription>
                    Review duplicate probability against active applications and existing members, then choose whether to delete or merge the duplicate application.
                  </DialogDescription>
                </DialogHeader>

                {!selectedPrimaryApplication || selectedDuplicateCandidates.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No duplicate candidates found for this application.
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Potential Duplicates</p>
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {selectedDuplicateCandidates.map((candidate) => (
                          <div
                            key={candidate.member.id}
                            className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                              selectedComparisonCandidate?.member.id === candidate.member.id
                                ? "border-primary bg-primary/10"
                                : "hover:bg-muted/40"
                            }`}
                          >
                            <p className="text-sm font-medium">{candidate.member.fullName}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <p className="text-xs text-muted-foreground">{candidate.member.contactNumber}</p>
                              <Badge
                                variant={getLifecycleBadgeVariant(getMemberLifecycleState(candidate.member))}
                                className="text-[10px]"
                              >
                                {getLifecycleLabel(getMemberLifecycleState(candidate.member))}
                              </Badge>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">
                                Probability: {formatProbability(candidate.probability)}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant={selectedComparisonCandidate?.member.id === candidate.member.id ? "default" : "outline"}
                                onClick={() => setSelectedComparisonCandidateId(candidate.member.id)}
                                data-testid={`button-compare-duplicate-${candidate.member.id}`}
                              >
                                Compare
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedComparisonCandidate && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
                          <div className="text-sm font-medium">
                            Duplicate Probability: {formatProbability(selectedComparisonCandidate.probability)}
                          </div>
                          <Badge
                            variant={
                              getDuplicateRiskLevel(selectedComparisonCandidate.probability) === "high"
                                ? "destructive"
                                : getDuplicateRiskLevel(selectedComparisonCandidate.probability) === "medium"
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {getDuplicateRiskLevel(selectedComparisonCandidate.probability).toUpperCase()} RISK
                          </Badge>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-md border p-3 space-y-2">
                            <p className="text-sm font-semibold">Primary Application</p>
                            <p className="text-sm"><span className="font-medium">Name:</span> {selectedPrimaryApplication.fullName}</p>
                            <p className="text-sm"><span className="font-medium">Record State:</span> {getLifecycleLabel(getMemberLifecycleState(selectedPrimaryApplication))}</p>
                            <p className="text-sm"><span className="font-medium">Contact:</span> {selectedPrimaryApplication.contactNumber || "-"}</p>
                            <p className="text-sm"><span className="font-medium">Email:</span> {selectedPrimaryApplication.email || "-"}</p>
                            <p className="text-sm"><span className="font-medium">Birthdate:</span> {selectedPrimaryApplication.birthdate ? formatManilaDateTime(selectedPrimaryApplication.birthdate) : "-"}</p>
                            <p className="text-sm"><span className="font-medium">Age:</span> {selectedPrimaryApplication.age || "-"}</p>
                            <p className="text-sm"><span className="font-medium">Barangay:</span> {getBarangayLabel(selectedPrimaryApplication)}</p>
                            <p className="text-sm"><span className="font-medium">Facebook:</span> {selectedPrimaryApplication.facebookLink || "-"}</p>
                          </div>

                          <div className="rounded-md border p-3 space-y-2">
                            <p className="text-sm font-semibold">Duplicate Candidate</p>
                            <p className="text-sm"><span className="font-medium">Name:</span> {selectedComparisonCandidate.member.fullName}</p>
                            <p className="text-sm"><span className="font-medium">Record State:</span> {getLifecycleLabel(getMemberLifecycleState(selectedComparisonCandidate.member))}</p>
                            <p className="text-sm"><span className="font-medium">Contact:</span> {selectedComparisonCandidate.member.contactNumber || "-"}</p>
                            <p className="text-sm"><span className="font-medium">Email:</span> {selectedComparisonCandidate.member.email || "-"}</p>
                            <p className="text-sm"><span className="font-medium">Birthdate:</span> {selectedComparisonCandidate.member.birthdate ? formatManilaDateTime(selectedComparisonCandidate.member.birthdate) : "-"}</p>
                            <p className="text-sm"><span className="font-medium">Age:</span> {selectedComparisonCandidate.member.age || "-"}</p>
                            <p className="text-sm"><span className="font-medium">Barangay:</span> {getBarangayLabel(selectedComparisonCandidate.member)}</p>
                            <p className="text-sm"><span className="font-medium">Facebook:</span> {selectedComparisonCandidate.member.facebookLink || "-"}</p>
                          </div>
                        </div>

                        <div className="rounded-md border p-3 text-xs text-muted-foreground">
                          <p>Name: {formatProbability(selectedComparisonCandidate.scores.name)}</p>
                          <p>Contact: {formatProbability(selectedComparisonCandidate.scores.contact)}</p>
                          <p>Email: {formatProbability(selectedComparisonCandidate.scores.email)}</p>
                          <p>Birthdate: {formatProbability(selectedComparisonCandidate.scores.birthdate)}</p>
                          <p>Age: {formatProbability(selectedComparisonCandidate.scores.age)}</p>
                          <p>Barangay: {formatProbability(selectedComparisonCandidate.scores.barangay)}</p>
                          <p>Facebook: {formatProbability(selectedComparisonCandidate.scores.facebook)}</p>
                        </div>

                        <div className="rounded-md border p-3 space-y-3">
                          <div>
                            <p className="text-sm font-semibold">Choose Data To Keep On Merge</p>
                            <p className="text-xs text-muted-foreground">
                              Pick per field whether to keep the value from the Primary Application or the Duplicate Candidate.
                            </p>
                          </div>

                          <div className="space-y-2">
                            {mergeFieldsWithDiscrepancy.length === 0 ? (
                              <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                                No discrepancies detected across merge fields. No manual field selection is required.
                              </div>
                            ) : (
                              mergeFieldsWithDiscrepancy.map((fieldConfig) => {
                                const selectedSource = mergeFieldSelectionByKey[fieldConfig.key] || "primary";

                                return (
                                  <div key={fieldConfig.key} className="rounded-md border p-2">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <p className="text-xs font-medium">{fieldConfig.label}</p>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={selectedSource === "primary" ? "default" : "outline"}
                                          className="h-7 px-2 text-[11px]"
                                          onClick={() => {
                                            setMergeFieldSelectionByKey((prev) => ({
                                              ...prev,
                                              [fieldConfig.key]: "primary",
                                            }));
                                          }}
                                        >
                                          Keep 1st
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={selectedSource === "duplicate" ? "default" : "outline"}
                                          className="h-7 px-2 text-[11px]"
                                          onClick={() => {
                                            setMergeFieldSelectionByKey((prev) => ({
                                              ...prev,
                                              [fieldConfig.key]: "duplicate",
                                            }));
                                          }}
                                        >
                                          Keep 2nd
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                                      <p className="break-words"><span className="font-medium text-foreground">1st:</span> {getMergeFieldDisplayValue(selectedPrimaryApplication, fieldConfig.key)}</p>
                                      <p className="break-words"><span className="font-medium text-foreground">2nd:</span> {getMergeFieldDisplayValue(selectedComparisonCandidate.member, fieldConfig.key)}</p>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {selectedDuplicateActionContext && (
                          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                            {selectedDuplicateActionContext.helperText}
                          </div>
                        )}

                        <DialogFooter className="gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                              if (!selectedDuplicateActionContext) return;
                              deleteDuplicateMutation.mutate(selectedDuplicateActionContext.duplicateMemberId);
                            }}
                            disabled={!selectedDuplicateActionContext || deleteDuplicateMutation.isPending || mergeDuplicateMutation.isPending}
                            data-testid="button-delete-duplicate-decision"
                          >
                            {deleteDuplicateMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            {selectedDuplicateActionContext?.deleteLabel || "Delete Duplicate"}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              if (!selectedDuplicateActionContext) return;
                              mergeDuplicateMutation.mutate({
                                primaryId: selectedDuplicateActionContext.mergePrimaryMemberId,
                                duplicateId: selectedDuplicateActionContext.mergeDuplicateMemberId,
                                fieldSources: mergeFieldSourcesPayload,
                              });
                            }}
                            disabled={!selectedDuplicateActionContext || mergeDuplicateMutation.isPending || deleteDuplicateMutation.isPending}
                            data-testid="button-merge-duplicate-decision"
                          >
                            {mergeDuplicateMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <GitMerge className="mr-2 h-4 w-4" />
                            )}
                            {selectedDuplicateActionContext?.mergeLabel || "Merge Duplicate"}
                          </Button>
                        </DialogFooter>
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="directory" className="space-y-6">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, phone, or reference ID..."
            className="pl-10"
            data-testid="input-search-chapter-members"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-muted-foreground">
            This table shows member records only. Officers are managed in the Officers section.
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">Chapter Direct: {chapterDirectMembers}</Badge>
            <Badge variant="secondary">Barangay-Based: {barangayBasedMembers}</Badge>
            <Badge variant="outline">Showing: {filteredMembers.length}</Badge>
          </div>
        </div>

        {!barangayId && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Member Scope</Label>
              <Select value={memberScopeFilter} onValueChange={setMemberScopeFilter}>
                <SelectTrigger data-testid="select-member-scope-filter">
                  <SelectValue placeholder="Filter by scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="chapter">Chapter Direct Members</SelectItem>
                  <SelectItem value="barangay">Barangay-Based Members</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Barangay</Label>
              <Select value={selectedBarangayFilter} onValueChange={setSelectedBarangayFilter}>
                <SelectTrigger data-testid="select-member-barangay-filter">
                  <SelectValue placeholder="Filter by barangay" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Barangays</SelectItem>
                  <SelectItem value="chapter-direct">Chapter Direct (No Barangay)</SelectItem>
                  {barangays.filter((barangay) => Boolean(barangay.id)).map((barangay) => (
                    <SelectItem key={barangay.id} value={barangay.id}>
                      {barangay.barangayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>PDF header and footer automatically include organization logo, organization name, full government name, motto, and SEC registry number.</p>
            <p>Footer also includes Facebook, website, email, and export date in Manila local time (12-hour format).</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDirectoryExportDialogOpen(true)}
              disabled={isExportingDirectoryPdf}
              data-testid="button-export-chapter-directory-pdf"
            >
              <FileDown className="h-4 w-4 mr-2" />
              {isExportingDirectoryPdf ? "Generating PDF..." : "Export PDF"}
            </Button>
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              testIdPrefix="chapter-members-view-mode"
            />
          </div>
        </div>

        {viewMode === "table" ? (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[1100px] table-auto [&_td]:[overflow-wrap:normal] [&_td]:[word-break:normal] [&_th]:whitespace-nowrap [&_th]:[overflow-wrap:normal] [&_th]:[word-break:normal]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm">Name</th>
                  <th className="text-left p-4 font-medium text-sm">Type</th>
                  <th className="text-left p-4 font-medium text-sm">Barangay</th>
                  <th className="text-left p-4 font-medium text-sm">Age</th>
                  <th className="text-left p-4 font-medium text-sm">Household Size</th>
                  <th className="text-left p-4 font-medium text-sm">Birthdate</th>
                  <th className="text-left p-4 font-medium text-sm">Contact</th>
                  <th className="text-center p-4 font-medium text-sm">Registered Voter</th>
                  <th className="text-center p-4 font-medium text-sm">Active</th>
                  <th className="text-left p-4 font-medium text-sm">Date Added</th>
                </tr>
              </thead>
              <tbody>
                {isDashboardMembersLoading ? (
                  <tr>
                    <td colSpan={10} className="p-6">
                      <LoadingState label="Loading members..." rows={1} compact />
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      No members found. {searchTerm ? "Try adjusting your search." : "Click 'Add Member' to get started."}
                    </td>
                  </tr>
                ) : (
                  memberPagination.paginatedItems.map((member) => (
                    <tr
                      key={member.id}
                      className="border-t cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => openDirectoryMemberDetailsDialog(member)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDirectoryMemberDetailsDialog(member);
                        }
                      }}
                      tabIndex={0}
                      data-testid={`row-chapter-member-directory-${member.id}`}
                    >
                      <td className="p-4">
                        <div className="font-medium">{member.fullName}</div>
                        {member.email && (
                          <div className="text-xs text-muted-foreground">{member.email}</div>
                        )}
                        {member.facebookLink && (
                          <a
                            href={member.facebookLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Facebook Profile
                          </a>
                        )}
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">
                          {member.barangayId ? "Barangay Member" : "Chapter Member"}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{getBarangayLabel(member)}</td>
                      <td className="p-4">{member.age}</td>
                      <td className="p-4">
                        <span className="text-sm">{member.householdSize ?? 1}</span>
                      </td>
                      <td className="p-4">
                        {member.birthdate ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span>{formatManilaDateTime(member.birthdate)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span>{member.contactNumber}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant={member.registeredVoter ? "default" : "secondary"}>
                          {member.registeredVoter ? "Yes" : "No"}
                        </Badge>
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant={member.isActive ? "default" : "secondary"}>
                          {member.isActive ? "Yes" : "No"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(member.createdAt), "MMM d, yyyy")}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {isDashboardMembersLoading ? (
              <Card className="sm:col-span-2">
                <CardContent className="p-4">
                  <LoadingState label="Loading members..." rows={1} compact />
                </CardContent>
              </Card>
            ) : filteredMembers.length === 0 ? (
              <Card className="sm:col-span-2">
                <CardContent className="p-6 text-center text-muted-foreground">
                  No members found. {searchTerm ? "Try adjusting your search." : "Click 'Add Member' to get started."}
                </CardContent>
              </Card>
            ) : (
              memberPagination.paginatedItems.map((member) => (
                <Card key={member.id} className="overflow-hidden" data-testid={`chapter-member-tile-${member.id}`}>
                  <CardContent className="space-y-3 p-4">
                    <div className="space-y-1">
                      <div className="font-semibold">{member.fullName}</div>
                      {member.email && (
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                      )}
                      {member.facebookLink && (
                        <a
                          href={member.facebookLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Facebook Profile
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">
                        {member.barangayId ? "Barangay Member" : "Chapter Member"}
                      </Badge>
                      <span className="text-muted-foreground">Age: {member.age}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-sm font-medium">Household Size</span>
                      <Input
                        type="number"
                        min={1}
                        defaultValue={member.householdSize ?? 1}
                        onBlur={(e) => updateHouseholdSize(member, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        className="h-8"
                        disabled={updatingMemberId === member.id}
                        data-testid={`input-chapter-member-household-size-tile-${member.id}`}
                      />
                    </div>

                    <div className="text-sm text-muted-foreground">
                      Barangay: {getBarangayLabel(member)}
                    </div>

                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{member.contactNumber}</span>
                    </div>

                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{member.birthdate ? formatManilaDateTime(member.birthdate) : "Birthdate not set"}</span>
                    </div>

                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Added {format(new Date(member.createdAt), "MMM d, yyyy")}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        variant={member.registeredVoter ? "default" : "outline"}
                        onClick={() => updateMutation.mutate({
                          id: member.id,
                          data: { registeredVoter: !member.registeredVoter }
                        })}
                        disabled={updatingMemberId === member.id}
                        data-testid={`button-toggle-chapter-voter-${member.id}`}
                      >
                        {member.registeredVoter ? (
                          <><Check className="h-3 w-3 mr-1" /> Voter</>
                        ) : (
                          <><X className="h-3 w-3 mr-1" /> Voter</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant={member.isActive ? "default" : "outline"}
                        onClick={() => updateMutation.mutate({
                          id: member.id,
                          data: { isActive: !member.isActive }
                        })}
                        disabled={updatingMemberId === member.id}
                        data-testid={`button-toggle-chapter-active-${member.id}`}
                      >
                        {member.isActive ? (
                          <><Check className="h-3 w-3 mr-1" /> Active</>
                        ) : (
                          <><X className="h-3 w-3 mr-1" /> Active</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        <Dialog
          open={directoryDetailsOpen}
          onOpenChange={(open) => {
            setDirectoryDetailsOpen(open);
            if (!open) {
              setSelectedDirectoryMemberId(null);
              setDirectoryHouseholdSizeInput("1");
              setDirectoryEditForm(defaultDirectoryEditFormState);
              setDirectoryEditRegisteredVoter(false);
              setDirectoryEditIsActive(false);
              clearDirectoryPhotoSelection(false);
              setIsEditingDirectoryInfo(false);
            }
          }}
        >
          <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Member Details</DialogTitle>
              <DialogDescription>
                Review complete member information, then use the action buttons below to update this member.
              </DialogDescription>
            </DialogHeader>

            {!selectedDirectoryMember ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No member selected.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-16 w-16 border">
                      <AvatarImage
                        src={
                          isEditingDirectoryInfo
                            ? (directoryPhotoMarkedForRemoval
                                ? undefined
                                : (directoryPhotoPreviewUrl || getMemberProfilePhotoSrc(selectedDirectoryMember.photoUrl)))
                            : getMemberProfilePhotoSrc(selectedDirectoryMember.photoUrl)
                        }
                        alt={`${selectedDirectoryMember.fullName} profile photo`}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                        {getMemberInitials(selectedDirectoryMember.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{selectedDirectoryMember.fullName}</p>
                      <p className="text-xs text-muted-foreground">{selectedDirectoryMember.email || "No email provided"}</p>
                      <p className="text-xs text-muted-foreground">{getBarangayLabel(selectedDirectoryMember)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isEditingDirectoryInfo ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDirectoryEditForm(toDirectoryEditFormState(selectedDirectoryMember));
                            setDirectoryHouseholdSizeInput(String(selectedDirectoryMember.householdSize ?? 1));
                            setDirectoryEditRegisteredVoter(Boolean(selectedDirectoryMember.registeredVoter));
                            setDirectoryEditIsActive(Boolean(selectedDirectoryMember.isActive));
                            clearDirectoryPhotoSelection(false);
                            setIsEditingDirectoryInfo(false);
                          }}
                          disabled={updatingMemberId === selectedDirectoryMember.id}
                          data-testid={`button-cancel-directory-member-edit-${selectedDirectoryMember.id}`}
                        >
                          Cancel Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={submitDirectoryMemberInfoUpdate}
                          disabled={updatingMemberId === selectedDirectoryMember.id}
                          data-testid={`button-save-directory-member-edit-${selectedDirectoryMember.id}`}
                        >
                          Save Info
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditingDirectoryInfo(true)}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        data-testid={`button-edit-directory-member-info-${selectedDirectoryMember.id}`}
                      >
                        Edit Info
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Full Name</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        value={directoryEditForm.fullName}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, fullName: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        data-testid={`input-directory-member-edit-full-name-${selectedDirectoryMember.id}`}
                      />
                    ) : (
                      <p className="text-sm font-medium">{selectedDirectoryMember.fullName}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="text-sm font-medium">{selectedDirectoryMember.barangayId ? "Barangay Member" : "Chapter Member"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Barangay</p>
                    {isEditingDirectoryInfo && !barangayId ? (
                      <Select
                        value={directoryEditForm.barangayId}
                        onValueChange={(value) => setDirectoryEditForm((prev) => ({ ...prev, barangayId: value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                      >
                        <SelectTrigger data-testid={`select-directory-member-edit-barangay-${selectedDirectoryMember.id}`}>
                          <SelectValue placeholder="Select barangay" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chapter-direct">Chapter Direct</SelectItem>
                          {barangays.map((barangay) => (
                            <SelectItem key={barangay.id} value={barangay.id}>
                              {barangay.barangayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm font-medium">{getBarangayLabel(selectedDirectoryMember)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contact Number</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        value={directoryEditForm.contactNumber}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, contactNumber: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        data-testid={`input-directory-member-edit-contact-${selectedDirectoryMember.id}`}
                      />
                    ) : (
                      <p className="text-sm font-medium">{selectedDirectoryMember.contactNumber || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        type="email"
                        value={directoryEditForm.email}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, email: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        placeholder="No email"
                        data-testid={`input-directory-member-edit-email-${selectedDirectoryMember.id}`}
                      />
                    ) : (
                      <p className="text-sm font-medium break-all">{selectedDirectoryMember.email || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Age</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        type="number"
                        min={1}
                        value={directoryEditForm.age}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, age: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        data-testid={`input-directory-member-edit-age-${selectedDirectoryMember.id}`}
                      />
                    ) : (
                      <p className="text-sm font-medium">{selectedDirectoryMember.age || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Birthdate</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        type="date"
                        value={directoryEditForm.birthdate}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, birthdate: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        data-testid={`input-directory-member-edit-birthdate-${selectedDirectoryMember.id}`}
                      />
                    ) : (
                      <p className="text-sm font-medium">
                        {selectedDirectoryMember.birthdate ? formatManilaDateTime(selectedDirectoryMember.birthdate) : "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date Added</p>
                    <p className="text-sm font-medium">{format(new Date(selectedDirectoryMember.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Registered Voter</p>
                    <p className="text-sm font-medium">{selectedDirectoryMember.registeredVoter ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-sm font-medium">{selectedDirectoryMember.isActive ? "Yes" : "No"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Facebook</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        value={directoryEditForm.facebookLink}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, facebookLink: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        placeholder="Facebook profile link"
                        data-testid={`input-directory-member-edit-facebook-${selectedDirectoryMember.id}`}
                      />
                    ) : (
                      <>
                        {selectedDirectoryMember.facebookLink ? (
                          <a
                            href={selectedDirectoryMember.facebookLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline break-all"
                          >
                            {selectedDirectoryMember.facebookLink}
                          </a>
                        ) : (
                          <p className="text-sm font-medium">-</p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Profile Photo</p>
                    {isEditingDirectoryInfo ? (
                      <div className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-14 w-14 border">
                            <AvatarImage
                              src={directoryPhotoPreviewUrl || (!directoryPhotoMarkedForRemoval ? getMemberProfilePhotoSrc(selectedDirectoryMember.photoUrl) : undefined)}
                              alt={`${selectedDirectoryMember.fullName} editable profile photo`}
                            />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                              {getMemberInitials(selectedDirectoryMember.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-xs text-muted-foreground">
                            {directoryPhotoFile
                              ? `Selected: ${directoryPhotoFile.name}`
                              : directoryPhotoMarkedForRemoval
                                ? "Photo will be removed when you save."
                                : selectedDirectoryMember.photoUrl
                                  ? "Current profile photo"
                                  : "No profile photo"}
                          </div>
                        </div>

                        <Input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                          onChange={handleDirectoryPhotoFileChange}
                          disabled={updatingMemberId === selectedDirectoryMember.id}
                          data-testid={`input-directory-member-edit-photo-file-${selectedDirectoryMember.id}`}
                        />

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => clearDirectoryPhotoSelection(true)}
                            disabled={updatingMemberId === selectedDirectoryMember.id || (!selectedDirectoryMember.photoUrl && !directoryPhotoFile)}
                            data-testid={`button-directory-member-remove-photo-${selectedDirectoryMember.id}`}
                          >
                            Remove Photo
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => clearDirectoryPhotoSelection(false)}
                            disabled={updatingMemberId === selectedDirectoryMember.id || (!directoryPhotoFile && !directoryPhotoMarkedForRemoval)}
                            data-testid={`button-directory-member-reset-photo-${selectedDirectoryMember.id}`}
                          >
                            Reset Photo Changes
                          </Button>
                        </div>
                      </div>
                    ) : selectedDirectoryMember.photoUrl ? (
                      <div className="space-y-2">
                        <Avatar className="h-14 w-14 border">
                          <AvatarImage
                            src={getMemberProfilePhotoSrc(selectedDirectoryMember.photoUrl)}
                            alt={`${selectedDirectoryMember.fullName} profile photo`}
                          />
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {getMemberInitials(selectedDirectoryMember.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <a
                          href={selectedDirectoryMember.photoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline break-all"
                        >
                          {selectedDirectoryMember.photoUrl}
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">-</p>
                    )}
                  </div>
                </div>

                <div className="rounded-md border p-4 space-y-3">
                  <p className="text-sm font-semibold">Actions</p>
                  <div className="space-y-2">
                    <Label className="block text-xs text-muted-foreground">Household Size</Label>
                    <div className="flex flex-col gap-2 sm:max-w-[220px]">
                      <Input
                        type="number"
                        min={1}
                        value={directoryHouseholdSizeInput}
                        onChange={(event) => setDirectoryHouseholdSizeInput(event.target.value)}
                        className="sm:max-w-[180px]"
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        data-testid={`input-chapter-member-household-size-dialog-${selectedDirectoryMember.id}`}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm">Registered Voter</span>
                        <Switch
                          checked={directoryEditRegisteredVoter}
                          onCheckedChange={setDirectoryEditRegisteredVoter}
                          disabled={updatingMemberId === selectedDirectoryMember.id || !isEditingDirectoryInfo}
                          data-testid={`switch-directory-member-registered-voter-${selectedDirectoryMember.id}`}
                        />
                      </div>
                    </div>

                    <div className="rounded-md border px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm">Active Member</span>
                        <Switch
                          checked={directoryEditIsActive}
                          onCheckedChange={setDirectoryEditIsActive}
                          disabled={updatingMemberId === selectedDirectoryMember.id || !isEditingDirectoryInfo}
                          data-testid={`switch-directory-member-active-${selectedDirectoryMember.id}`}
                        />
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Changes in this section are staged and will only be applied after clicking Save Info.
                  </p>

                  {!isEditingDirectoryInfo ? (
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
                      <p>Registered Voter: {selectedDirectoryMember.registeredVoter ? "Yes" : "No"}</p>
                      <p>Active: {selectedDirectoryMember.isActive ? "Yes" : "No"}</p>
                    </div>
                  ) : null}

                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={deleteDirectoryMember}
                      disabled={deleteMemberMutation.isPending || updatingMemberId === selectedDirectoryMember.id}
                      data-testid={`button-delete-directory-member-${selectedDirectoryMember.id}`}
                    >
                      {deleteMemberMutation.isPending ? "Deleting..." : "Delete Member"}
                    </Button>
                  </div>
                  </div>
                </div>
            )}
          </DialogContent>
        </Dialog>

        <PaginationControls
          currentPage={memberPagination.currentPage}
          totalPages={memberPagination.totalPages}
          itemsPerPage={memberPagination.itemsPerPage}
          totalItems={memberPagination.totalItems}
          startItem={memberPagination.startItem}
          endItem={memberPagination.endItem}
          onPageChange={memberPagination.setCurrentPage}
          onItemsPerPageChange={memberPagination.setItemsPerPage}
          itemLabel="members"
        />
          </TabsContent>

          {!barangayId && (
            <TabsContent value="analytics" className="space-y-6">
              <MemberAnalyticsTab chapterId={chapterId} chapterName={chapterName} />
            </TabsContent>
          )}
        </Tabs>

        <Dialog
          open={applicationsExportDialogOpen}
          onOpenChange={(open) => {
            if (isExportingApplicationsPdf) {
              return;
            }
            setApplicationsExportDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Export Applications PDF</DialogTitle>
              <DialogDescription>
                Customize what to include in the applications report before downloading the PDF.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="applications-export-report-title">Report Title</Label>
                <Input
                  id="applications-export-report-title"
                  value={applicationsExportReportTitle}
                  onChange={(event) => setApplicationsExportReportTitle(event.target.value)}
                  placeholder="Member Applications Report"
                  data-testid="input-applications-export-report-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Quick Presets</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyApplicationsExportPreset("minimal")}
                    disabled={isExportingApplicationsPdf}
                    data-testid="button-applications-export-preset-minimal"
                  >
                    Minimal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyApplicationsExportPreset("standard")}
                    disabled={isExportingApplicationsPdf}
                    data-testid="button-applications-export-preset-standard"
                  >
                    Standard
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyApplicationsExportPreset("full")}
                    disabled={isExportingApplicationsPdf}
                    data-testid="button-applications-export-preset-full"
                  >
                    Full
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sections to Include</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={applicationsExportSections.scope}
                      onCheckedChange={(checked) => toggleApplicationsExportSection("scope", checked === true)}
                      data-testid="checkbox-applications-export-section-scope"
                    />
                    Report Scope Summary
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={applicationsExportSections.applicationsTable}
                      onCheckedChange={(checked) => toggleApplicationsExportSection("applicationsTable", checked === true)}
                      data-testid="checkbox-applications-export-section-table"
                    />
                    Pending Applications Table
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:col-span-2">
                    <Checkbox
                      checked={applicationsExportSections.originByBarangay}
                      onCheckedChange={(checked) => toggleApplicationsExportSection("originByBarangay", checked === true)}
                      data-testid="checkbox-applications-export-section-origin"
                    />
                    Applicant Origin by Barangay
                  </label>
                </div>
              </div>

              {applicationsExportSections.applicationsTable ? (
                <div className="space-y-2">
                  <Label>Application Table Columns</Label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.name}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("name", checked === true)}
                        data-testid="checkbox-applications-export-column-name"
                      />
                      Name
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.referenceId}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("referenceId", checked === true)}
                        data-testid="checkbox-applications-export-column-reference"
                      />
                      Reference ID
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.type}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("type", checked === true)}
                        data-testid="checkbox-applications-export-column-type"
                      />
                      Type
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.barangay}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("barangay", checked === true)}
                        data-testid="checkbox-applications-export-column-barangay"
                      />
                      Barangay
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.contact}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("contact", checked === true)}
                        data-testid="checkbox-applications-export-column-contact"
                      />
                      Contact
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.submitted}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("submitted", checked === true)}
                        data-testid="checkbox-applications-export-column-submitted"
                      />
                      Submitted
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.directoryCheck}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("directoryCheck", checked === true)}
                        data-testid="checkbox-applications-export-column-directory-check"
                      />
                      Directory Check
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={applicationsExportColumns.duplicateCheck}
                        onCheckedChange={(checked) => toggleApplicationsExportColumn("duplicateCheck", checked === true)}
                        data-testid="checkbox-applications-export-column-duplicate-check"
                      />
                      Duplicate Check
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>PDF header and footer automatically include organization logo, organization name, full government name, motto, and SEC registry number.</p>
                <p>Footer also includes Facebook, website, email, and export date in Manila local time (12-hour format).</p>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setApplicationsExportDialogOpen(false)} disabled={isExportingApplicationsPdf}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleExportApplicationsPdf} disabled={isExportingApplicationsPdf} data-testid="button-download-applications-export-pdf">
                  <FileDown className="h-4 w-4 mr-2" />
                  {isExportingApplicationsPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={directoryExportDialogOpen}
          onOpenChange={(open) => {
            if (isExportingDirectoryPdf) {
              return;
            }
            setDirectoryExportDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Export Directory PDF</DialogTitle>
              <DialogDescription>
                Customize what to include in the directory report before downloading the PDF.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="directory-export-report-title">Report Title</Label>
                <Input
                  id="directory-export-report-title"
                  value={directoryExportReportTitle}
                  onChange={(event) => setDirectoryExportReportTitle(event.target.value)}
                  placeholder="Member Directory Report"
                  data-testid="input-directory-export-report-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Quick Presets</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyDirectoryExportPreset("minimal")}
                    disabled={isExportingDirectoryPdf}
                    data-testid="button-directory-export-preset-minimal"
                  >
                    Minimal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyDirectoryExportPreset("standard")}
                    disabled={isExportingDirectoryPdf}
                    data-testid="button-directory-export-preset-standard"
                  >
                    Standard
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyDirectoryExportPreset("full")}
                    disabled={isExportingDirectoryPdf}
                    data-testid="button-directory-export-preset-full"
                  >
                    Full
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sections to Include</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={directoryExportSections.scope}
                      onCheckedChange={(checked) => toggleDirectoryExportSection("scope", checked === true)}
                      data-testid="checkbox-directory-export-section-scope"
                    />
                    Report Scope Summary
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={directoryExportSections.directoryTable}
                      onCheckedChange={(checked) => toggleDirectoryExportSection("directoryTable", checked === true)}
                      data-testid="checkbox-directory-export-section-table"
                    />
                    Member Directory Table
                  </label>
                </div>
              </div>

              {directoryExportSections.directoryTable ? (
                <div className="space-y-2">
                  <Label>Directory Table Columns</Label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.name}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("name", checked === true)}
                        data-testid="checkbox-directory-export-column-name"
                      />
                      Name
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.type}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("type", checked === true)}
                        data-testid="checkbox-directory-export-column-type"
                      />
                      Type
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.barangay}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("barangay", checked === true)}
                        data-testid="checkbox-directory-export-column-barangay"
                      />
                      Barangay
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.age}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("age", checked === true)}
                        data-testid="checkbox-directory-export-column-age"
                      />
                      Age
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.household}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("household", checked === true)}
                        data-testid="checkbox-directory-export-column-household"
                      />
                      Household Size
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.contact}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("contact", checked === true)}
                        data-testid="checkbox-directory-export-column-contact"
                      />
                      Contact
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.voter}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("voter", checked === true)}
                        data-testid="checkbox-directory-export-column-voter"
                      />
                      Registered Voter
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={directoryExportColumns.active}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("active", checked === true)}
                        data-testid="checkbox-directory-export-column-active"
                      />
                      Active
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:col-span-2">
                      <Checkbox
                        checked={directoryExportColumns.dateAdded}
                        onCheckedChange={(checked) => toggleDirectoryExportColumn("dateAdded", checked === true)}
                        data-testid="checkbox-directory-export-column-date-added"
                      />
                      Date Added
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>PDF header and footer automatically include organization logo, organization name, full government name, motto, and SEC registry number.</p>
                <p>Footer also includes Facebook, website, email, and export date in Manila local time (12-hour format).</p>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setDirectoryExportDialogOpen(false)} disabled={isExportingDirectoryPdf}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleExportDirectoryPdf} disabled={isExportingDirectoryPdf} data-testid="button-download-directory-export-pdf">
                  <FileDown className="h-4 w-4 mr-2" />
                  {isExportingDirectoryPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Label({
  children,
  className,
  htmlFor,
}: {
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`font-medium text-sm ${className || ""}`}>
      {children}
    </label>
  );
}
