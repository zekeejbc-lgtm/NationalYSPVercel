import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, BarChart3, CheckCircle2, GitMerge, Loader2, RotateCcw, Trash2, X, XCircle } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Publication } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type PublicationAnalyticsItem = Publication & { chapterName: string };
type DuplicateRiskLevel = "high" | "medium" | "low";
type MergeFieldKey = "title" | "content" | "photoUrl" | "facebookLink" | "chapterId" | "sourceProjectReportId";
type FieldSourceByKey = Record<MergeFieldKey, string>;
type BatchDuplicateAction = "merge" | "delete-duplicate" | "delete-all";
type PublicationModerationStatus = "approved" | "pending" | "rejected";

type DuplicateCandidate = {
  id: string;
  probability: number;
  riskLevel: DuplicateRiskLevel;
  statusPair: string;
  scoreBreakdown: {
    title: number;
    content: number;
    facebook: number;
    photo: number;
    chapter: number;
    sourceReport: number;
  };
  primaryPublication: PublicationAnalyticsItem;
  duplicatePublication: PublicationAnalyticsItem;
};

type PublicationAnalyticsResponse = {
  summary: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    resubmitted: number;
    withFacebookLink: number;
    duplicateCandidates: number;
    highRiskDuplicates: number;
  };
  chapterStats: Array<{
    chapterId: string | null;
    chapterName: string;
    total: number;
    approved: number;
    pending: number;
  }>;
  leaderboard: Array<{
    chapterId: string | null;
    chapterName: string;
    submissions: number;
    approved: number;
    pending: number;
  }>;
  duplicateCandidates: DuplicateCandidate[];
  rejectedSubmissions: PublicationAnalyticsItem[];
  resubmittedSubmissions: PublicationAnalyticsItem[];
  appliedFilters?: {
    minProbability: number;
    maxPairs: number;
    ignoreTitleSimilarity: boolean;
  };
};

const ANALYTICS_ENDPOINT = "/api/publications/analytics";
const PIE_COLORS = ["#16a34a", "#f59e0b"];

const MERGE_FIELDS: Array<{ key: MergeFieldKey; label: string }> = [
  { key: "title", label: "Title" },
  { key: "content", label: "Content / Write-up" },
  { key: "photoUrl", label: "Photo URL" },
  { key: "facebookLink", label: "Facebook Link" },
  { key: "chapterId", label: "Chapter" },
  { key: "sourceProjectReportId", label: "Source Report ID" },
];

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getBatchActionLabel(action: BatchDuplicateAction) {
  if (action === "merge") return "merged";
  if (action === "delete-duplicate") return "duplicate-deleted";
  return "delete-all";
}

const FULL_SCORE_BREAKDOWN_LABELS: Array<{ key: keyof DuplicateCandidate["scoreBreakdown"]; label: string }> = [
  { key: "title", label: "Title" },
  { key: "content", label: "Content" },
  { key: "facebook", label: "Facebook Link" },
  { key: "photo", label: "Photo URL" },
  { key: "chapter", label: "Chapter" },
  { key: "sourceReport", label: "Source Report ID" },
];

const SCORE_BREAKDOWN_KEY_BY_MERGE_FIELD: Record<MergeFieldKey, keyof DuplicateCandidate["scoreBreakdown"]> = {
  title: "title",
  content: "content",
  photoUrl: "photo",
  facebookLink: "facebook",
  chapterId: "chapter",
  sourceProjectReportId: "sourceReport",
};

function getRiskBadgeVariant(riskLevel: DuplicateRiskLevel): "destructive" | "default" | "secondary" {
  if (riskLevel === "high") return "destructive";
  if (riskLevel === "medium") return "default";
  return "secondary";
}

function hasMeaningfulFieldValue(publication: PublicationAnalyticsItem, key: MergeFieldKey) {
  const value = publication[key];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return Boolean(value);
}

function getFieldDisplayValue(publication: PublicationAnalyticsItem, key: MergeFieldKey) {
  if (key === "chapterId") {
    return publication.chapterName || "National / Unassigned";
  }

  const value = publication[key];
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : "-";
  }

  return String(value);
}

