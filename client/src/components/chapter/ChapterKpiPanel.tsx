import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useToast } from "@/hooks/use-toast";
import { getComparisonColor } from "@/lib/chartColors";
import { createPdfExportContract } from "@/lib/export/pdfContract";
import { reportPdfFallbackRequest } from "@/lib/export/pdfFallback";
import { createSafeFileToken, getIsoDateFileStamp } from "@/lib/export/pdfStandards";
import { createYspPdfReport } from "@/lib/pdfReport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BarChart3, Target, Check, Clock, TrendingUp, Plus, Save, MapPin, Edit2, Trash2, Eye, FileDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import type { KpiTemplate, KpiCompletion } from "@shared/schema";
import {
  createDefaultKpiDependencyRule,
  parseKpiDependencyConfig,
  serializeKpiDependencyConfig,
  summarizeKpiDependencyConfig,
  type KpiDependencyRule,
} from "@shared/kpi-dependencies";
import KpiDependencyEditor from "@/components/kpi/KpiDependencyEditor";

interface ChapterKpiPanelProps {
  chapterId: string;
}

interface BarangayOption {
  id: string;
  barangayName: string;
  chapterId: string;
}

interface KpiScopeRecord {
  entityType: string;
  entityId: string;
}

interface ManagedBarangayTemplate extends KpiTemplate {
  assignedBarangayIds: string[];
  dependencySummary: string | null;
}

interface BarangayAnalyticsRuleEvaluation {
  metric: string;
  metricLabel: string;
  operator: string;
  operatorLabel: string;
  targetValue: number;
  currentValue: number;
  passed: boolean;
  description: string;
}

interface BarangayTemplateAnalyticsEntry {
  barangayId: string;
  barangayName: string;
  chapterId: string;
  accomplished: boolean;
  ruleEvaluations: BarangayAnalyticsRuleEvaluation[];
}

interface BarangayTemplateAnalytics {
  template: KpiTemplate;
  dependencySummary: string | null;
  assignedBarangays: BarangayTemplateAnalyticsEntry[];
  assignedCount: number;
  accomplishedCount: number;
  pendingCount: number;
}

interface ChapterAssignFormData {
  name: string;
  description: string;
  timeframe: string;
  inputType: string;
  year: number;
  quarter: number | null;
  targetValue: number | null;
  selectedEntityIds: string[];
  dependencyEnabled: boolean;
  dependencyAggregation: "all" | "any";
  dependencyRules: KpiDependencyRule[];
}

const chapterKpiAnalyticsChartConfig = {
  accomplished: {
    label: "Accomplished",
    color: "#16a34a",
  },
  pending: {
    label: "Pending",
    color: "#f97316",
  },
  completionRate: {
    label: "Completion Rate",
    color: "#2563eb",
  },
  rulePassed: {
    label: "Passed Checks",
    color: "#0f766e",
  },
  ruleFailed: {
    label: "Failed Checks",
    color: "#dc2626",
  },
} satisfies ChartConfig;

const DEFAULT_CHAPTER_ANALYTICS_EXPORT_SECTIONS = {
  scope: true,
  completionSummary: true,
  assignmentSnapshot: true,
};

const DEFAULT_CHAPTER_ANALYTICS_EXPORT_COLUMNS = {
  completionTemplate: true,
  completionAssigned: true,
  completionAccomplished: true,
  completionPending: true,
  completionRate: true,
  assignmentTemplate: true,
  assignmentDependency: true,
  assignmentAssigned: true,
  assignmentAccomplished: true,
};

const DEFAULT_TEMPLATE_DETAILS_EXPORT_SECTIONS = {
  scope: true,
  statusBreakdown: true,
  dependencyRuleHealth: true,
  accomplishedBarangays: true,
  pendingBarangays: true,
};

const DEFAULT_TEMPLATE_DETAILS_EXPORT_COLUMNS = {
  statusLabel: true,
  statusCount: true,
  ruleStatusLabel: true,
  ruleStatusCount: true,
  accomplishedBarangay: true,
  accomplishedChecks: true,
  pendingBarangay: true,
  pendingUnmetRules: true,
};

type ChapterAnalyticsExportSectionKey = keyof typeof DEFAULT_CHAPTER_ANALYTICS_EXPORT_SECTIONS;
type ChapterAnalyticsExportColumnKey = keyof typeof DEFAULT_CHAPTER_ANALYTICS_EXPORT_COLUMNS;
type TemplateDetailsExportSectionKey = keyof typeof DEFAULT_TEMPLATE_DETAILS_EXPORT_SECTIONS;
type TemplateDetailsExportColumnKey = keyof typeof DEFAULT_TEMPLATE_DETAILS_EXPORT_COLUMNS;

