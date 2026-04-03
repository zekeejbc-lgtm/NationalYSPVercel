import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { applyImageFallback, getDisplayImageUrl, resetImageFallback } from "@/lib/driveUtils";
import { Users, Phone, Calendar, Plus, Check, X, Search, Loader2, GitMerge, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { usePagination } from "@/hooks/use-pagination";
import PaginationControls from "@/components/ui/pagination-controls";
import ViewModeToggle, { type ViewMode } from "@/components/ui/view-mode-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Member } from "@shared/schema";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";

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

function formatManilaDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" ? value : "-";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

function getMemberPhotoSrc(photoUrl: string | null | undefined) {
  const normalizedPhotoUrl = (photoUrl || "").trim();
  if (!normalizedPhotoUrl) {
    return "/images/ysp-logo.png";
  }

  return getDisplayImageUrl(normalizedPhotoUrl);
}

export default function MemberDashboardPanel({ chapterId, chapterName, barangayId }: MemberDashboardPanelProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBarangayFilter, setSelectedBarangayFilter] = useState("all");
  const [memberScopeFilter, setMemberScopeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [memberSubTab, setMemberSubTab] = useState<"applications" | "directory">("applications");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [applicantDetailsOpen, setApplicantDetailsOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<MemberWithLifecycle | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [selectedPrimaryApplication, setSelectedPrimaryApplication] = useState<MemberWithLifecycle | null>(null);
  const [selectedDuplicateCandidates, setSelectedDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [selectedComparisonCandidateId, setSelectedComparisonCandidateId] = useState<string | null>(null);

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

  const { data: members = [], isLoading } = useQuery<MemberWithLifecycle[]>({
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
    enabled: !!chapterId,
  });

  const { data: barangays = [] } = useQuery<BarangayOption[]>({
    queryKey: ["/api/chapters", chapterId, "barangays"],
    queryFn: async () => {
      if (!chapterId) return [];
      const res = await fetch(`/api/chapters/${chapterId}/barangays`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!chapterId,
  });

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
    mutationFn: async ({ id, data }: { id: string; data: Partial<Member> }) => {
      setUpdatingMemberId(id);
      return await apiRequest("PATCH", `/api/members/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setUpdatingMemberId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setUpdatingMemberId(null);
    }
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
    mutationFn: async ({ primaryId, duplicateId }: { primaryId: string; duplicateId: string }) => {
      return await apiRequest("POST", `/api/members/${primaryId}/merge`, { duplicateMemberId: duplicateId });
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

  const barangayNameById = new Map(
    barangays
      .filter((barangay) => Boolean(barangay.id))
      .map((barangay) => [barangay.id, barangay.barangayName] as const)
  );

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

  const approvedDirectoryMembers = members.filter((member) => resolveMemberApplicationStatus(member) === "approved");

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

  const applicationsPagination = usePagination(pendingApplications, {
    pageSize: 10,
    resetKey: `${chapterId}|${barangayId || "all"}|${pendingApplications.length}`,
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

  const selectedComparisonCandidate = useMemo(() => {
    if (selectedDuplicateCandidates.length === 0) {
      return null;
    }

    return (
      selectedDuplicateCandidates.find((candidate) => candidate.member.id === selectedComparisonCandidateId) ||
      selectedDuplicateCandidates[0]
    );
  }, [selectedComparisonCandidateId, selectedDuplicateCandidates]);

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
              <Button data-testid="button-add-chapter-member">
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

        <Tabs value={memberSubTab} onValueChange={(value) => setMemberSubTab(value as "applications" | "directory")} className="space-y-4">
          <TabsList className="w-full justify-start" data-testid="tabs-chapter-member-subpages">
            <TabsTrigger value="applications" data-testid="tab-chapter-member-applications-subpage">
              Applications
            </TabsTrigger>
            <TabsTrigger value="directory" data-testid="tab-chapter-member-directory-subpage">
              Directory
            </TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="space-y-4">
            <Card data-testid="card-chapter-member-applications">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">Member Applications</CardTitle>
                  <Badge variant={pendingApplications.length > 0 ? "default" : "secondary"}>
                    {pendingApplications.length} Pending
                  </Badge>
                </div>
                <CardDescription>
                  Applications submitted from the public membership form stay here until approved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingApplications.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No pending applications in this workspace.
                  </div>
                ) : (
                  <>
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
                          {applicationsPagination.paginatedItems.map((member) => {
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
                                    <img
                                      src={getMemberPhotoSrc(member.photoUrl)}
                                      alt={`${member.fullName} profile`}
                                      className="h-10 w-10 rounded-md border object-cover"
                                      onError={(event) => {
                                        applyImageFallback(event.currentTarget, "/images/ysp-logo.png");
                                      }}
                                      onLoad={(event) => {
                                        resetImageFallback(event.currentTarget);
                                      }}
                                    />
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
                                    <Badge variant="default">Official Directory (Approved)</Badge>
                                  ) : applicationInsights.inOfficialDirectory ? (
                                    <Badge variant="outline">In Directory (Pending)</Badge>
                                  ) : (
                                    <Badge variant="secondary">Not Yet in Directory</Badge>
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
                          })}
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
                        <img
                          src={getMemberPhotoSrc(selectedApplicant.photoUrl)}
                          alt={`${selectedApplicant.fullName} submitted 1x1`}
                          className="aspect-square w-full rounded-md border object-cover"
                          onError={(event) => {
                            applyImageFallback(event.currentTarget, "/images/ysp-logo.png");
                          }}
                          onLoad={(event) => {
                            resetImageFallback(event.currentTarget);
                          }}
                        />
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
                                ? "Official Directory (Approved)"
                                : selectedApplicantInsights?.inOfficialDirectory
                                  ? "In Directory (Pending)"
                                  : "Not Yet in Directory"}
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

        <div className="flex items-center justify-end">
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            testIdPrefix="chapter-members-view-mode"
          />
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
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="p-6">
                      <div className="space-y-2" role="status" aria-label="Loading members">
                        <div className="h-4 w-full rounded-md bg-muted skeleton-shimmer" />
                        <div className="h-4 w-5/6 rounded-md bg-muted skeleton-shimmer" />
                        <div className="h-4 w-2/3 rounded-md bg-muted skeleton-shimmer" />
                      </div>
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
                    <tr key={member.id} className="border-t hover-elevate">
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
                          className="h-8 w-24"
                          disabled={updatingMemberId === member.id}
                          data-testid={`input-chapter-member-household-size-${member.id}`}
                        />
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
                            <><Check className="h-3 w-3 mr-1" /> Yes</>
                          ) : (
                            <><X className="h-3 w-3 mr-1" /> No</>
                          )}
                        </Button>
                      </td>
                      <td className="p-4 text-center">
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
                            <><Check className="h-3 w-3 mr-1" /> Yes</>
                          ) : (
                            <><X className="h-3 w-3 mr-1" /> No</>
                          )}
                        </Button>
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
            {isLoading ? (
              <Card className="sm:col-span-2">
                <CardContent className="p-4">
                  <div className="space-y-2" role="status" aria-label="Loading members">
                    <div className="h-4 w-full rounded-md bg-muted skeleton-shimmer" />
                    <div className="h-4 w-5/6 rounded-md bg-muted skeleton-shimmer" />
                    <div className="h-4 w-2/3 rounded-md bg-muted skeleton-shimmer" />
                  </div>
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
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-medium text-sm ${className || ""}`}>{children}</span>;
}