function getFieldDisplayHref(value: string, key: MergeFieldKey) {
  if (key !== "facebookLink" && key !== "photoUrl") {
    return null;
  }

  if (!value || value === "-") {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (/^www\./i.test(value)) {
    return `https://${value}`;
  }

  return null;
}

function getModerationStatus(publication: Pick<Publication, "isApproved" | "isRejected">): PublicationModerationStatus {
  if (publication.isApproved) return "approved";
  if (publication.isRejected) return "rejected";
  return "pending";
}

function buildDuplicateRejectionReason(
  candidate: DuplicateCandidate,
  publicationsToReject: PublicationAnalyticsItem[],
  keptPublication: PublicationAnalyticsItem | null,
) {
  const similarityLines = FULL_SCORE_BREAKDOWN_LABELS.map((entry) => {
    return `- ${entry.label}: ${formatPercent(candidate.scoreBreakdown[entry.key])}`;
  });

  const comparedRecordLines = keptPublication
    ? [
        `- Record selected to keep: \"${keptPublication.title}\" (${keptPublication.chapterName})`,
        ...publicationsToReject.map(
          (publicationToReject) =>
            `- Duplicate candidate under review: \"${publicationToReject.title}\" (${publicationToReject.chapterName})`,
        ),
      ]
    : [
        "- No record was selected to keep.",
        ...publicationsToReject.map(
          (publicationToReject, index) =>
            `- Duplicate candidate ${index + 1}: \"${publicationToReject.title}\" (${publicationToReject.chapterName})`,
        ),
      ];

  const closingLine = keptPublication
    ? "If duplicate rejection is confirmed, please revise and resubmit with clearer distinction from the kept submission."
    : "If rejection is confirmed, both duplicate candidates will be moved to rejected submissions and must be revised before resubmission.";

  return [
    "Potential duplicate submission detected during admin duplicate review.",
    `Overall duplicate probability: ${formatPercent(candidate.probability)} (${candidate.riskLevel.toUpperCase()} risk).`,
    "",
    "Similarity breakdown:",
    ...similarityLines,
    "",
    "Compared records:",
    ...comparedRecordLines,
    "",
    closingLine,
  ].join("\n");
}

export default function PublicationsAnalyticsPanel() {
  const { toast } = useToast();
  const [draftMinProbabilityPercent, setDraftMinProbabilityPercent] = useState(58);
  const [draftMaxDuplicatePairs, setDraftMaxDuplicatePairs] = useState(120);
  const [appliedMinProbabilityPercent, setAppliedMinProbabilityPercent] = useState(58);
  const [appliedMaxDuplicatePairs, setAppliedMaxDuplicatePairs] = useState(120);
  const [ignoredDuplicateIds, setIgnoredDuplicateIds] = useState<Set<string>>(new Set());
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateCandidate | null>(null);
  const [keepPublicationId, setKeepPublicationId] = useState<string | null>(null);
  const [showPendingResubmissionsOnly, setShowPendingResubmissionsOnly] = useState(false);
  const [rejectTargetPublications, setRejectTargetPublications] = useState<PublicationAnalyticsItem[]>([]);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [fieldSourceByKey, setFieldSourceByKey] = useState<FieldSourceByKey>({
    title: "",
    content: "",
    photoUrl: "",
    facebookLink: "",
    chapterId: "",
    sourceProjectReportId: "",
  });

  const analyticsQueryUrl = useMemo(() => {
    const normalizedProbability = Math.min(Math.max(appliedMinProbabilityPercent, 0), 100) / 100;
    const normalizedMaxPairs = Math.min(Math.max(appliedMaxDuplicatePairs, 10), 400);
    return `${ANALYTICS_ENDPOINT}?minProbability=${normalizedProbability.toFixed(2)}&maxPairs=${normalizedMaxPairs}`;
  }, [appliedMaxDuplicatePairs, appliedMinProbabilityPercent]);

  const { data, isLoading, isFetching } = useQuery<PublicationAnalyticsResponse>({
    queryKey: [analyticsQueryUrl],
    placeholderData: (previousData) => previousData,
  });

  const invalidatePublicationQueries = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith(ANALYTICS_ENDPOINT);
      },
    });
    queryClient.invalidateQueries({ queryKey: ["/api/publications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/publications?includeAll=true"] });
  };

  const closeDuplicateDialog = () => {
    setSelectedDuplicate(null);
    setKeepPublicationId(null);
    setRejectTargetPublications([]);
    setRejectReasonDraft("");
  };

  const openDuplicateDialog = (candidate: DuplicateCandidate) => {
    const defaultFieldSourceByKey = MERGE_FIELDS.reduce((acc, fieldConfig) => {
      const primaryHasValue = hasMeaningfulFieldValue(candidate.primaryPublication, fieldConfig.key);
      const duplicateHasValue = hasMeaningfulFieldValue(candidate.duplicatePublication, fieldConfig.key);

      if (primaryHasValue) {
        acc[fieldConfig.key] = candidate.primaryPublication.id;
      } else if (duplicateHasValue) {
        acc[fieldConfig.key] = candidate.duplicatePublication.id;
      } else {
        acc[fieldConfig.key] = candidate.primaryPublication.id;
      }

      return acc;
    }, {} as FieldSourceByKey);

    setSelectedDuplicate(candidate);
    setKeepPublicationId(null);
    setFieldSourceByKey(defaultFieldSourceByKey);
  };

  const mergeDuplicateMutation = useMutation({
    mutationFn: (payload: {
      primaryPublicationId: string;
      duplicatePublicationId: string;
      fieldSources: FieldSourceByKey;
    }) => apiRequest("POST", "/api/publications/duplicates/merge", payload),
    onSuccess: () => {
      invalidatePublicationQueries();
      closeDuplicateDialog();
      toast({
        title: "Duplicate merged",
        description: "The selected publication was kept and duplicate data was merged.",
      });
    },
    onError: () => {
      toast({
        title: "Merge failed",
        description: "Unable to merge duplicate publications right now.",
        variant: "destructive",
      });
    },
  });

  const deleteDuplicateMutation = useMutation({
    mutationFn: (publicationId: string) => apiRequest("DELETE", `/api/publications/${publicationId}`),
    onSuccess: () => {
      invalidatePublicationQueries();
      closeDuplicateDialog();
      toast({
        title: "Duplicate deleted",
        description: "The duplicate publication has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Unable to delete duplicate publication right now.",
        variant: "destructive",
      });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async ({ firstId, secondId }: { firstId: string; secondId: string }) => {
      await Promise.all([
        apiRequest("DELETE", `/api/publications/${firstId}`),
        apiRequest("DELETE", `/api/publications/${secondId}`),
      ]);
    },
    onSuccess: () => {
      invalidatePublicationQueries();
      closeDuplicateDialog();
      toast({
        title: "Duplicates deleted",
        description: "Both publications in this duplicate pair were deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Delete all failed",
        description: "Unable to delete both duplicate publications right now.",
        variant: "destructive",
      });
    },
  });

  const rejectPublicationMutation = useMutation({
    mutationFn: async ({ publicationIds, reason }: { publicationIds: string[]; reason: string }) => {
      const uniquePublicationIds = Array.from(new Set(publicationIds.map((id) => id.trim()).filter(Boolean)));
      await Promise.all(
        uniquePublicationIds.map((publicationId) =>
          apiRequest("PATCH", `/api/publications/${publicationId}/reject`, { reason }),
        ),
      );
    },
    onSuccess: (_, variables) => {
      invalidatePublicationQueries();
      closeDuplicateDialog();
      toast({
        title: variables.publicationIds.length > 1 ? "Publications rejected" : "Publication rejected",
        description:
          variables.publicationIds.length > 1
            ? "Both duplicate candidates were rejected and removed from public visibility."
            : "The selected record was rejected and removed from public visibility.",
      });
    },
    onError: () => {
      toast({
        title: "Reject failed",
        description: "Unable to reject this publication right now.",
        variant: "destructive",
      });
    },
  });

  const undoRejectMutation = useMutation({
    mutationFn: (publicationId: string) => apiRequest("PATCH", `/api/publications/${publicationId}/unreject`, {}),
    onSuccess: () => {
      invalidatePublicationQueries();
      toast({
        title: "Reject undone",
        description: "The publication is back in pending review state.",
      });
    },
    onError: (error) => {
      const rawMessage = error instanceof Error ? error.message : "Unable to take back the reject decision right now.";
      const isUnauthorized = /^401:/.test(rawMessage) || /admin access required/i.test(rawMessage);
      const normalizedMessage = rawMessage.replace(/^\d{3}:\s*/, "").trim() || "Unable to take back the reject decision right now.";
      toast({
        title: "Undo reject failed",
        description: isUnauthorized ? "Session expired. Please log in again as Admin." : normalizedMessage,
        variant: "destructive",
      });
    },
  });

  const batchResolveMutation = useMutation({
    mutationFn: async ({ action, candidateIds }: { action: BatchDuplicateAction; candidateIds: string[] }) => {
      const candidateMap = new Map(duplicateCandidates.map((candidate) => [candidate.id, candidate]));
      const selectedCandidates = candidateIds
        .map((candidateId) => candidateMap.get(candidateId))
        .filter((candidate): candidate is DuplicateCandidate => Boolean(candidate))
        .sort((left, right) => right.probability - left.probability);

      const usedPublicationIds = new Set<string>();
      let processed = 0;
      let failed = 0;
      let skipped = 0;

      for (const candidate of selectedCandidates) {
        const primaryId = candidate.primaryPublication.id;
        const duplicateId = candidate.duplicatePublication.id;

        if (usedPublicationIds.has(primaryId) || usedPublicationIds.has(duplicateId)) {
          skipped += 1;
          continue;
        }

        try {
          if (action === "merge") {
            await apiRequest("POST", "/api/publications/duplicates/merge", {
              primaryPublicationId: primaryId,
              duplicatePublicationId: duplicateId,
              fieldSources: {},
            });
          } else if (action === "delete-duplicate") {
            await apiRequest("DELETE", `/api/publications/${duplicateId}`);
          } else {
            await Promise.all([
              apiRequest("DELETE", `/api/publications/${primaryId}`),
              apiRequest("DELETE", `/api/publications/${duplicateId}`),
            ]);
          }

          processed += 1;
          usedPublicationIds.add(primaryId);
          usedPublicationIds.add(duplicateId);
        } catch {
          failed += 1;
        }
      }

      return { processed, failed, skipped, action };
    },
    onSuccess: (result) => {
      invalidatePublicationQueries();
      setSelectedDuplicateIds(new Set());
      toast({
        title: "Batch duplicate resolution finished",
        description: `${result.processed} ${getBatchActionLabel(result.action)} pair(s), ${result.failed} failed, ${result.skipped} skipped (overlap).`,
      });
    },
    onError: () => {
      toast({
        title: "Batch resolve failed",
        description: "Unable to run batch duplicate actions right now.",
        variant: "destructive",
      });
    },
  });

  const summary = data?.summary;
  const rawDuplicateCandidates = data?.duplicateCandidates || [];
  const rejectedSubmissions = data?.rejectedSubmissions || [];
  const resubmittedSubmissions = data?.resubmittedSubmissions || [];
  const filteredResubmittedSubmissions = useMemo(() => {
    if (!showPendingResubmissionsOnly) {
      return resubmittedSubmissions;
    }

    return resubmittedSubmissions.filter((publication) => getModerationStatus(publication) === "pending");
  }, [resubmittedSubmissions, showPendingResubmissionsOnly]);
  const duplicateCandidates = useMemo(
    () => rawDuplicateCandidates.filter((candidate) => !ignoredDuplicateIds.has(candidate.id)),
    [ignoredDuplicateIds, rawDuplicateCandidates],
  );
  const chapterStats = data?.chapterStats || [];
  const leaderboard = data?.leaderboard || [];

  const applyDuplicateFilters = () => {
    setAppliedMinProbabilityPercent(Math.min(Math.max(draftMinProbabilityPercent, 50), 95));
    setAppliedMaxDuplicatePairs(Math.min(Math.max(draftMaxDuplicatePairs, 10), 400));
  };

  const filtersChanged =
    draftMinProbabilityPercent !== appliedMinProbabilityPercent ||
    draftMaxDuplicatePairs !== appliedMaxDuplicatePairs;

  const toggleIgnoredDuplicateCandidate = (candidateId: string, shouldIgnore: boolean) => {
    setIgnoredDuplicateIds((previous) => {
      const next = new Set(previous);
      if (shouldIgnore) {
        next.add(candidateId);
      } else {
        next.delete(candidateId);
      }
      return next;
    });

    if (shouldIgnore) {
      setSelectedDuplicateIds((previous) => {
        if (!previous.has(candidateId)) {
          return previous;
        }

        const next = new Set(previous);
        next.delete(candidateId);
        return next;
      });

      if (selectedDuplicate?.id === candidateId) {
        closeDuplicateDialog();
      }
    }
  };

  useEffect(() => {
    setSelectedDuplicateIds((previous) => {
      const validIds = new Set(duplicateCandidates.map((candidate) => candidate.id));
      let changed = false;
      const next = new Set<string>();

      for (const candidateId of Array.from(previous)) {
        if (validIds.has(candidateId)) {
          next.add(candidateId);
        } else {
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [duplicateCandidates]);

  const visibleDuplicateCandidates = useMemo(
    () => rawDuplicateCandidates.slice(0, 30),
    [rawDuplicateCandidates],
  );

  const visibleActiveDuplicateCandidates = useMemo(
    () => visibleDuplicateCandidates.filter((candidate) => !ignoredDuplicateIds.has(candidate.id)),
    [ignoredDuplicateIds, visibleDuplicateCandidates],
  );

  const selectedDuplicateCount = selectedDuplicateIds.size;
  const allVisibleSelected =
    visibleActiveDuplicateCandidates.length > 0 &&
    visibleActiveDuplicateCandidates.every((candidate) => selectedDuplicateIds.has(candidate.id));
  const someVisibleSelected =
    !allVisibleSelected && visibleActiveDuplicateCandidates.some((candidate) => selectedDuplicateIds.has(candidate.id));

  const toggleDuplicateSelection = (candidateId: string, shouldSelect: boolean) => {
    setSelectedDuplicateIds((previous) => {
      const next = new Set(previous);
      if (shouldSelect) {
        next.add(candidateId);
      } else {
        next.delete(candidateId);
      }
      return next;
    });
  };

  const toggleAllVisibleSelections = (shouldSelect: boolean) => {
    setSelectedDuplicateIds((previous) => {
      const next = new Set(previous);
      for (const candidate of visibleActiveDuplicateCandidates) {
        if (shouldSelect) {
          next.add(candidate.id);
        } else {
          next.delete(candidate.id);
        }
      }
      return next;
    });
  };

  const chapterDistributionRows = useMemo(
    () =>
      chapterStats.map((entry) => ({
        chapter: entry.chapterName,
        submissions: entry.total,
        approved: entry.approved,
        pending: entry.pending,
        share: summary?.total ? entry.total / summary.total : 0,
      })),
    [chapterStats, summary?.total],
  );

  const maxChapterSubmissions = useMemo(
    () => Math.max(...chapterDistributionRows.map((entry) => entry.submissions), 0),
    [chapterDistributionRows],
  );

  const approvalBreakdownData = useMemo(
    () => [
      { label: "Approved", value: summary?.approved || 0 },
      { label: "Pending", value: summary?.pending || 0 },
    ],
    [summary?.approved, summary?.pending],
  );

  const keptPublication = useMemo(() => {
    if (!selectedDuplicate) return null;
    if (!keepPublicationId) {
      return null;
    }

    if (keepPublicationId === selectedDuplicate.primaryPublication.id) {
      return selectedDuplicate.primaryPublication;
    }

    if (keepPublicationId !== selectedDuplicate.duplicatePublication.id) {
      return null;
    }

    return selectedDuplicate.duplicatePublication;
  }, [keepPublicationId, selectedDuplicate]);

  const duplicateToRemove = useMemo(() => {
    if (!selectedDuplicate || !keptPublication) {
      return null;
    }

    return keptPublication.id === selectedDuplicate.primaryPublication.id
      ? selectedDuplicate.duplicatePublication
      : selectedDuplicate.primaryPublication;
  }, [keptPublication, selectedDuplicate]);

  const openRejectDraftDialog = () => {
    if (!selectedDuplicate) {
      return;
    }

    const publicationsToReject = keptPublication && duplicateToRemove
      ? [duplicateToRemove]
      : [selectedDuplicate.primaryPublication, selectedDuplicate.duplicatePublication];

    setRejectTargetPublications(publicationsToReject);
    setRejectReasonDraft(buildDuplicateRejectionReason(selectedDuplicate, publicationsToReject, keptPublication));
  };

  const isActionPending =
    mergeDuplicateMutation.isPending ||
    deleteDuplicateMutation.isPending ||
    deleteAllMutation.isPending ||
    rejectPublicationMutation.isPending ||
    undoRejectMutation.isPending ||
    batchResolveMutation.isPending;

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Publication Analytics</CardTitle>
          <CardDescription>Loading analytics, duplicate checks, and chapter leaderboard...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4" data-testid="section-publication-analytics">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Publication Analytics
            </CardTitle>
            <CardDescription>
              Chapter performance, publication statistics, and duplicate-probability review for both pending and approved submissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Total Publications</p>
                <p className="text-2xl font-semibold">{summary?.total || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="text-2xl font-semibold">{summary?.approved || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-2xl font-semibold">{summary?.pending || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Rejected</p>
                <p className="text-2xl font-semibold text-destructive">{summary?.rejected || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Resubmitted</p>
                <p className="text-2xl font-semibold">{summary?.resubmitted || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">With Facebook Link</p>
                <p className="text-2xl font-semibold">{summary?.withFacebookLink || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Duplicate Candidates</p>
                <p className="text-2xl font-semibold">{duplicateCandidates.length}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">High Risk Duplicates</p>
                <p className="text-2xl font-semibold text-destructive">{duplicateCandidates.filter((candidate) => candidate.riskLevel === "high").length}</p>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Publications Per Chapter</CardTitle>
                  <CardDescription>Scalable chapter ranking view that stays readable even with many chapters.</CardDescription>
                </CardHeader>
                <CardContent>
                  {chapterDistributionRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No chapter publication data yet.</p>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {chapterDistributionRows.map((entry, index) => {
                        const normalizedWidth = maxChapterSubmissions > 0
                          ? Math.max((entry.submissions / maxChapterSubmissions) * 100, 4)
                          : 0;

                        return (
                          <div key={`${entry.chapter}-${index}`} className="rounded-md border p-2">
                            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                              <p className="truncate font-medium">
                                #{index + 1} {entry.chapter}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {entry.submissions} submission{entry.submissions === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted">
                              <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${normalizedWidth}%` }}
                              />
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Approved: {entry.approved} | Pending: {entry.pending} | Share: {Math.round(entry.share * 100)}%
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Approval Distribution</CardTitle>
                  <CardDescription>Approved vs pending publication ratio.</CardDescription>
                </CardHeader>
                <CardContent>
                  {(summary?.total || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No publication records available.</p>
                  ) : (
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={approvalBreakdownData}
                            dataKey="value"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={72}
                            outerRadius={108}
                            paddingAngle={3}
                          >
                            {approvalBreakdownData.map((entry, index) => (
                              <Cell key={`approval-${entry.label}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number, name: string) => [value, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Chapter Submission Leaderboard</CardTitle>
                <CardDescription>Who submitted report publications the most. Scroll inside this card to view all chapters.</CardDescription>
              </CardHeader>
              <CardContent>
                {leaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No publication leaderboard data available yet.</p>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {leaderboard.map((entry, index) => (
                      <div key={`${entry.chapterId || "none"}-${entry.chapterName}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            #{index + 1}
                          </span>
                          <div>
                            <p className="font-medium">{entry.chapterName}</p>
                            <p className="text-xs text-muted-foreground">
                              Approved: {entry.approved} | Pending: {entry.pending}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary">{entry.submissions} submissions</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Rejected Submissions Tracker</CardTitle>
                  <CardDescription>Review all rejected publications and take back a reject decision when needed.</CardDescription>
                </CardHeader>
                <CardContent>
                  {rejectedSubmissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rejected submissions recorded.</p>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {rejectedSubmissions.map((publication) => (
                        <div key={publication.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium break-words">{publication.title}</p>
                              <p className="text-xs text-muted-foreground">{publication.chapterName}</p>
                              <p className="text-xs text-muted-foreground">
                                Rejected {format(new Date(publication.rejectedAt || publication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => undoRejectMutation.mutate(publication.id)}
                              disabled={undoRejectMutation.isPending || isActionPending}
                              data-testid={`button-undo-reject-publication-${publication.id}`}
                            >
                              {undoRejectMutation.isPending ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-1 h-4 w-4" />
                              )}
                              Undo Reject
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                            {publication.rejectionReason?.trim() || "No rejection reason provided."}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Resubmission Tracker</CardTitle>
                  <CardDescription>All resubmissions are tracked here and go back through moderation preview.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Showing {filteredResubmittedSubmissions.length} of {resubmittedSubmissions.length} resubmission records
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant={showPendingResubmissionsOnly ? "default" : "outline"}
                      onClick={() => setShowPendingResubmissionsOnly((previous) => !previous)}
                      data-testid="button-filter-pending-resubmissions"
                    >
                      {showPendingResubmissionsOnly ? "Show All" : "Pending Only"}
                    </Button>
                  </div>

                  {resubmittedSubmissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No resubmitted reports yet.</p>
                  ) : filteredResubmittedSubmissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pending resubmissions match the current filter.</p>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {filteredResubmittedSubmissions.map((publication) => {
                        const moderationStatus = getModerationStatus(publication);

                        return (
                          <div key={publication.id} className="rounded-md border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="font-medium break-words">{publication.title}</p>
                                <p className="text-xs text-muted-foreground">{publication.chapterName}</p>
                                <p className="text-xs text-muted-foreground">
                                  Last resubmitted {format(new Date(publication.lastResubmittedAt || publication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant="outline">Resubmission #{publication.resubmissionCount || 0}</Badge>
                                {moderationStatus === "approved" ? (
                                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">Approved</Badge>
                                ) : moderationStatus === "rejected" ? (
                                  <Badge variant="destructive">Rejected</Badge>
                                ) : (
                                  <Badge variant="secondary">Pending Review</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Duplicate Publication Detector</CardTitle>
                <CardDescription>
                  Scans pending and approved publications for possible duplicates using all publication info fields and uploaded details (title, content, links, media, chapter, source report, moderation metadata, and timestamps). Ignore toggles below are pair-specific.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid gap-4 rounded-md border p-3 lg:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Minimum Duplicate Probability: {draftMinProbabilityPercent}%</p>
                    <input
                      type="range"
                      min={50}
                      max={95}
                      step={1}
                      value={draftMinProbabilityPercent}
                      onChange={(event) => setDraftMinProbabilityPercent(Number.parseInt(event.target.value, 10) || 58)}
                      className="h-2 w-full cursor-pointer"
                      data-testid="input-publication-duplicate-min-probability"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Max Duplicate Pairs To Scan</p>
                    <Input
                      type="number"
                      min={10}
                      max={400}
                      value={draftMaxDuplicatePairs}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(value)) {
                          setDraftMaxDuplicatePairs(120);
                          return;
                        }

                        setDraftMaxDuplicatePairs(Math.min(Math.max(value, 10), 400));
                      }}
                      data-testid="input-publication-duplicate-max-pairs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyDuplicateFilters}
                      disabled={!filtersChanged || isActionPending}
                      data-testid="button-apply-publication-duplicate-filters"
                    >
                      Apply Filters
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Sliding does not reload the whole tab. Filters apply only when you click Apply.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Batch Actions</p>
                    <p className="text-xs text-muted-foreground">Selected pairs: {selectedDuplicateCount}</p>
                    {isFetching && <Badge variant="outline" className="w-fit">Refreshing analytics...</Badge>}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={selectedDuplicateCount === 0 || isActionPending}
                        onClick={() =>
                          batchResolveMutation.mutate({
                            action: "merge",
                            candidateIds: Array.from(selectedDuplicateIds),
                          })
                        }
                        data-testid="button-batch-merge-publication-duplicates"
                      >
                        Batch Merge
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={selectedDuplicateCount === 0 || isActionPending}
                        onClick={() =>
                          batchResolveMutation.mutate({
                            action: "delete-duplicate",
                            candidateIds: Array.from(selectedDuplicateIds),
                          })
                        }
                        data-testid="button-batch-delete-publication-duplicates"
                      >
                        Batch Delete Duplicates
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={selectedDuplicateCount === 0 || isActionPending}
                        onClick={() =>
                          batchResolveMutation.mutate({
                            action: "delete-all",
                            candidateIds: Array.from(selectedDuplicateIds),
                          })
                        }
                        data-testid="button-batch-delete-all-publication-duplicates"
                      >
                        Batch Delete All
                      </Button>
                    </div>
                  </div>
                </div>

                {rawDuplicateCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No duplicate publication candidates found.</p>
                ) : duplicateCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All currently flagged duplicate pairs are ignored. Toggle them back on in the list below.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                          onCheckedChange={(checked) => toggleAllVisibleSelections(checked === true)}
                          disabled={visibleActiveDuplicateCandidates.length === 0}
                          data-testid="checkbox-select-all-publication-duplicates"
                        />
                        <span>Select all shown ({visibleActiveDuplicateCandidates.length})</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {selectedDuplicateCount} selected
                      </span>
                    </div>

                    {visibleDuplicateCandidates.map((candidate) => (
                      <div key={candidate.id} className="rounded-md border p-3">
                        <div className="flex gap-3">
                          <div className="pt-1">
                            <Checkbox
                              checked={selectedDuplicateIds.has(candidate.id)}
                              onCheckedChange={(checked) => toggleDuplicateSelection(candidate.id, checked === true)}
                              disabled={ignoredDuplicateIds.has(candidate.id)}
                              data-testid={`checkbox-select-publication-duplicate-${candidate.id}`}
                            />
                          </div>

                          <div className="flex-1">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {ignoredDuplicateIds.has(candidate.id) && (
                                    <Badge variant="outline">IGNORED</Badge>
                                  )}
                                  <Badge variant={getRiskBadgeVariant(candidate.riskLevel)}>
                                    {candidate.riskLevel.toUpperCase()} RISK
                                  </Badge>
                                  <Badge variant="outline">Duplicate Probability: {formatPercent(candidate.probability)}</Badge>
                                  <Badge variant="secondary">{candidate.statusPair}</Badge>
                                </div>
                                <p className="text-sm font-medium break-words">
                                  {candidate.primaryPublication.title} <span className="text-muted-foreground">vs</span> {candidate.duplicatePublication.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {candidate.primaryPublication.chapterName} <span>vs</span> {candidate.duplicatePublication.chapterName}
                                </p>
                              </div>
                              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end lg:shrink-0">
                                <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                                  <span className="whitespace-nowrap text-xs text-muted-foreground">Ignore this duplicate</span>
                                  <Switch
                                    checked={ignoredDuplicateIds.has(candidate.id)}
                                    onCheckedChange={(checked) => toggleIgnoredDuplicateCandidate(candidate.id, checked)}
                                    className="shrink-0"
                                    data-testid={`switch-ignore-publication-duplicate-${candidate.id}`}
                                  />
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => openDuplicateDialog(candidate)}
                                  disabled={ignoredDuplicateIds.has(candidate.id)}
                                  data-testid={`button-review-publication-duplicate-${candidate.id}`}
                                >
                                  Review Duplicate
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedDuplicate)} onOpenChange={(open) => !open && closeDuplicateDialog()}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto" hideClose>
          {!selectedDuplicate ? null : (
            <>
              <DialogHeader className="sticky -top-6 z-20 -mx-6 -mt-6 border-b bg-background px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <DialogTitle>Duplicate Publication Review</DialogTitle>
                    <DialogDescription>
                      Choose which publication to keep, review field-level data sources, then merge or delete duplicates.
                    </DialogDescription>
                  </div>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Close duplicate review dialog"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogClose>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>Duplicate Probability: <strong>{formatPercent(selectedDuplicate.probability)}</strong></span>
                  <Badge variant={getRiskBadgeVariant(selectedDuplicate.riskLevel)}>
                    {selectedDuplicate.riskLevel.toUpperCase()} RISK
                  </Badge>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">1st Publication</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="font-medium break-words">{selectedDuplicate.primaryPublication.title}</p>
                      <p className="text-xs text-muted-foreground">{selectedDuplicate.primaryPublication.chapterName}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedDuplicate.primaryPublication.isApproved ? "Approved" : "Pending"} • {format(new Date(selectedDuplicate.primaryPublication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant={keepPublicationId === selectedDuplicate.primaryPublication.id ? "default" : "outline"}
                        onClick={() =>
                          setKeepPublicationId((current) =>
                            current === selectedDuplicate.primaryPublication.id ? null : selectedDuplicate.primaryPublication.id,
                          )
                        }
                      >
                        Keep This Record
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">2nd Publication</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="font-medium break-words">{selectedDuplicate.duplicatePublication.title}</p>
                      <p className="text-xs text-muted-foreground">{selectedDuplicate.duplicatePublication.chapterName}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedDuplicate.duplicatePublication.isApproved ? "Approved" : "Pending"} • {format(new Date(selectedDuplicate.duplicatePublication.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant={keepPublicationId === selectedDuplicate.duplicatePublication.id ? "default" : "outline"}
                        onClick={() =>
                          setKeepPublicationId((current) =>
                            current === selectedDuplicate.duplicatePublication.id ? null : selectedDuplicate.duplicatePublication.id,
                          )
                        }
                      >
                        Keep This Record
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Field Similarity Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    {FULL_SCORE_BREAKDOWN_LABELS.map((entry) => (
                      <div key={entry.key} className="rounded-md border p-2">
                        {entry.label}: {formatPercent(selectedDuplicate.scoreBreakdown[entry.key])}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Choose Field Sources For Merge</CardTitle>
                    <CardDescription>
                      Choose whether each field should keep data from the 1st or 2nd publication. Similarity percentages are shown below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 lg:grid-cols-2">
                    {MERGE_FIELDS.map((fieldConfig) => {
                      const currentSourceId = fieldSourceByKey[fieldConfig.key];
                      const firstIsSelected = currentSourceId === selectedDuplicate.primaryPublication.id;
                      const secondIsSelected = currentSourceId === selectedDuplicate.duplicatePublication.id;
                      const similarityKey = SCORE_BREAKDOWN_KEY_BY_MERGE_FIELD[fieldConfig.key];
                      const similarityPercent = formatPercent(selectedDuplicate.scoreBreakdown[similarityKey]);
                      const firstFieldValue = getFieldDisplayValue(selectedDuplicate.primaryPublication, fieldConfig.key);
                      const secondFieldValue = getFieldDisplayValue(selectedDuplicate.duplicatePublication, fieldConfig.key);
                      const firstFieldHref = getFieldDisplayHref(firstFieldValue, fieldConfig.key);
                      const secondFieldHref = getFieldDisplayHref(secondFieldValue, fieldConfig.key);

                      return (
                        <div key={fieldConfig.key} className="rounded-md border p-3">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-sm font-medium">{fieldConfig.label}</p>
                              <p className="text-xs text-muted-foreground">Similarity: {similarityPercent}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant={firstIsSelected ? "default" : "outline"}
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setFieldSourceByKey((prev) => ({ ...prev, [fieldConfig.key]: selectedDuplicate.primaryPublication.id }))}
                              >
                                Keep 1st
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={secondIsSelected ? "default" : "outline"}
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setFieldSourceByKey((prev) => ({ ...prev, [fieldConfig.key]: selectedDuplicate.duplicatePublication.id }))}
                              >
                                Keep 2nd
                              </Button>
                            </div>
                          </div>

                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-md border bg-muted/20 p-2 text-xs">
                              <p className="mb-1 font-medium text-foreground">1st</p>
                              {firstFieldHref ? (
                                <a
                                  href={firstFieldHref}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="break-all text-primary underline-offset-2 hover:underline"
                                >
                                  {firstFieldValue}
                                </a>
                              ) : (
                                <p className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">
                                  {firstFieldValue}
                                </p>
                              )}
                            </div>

                            <div className="rounded-md border bg-muted/20 p-2 text-xs">
                              <p className="mb-1 font-medium text-foreground">2nd</p>
                              {secondFieldHref ? (
                                <a
                                  href={secondFieldHref}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="break-all text-primary underline-offset-2 hover:underline"
                                >
                                  {secondFieldValue}
                                </a>
                              ) : (
                                <p className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">
                                  {secondFieldValue}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {keptPublication && duplicateToRemove && (
                  <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                    Keeping: <strong>{keptPublication.title}</strong> | Duplicate to remove: <strong>{duplicateToRemove.title}</strong>
                  </div>
                )}

                {!keptPublication && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    No keep record selected. Reject will target both records. Merge stays disabled until you choose one record to keep.
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      openRejectDraftDialog();
                    }}
                    disabled={!selectedDuplicate || isActionPending}
                    data-testid="button-reject-publication-duplicate"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    {keptPublication ? "Reject Duplicate" : "Reject Both"}
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (!duplicateToRemove) return;
                      deleteDuplicateMutation.mutate(duplicateToRemove.id);
                    }}
                    disabled={!duplicateToRemove || isActionPending}
                    data-testid="button-delete-publication-duplicate"
                  >
                    {deleteDuplicateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete Duplicate
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!selectedDuplicate) return;
                      deleteAllMutation.mutate({
                        firstId: selectedDuplicate.primaryPublication.id,
                        secondId: selectedDuplicate.duplicatePublication.id,
                      });
                    }}
                    disabled={!selectedDuplicate || isActionPending}
                    data-testid="button-delete-all-publication-duplicates"
                  >
                    {deleteAllMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete All
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      if (!keptPublication || !duplicateToRemove) {
                        toast({
                          title: "Select a record to keep",
                          description: "Choose exactly one record to keep before merging.",
                          variant: "destructive",
                        });
                        return;
                      }

                      mergeDuplicateMutation.mutate({
                        primaryPublicationId: keptPublication.id,
                        duplicatePublicationId: duplicateToRemove.id,
                        fieldSources: fieldSourceByKey,
                      });
                    }}
                    disabled={!keptPublication || !duplicateToRemove || isActionPending}
                    data-testid="button-merge-publication-duplicate"
                  >
                    {mergeDuplicateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <GitMerge className="mr-2 h-4 w-4" />
                    )}
                    Merge Records
                  </Button>
                </DialogFooter>

                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Merge keeps the selected record and carries over chosen field data from either side.
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectTargetPublications.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTargetPublications([]);
            setRejectReasonDraft("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reject Publication</DialogTitle>
            <DialogDescription>
              The rejection reason is prefilled from duplicate similarity analysis. Edit as needed, then submit manually.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {rejectTargetPublications.length === 1 ? (
              <p className="text-xs text-muted-foreground">
                Target publication: <span className="font-medium text-foreground">{rejectTargetPublications[0]?.title || "-"}</span>
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Target publications:</p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {rejectTargetPublications.map((publication) => (
                    <li key={publication.id} className="break-words">
                      <span className="font-medium text-foreground">{publication.title}</span>
                      {` (${publication.chapterName})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Textarea
              value={rejectReasonDraft}
              onChange={(event) => setRejectReasonDraft(event.target.value)}
              rows={10}
              placeholder="Provide rejection reason"
              data-testid="textarea-analytics-reject-reason"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectTargetPublications([]);
                setRejectReasonDraft("");
              }}
              disabled={rejectPublicationMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const normalizedReason = rejectReasonDraft.trim();
                if (rejectTargetPublications.length === 0) {
                  return;
                }

                if (!normalizedReason) {
                  toast({
                    title: "Rejection reason required",
                    description: "Please provide a reason before rejecting this publication.",
                    variant: "destructive",
                  });
                  return;
                }

                rejectPublicationMutation.mutate({
                  publicationIds: rejectTargetPublications.map((publication) => publication.id),
                  reason: normalizedReason,
                });
              }}
              disabled={rejectPublicationMutation.isPending || rejectTargetPublications.length === 0}
              data-testid="button-confirm-analytics-reject"
            >
              {rejectPublicationMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              {rejectTargetPublications.length > 1 ? "Confirm Reject Both" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