function truncateChartLabel(value: string | number, maxLength = 16) {
  const label = String(value ?? "");
  if (label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, maxLength - 1)}...`;
}

export default function ChapterKpiPanel({ chapterId }: ChapterKpiPanelProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const createInitialAssignFormData = (): ChapterAssignFormData => ({
    name: "",
    description: "",
    timeframe: "quarterly",
    inputType: "numeric",
    year: currentYear,
    quarter: currentQuarter,
    targetValue: null as number | null,
    selectedEntityIds: [] as string[],
    dependencyEnabled: false,
    dependencyAggregation: "all" as "all" | "any",
    dependencyRules: [] as KpiDependencyRule[],
  });

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [viewTab, setViewTab] = useState("quarterly");
  const [mainTab, setMainTab] = useState<"kpis" | "analytics">("kpis");
  const [isAssigningTemplate, setIsAssigningTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [selectedManagedTemplate, setSelectedManagedTemplate] = useState<ManagedBarangayTemplate | null>(null);
  const [selectedAnalyticsTemplate, setSelectedAnalyticsTemplate] = useState<ManagedBarangayTemplate | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isExportingAnalyticsPdf, setIsExportingAnalyticsPdf] = useState(false);
  const [isExportingTemplatePdf, setIsExportingTemplatePdf] = useState(false);
  const [analyticsExportDialogOpen, setAnalyticsExportDialogOpen] = useState(false);
  const [templateExportDialogOpen, setTemplateExportDialogOpen] = useState(false);
  const [analyticsExportReportTitle, setAnalyticsExportReportTitle] = useState("Chapter KPI Analytics Report");
  const [templateExportReportTitle, setTemplateExportReportTitle] = useState("Specific KPI Details Report");
  const [analyticsExportSections, setAnalyticsExportSections] = useState(() => ({
    ...DEFAULT_CHAPTER_ANALYTICS_EXPORT_SECTIONS,
  }));
  const [analyticsExportColumns, setAnalyticsExportColumns] = useState(() => ({
    ...DEFAULT_CHAPTER_ANALYTICS_EXPORT_COLUMNS,
  }));
  const [templateExportSections, setTemplateExportSections] = useState(() => ({
    ...DEFAULT_TEMPLATE_DETAILS_EXPORT_SECTIONS,
  }));
  const [templateExportColumns, setTemplateExportColumns] = useState(() => ({
    ...DEFAULT_TEMPLATE_DETAILS_EXPORT_COLUMNS,
  }));
  const [assignFormData, setAssignFormData] = useState<ChapterAssignFormData>(createInitialAssignFormData);

  const { data: chapterBarangays = [] } = useQuery<BarangayOption[]>({
    queryKey: ["/api/chapters", chapterId, "barangays"],
    queryFn: async () => {
      const res = await fetch(`/api/chapters/${chapterId}/barangays`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chapter barangays");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const chapterBarangayIds = useMemo(
    () => chapterBarangays.map((barangay) => barangay.id),
    [chapterBarangays],
  );

  const { data: templates = [] } = useQuery<KpiTemplate[]>({
    queryKey: ["/api/kpi-templates", { year: selectedYear, chapterId }],
    queryFn: async () => {
      const res = await fetch(`/api/kpi-templates?year=${selectedYear}&chapterScope=true&chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI templates");
      return res.json();
    },
  });

  const { data: completions = [] } = useQuery<KpiCompletion[]>({
    queryKey: ["/api/kpi-completions", { chapterId }],
    queryFn: async () => {
      const res = await fetch(`/api/kpi-completions?chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch completions");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const selectedTemplateIdForScopes = selectedManagedTemplate?.id || selectedAnalyticsTemplate?.id;

  const managedTemplateIds = useMemo(
    () => templates.filter((template) => template.scope === "selected_barangays").map((template) => template.id),
    [templates],
  );

  const { data: scopesByTemplateId = {} } = useQuery<Record<string, KpiScopeRecord[]>>({
    queryKey: ["/api/chapter-kpi-template-scopes", managedTemplateIds.join(",")],
    queryFn: async () => {
      const scopeEntries = await Promise.all(
        managedTemplateIds.map(async (templateId) => {
          const res = await fetch(`/api/kpi-templates/${templateId}/scopes`, { credentials: "include" });
          if (!res.ok) {
            return [templateId, []] as const;
          }
          return [templateId, ((await res.json()) as KpiScopeRecord[])] as const;
        }),
      );

      return Object.fromEntries(scopeEntries);
    },
    enabled: managedTemplateIds.length > 0,
  });

  const { data: selectedTemplateScopes = [] } = useQuery<KpiScopeRecord[]>({
    queryKey: ["/api/kpi-templates", selectedTemplateIdForScopes, "scopes"],
    queryFn: async () => {
      if (!selectedTemplateIdForScopes) return [];
      const res = await fetch(`/api/kpi-templates/${selectedTemplateIdForScopes}/scopes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI scopes");
      return res.json();
    },
    enabled: Boolean(selectedTemplateIdForScopes),
  });

  const { data: selectedTemplateAnalytics = null, isLoading: isTemplateAnalyticsLoading } = useQuery<BarangayTemplateAnalytics | null>({
    queryKey: ["/api/kpi-templates", selectedAnalyticsTemplate?.id, "barangay-analytics"],
    queryFn: async () => {
      if (!selectedAnalyticsTemplate) return null;
      const res = await fetch(`/api/kpi-templates/${selectedAnalyticsTemplate.id}/barangay-analytics`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI barangay analytics");
      return res.json();
    },
    enabled: Boolean(selectedAnalyticsTemplate),
  });

  const { data: chapterManagedTemplateAnalytics = [], isLoading: isChapterAnalyticsLoading } = useQuery<BarangayTemplateAnalytics[]>({
    queryKey: ["/api/chapter-kpi-templates-barangay-analytics", managedTemplateIds.join(",")],
    queryFn: async () => {
      const analyticsEntries = await Promise.all(
        managedTemplateIds.map(async (templateId) => {
          const res = await fetch(`/api/kpi-templates/${templateId}/barangay-analytics`, { credentials: "include" });
          if (!res.ok) {
            return null;
          }
          return (await res.json()) as BarangayTemplateAnalytics;
        }),
      );

      return analyticsEntries.filter(
        (entry): entry is BarangayTemplateAnalytics => Boolean(entry),
      );
    },
    enabled: mainTab === "analytics" && managedTemplateIds.length > 0,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/kpi-completions", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-completions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const markCompleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/kpi-completions/${id}/mark-complete`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI marked as completed. Your score has increased!" });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-completions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const assignTemplateMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (payload?.id && payload?.data) {
        return await apiRequest("PUT", `/api/kpi-templates/${payload.id}`, payload.data);
      }
      return await apiRequest("POST", "/api/kpi-templates", payload);
    },
    onSuccess: () => {
      toast({ title: "Success", description: editingTemplateId ? "KPI template updated." : "KPI template assigned to selected barangays." });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-completions"] });
      resetAssignForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return await apiRequest("DELETE", `/api/kpi-templates/${templateId}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI template deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-completions"] });
      setIsDetailsModalOpen(false);
      setSelectedManagedTemplate(null);
      setSelectedAnalyticsTemplate(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetAssignForm = () => {
    setIsAssigningTemplate(false);
    setEditingTemplateId(null);
    setSelectedManagedTemplate(null);
    setAssignFormData(createInitialAssignFormData());
  };

  const openCreateTemplateModal = () => {
    setEditingTemplateId(null);
    setSelectedManagedTemplate(null);
    setAssignFormData(createInitialAssignFormData());
    setIsAssigningTemplate(true);
  };

  const openEditTemplateModal = (template: ManagedBarangayTemplate) => {
    setSelectedManagedTemplate(template);
    setEditingTemplateId(template.id);
    setIsAssigningTemplate(true);
  };

  const openTemplateDetailsModal = (template: ManagedBarangayTemplate) => {
    setSelectedAnalyticsTemplate(template);
    setIsDetailsModalOpen(true);
  };

  const handleBarangayToggle = (barangayId: string) => {
    setAssignFormData((prev) => ({
      ...prev,
      selectedEntityIds: prev.selectedEntityIds.includes(barangayId)
        ? prev.selectedEntityIds.filter((id) => id !== barangayId)
        : [...prev.selectedEntityIds, barangayId],
    }));
  };

  const isAllBarangaysSelected =
    chapterBarangayIds.length > 0 &&
    chapterBarangayIds.every((barangayId) => assignFormData.selectedEntityIds.includes(barangayId));

  const hasSomeBarangaysSelected =
    !isAllBarangaysSelected &&
    chapterBarangayIds.some((barangayId) => assignFormData.selectedEntityIds.includes(barangayId));

  const handleToggleAllBarangays = (checked: boolean) => {
    setAssignFormData((prev) => ({
      ...prev,
      selectedEntityIds: checked ? chapterBarangayIds : [],
    }));
  };

  const handleAssignTemplate = (e: FormEvent) => {
    e.preventDefault();

    if (!assignFormData.name.trim()) {
      toast({ title: "Error", description: "KPI name is required", variant: "destructive" });
      return;
    }

    if (assignFormData.selectedEntityIds.length === 0) {
      toast({ title: "Error", description: "Select at least one barangay", variant: "destructive" });
      return;
    }

    if (assignFormData.dependencyEnabled && assignFormData.dependencyRules.length === 0) {
      toast({ title: "Error", description: "Add at least one dependency rule", variant: "destructive" });
      return;
    }

    if (
      assignFormData.dependencyEnabled &&
      assignFormData.dependencyRules.some(
        (rule) => !Number.isFinite(rule.targetValue) || rule.targetValue < 0,
      )
    ) {
      toast({ title: "Error", description: "Dependency targets must be zero or greater", variant: "destructive" });
      return;
    }

    const serializedDependencyConfig = assignFormData.dependencyEnabled
      ? serializeKpiDependencyConfig({
          version: 1,
          mode: "auto",
          aggregation: assignFormData.dependencyAggregation,
          rules: assignFormData.dependencyRules,
        })
      : null;

    const resolvedInputType = assignFormData.dependencyEnabled ? "numeric" : assignFormData.inputType;
    const dependencyDerivedTarget = assignFormData.dependencyEnabled
      ? assignFormData.dependencyRules[0]?.targetValue ?? null
      : null;

    const submitData = {
      name: assignFormData.name.trim(),
      description: assignFormData.description,
      timeframe: assignFormData.timeframe,
      inputType: resolvedInputType,
      year: assignFormData.year,
      quarter:
        assignFormData.timeframe === "quarterly" || assignFormData.timeframe === "both"
          ? assignFormData.quarter
          : null,
      targetValue: resolvedInputType === "numeric" ? (dependencyDerivedTarget ?? assignFormData.targetValue) : null,
      isActive: true,
      scope: "selected_barangays",
      selectedEntityIds: assignFormData.selectedEntityIds,
      linkedEntityId: serializedDependencyConfig,
    };

    if (editingTemplateId) {
      assignTemplateMutation.mutate({
        id: editingTemplateId,
        data: submitData,
      } as any);
      return;
    }

    assignTemplateMutation.mutate(submitData);
  };

  const getCompletion = (templateId: string) => {
    return completions.find(c => c.kpiTemplateId === templateId);
  };

  const dependencySummaryByTemplateId = useMemo(() => {
    return new Map(
      templates.map((template) => {
        const dependencyConfig = parseKpiDependencyConfig(template.linkedEntityId);
        return [template.id, dependencyConfig ? summarizeKpiDependencyConfig(dependencyConfig) : null] as const;
      }),
    );
  }, [templates]);

  const selectedScopeBarangayIds = useMemo(
    () => selectedTemplateScopes.filter((scope) => scope.entityType === "barangay").map((scope) => scope.entityId),
    [selectedTemplateScopes],
  );

  const managedTemplates = useMemo<ManagedBarangayTemplate[]>(() => {
    return templates
      .filter((template) => template.scope === "selected_barangays")
      .map((template) => {
        const assignedBarangayIds = (scopesByTemplateId[template.id] || [])
          .filter((scope) => scope.entityType === "barangay")
          .map((scope) => scope.entityId);

        return {
          ...template,
          assignedBarangayIds,
          dependencySummary: dependencySummaryByTemplateId.get(template.id) || null,
        };
      })
      .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  }, [templates, scopesByTemplateId, dependencySummaryByTemplateId]);

  const analyticsOverview = useMemo(() => {
    const templateCount = chapterManagedTemplateAnalytics.length;
    const totalAssignments = chapterManagedTemplateAnalytics.reduce(
      (sum, item) => sum + item.assignedCount,
      0,
    );
    const totalAccomplished = chapterManagedTemplateAnalytics.reduce(
      (sum, item) => sum + item.accomplishedCount,
      0,
    );
    const completionRate = totalAssignments > 0 ? Math.round((totalAccomplished / totalAssignments) * 100) : 0;

    return {
      templateCount,
      totalAssignments,
      totalAccomplished,
      totalPending: Math.max(totalAssignments - totalAccomplished, 0),
      completionRate,
    };
  }, [chapterManagedTemplateAnalytics]);

  const analyticsStatusChartData = useMemo(
    () => [
      {
        name: "Accomplished",
        value: analyticsOverview.totalAccomplished,
        fill: "var(--color-accomplished)",
      },
      {
        name: "Pending",
        value: analyticsOverview.totalPending,
        fill: "var(--color-pending)",
      },
    ],
    [analyticsOverview.totalAccomplished, analyticsOverview.totalPending],
  );

  const templateCompletionChartData = useMemo(
    () =>
      chapterManagedTemplateAnalytics
        .map((item) => {
          const completionRate =
            item.assignedCount > 0
              ? Math.round((item.accomplishedCount / item.assignedCount) * 100)
              : 0;

          return {
            templateId: item.template.id,
            templateName: item.template.name,
            shortTemplateName:
              item.template.name.length > 22
                ? `${item.template.name.slice(0, 22)}...`
                : item.template.name,
            accomplished: item.accomplishedCount,
            pending: item.pendingCount,
            assigned: item.assignedCount,
            completionRate,
          };
        })
        .sort((a, b) => b.assigned - a.assigned || b.completionRate - a.completionRate),
    [chapterManagedTemplateAnalytics],
  );

  const selectedTemplateBreakdown = useMemo(() => {
    if (!selectedTemplateAnalytics) {
      return null;
    }

    const accomplishedBarangays = selectedTemplateAnalytics.assignedBarangays
      .filter((barangay) => barangay.accomplished)
      .sort((a, b) => a.barangayName.localeCompare(b.barangayName));
    const pendingBarangays = selectedTemplateAnalytics.assignedBarangays
      .filter((barangay) => !barangay.accomplished)
      .sort((a, b) => a.barangayName.localeCompare(b.barangayName));

    const totalRuleChecks = selectedTemplateAnalytics.assignedBarangays.reduce(
      (sum, barangay) => sum + barangay.ruleEvaluations.length,
      0,
    );
    const passedRuleChecks = selectedTemplateAnalytics.assignedBarangays.reduce(
      (sum, barangay) =>
        sum + barangay.ruleEvaluations.filter((evaluation) => evaluation.passed).length,
      0,
    );
    const failedRuleChecks = Math.max(totalRuleChecks - passedRuleChecks, 0);
    const completionRate =
      selectedTemplateAnalytics.assignedCount > 0
        ? Math.round(
            (selectedTemplateAnalytics.accomplishedCount /
              selectedTemplateAnalytics.assignedCount) *
              100,
          )
        : 0;

    return {
      accomplishedBarangays,
      pendingBarangays,
      totalRuleChecks,
      passedRuleChecks,
      failedRuleChecks,
      completionRate,
      statusChartData: [
        {
          name: "Accomplished",
          value: selectedTemplateAnalytics.accomplishedCount,
          fill: "var(--color-accomplished)",
        },
        {
          name: "Pending",
          value: selectedTemplateAnalytics.pendingCount,
          fill: "var(--color-pending)",
        },
      ],
      ruleCheckChartData: [
        {
          label: "Passed checks",
          count: passedRuleChecks,
          fill: "var(--color-rulePassed)",
        },
        {
          label: "Failed checks",
          count: failedRuleChecks,
          fill: "var(--color-ruleFailed)",
        },
      ],
    };
  }, [selectedTemplateAnalytics]);

  const chapterFileToken = useMemo(() => createSafeFileToken(chapterId), [chapterId]);

  const toggleAnalyticsExportSection = (key: ChapterAnalyticsExportSectionKey, enabled: boolean) => {
    setAnalyticsExportSections((prev) => ({ ...prev, [key]: enabled }));
  };

  const toggleAnalyticsExportColumn = (key: ChapterAnalyticsExportColumnKey, enabled: boolean) => {
    setAnalyticsExportColumns((prev) => ({ ...prev, [key]: enabled }));
  };

  const applyAnalyticsExportPreset = (preset: "minimal" | "standard" | "full") => {
    if (preset === "minimal") {
      setAnalyticsExportSections({
        scope: true,
        completionSummary: true,
        assignmentSnapshot: false,
      });
      setAnalyticsExportColumns({
        completionTemplate: true,
        completionAssigned: true,
        completionAccomplished: true,
        completionPending: false,
        completionRate: true,
        assignmentTemplate: true,
        assignmentDependency: false,
        assignmentAssigned: true,
        assignmentAccomplished: true,
      });
      return;
    }

    if (preset === "standard") {
      setAnalyticsExportSections({
        scope: true,
        completionSummary: true,
        assignmentSnapshot: true,
      });
      setAnalyticsExportColumns({
        ...DEFAULT_CHAPTER_ANALYTICS_EXPORT_COLUMNS,
        assignmentDependency: false,
      });
      return;
    }

    setAnalyticsExportSections({ ...DEFAULT_CHAPTER_ANALYTICS_EXPORT_SECTIONS });
    setAnalyticsExportColumns({ ...DEFAULT_CHAPTER_ANALYTICS_EXPORT_COLUMNS });
  };

  const toggleTemplateExportSection = (key: TemplateDetailsExportSectionKey, enabled: boolean) => {
    setTemplateExportSections((prev) => ({ ...prev, [key]: enabled }));
  };

  const toggleTemplateExportColumn = (key: TemplateDetailsExportColumnKey, enabled: boolean) => {
    setTemplateExportColumns((prev) => ({ ...prev, [key]: enabled }));
  };

  const applyTemplateExportPreset = (preset: "minimal" | "standard" | "full") => {
    if (preset === "minimal") {
      setTemplateExportSections({
        scope: true,
        statusBreakdown: true,
        dependencyRuleHealth: false,
        accomplishedBarangays: true,
        pendingBarangays: false,
      });
      setTemplateExportColumns({
        statusLabel: true,
        statusCount: true,
        ruleStatusLabel: true,
        ruleStatusCount: true,
        accomplishedBarangay: true,
        accomplishedChecks: true,
        pendingBarangay: true,
        pendingUnmetRules: false,
      });
      return;
    }

    if (preset === "standard") {
      setTemplateExportSections({
        scope: true,
        statusBreakdown: true,
        dependencyRuleHealth: true,
        accomplishedBarangays: true,
        pendingBarangays: true,
      });
      setTemplateExportColumns({
        ...DEFAULT_TEMPLATE_DETAILS_EXPORT_COLUMNS,
        pendingUnmetRules: false,
      });
      return;
    }

    setTemplateExportSections({ ...DEFAULT_TEMPLATE_DETAILS_EXPORT_SECTIONS });
    setTemplateExportColumns({ ...DEFAULT_TEMPLATE_DETAILS_EXPORT_COLUMNS });
  };

  const handleExportAnalyticsPdf = async () => {
    if (isExportingAnalyticsPdf) {
      return;
    }

    if (!Object.values(analyticsExportSections).some(Boolean)) {
      toast({
        title: "Select at least one section",
        description: "Choose at least one analytics section before exporting.",
        variant: "destructive",
      });
      return;
    }

    if (chapterManagedTemplateAnalytics.length === 0) {
      toast({
        title: "No analytics data",
        description: "No chapter KPI analytics data is available to export yet.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingAnalyticsPdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      exportContract = createPdfExportContract({
        reportId: "chapter-kpi-analytics",
        purpose: "chapter_barangay_kpi_analytics",
        title: analyticsExportReportTitle.trim() || "Chapter KPI Analytics Report",
        subtitle: `Chapter ${chapterId} | Year ${selectedYear}`,
        selectedSections: analyticsExportSections,
        selectedColumns: analyticsExportColumns,
        filters: {
          chapterId,
          year: selectedYear,
          managedTemplates: analyticsOverview.templateCount,
        },
        filenamePolicy: {
          prefix: "YSP-Chapter-KPI-Analytics",
          includeChapterToken: true,
          includeYear: true,
          includeDateStamp: true,
        },
        snapshotMetadata: {
          actorRole: "chapter",
          chapterId,
        },
      });

      const report = await createYspPdfReport({
        reportTitle: exportContract.title,
        reportSubtitle: exportContract.subtitle,
      });

      if (analyticsExportSections.scope) {
        report.addSectionTitle("Report Scope");
        report.addMetricRow("Chapter ID", chapterId);
        report.addMetricRow("Year", String(selectedYear));
        report.addMetricRow("Managed Templates", String(analyticsOverview.templateCount));
        report.addMetricRow("Assigned Barangays", String(analyticsOverview.totalAssignments));
        report.addMetricRow("Accomplished", String(analyticsOverview.totalAccomplished));
        report.addMetricRow("Pending", String(analyticsOverview.totalPending));
        report.addMetricRow("Completion Rate", `${analyticsOverview.completionRate}%`);
        report.addSpacer(8);
      }

      if (analyticsExportSections.completionSummary) {
        report.addSectionTitle("Template Completion Summary");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (analyticsExportColumns.completionTemplate) selectedColumns.push({ header: "Template", key: "template", width: 2.6 });
        if (analyticsExportColumns.completionAssigned) selectedColumns.push({ header: "Assigned", key: "assigned", width: 1, align: "right" });
        if (analyticsExportColumns.completionAccomplished) selectedColumns.push({ header: "Accomplished", key: "accomplished", width: 1.2, align: "right" });
        if (analyticsExportColumns.completionPending) selectedColumns.push({ header: "Pending", key: "pending", width: 1, align: "right" });
        if (analyticsExportColumns.completionRate) selectedColumns.push({ header: "Completion", key: "completion", width: 1.2, align: "right" });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No completion summary columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            templateCompletionChartData.map((entry) => {
              const row: Record<string, string | number> = {};
              if (analyticsExportColumns.completionTemplate) row.template = entry.templateName;
              if (analyticsExportColumns.completionAssigned) row.assigned = entry.assigned;
              if (analyticsExportColumns.completionAccomplished) row.accomplished = entry.accomplished;
              if (analyticsExportColumns.completionPending) row.pending = entry.pending;
              if (analyticsExportColumns.completionRate) row.completion = `${entry.completionRate}%`;
              return row;
            }),
            { emptyMessage: "No template analytics data yet." },
          );
        }
      }

      if (analyticsExportSections.assignmentSnapshot) {
        report.addSectionTitle("Template Assignment Snapshot");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (analyticsExportColumns.assignmentTemplate) selectedColumns.push({ header: "Template", key: "template", width: 2.4 });
        if (analyticsExportColumns.assignmentDependency) selectedColumns.push({ header: "Dependency Rule", key: "dependency", width: 2.6 });
        if (analyticsExportColumns.assignmentAssigned) selectedColumns.push({ header: "Assigned", key: "assigned", width: 1, align: "right" });
        if (analyticsExportColumns.assignmentAccomplished) selectedColumns.push({ header: "Accomplished", key: "accomplished", width: 1.2, align: "right" });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No assignment snapshot columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            chapterManagedTemplateAnalytics.map((item) => {
              const row: Record<string, string | number> = {};
              if (analyticsExportColumns.assignmentTemplate) row.template = item.template.name;
              if (analyticsExportColumns.assignmentDependency) row.dependency = item.dependencySummary || "No dependency rule";
              if (analyticsExportColumns.assignmentAssigned) row.assigned = item.assignedCount;
              if (analyticsExportColumns.assignmentAccomplished) row.accomplished = item.accomplishedCount;
              return row;
            }),
            { emptyMessage: "No managed template analytics found." },
          );
        }
      }

      const fileDate = getIsoDateFileStamp();
      report.save(`YSP-Chapter-KPI-Analytics-${chapterFileToken}-${selectedYear}-${fileDate}.pdf`);
      setAnalyticsExportDialogOpen(false);

      toast({ title: "PDF Exported", description: "Chapter KPI analytics PDF downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export chapter KPI analytics PDF", error);
      toast({
        title: "Export failed",
        description: "Unable to generate chapter KPI analytics PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingAnalyticsPdf(false);
    }
  };

  const handleExportTemplateDetailsPdf = async () => {
    if (isExportingTemplatePdf) {
      return;
    }

    if (!Object.values(templateExportSections).some(Boolean)) {
      toast({
        title: "Select at least one section",
        description: "Choose at least one template details section before exporting.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedTemplateAnalytics || !selectedTemplateBreakdown) {
      toast({
        title: "No KPI details",
        description: "Open a KPI with available analytics details before exporting.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingTemplatePdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      const template = selectedTemplateAnalytics.template;
      const templateToken = createSafeFileToken(template.name);

      exportContract = createPdfExportContract({
        reportId: "chapter-kpi-template-details",
        purpose: "chapter_specific_kpi_template_details",
        title: templateExportReportTitle.trim() || "Specific KPI Details Report",
        subtitle: `${template.name} | Chapter ${chapterId} | Year ${template.year}`,
        selectedSections: templateExportSections,
        selectedColumns: templateExportColumns,
        filters: {
          chapterId,
          templateId: template.id,
          year: template.year,
          quarter: template.quarter || "all",
        },
        filenamePolicy: {
          prefix: "YSP-KPI-Details",
          includeDateStamp: true,
        },
        snapshotMetadata: {
          actorRole: "chapter",
          chapterId,
        },
      });

      const report = await createYspPdfReport({
        reportTitle: exportContract.title,
        reportSubtitle: exportContract.subtitle,
      });

      if (templateExportSections.scope) {
        report.addSectionTitle("KPI Scope");
        report.addMetricRow("Chapter ID", chapterId);
        report.addMetricRow("Template", template.name);
        report.addMetricRow("Timeframe", template.timeframe);
        report.addMetricRow("Input Type", template.inputType);
        report.addMetricRow("Year", String(template.year));
        report.addMetricRow("Quarter", template.quarter ? `Q${template.quarter}` : "All Year");
        report.addMetricRow("Assigned Barangays", String(selectedTemplateAnalytics.assignedCount));
        report.addMetricRow("Accomplished", String(selectedTemplateAnalytics.accomplishedCount));
        report.addMetricRow("Pending", String(selectedTemplateAnalytics.pendingCount));
        report.addMetricRow("Completion Rate", `${selectedTemplateBreakdown.completionRate}%`);
        if (selectedTemplateAnalytics.dependencySummary) {
          report.addTextBlock(selectedTemplateAnalytics.dependencySummary, "muted");
        }
        report.addSpacer(8);
      }

      if (templateExportSections.statusBreakdown) {
        report.addSectionTitle("Status Breakdown");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (templateExportColumns.statusLabel) selectedColumns.push({ header: "Status", key: "status", width: 2.2 });
        if (templateExportColumns.statusCount) selectedColumns.push({ header: "Count", key: "count", width: 1, align: "right" });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No status breakdown columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            selectedTemplateBreakdown.statusChartData.map((item) => {
              const row: Record<string, string | number> = {};
              if (templateExportColumns.statusLabel) row.status = item.name;
              if (templateExportColumns.statusCount) row.count = item.value;
              return row;
            }),
            { emptyMessage: "No status breakdown available." },
          );
        }
      }

      if (templateExportSections.dependencyRuleHealth) {
        report.addSectionTitle("Dependency Rule Check Health");
        report.addMetricRow("Total Rule Checks", String(selectedTemplateBreakdown.totalRuleChecks));
        report.addMetricRow("Passed Checks", String(selectedTemplateBreakdown.passedRuleChecks));
        report.addMetricRow("Failed Checks", String(selectedTemplateBreakdown.failedRuleChecks));

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (templateExportColumns.ruleStatusLabel) selectedColumns.push({ header: "Rule Status", key: "status", width: 2.2 });
        if (templateExportColumns.ruleStatusCount) selectedColumns.push({ header: "Count", key: "count", width: 1, align: "right" });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No dependency rule health columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            selectedTemplateBreakdown.ruleCheckChartData.map((item) => {
              const row: Record<string, string | number> = {};
              if (templateExportColumns.ruleStatusLabel) row.status = item.label;
              if (templateExportColumns.ruleStatusCount) row.count = item.count;
              return row;
            }),
            { emptyMessage: "No dependency rule checks recorded." },
          );
        }
      }

      if (templateExportSections.accomplishedBarangays) {
        report.addSectionTitle("Accomplished Barangays");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (templateExportColumns.accomplishedBarangay) selectedColumns.push({ header: "Barangay", key: "barangay", width: 2.2 });
        if (templateExportColumns.accomplishedChecks) selectedColumns.push({ header: "Dependency Checks Passed", key: "checks", width: 1.6 });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No accomplished barangay columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            selectedTemplateBreakdown.accomplishedBarangays.map((barangay) => {
              const passed = barangay.ruleEvaluations.filter((evaluation) => evaluation.passed).length;
              const total = barangay.ruleEvaluations.length;
              const row: Record<string, string | number> = {};
              if (templateExportColumns.accomplishedBarangay) row.barangay = barangay.barangayName;
              if (templateExportColumns.accomplishedChecks) row.checks = total > 0 ? `${passed}/${total}` : "No dependency checks";
              return row;
            }),
            { emptyMessage: "No accomplished barangays yet." },
          );
        }
      }

      if (templateExportSections.pendingBarangays) {
        report.addSectionTitle("Pending Barangays");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (templateExportColumns.pendingBarangay) selectedColumns.push({ header: "Barangay", key: "barangay", width: 2 });
        if (templateExportColumns.pendingUnmetRules) selectedColumns.push({ header: "Unmet Rule Details", key: "unmetRules", width: 2.8 });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No pending barangay columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            selectedTemplateBreakdown.pendingBarangays.map((barangay) => {
              const unmetRules = barangay.ruleEvaluations.filter((evaluation) => !evaluation.passed);
              const row: Record<string, string | number> = {};
              if (templateExportColumns.pendingBarangay) row.barangay = barangay.barangayName;
              if (templateExportColumns.pendingUnmetRules) {
                row.unmetRules =
                  unmetRules.length > 0
                    ? unmetRules.map((evaluation) => `${evaluation.description}: ${evaluation.currentValue}`).join("; ")
                    : "Pending status remains; unmet dependency details not yet available.";
              }
              return row;
            }),
            { emptyMessage: "No pending barangays." },
          );
        }
      }

      const fileDate = getIsoDateFileStamp();
      report.save(`YSP-KPI-Details-${templateToken}-${fileDate}.pdf`);
      setTemplateExportDialogOpen(false);

      toast({ title: "PDF Exported", description: "Specific KPI details PDF downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export specific KPI details PDF", error);
      toast({
        title: "Export failed",
        description: "Unable to generate specific KPI details PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingTemplatePdf(false);
    }
  };

  useEffect(() => {
    if (!isAssigningTemplate || !selectedManagedTemplate) {
      return;
    }

    const dependencyConfig = parseKpiDependencyConfig(selectedManagedTemplate.linkedEntityId);
    setAssignFormData({
      name: selectedManagedTemplate.name,
      description: selectedManagedTemplate.description || "",
      timeframe: selectedManagedTemplate.timeframe,
      inputType: selectedManagedTemplate.inputType,
      year: selectedManagedTemplate.year,
      quarter: selectedManagedTemplate.quarter,
      targetValue: selectedManagedTemplate.targetValue,
      selectedEntityIds: selectedScopeBarangayIds,
      dependencyEnabled: Boolean(dependencyConfig),
      dependencyAggregation: dependencyConfig?.aggregation || "all",
      dependencyRules: dependencyConfig?.rules || [],
    });
  }, [isAssigningTemplate, selectedManagedTemplate, selectedScopeBarangayIds]);

  const recipientTemplates = useMemo(
    () => templates.filter((template) => template.scope !== "selected_barangays"),
    [templates],
  );

  const quarterlyTemplates = recipientTemplates.filter((template) => template.timeframe === "quarterly" || template.timeframe === "both");
  const yearlyTemplates = recipientTemplates.filter((template) => template.timeframe === "yearly" || template.timeframe === "both");

  const totalKpis = recipientTemplates.filter((template) => template.isActive).length;
  const completedKpis = recipientTemplates.filter(
    (template) => template.isActive && Boolean(getCompletion(template.id)?.isCompleted),
  ).length;
  const progressPercent = totalKpis > 0 ? Math.round((completedKpis / totalKpis) * 100) : 0;

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const quarters = [1, 2, 3, 4];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Chapter KPIs
          </CardTitle>
          <CardDescription>
            Manage KPI templates for your barangays and monitor accomplishment progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Barangay KPI Assignment</p>
              <p className="text-xs text-muted-foreground">
                Assign templates to barangays under your chapter and review accomplishment analytics.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto sm:justify-end">
              <div className="w-32">
                <Label>Year</Label>
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v, 10))}>
                  <SelectTrigger data-testid="select-kpi-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={openCreateTemplateModal}
                data-testid="button-toggle-assign-kpi-template"
                  className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Assign KPI Template
              </Button>
            </div>
          </div>

          <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as "kpis" | "analytics")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="kpis">KPIs</TabsTrigger>
              <TabsTrigger value="analytics">Barangay Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="kpis" className="mt-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Barangay KPIs I Added</CardTitle>
                  <CardDescription>
                    Edit, delete, or inspect KPI templates assigned to barangays in your chapter.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {managedTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No barangay-specific KPI templates yet. Click Assign KPI Template to create one.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {managedTemplates.map((template) => (
                        <div key={template.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{template.name}</p>
                                <Badge variant={template.timeframe === "quarterly" ? "secondary" : "default"}>
                                  {template.timeframe}
                                </Badge>
                                {template.dependencySummary && <Badge className="bg-amber-600">Auto-Tracked</Badge>}
                              </div>
                              {template.description && (
                                <p className="text-sm text-muted-foreground">{template.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Assigned to {template.assignedBarangayIds.length} barangay(s)
                              </p>
                              {template.dependencySummary && (
                                <p className="text-xs text-muted-foreground">{template.dependencySummary}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openTemplateDetailsModal(template)}
                              >
                                <Eye className="mr-1 h-4 w-4" />
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditTemplateModal(template)}
                              >
                                <Edit2 className="mr-1 h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deleteTemplateMutation.isPending}
                                onClick={() => {
                                  if (!window.confirm("Delete this KPI template and its assignments?")) {
                                    return;
                                  }
                                  deleteTemplateMutation.mutate(template.id);
                                }}
                              >
                                <Trash2 className="mr-1 h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-primary/10 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-primary">{completedKpis}</div>
                      <div className="text-sm text-muted-foreground">Completed KPIs</div>
                    </div>
                    <Check className="h-8 w-8 text-primary" />
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{totalKpis - completedKpis}</div>
                      <div className="text-sm text-muted-foreground">Pending KPIs</div>
                    </div>
                    <Clock className="h-8 w-8 text-muted-foreground" />
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{progressPercent}%</div>
                      <div className="text-sm text-muted-foreground">Progress</div>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-600" />
                  </div>
                  <Progress value={progressPercent} className="mt-2" />
                </Card>
              </div>

              <Tabs value={viewTab} onValueChange={setViewTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="quarterly" data-testid="tab-quarterly-kpis">
                    Quarterly ({quarterlyTemplates.filter((template) => template.isActive).length})
                  </TabsTrigger>
                  <TabsTrigger value="yearly" data-testid="tab-yearly-kpis">
                    Yearly ({yearlyTemplates.filter((template) => template.isActive).length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="quarterly" className="mt-4">
                  <div className="space-y-4">
                    {quarters.map((quarter) => {
                      const quarterKpis = quarterlyTemplates.filter(
                        (template) => template.isActive && (template.quarter === quarter || !template.quarter),
                      );
                      if (quarterKpis.length === 0) return null;

                      const isCurrentQuarter = quarter === currentQuarter && selectedYear === currentYear;

                      return (
                        <div key={quarter} className={`rounded-lg border p-4 ${isCurrentQuarter ? "border-primary bg-primary/5" : ""}`}>
                          <div className="mb-4 flex items-center gap-2">
                            <h3 className="font-medium">Q{quarter} {selectedYear}</h3>
                            {isCurrentQuarter && <Badge>Current Quarter</Badge>}
                          </div>
                          <div className="space-y-3">
                            {quarterKpis.map((template) => (
                              <KpiItem
                                key={template.id}
                                template={template}
                                completion={getCompletion(template.id)}
                                isAutoTracked={Boolean(dependencySummaryByTemplateId.get(template.id))}
                                autoDependencySummary={dependencySummaryByTemplateId.get(template.id)}
                                onSubmit={(data) => submitMutation.mutate({ kpiTemplateId: template.id, ...data })}
                                onMarkComplete={(id) => markCompleteMutation.mutate(id)}
                                isPending={submitMutation.isPending || markCompleteMutation.isPending}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {quarterlyTemplates.filter((template) => template.isActive).length === 0 && (
                      <p className="py-8 text-center text-muted-foreground">No quarterly KPIs available for {selectedYear}</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="yearly" className="mt-4">
                  <div className="space-y-3">
                    {yearlyTemplates.filter((template) => template.isActive).length === 0 ? (
                      <p className="py-8 text-center text-muted-foreground">No yearly KPIs available for {selectedYear}</p>
                    ) : (
                      yearlyTemplates
                        .filter((template) => template.isActive)
                        .map((template) => (
                          <KpiItem
                            key={template.id}
                            template={template}
                            completion={getCompletion(template.id)}
                            isAutoTracked={Boolean(dependencySummaryByTemplateId.get(template.id))}
                            autoDependencySummary={dependencySummaryByTemplateId.get(template.id)}
                            onSubmit={(data) => submitMutation.mutate({ kpiTemplateId: template.id, ...data })}
                            onMarkComplete={(id) => markCompleteMutation.mutate(id)}
                            isPending={submitMutation.isPending || markCompleteMutation.isPending}
                          />
                        ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="analytics" className="mt-4 space-y-4">
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAnalyticsExportDialogOpen(true)}
                  disabled={isChapterAnalyticsLoading || chapterManagedTemplateAnalytics.length === 0}
                  data-testid="button-export-chapter-kpi-analytics-pdf"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Customize Analytics PDF
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Managed Templates</p>
                  <p className="text-2xl font-bold">{analyticsOverview.templateCount}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Assigned Barangays</p>
                  <p className="text-2xl font-bold">{analyticsOverview.totalAssignments}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Accomplished</p>
                  <p className="text-2xl font-bold text-green-600">{analyticsOverview.totalAccomplished}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-orange-500">{analyticsOverview.totalPending}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Completion Rate</p>
                  <p className="text-2xl font-bold">{analyticsOverview.completionRate}%</p>
                  <Progress value={analyticsOverview.completionRate} className="mt-2" />
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-base">Overall Assignment Status</CardTitle>
                    <CardDescription>
                      Accomplished vs pending assignments across all chapter-managed templates.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    {analyticsOverview.totalAssignments === 0 ? (
                      <p className="text-sm text-muted-foreground">No assignment data to visualize yet.</p>
                    ) : (
                      <>
                        <ChartContainer config={chapterKpiAnalyticsChartConfig} className="mx-auto h-[220px] w-full min-w-0 max-w-[320px] aspect-auto sm:h-[240px]">
                          <PieChart>
                            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                            <Pie
                              data={analyticsStatusChartData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="42%"
                              outerRadius="78%"
                              strokeWidth={4}
                            >
                              {analyticsStatusChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.fill} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ChartContainer>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-muted-foreground">
                          <p>Accomplished: {analyticsOverview.totalAccomplished}</p>
                          <p>Pending: {analyticsOverview.totalPending}</p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-base">Template Completion Rate</CardTitle>
                    <CardDescription>
                      Quick comparison of completion performance per template.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    {templateCompletionChartData.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No template analytics data yet.</p>
                    ) : (
                      <ChartContainer config={chapterKpiAnalyticsChartConfig} className="min-w-0 h-[240px] w-full sm:h-[260px]">
                        <BarChart data={templateCompletionChartData} margin={{ top: 8, right: 8, left: 8, bottom: 28 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="shortTemplateName"
                            tickLine={false}
                            axisLine={false}
                            angle={0}
                            textAnchor="middle"
                            height={44}
                            tickMargin={8}
                            minTickGap={10}
                            interval="preserveStartEnd"
                            tickFormatter={(value) => truncateChartLabel(value, 14)}
                          />
                          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                          <Bar dataKey="completionRate" radius={[8, 8, 0, 0]}>
                            {templateCompletionChartData.map((entry, index) => (
                              <Cell key={`template-completion-rate-${entry.templateId}`} fill={getComparisonColor(index)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template Analytics</CardTitle>
                  <CardDescription>
                    KPI analytics below are scoped to barangays under your chapter.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isChapterAnalyticsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading analytics...</p>
                  ) : chapterManagedTemplateAnalytics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No barangay KPI analytics yet for this year.</p>
                  ) : (
                    <div className="space-y-3">
                      {chapterManagedTemplateAnalytics.map((analyticsRow) => {
                        const templateCompletionRate =
                          analyticsRow.assignedCount > 0
                            ? Math.round((analyticsRow.accomplishedCount / analyticsRow.assignedCount) * 100)
                            : 0;

                        return (
                          <div key={analyticsRow.template.id} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium">{analyticsRow.template.name}</p>
                                  <Badge variant="outline">{templateCompletionRate}%</Badge>
                                  <Badge className="bg-green-600">Accomplished: {analyticsRow.accomplishedCount}</Badge>
                                  <Badge className="bg-orange-500">Pending: {analyticsRow.pendingCount}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {analyticsRow.accomplishedCount} accomplished out of {analyticsRow.assignedCount} assigned barangays.
                                </p>
                                <Progress value={templateCompletionRate} className="h-2" />
                                {analyticsRow.dependencySummary && (
                                  <p className="text-xs text-muted-foreground">{analyticsRow.dependencySummary}</p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const template = managedTemplates.find((item) => item.id === analyticsRow.template.id);
                                  if (!template) {
                                    return;
                                  }
                                  openTemplateDetailsModal(template);
                                }}
                              >
                                <Eye className="mr-1 h-4 w-4" />
                                View Details
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isAssigningTemplate} onOpenChange={(open) => (open ? setIsAssigningTemplate(true) : resetAssignForm())}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplateId ? "Edit KPI Template Assignment" : "Create and Assign KPI Template"}
            </DialogTitle>
            <DialogDescription>
              This template will only be visible to the barangays you select below.
            </DialogDescription>
          </DialogHeader>

          {chapterBarangays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active barangays found in your chapter. Add barangay accounts first before assigning KPI templates.
            </p>
          ) : (
            <form onSubmit={handleAssignTemplate} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="chapter-kpi-name">KPI Name *</Label>
                  <Input
                    id="chapter-kpi-name"
                    value={assignFormData.name}
                    onChange={(e) => setAssignFormData({ ...assignFormData, name: e.target.value })}
                    placeholder="e.g., Youth outreach completed"
                    data-testid="input-chapter-kpi-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chapter-kpi-timeframe">Timeframe *</Label>
                  <Select
                    value={assignFormData.timeframe}
                    onValueChange={(v) =>
                      setAssignFormData({
                        ...assignFormData,
                        timeframe: v,
                        quarter: v === "yearly" ? null : assignFormData.quarter ?? currentQuarter,
                      })
                    }
                  >
                    <SelectTrigger id="chapter-kpi-timeframe" data-testid="select-chapter-kpi-timeframe">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                      <SelectItem value="both">Both (Quarterly + Yearly)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chapter-kpi-input-type">Input Type *</Label>
                  <Select
                    value={assignFormData.inputType}
                    onValueChange={(v) => setAssignFormData({ ...assignFormData, inputType: v })}
                  >
                    <SelectTrigger
                      id="chapter-kpi-input-type"
                      data-testid="select-chapter-kpi-input-type"
                      disabled={assignFormData.dependencyEnabled}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="numeric">Numeric</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chapter-kpi-year">Year *</Label>
                  <Select
                    value={String(assignFormData.year)}
                    onValueChange={(v) => setAssignFormData({ ...assignFormData, year: parseInt(v, 10) })}
                  >
                    <SelectTrigger id="chapter-kpi-year" data-testid="select-chapter-kpi-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(assignFormData.timeframe === "quarterly" || assignFormData.timeframe === "both") && (
                  <div className="space-y-2">
                    <Label htmlFor="chapter-kpi-quarter">Quarter</Label>
                    <Select
                      value={assignFormData.quarter ? String(assignFormData.quarter) : ""}
                      onValueChange={(v) => setAssignFormData({ ...assignFormData, quarter: v ? parseInt(v, 10) : null })}
                    >
                      <SelectTrigger id="chapter-kpi-quarter" data-testid="select-chapter-kpi-quarter">
                        <SelectValue placeholder="Select quarter..." />
                      </SelectTrigger>
                      <SelectContent>
                        {quarters.map((quarter) => (
                          <SelectItem key={quarter} value={String(quarter)}>
                            Q{quarter}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {assignFormData.inputType === "numeric" && (
                  <div className="space-y-2">
                    <Label htmlFor="chapter-kpi-target">
                      {assignFormData.dependencyEnabled ? "Target Value (from first dependency rule)" : "Target Value (optional)"}
                    </Label>
                    <Input
                      id="chapter-kpi-target"
                      type="number"
                      min="0"
                      value={
                        assignFormData.dependencyEnabled
                          ? (assignFormData.dependencyRules[0]?.targetValue ?? "")
                          : (assignFormData.targetValue ?? "")
                      }
                      onChange={(e) =>
                        setAssignFormData({
                          ...assignFormData,
                          targetValue: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      placeholder="e.g., 25"
                      disabled={assignFormData.dependencyEnabled}
                      data-testid="input-chapter-kpi-target"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="chapter-kpi-description">Description (optional)</Label>
                <Textarea
                  id="chapter-kpi-description"
                  value={assignFormData.description}
                  onChange={(e) => setAssignFormData({ ...assignFormData, description: e.target.value })}
                  placeholder="Describe how barangays should complete this KPI"
                  data-testid="input-chapter-kpi-description"
                />
              </div>

              <KpiDependencyEditor
                enabled={assignFormData.dependencyEnabled}
                onEnabledChange={(enabled) =>
                  setAssignFormData((prev) => ({
                    ...prev,
                    dependencyEnabled: enabled,
                    inputType: enabled ? "numeric" : prev.inputType,
                    dependencyRules: enabled && prev.dependencyRules.length === 0
                      ? [createDefaultKpiDependencyRule()]
                      : prev.dependencyRules,
                  }))
                }
                aggregation={assignFormData.dependencyAggregation}
                onAggregationChange={(aggregation) =>
                  setAssignFormData((prev) => ({
                    ...prev,
                    dependencyAggregation: aggregation,
                  }))
                }
                rules={assignFormData.dependencyRules}
                onRulesChange={(rules) =>
                  setAssignFormData((prev) => ({
                    ...prev,
                    dependencyRules: rules,
                  }))
                }
                dataTestIdPrefix="chapter-kpi-dependency"
              />

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Select Barangays *
                </Label>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">Toggle all barangays</span>
                  <Checkbox
                    id="chapter-barangay-toggle-all"
                    checked={isAllBarangaysSelected ? true : hasSomeBarangaysSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => handleToggleAllBarangays(checked === true)}
                    data-testid="checkbox-chapter-barangay-toggle-all"
                  />
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                  {chapterBarangays.map((barangay) => (
                    <div key={barangay.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`chapter-barangay-${barangay.id}`}
                        checked={assignFormData.selectedEntityIds.includes(barangay.id)}
                        onCheckedChange={() => handleBarangayToggle(barangay.id)}
                        data-testid={`checkbox-chapter-barangay-${barangay.id}`}
                      />
                      <label htmlFor={`chapter-barangay-${barangay.id}`} className="cursor-pointer text-sm">
                        {barangay.barangayName}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {assignFormData.selectedEntityIds.length} barangay(s) selected
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={assignTemplateMutation.isPending}
                  data-testid="button-assign-kpi-template"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {assignTemplateMutation.isPending
                    ? (editingTemplateId ? "Updating..." : "Assigning...")
                    : (editingTemplateId ? "Save Changes" : "Assign Template")}
                </Button>
                <Button type="button" variant="outline" onClick={resetAssignForm}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDetailsModalOpen}
        onOpenChange={(open) => {
          setIsDetailsModalOpen(open);
          if (!open) {
            setSelectedAnalyticsTemplate(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedAnalyticsTemplate?.name || "KPI Details"}</DialogTitle>
            <DialogDescription>
              Assigned barangays, accomplishment status, and dependency rule checks.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTemplateExportDialogOpen(true)}
              disabled={
                isTemplateAnalyticsLoading
                || !selectedTemplateAnalytics
                || !selectedTemplateBreakdown
              }
              data-testid="button-export-specific-kpi-pdf"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Customize KPI PDF
            </Button>
          </div>

          {isTemplateAnalyticsLoading ? (
            <p className="text-sm text-muted-foreground">Loading KPI details...</p>
          ) : !selectedTemplateAnalytics ? (
            <p className="text-sm text-muted-foreground">No analytics data available for this KPI template.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Assigned</p>
                  <p className="text-xl font-semibold">{selectedTemplateAnalytics.assignedCount}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Accomplished</p>
                  <p className="text-xl font-semibold text-green-600">{selectedTemplateAnalytics.accomplishedCount}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="text-xl font-semibold text-orange-500">{selectedTemplateAnalytics.pendingCount}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Completion Rate</p>
                  <p className="text-xl font-semibold">{selectedTemplateBreakdown?.completionRate ?? 0}%</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Failed Rule Checks</p>
                  <p className="text-xl font-semibold text-orange-500">{selectedTemplateBreakdown?.failedRuleChecks ?? 0}</p>
                </Card>
              </div>

              {selectedTemplateAnalytics.dependencySummary && (
                <p className="text-xs text-muted-foreground">{selectedTemplateAnalytics.dependencySummary}</p>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-base">Status Breakdown</CardTitle>
                    <CardDescription>
                      Visual split of accomplished and pending barangays for this template.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(selectedTemplateBreakdown?.statusChartData.reduce((sum, item) => sum + item.value, 0) || 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">No status data available yet.</p>
                    ) : (
                      <ChartContainer config={chapterKpiAnalyticsChartConfig} className="mx-auto h-[220px] w-full min-w-0 max-w-[320px] aspect-auto sm:h-[240px]">
                        <PieChart>
                          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                          <Pie
                            data={selectedTemplateBreakdown?.statusChartData || []}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="42%"
                            outerRadius="78%"
                            strokeWidth={4}
                          >
                            {(selectedTemplateBreakdown?.statusChartData || []).map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>

                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-base">Rule Check Health</CardTitle>
                    <CardDescription>
                      Passed and failed dependency rule checks across assigned barangays.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(selectedTemplateBreakdown?.totalRuleChecks || 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">No dependency rule checks recorded for this template.</p>
                    ) : (
                      <>
                        <ChartContainer config={chapterKpiAnalyticsChartConfig} className="h-[220px] w-full sm:h-[240px]">
                          <BarChart
                            data={selectedTemplateBreakdown?.ruleCheckChartData || []}
                            layout="vertical"
                            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                          >
                            <CartesianGrid horizontal={false} />
                            <XAxis type="number" tickLine={false} axisLine={false} />
                            <YAxis
                              type="category"
                              dataKey="label"
                              tickLine={false}
                              axisLine={false}
                              width={84}
                              tickFormatter={(value) => truncateChartLabel(value, 12)}
                            />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                            <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                              {(selectedTemplateBreakdown?.ruleCheckChartData || []).map((entry) => (
                                <Cell key={entry.label} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                        <p className="mt-3 text-xs text-muted-foreground">
                          {selectedTemplateBreakdown?.passedRuleChecks || 0} passed out of {selectedTemplateBreakdown?.totalRuleChecks || 0} total checks.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Accomplished Barangays ({selectedTemplateBreakdown?.accomplishedBarangays.length || 0})
                    </CardTitle>
                    <CardDescription>
                      Barangays that already met all completion conditions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!selectedTemplateBreakdown || selectedTemplateBreakdown.accomplishedBarangays.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No barangays have accomplished this KPI yet.</p>
                    ) : (
                      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                        {selectedTemplateBreakdown.accomplishedBarangays.map((barangay) => {
                          const passedRulesCount = barangay.ruleEvaluations.filter((evaluation) => evaluation.passed).length;

                          return (
                            <div key={barangay.barangayId} className="rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">{barangay.barangayName}</p>
                                <Badge className="bg-green-600">Accomplished</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {barangay.ruleEvaluations.length > 0
                                  ? `${passedRulesCount}/${barangay.ruleEvaluations.length} dependency checks passed`
                                  : "No dependency checks required"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Pending Barangays ({selectedTemplateBreakdown?.pendingBarangays.length || 0})
                    </CardTitle>
                    <CardDescription>
                      Barangays that have not yet met all required conditions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!selectedTemplateBreakdown || selectedTemplateBreakdown.pendingBarangays.length === 0 ? (
                      <p className="text-sm text-muted-foreground">All assigned barangays have accomplished this KPI.</p>
                    ) : (
                      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                        {selectedTemplateBreakdown.pendingBarangays.map((barangay) => {
                          const unmetRules = barangay.ruleEvaluations.filter((evaluation) => !evaluation.passed);

                          return (
                            <div key={barangay.barangayId} className="rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">{barangay.barangayName}</p>
                                <Badge className="bg-orange-500">Pending</Badge>
                              </div>

                              {unmetRules.length > 0 ? (
                                <div className="mt-2 space-y-1">
                                  {unmetRules.map((ruleEvaluation, index) => (
                                    <p key={`${barangay.barangayId}-pending-${index}`} className="text-xs text-muted-foreground">
                                      {ruleEvaluation.description}: {ruleEvaluation.currentValue} (not yet met)
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Pending status remains, but unmet dependency details are not yet available.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={analyticsExportDialogOpen}
        onOpenChange={(open) => {
          if (isExportingAnalyticsPdf) {
            return;
          }
          setAnalyticsExportDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export Chapter Analytics PDF</DialogTitle>
            <DialogDescription>
              Choose sections and columns to include before downloading.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="chapter-analytics-export-report-title">Report Title</Label>
              <Input
                id="chapter-analytics-export-report-title"
                value={analyticsExportReportTitle}
                onChange={(event) => setAnalyticsExportReportTitle(event.target.value)}
                placeholder="Chapter KPI Analytics Report"
              />
            </div>

            <div className="space-y-2">
              <Label>Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => applyAnalyticsExportPreset("minimal")}>Minimal</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyAnalyticsExportPreset("standard")}>Standard</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyAnalyticsExportPreset("full")}>Full</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sections to Include</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={analyticsExportSections.scope}
                    onCheckedChange={(checked) => toggleAnalyticsExportSection("scope", checked === true)}
                  />
                  Report Scope
                </label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={analyticsExportSections.completionSummary}
                    onCheckedChange={(checked) => toggleAnalyticsExportSection("completionSummary", checked === true)}
                  />
                  Template Completion Summary
                </label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={analyticsExportSections.assignmentSnapshot}
                    onCheckedChange={(checked) => toggleAnalyticsExportSection("assignmentSnapshot", checked === true)}
                  />
                  Template Assignment Snapshot
                </label>
              </div>
            </div>

            {analyticsExportSections.completionSummary ? (
              <div className="space-y-2">
                <Label>Completion Summary Columns</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.completionTemplate}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("completionTemplate", checked === true)}
                    />
                    Template
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.completionAssigned}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("completionAssigned", checked === true)}
                    />
                    Assigned
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.completionAccomplished}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("completionAccomplished", checked === true)}
                    />
                    Accomplished
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.completionPending}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("completionPending", checked === true)}
                    />
                    Pending
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.completionRate}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("completionRate", checked === true)}
                    />
                    Completion Rate
                  </label>
                </div>
              </div>
            ) : null}

            {analyticsExportSections.assignmentSnapshot ? (
              <div className="space-y-2">
                <Label>Assignment Snapshot Columns</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.assignmentTemplate}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("assignmentTemplate", checked === true)}
                    />
                    Template
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.assignmentDependency}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("assignmentDependency", checked === true)}
                    />
                    Dependency Rule
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.assignmentAssigned}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("assignmentAssigned", checked === true)}
                    />
                    Assigned
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={analyticsExportColumns.assignmentAccomplished}
                      onCheckedChange={(checked) => toggleAnalyticsExportColumn("assignmentAccomplished", checked === true)}
                    />
                    Accomplished
                  </label>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAnalyticsExportDialogOpen(false)} disabled={isExportingAnalyticsPdf}>
                Cancel
              </Button>
              <Button type="button" onClick={handleExportAnalyticsPdf} disabled={isExportingAnalyticsPdf || chapterManagedTemplateAnalytics.length === 0}>
                <FileDown className="h-4 w-4 mr-2" />
                {isExportingAnalyticsPdf ? "Generating PDF..." : "Download PDF"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={templateExportDialogOpen}
        onOpenChange={(open) => {
          if (isExportingTemplatePdf) {
            return;
          }
          setTemplateExportDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export Specific KPI PDF</DialogTitle>
            <DialogDescription>
              Customize the selected KPI details report before downloading.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="chapter-template-export-report-title">Report Title</Label>
              <Input
                id="chapter-template-export-report-title"
                value={templateExportReportTitle}
                onChange={(event) => setTemplateExportReportTitle(event.target.value)}
                placeholder="Specific KPI Details Report"
              />
            </div>

            <div className="space-y-2">
              <Label>Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => applyTemplateExportPreset("minimal")}>Minimal</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyTemplateExportPreset("standard")}>Standard</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyTemplateExportPreset("full")}>Full</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sections to Include</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox checked={templateExportSections.scope} onCheckedChange={(checked) => toggleTemplateExportSection("scope", checked === true)} />
                  KPI Scope
                </label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox checked={templateExportSections.statusBreakdown} onCheckedChange={(checked) => toggleTemplateExportSection("statusBreakdown", checked === true)} />
                  Status Breakdown
                </label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox checked={templateExportSections.dependencyRuleHealth} onCheckedChange={(checked) => toggleTemplateExportSection("dependencyRuleHealth", checked === true)} />
                  Dependency Rule Health
                </label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox checked={templateExportSections.accomplishedBarangays} onCheckedChange={(checked) => toggleTemplateExportSection("accomplishedBarangays", checked === true)} />
                  Accomplished Barangays
                </label>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox checked={templateExportSections.pendingBarangays} onCheckedChange={(checked) => toggleTemplateExportSection("pendingBarangays", checked === true)} />
                  Pending Barangays
                </label>
              </div>
            </div>

            {templateExportSections.statusBreakdown ? (
              <div className="space-y-2">
                <Label>Status Breakdown Columns</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.statusLabel} onCheckedChange={(checked) => toggleTemplateExportColumn("statusLabel", checked === true)} />
                    Status
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.statusCount} onCheckedChange={(checked) => toggleTemplateExportColumn("statusCount", checked === true)} />
                    Count
                  </label>
                </div>
              </div>
            ) : null}

            {templateExportSections.dependencyRuleHealth ? (
              <div className="space-y-2">
                <Label>Dependency Rule Health Columns</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.ruleStatusLabel} onCheckedChange={(checked) => toggleTemplateExportColumn("ruleStatusLabel", checked === true)} />
                    Rule Status
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.ruleStatusCount} onCheckedChange={(checked) => toggleTemplateExportColumn("ruleStatusCount", checked === true)} />
                    Count
                  </label>
                </div>
              </div>
            ) : null}

            {templateExportSections.accomplishedBarangays ? (
              <div className="space-y-2">
                <Label>Accomplished Barangays Columns</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.accomplishedBarangay} onCheckedChange={(checked) => toggleTemplateExportColumn("accomplishedBarangay", checked === true)} />
                    Barangay
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.accomplishedChecks} onCheckedChange={(checked) => toggleTemplateExportColumn("accomplishedChecks", checked === true)} />
                    Dependency Checks Passed
                  </label>
                </div>
              </div>
            ) : null}

            {templateExportSections.pendingBarangays ? (
              <div className="space-y-2">
                <Label>Pending Barangays Columns</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.pendingBarangay} onCheckedChange={(checked) => toggleTemplateExportColumn("pendingBarangay", checked === true)} />
                    Barangay
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={templateExportColumns.pendingUnmetRules} onCheckedChange={(checked) => toggleTemplateExportColumn("pendingUnmetRules", checked === true)} />
                    Unmet Rule Details
                  </label>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTemplateExportDialogOpen(false)} disabled={isExportingTemplatePdf}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleExportTemplateDetailsPdf}
                disabled={isExportingTemplatePdf || !selectedTemplateAnalytics || !selectedTemplateBreakdown}
                data-testid="button-export-specific-kpi-pdf-download"
              >
                <FileDown className="h-4 w-4 mr-2" />
                {isExportingTemplatePdf ? "Generating PDF..." : "Download PDF"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface KpiItemProps {
  template: KpiTemplate;
  completion?: KpiCompletion;
  isAutoTracked: boolean;
  autoDependencySummary: string | null | undefined;
  onSubmit: (data: { numericValue?: number; textValue?: string }) => void;
  onMarkComplete: (id: string) => void;
  isPending: boolean;
}

function KpiItem({
  template,
  completion,
  isAutoTracked,
  autoDependencySummary,
  onSubmit,
  onMarkComplete,
  isPending,
}: KpiItemProps) {
  const [value, setValue] = useState(completion?.numericValue?.toString() || completion?.textValue || "");
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    if (template.inputType === "numeric") {
      onSubmit({ numericValue: parseInt(value) || 0 });
    } else {
      onSubmit({ textValue: value });
    }
    setIsEditing(false);
  };

  const progressValue = completion?.numericValue || 0;
  const targetValue = template.targetValue || 0;
  const progressPercent = targetValue > 0 ? Math.min(100, Math.round((progressValue / targetValue) * 100)) : 0;

  return (
    <div className={`p-4 border rounded-lg ${completion?.isCompleted ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : ''}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium break-normal">{template.name}</span>
            <Badge variant={template.timeframe === "quarterly" ? "secondary" : "default"}>
              {template.timeframe}
            </Badge>
            {template.inputType === "text" && <Badge variant="outline">Text</Badge>}
            {isAutoTracked && <Badge className="bg-amber-600">Auto-Tracked</Badge>}
            {completion?.isCompleted && <Badge className="bg-green-600">Completed</Badge>}
          </div>
          {template.description && (
            <p className="text-sm text-muted-foreground mb-2 break-normal">{template.description}</p>
          )}

          {autoDependencySummary && (
            <p className="text-xs text-muted-foreground mb-2 break-normal">{autoDependencySummary}</p>
          )}
          
          {template.inputType === "numeric" && targetValue > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Target: {targetValue}</span>
              <Progress value={progressPercent} className="w-full sm:flex-1 sm:max-w-32" />
              <span className="text-sm">{progressValue} / {targetValue}</span>
            </div>
          )}
          
          {completion && !completion.isCompleted && !isEditing && (
            <div className="mt-2 text-sm">
              Current value: <strong>{completion.numericValue ?? completion.textValue ?? "Not set"}</strong>
            </div>
          )}

          {isAutoTracked && (
            <p className="mt-2 text-xs text-muted-foreground">
              Completion status updates automatically based on connected chapter dependencies.
            </p>
          )}
        </div>
        
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {!completion?.isCompleted && !isAutoTracked && (
            <>
              {isEditing ? (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {template.inputType === "numeric" ? (
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-full sm:w-24"
                      placeholder="Value"
                    />
                  ) : (
                    <Textarea
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-full sm:w-48"
                      placeholder="Enter notes..."
                    />
                  )}
                  <Button size="sm" onClick={handleSave} disabled={isPending}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  {completion ? "Update" : "Add Value"}
                </Button>
              )}
              
              {completion && (
                <Button 
                  size="sm" 
                  onClick={() => onMarkComplete(completion.id)}
                  disabled={isPending}
                  data-testid={`button-complete-kpi-${template.id}`}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Mark Done
                </Button>
              )}
            </>
          )}

          {!completion?.isCompleted && isAutoTracked && (
            <Badge variant="outline">Waiting For Dependency Check</Badge>
          )}
          
          {completion?.isCompleted && (
            <div className="flex items-center gap-1 text-green-600">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">Done</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
